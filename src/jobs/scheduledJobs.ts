/**
 * Scheduled Jobs Service
 * 
 * Contains:
 * - Weekly Digest: Sunday 9:00 AM UTC - summarizes all watches
 * - Still-Available Reminders: Daily check for 3-day-old deals >20% off
 * - Daily Price Snapshot: 00:05 UTC - aggregates current deals into history
 * - Expired Deals Cleanup: 00:10 UTC - removes stale current deals
 */

import { query } from '../db/index.js';
import { sendMessage } from '../telegram/bot.js';
import { 
  escapeMarkdownV2, 
  formatPrice, 
  formatLink,
  formatStillAvailableReminder 
} from '../telegram/escape.js';
import { searchEbay, normalizeEbayListing } from '../providers/ebay/index.js';
import { snapshotDailyPrices, cleanupExpiredDeals } from '../services/currentDeals.js';

// ============================================
// TYPES
// ============================================

interface DigestUser {
  id: number;
  email: string;
  telegram_chat_id: number;
  ship_to_country: string;
  timezone: string;
}

interface DigestWatch {
  id: number;
  set_number: string;
  set_name: string | null;
  target_total_price_eur: number;
  total_alerts_sent: number;
  last_alert_at: Date | null;
  status: string;
}

interface DigestAlert {
  set_number: string;
  total_eur: number;
  listing_url: string;
  created_at: Date;
}

interface ReminderCandidate {
  user_id: number;
  watch_id: number;
  set_number: string;
  set_name: string | null;
  target_total_price_eur: number;
  listing_id: string;
  listing_price: number;
  listing_url: string | null;
  notified_at: Date;
  telegram_chat_id: number;
  ship_to_country: string;
  reminder_count: number;
}

// ============================================
// WEEKLY DIGEST JOB
// ============================================

/**
 * Get all users who have weekly digest enabled and Telegram connected
 */
async function getDigestUsers(): Promise<DigestUser[]> {
  const result = await query<DigestUser>(
    `SELECT id, email, telegram_chat_id, ship_to_country, timezone
     FROM users
     WHERE weekly_digest_enabled = true
       AND telegram_chat_id IS NOT NULL
       AND deleted_at IS NULL
       AND subscription_status = 'active'`
  );
  return result.rows;
}

/**
 * Get watches for a user
 */
async function getUserWatches(userId: number): Promise<DigestWatch[]> {
  const result = await query<DigestWatch>(
    `SELECT w.id, w.set_number, s.name as set_name, w.target_total_price_eur, 
            w.total_alerts_sent, w.last_alert_at, w.status
     FROM watches w
     LEFT JOIN sets s ON w.set_number = s.set_number
     WHERE w.user_id = $1
     ORDER BY w.status = 'active' DESC, w.total_alerts_sent DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get best alerts from the past week for a user
 */
async function getWeeklyAlerts(userId: number): Promise<DigestAlert[]> {
  const result = await query<DigestAlert>(
    `SELECT set_number, MIN(total_eur) as total_eur, 
            listing_url, MAX(created_at) as created_at
     FROM alert_history
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '7 days'
       AND status = 'sent'
     GROUP BY set_number, listing_url
     ORDER BY total_eur ASC
     LIMIT 10`,
    [userId]
  );
  return result.rows;
}

/**
 * Format the weekly digest message
 */
function formatWeeklyDigest(
  watches: DigestWatch[],
  alerts: DigestAlert[]
): string {
  const activeWatches = watches.filter(w => w.status === 'active');
  const totalAlerts = watches.reduce((sum, w) => sum + (w.total_alerts_sent || 0), 0);
  
  let message = `📊 *Weekly ScoutLoot Digest*\n\n`;
  
  // Summary stats
  message += `📋 *Your Watches:* ${activeWatches.length} active`;
  if (watches.length > activeWatches.length) {
    message += ` \\(${watches.length - activeWatches.length} paused\\)`;
  }
  message += `\n`;
  message += `🔔 *Alerts This Week:* ${alerts.length}\n`;
  message += `📈 *Total Alerts Ever:* ${totalAlerts}\n\n`;
  
  // Best deals this week
  if (alerts.length > 0) {
    message += `🏆 *Best Deals This Week:*\n`;
    for (const alert of alerts.slice(0, 5)) {
      const watch = watches.find(w => w.set_number === alert.set_number);
      const setName = watch?.set_name || alert.set_number;
      const targetPrice = watch ? Number(watch.target_total_price_eur) : 0;
      const savings = targetPrice > 0 ? targetPrice - Number(alert.total_eur) : 0;
      const savingsPercent = targetPrice > 0 
        ? Math.round((savings / targetPrice) * 100) 
        : 0;
      
      message += `\n• *${escapeMarkdownV2(alert.set_number)}* \\- ${escapeMarkdownV2(setName)}\n`;
      message += `  💰 ${formatPrice(alert.total_eur)}`;
      if (savingsPercent > 0) {
        message += ` \\(${savingsPercent}% off\\)`;
      }
      message += `\n`;
    }
    message += `\n`;
  } else {
    message += `_No deals found this week matching your criteria\\._\n\n`;
  }
  
  // Active watches summary
  if (activeWatches.length > 0) {
    message += `👀 *Active Watches:*\n`;
    for (const watch of activeWatches.slice(0, 10)) {
      const setName = watch.set_name || watch.set_number;
      message += `• ${escapeMarkdownV2(watch.set_number)} \\- ${escapeMarkdownV2(setName)} \\(target: ${formatPrice(watch.target_total_price_eur)}\\)\n`;
    }
    if (activeWatches.length > 10) {
      message += `_\\.\\.\\. and ${activeWatches.length - 10} more_\n`;
    }
    message += `\n`;
  }
  
  // Footer with unsubscribe instructions
  message += `_Manage your watches at ${formatLink('scoutloot\\.com', 'https://scoutloot.com')}_\n\n`;
  message += `📧 _To unsubscribe from weekly digests:_\n`;
  message += `_1\\. Go to ${formatLink('scoutloot\\.com', 'https://scoutloot.com')}_\n`;
  message += `_2\\. Click Settings \\(⚙️\\)_\n`;
  message += `_3\\. Uncheck "Weekly Digest"_`;
  
  return message;
}

/**
 * Run the weekly digest job
 */
export async function runWeeklyDigest(): Promise<{
  usersProcessed: number;
  messagesSent: number;
  errors: string[];
}> {
  console.log('[Weekly Digest] Starting...');
  
  const result = {
    usersProcessed: 0,
    messagesSent: 0,
    errors: [] as string[],
  };
  
  try {
    const users = await getDigestUsers();
    console.log(`[Weekly Digest] Found ${users.length} users with digest enabled`);
    
    for (const user of users) {
      try {
        const watches = await getUserWatches(user.id);
        const alerts = await getWeeklyAlerts(user.id);
        
        // Skip if user has no watches
        if (watches.length === 0) {
          console.log(`[Weekly Digest] Skipping user ${user.id} - no watches`);
          continue;
        }
        
        const message = formatWeeklyDigest(watches, alerts);
        
        const sendResult = await sendMessage(user.telegram_chat_id, message, {
          parse_mode: 'MarkdownV2',
        });
        
        if (sendResult.success) {
          result.messagesSent++;
          console.log(`[Weekly Digest] Sent to user ${user.id}`);
        } else {
          result.errors.push(`User ${user.id}: ${sendResult.error}`);
          console.error(`[Weekly Digest] Failed for user ${user.id}: ${sendResult.error}`);
        }
        
        result.usersProcessed++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        const errorMsg = `User ${user.id}: ${error}`;
        result.errors.push(errorMsg);
        console.error(`[Weekly Digest] Error:`, errorMsg);
      }
    }
    
  } catch (error) {
    const errorMsg = `Fatal error: ${error}`;
    result.errors.push(errorMsg);
    console.error(`[Weekly Digest] ${errorMsg}`);
  }
  
  console.log(`[Weekly Digest] Complete - ${result.messagesSent}/${result.usersProcessed} sent`);
  return result;
}

// ============================================
// STILL-AVAILABLE REMINDERS JOB
// ============================================

/**
 * Get candidates for "still available" reminders:
 * - User has still_available_reminders enabled
 * - User has Telegram connected
 * - Notification was sent 3+ days ago
 * - Deal is >20% below target price
 * - Haven't sent more than 2 reminders for this watch
 */
async function getReminderCandidates(): Promise<ReminderCandidate[]> {
  const result = await query<ReminderCandidate>(
    `SELECT 
       wns.watch_id,
       wns.listing_id,
       wns.listing_price,
       wns.listing_url,
       wns.notified_at,
       wns.reminder_count,
       w.user_id,
       w.set_number,
       w.target_total_price_eur,
       s.name as set_name,
       u.telegram_chat_id,
       u.ship_to_country
     FROM watch_notification_state wns
     JOIN watches w ON wns.watch_id = w.id
     JOIN users u ON w.user_id = u.id
     LEFT JOIN sets s ON w.set_number = s.set_number
     WHERE u.still_available_reminders = true
       AND u.telegram_chat_id IS NOT NULL
       AND u.deleted_at IS NULL
       AND u.subscription_status = 'active'
       AND w.status = 'active'
       AND wns.notified_at <= NOW() - INTERVAL '3 days'
       AND wns.reminder_count < 2
       AND (wns.reminder_sent_at IS NULL OR wns.reminder_sent_at <= NOW() - INTERVAL '3 days')
       AND wns.listing_price < w.target_total_price_eur * 0.80  -- >20% off
     ORDER BY wns.notified_at ASC`
  );
  return result.rows;
}

/**
 * Check if a listing is still available on eBay
 */
async function isListingStillAvailable(
  listingId: string,
  setNumber: string,
  shipToCountry: string
): Promise<{ available: boolean; currentPrice?: number }> {
  try {
    // Search for the set to get current listings
    const searchResults = await searchEbay(setNumber, shipToCountry, { limit: 50 });
    
    if (!searchResults.itemSummaries) {
      return { available: false };
    }
    
    // Look for our specific listing
    const listing = searchResults.itemSummaries.find(item => item.itemId === listingId);
    
    if (listing) {
      const normalized = normalizeEbayListing(listing, setNumber, shipToCountry);
      return { 
        available: true, 
        currentPrice: normalized.total_eur 
      };
    }
    
    return { available: false };
  } catch (error) {
    console.error(`[Reminder] Error checking listing ${listingId}:`, error);
    // On error, assume not available to avoid spamming
    return { available: false };
  }
}

/**
 * Update reminder state after sending
 */
async function updateReminderState(watchId: number): Promise<void> {
  await query(
    `UPDATE watch_notification_state 
     SET reminder_sent_at = NOW(), 
         reminder_count = reminder_count + 1,
         updated_at = NOW()
     WHERE watch_id = $1`,
    [watchId]
  );
}

/**
 * Run the still-available reminders job
 */
export async function runStillAvailableReminders(): Promise<{
  candidatesFound: number;
  stillAvailable: number;
  remindersSent: number;
  errors: string[];
}> {
  console.log('[Still-Available Reminders] Starting...');
  
  const result = {
    candidatesFound: 0,
    stillAvailable: 0,
    remindersSent: 0,
    errors: [] as string[],
  };
  
  try {
    const candidates = await getReminderCandidates();
    result.candidatesFound = candidates.length;
    console.log(`[Still-Available Reminders] Found ${candidates.length} candidates`);
    
    for (const candidate of candidates) {
      try {
        // Check if listing is still available
        const availability = await isListingStillAvailable(
          candidate.listing_id,
          candidate.set_number,
          candidate.ship_to_country
        );
        
        if (!availability.available) {
          console.log(`[Still-Available Reminders] Listing ${candidate.listing_id} no longer available`);
          continue;
        }
        
        result.stillAvailable++;
        
        // Calculate days since notification
        const notifiedAt = new Date(candidate.notified_at);
        const daysAvailable = Math.floor(
          (Date.now() - notifiedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Use current price if we got it, otherwise use stored price
        const price = availability.currentPrice || Number(candidate.listing_price);
        
        // Format and send the reminder
        const message = formatStillAvailableReminder({
          setNumber: candidate.set_number,
          setName: candidate.set_name || candidate.set_number,
          price: price,
          targetPrice: Number(candidate.target_total_price_eur),
          daysAvailable: daysAvailable,
          listingUrl: candidate.listing_url || '',
        });
        
        const sendResult = await sendMessage(candidate.telegram_chat_id, message, {
          parse_mode: 'MarkdownV2',
        });
        
        if (sendResult.success) {
          await updateReminderState(candidate.watch_id);
          result.remindersSent++;
          console.log(`[Still-Available Reminders] Sent reminder for watch ${candidate.watch_id}`);
        } else {
          result.errors.push(`Watch ${candidate.watch_id}: ${sendResult.error}`);
          console.error(`[Still-Available Reminders] Failed for watch ${candidate.watch_id}: ${sendResult.error}`);
        }
        
        // Delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        const errorMsg = `Watch ${candidate.watch_id}: ${error}`;
        result.errors.push(errorMsg);
        console.error(`[Still-Available Reminders] Error:`, errorMsg);
      }
    }
    
  } catch (error) {
    const errorMsg = `Fatal error: ${error}`;
    result.errors.push(errorMsg);
    console.error(`[Still-Available Reminders] ${errorMsg}`);
  }
  
  console.log(`[Still-Available Reminders] Complete - ${result.remindersSent} sent (${result.stillAvailable} still available)`);
  return result;
}

// ============================================
// DAILY PRICE SNAPSHOT JOB (NEW)
// ============================================

/**
 * Run the daily price snapshot job
 * Aggregates current deals into historical price data
 */
export async function runDailyPriceSnapshot(): Promise<{
  setsProcessed: number;
  rowsInserted: number;
  error: string | null;
}> {
  console.log('[Daily Price Snapshot] Starting...');
  
  try {
    const result = await snapshotDailyPrices();
    
    console.log(`[Daily Price Snapshot] Complete - ${result.setsProcessed} sets, ${result.rowsInserted} rows`);
    
    return {
      setsProcessed: result.setsProcessed,
      rowsInserted: result.rowsInserted,
      error: null,
    };
  } catch (error) {
    const errorMsg = `Error: ${error}`;
    console.error(`[Daily Price Snapshot] ${errorMsg}`);
    return {
      setsProcessed: 0,
      rowsInserted: 0,
      error: errorMsg,
    };
  }
}

// ============================================
// EXPIRED DEALS CLEANUP JOB (NEW)
// ============================================

/**
 * Run the expired deals cleanup job
 * Removes stale current deals that have expired
 */
export async function runExpiredDealsCleanup(): Promise<{
  dealsRemoved: number;
  error: string | null;
}> {
  console.log('[Expired Deals Cleanup] Starting...');
  
  try {
    const dealsRemoved = await cleanupExpiredDeals();
    
    console.log(`[Expired Deals Cleanup] Complete - removed ${dealsRemoved} expired deals`);
    
    return {
      dealsRemoved,
      error: null,
    };
  } catch (error) {
    const errorMsg = `Error: ${error}`;
    console.error(`[Expired Deals Cleanup] ${errorMsg}`);
    return {
      dealsRemoved: 0,
      error: errorMsg,
    };
  }
}
