/**
 * Scheduled Jobs Service
 * 
 * Contains:
 * - Weekly Digest: Sunday 9:00 AM UTC - summarizes all watches
 * - Still-Available Reminders: Daily check for 3-day-old deals >20% off
 * - Daily Price Snapshot: 00:05 UTC - aggregates current deals into history (sets + minifigs)
 * - Expired Deals Cleanup: 00:10 UTC - removes stale current deals (sets + minifigs)
 * 
 * V27: Added minifig price snapshot and cleanup
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
import { snapshotMinifigDailyPrices } from '../services/minifigPriceHistory.js';
import { cleanupExpiredMinifigDeals } from '../services/minifigCurrentDeals.js';

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
    `SELECT DISTINCT ON (set_number) set_number, total_eur, listing_url, created_at
     FROM alert_history
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '7 days'
     ORDER BY set_number, total_eur ASC`,
    [userId]
  );
  return result.rows;
}

/**
 * Format the weekly digest message
 */
function formatDigestMessage(
  watches: DigestWatch[], 
  alerts: DigestAlert[]
): string {
  const lines: string[] = [
    '📊 *Your Weekly ScoutLoot Digest*',
    '',
  ];

  // Summary stats
  const activeWatches = watches.filter(w => w.status === 'active').length;
  const totalAlerts = alerts.length;
  
  lines.push(`📍 *Active Watches:* ${activeWatches}`);
  lines.push(`🔔 *Alerts This Week:* ${totalAlerts}`);
  lines.push('');

  // Best deals of the week
  if (alerts.length > 0) {
    lines.push('🏆 *Best Deals Found:*');
    for (const alert of alerts.slice(0, 5)) {
      const priceStr = formatPrice(alert.total_eur);
      const link = formatLink(alert.listing_url, `${alert.set_number} @ ${priceStr}`);
      lines.push(`  • ${link}`);
    }
    lines.push('');
  }

  // Watches needing attention
  const staleWatches = watches.filter(w => 
    w.status === 'active' && 
    (!w.last_alert_at || (Date.now() - new Date(w.last_alert_at).getTime()) > 14 * 24 * 60 * 60 * 1000)
  );
  
  if (staleWatches.length > 0) {
    lines.push('⚠️ *No deals found recently:*');
    for (const watch of staleWatches.slice(0, 3)) {
      const name = watch.set_name ? escapeMarkdownV2(watch.set_name) : watch.set_number;
      lines.push(`  • ${watch.set_number} \\- ${name}`);
    }
    lines.push('');
  }

  lines.push('_Visit scoutloot\\.com to manage your watches_');

  return lines.join('\n');
}

/**
 * Run the weekly digest job
 */
export async function runWeeklyDigest(): Promise<{
  usersSent: number;
  errors: string[];
}> {
  console.log('[Weekly Digest] Starting...');
  
  const result = {
    usersSent: 0,
    errors: [] as string[],
  };

  try {
    const users = await getDigestUsers();
    console.log(`[Weekly Digest] Found ${users.length} users with digest enabled`);

    for (const user of users) {
      try {
        const [watches, alerts] = await Promise.all([
          getUserWatches(user.id),
          getWeeklyAlerts(user.id),
        ]);

        // Skip if no watches
        if (watches.length === 0) continue;

        const message = formatDigestMessage(watches, alerts);
        
        const sendResult = await sendMessage(user.telegram_chat_id, message, {
          parse_mode: 'MarkdownV2',
        });

        if (sendResult.success) {
          result.usersSent++;
        } else {
          result.errors.push(`User ${user.id}: ${sendResult.error}`);
        }

        // Rate limit: 30 messages per second max
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        result.errors.push(`User ${user.id}: ${error}`);
      }
    }

  } catch (error) {
    result.errors.push(`Fatal error: ${error}`);
  }

  console.log(`[Weekly Digest] Complete - sent to ${result.usersSent} users`);
  return result;
}

// ============================================
// STILL-AVAILABLE REMINDERS JOB
// ============================================

/**
 * Get candidates for still-available reminders
 * Criteria: notified 3+ days ago, not yet reminded, deal was 20%+ off target
 */
async function getStillAvailableCandidates(): Promise<ReminderCandidate[]> {
  const result = await query<ReminderCandidate>(
    `SELECT 
       wns.user_id,
       wns.watch_id,
       w.set_number,
       s.name as set_name,
       w.target_total_price_eur,
       wns.listing_id,
       wns.listing_price,
       l.listing_url,
       wns.notified_at,
       u.telegram_chat_id,
       u.ship_to_country,
       wns.reminder_count
     FROM watch_notification_state wns
     JOIN watches w ON w.id = wns.watch_id
     JOIN users u ON u.id = wns.user_id
     LEFT JOIN sets s ON s.set_number = w.set_number
     LEFT JOIN listings l ON l.listing_id = wns.listing_id
     WHERE wns.notified_at <= NOW() - INTERVAL '3 days'
       AND wns.reminder_count = 0
       AND u.telegram_chat_id IS NOT NULL
       AND u.deleted_at IS NULL
       AND w.status = 'active'
       AND wns.listing_price <= w.target_total_price_eur * 0.8
     ORDER BY wns.notified_at ASC
     LIMIT 50`
  );
  return result.rows;
}

/**
 * Check if a listing is still available
 */
async function isListingStillAvailable(
  setNumber: string,
  listingId: string,
  maxPrice: number,
  shipToCountry: string
): Promise<boolean> {
  try {
    // Search eBay for the set
    const response = await searchEbay(setNumber, shipToCountry);
    const listings = response.itemSummaries || [];
    
    // Check if our listing is still there and under price
    for (const raw of listings) {
      const listing = normalizeEbayListing(raw, setNumber, shipToCountry);
      if (listing.id === listingId && listing.total_eur <= maxPrice) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`[Still-Available] Check failed for ${listingId}:`, error);
    return false;
  }
}

/**
 * Update reminder state after sending
 */
async function updateReminderState(watchId: number): Promise<void> {
  await query(
    `UPDATE watch_notification_state 
     SET reminder_count = reminder_count + 1,
         last_reminder_at = NOW()
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
    const candidates = await getStillAvailableCandidates();
    result.candidatesFound = candidates.length;
    console.log(`[Still-Available Reminders] Found ${candidates.length} candidates`);

    for (const candidate of candidates) {
      try {
        // Check if listing is still available
        const stillAvailable = await isListingStillAvailable(
          candidate.set_number,
          candidate.listing_id,
          candidate.target_total_price_eur,
          candidate.ship_to_country
        );

        if (!stillAvailable) {
          // Mark as reminded anyway to prevent re-checking
          await updateReminderState(candidate.watch_id);
          continue;
        }

        result.stillAvailable++;

        // Send reminder
        const message = formatStillAvailableReminder({
          setNumber: candidate.set_number,
          setName: candidate.set_name || 'Unknown Set',
          targetPrice: candidate.target_total_price_eur,
          price: candidate.listing_price,
          listingUrl: candidate.listing_url || '#',
          daysAvailable: Math.floor((Date.now() - new Date(candidate.notified_at).getTime()) / (24 * 60 * 60 * 1000)),
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
// DAILY PRICE SNAPSHOT JOB (V27: Sets + Minifigs)
// ============================================

/**
 * Run the daily price snapshot job
 * Aggregates current deals into historical price data for BOTH sets and minifigs
 */
export async function runDailyPriceSnapshot(): Promise<{
  setsProcessed: number;
  setsRowsInserted: number;
  minifigsProcessed: number;
  minifigsRowsInserted: number;
  error: string | null;
}> {
  console.log('[Daily Price Snapshot] Starting...');
  
  try {
    // Snapshot sets
    const setResult = await snapshotDailyPrices();
    console.log(`[Daily Price Snapshot] Sets: ${setResult.setsProcessed} processed, ${setResult.rowsInserted} rows`);
    
    // V27: Snapshot minifigs
    let minifigResult = { minifigsProcessed: 0, rowsInserted: 0 };
    try {
      minifigResult = await snapshotMinifigDailyPrices();
      console.log(`[Daily Price Snapshot] Minifigs: ${minifigResult.minifigsProcessed} processed, ${minifigResult.rowsInserted} rows`);
    } catch (minifigError) {
      console.error('[Daily Price Snapshot] Minifig snapshot error:', minifigError);
      // Don't fail the whole job if minifig snapshot fails
    }
    
    console.log('[Daily Price Snapshot] Complete');
    
    return {
      setsProcessed: setResult.setsProcessed,
      setsRowsInserted: setResult.rowsInserted,
      minifigsProcessed: minifigResult.minifigsProcessed,
      minifigsRowsInserted: minifigResult.rowsInserted,
      error: null,
    };
  } catch (error) {
    const errorMsg = `Error: ${error}`;
    console.error(`[Daily Price Snapshot] ${errorMsg}`);
    return {
      setsProcessed: 0,
      setsRowsInserted: 0,
      minifigsProcessed: 0,
      minifigsRowsInserted: 0,
      error: errorMsg,
    };
  }
}

// ============================================
// EXPIRED DEALS CLEANUP JOB (V27: Sets + Minifigs)
// ============================================

/**
 * Run the expired deals cleanup job
 * Removes stale current deals that have expired for BOTH sets and minifigs
 */
export async function runExpiredDealsCleanup(): Promise<{
  setDealsRemoved: number;
  minifigDealsRemoved: number;
  error: string | null;
}> {
  console.log('[Expired Deals Cleanup] Starting...');
  
  try {
    // Cleanup set deals
    const setDealsRemoved = await cleanupExpiredDeals();
    console.log(`[Expired Deals Cleanup] Sets: removed ${setDealsRemoved} expired deals`);
    
    // V27: Cleanup minifig deals
    let minifigDealsRemoved = 0;
    try {
      minifigDealsRemoved = await cleanupExpiredMinifigDeals();
      console.log(`[Expired Deals Cleanup] Minifigs: removed ${minifigDealsRemoved} expired deals`);
    } catch (minifigError) {
      console.error('[Expired Deals Cleanup] Minifig cleanup error:', minifigError);
      // Don't fail the whole job if minifig cleanup fails
    }
    
    console.log('[Expired Deals Cleanup] Complete');
    
    return {
      setDealsRemoved,
      minifigDealsRemoved,
      error: null,
    };
  } catch (error) {
    const errorMsg = `Error: ${error}`;
    console.error(`[Expired Deals Cleanup] ${errorMsg}`);
    return {
      setDealsRemoved: 0,
      minifigDealsRemoved: 0,
      error: errorMsg,
    };
  }
}
