import { v4 as uuidv4 } from 'uuid';
import { searchEbay, normalizeEbayListing, filterByShipFrom, filterByValidShipping } from '../providers/ebay/index.js';
import { NormalizedListing } from '../providers/ebay/types.js';
import { getActiveScanGroups, getWatchesForScanGroup, incrementWatchAlertCount } from './watches.js';
import { upsertListings, markListingsInactive } from './listings.js';
import { createAlert } from './alerts.js';
import { calculateDelay, getTierLimitsFromDb } from './delay.js';
import { enqueueTelegramAlert } from '../jobs/telegramQueue.js';
import { enqueuePushAlert } from '../jobs/pushQueue.js';
import { formatDealAlertMessage } from '../telegram/escape.js';
import { containsExcludeWord } from '../utils/normalize.js';
import { getSet } from './sets.js';
import { getUserById } from './users.js';
import { userHasPushEnabled } from './push.js';
import { filterListing } from '../utils/listingFilter.js';
import { generateAffiliateUrlForCountry } from '../utils/affiliate.js';
import { getMarketplaceForCountry } from '../providers/ebay/client.js';
import { config } from '../config.js';
import { 
  getNotificationState, 
  updateNotificationState, 
  decideNotification,
  NotificationDecision 
} from './notificationState.js';

/**
 * Check if scanning should be active
 * Pauses 00:00-07:00 UTC to save ~29% API calls
 */
function shouldScanNow(): boolean {
  const utcHour = new Date().getUTCHours();
  
  if (utcHour >= 0 && utcHour < 7) {
    console.log(`[Night Pause] Scanner paused during night hours (UTC ${utcHour}:00)`);
    return false;
  }
  
  return true;
}

/**
 * Get human-readable notification reason
 */
function getNotificationReasonText(reason: string): string {
  switch (reason) {
    case 'better_deal':
      return 'Better deal found!';
    case 'previous_sold':
      return 'Previous sold — new best';
    case 'price_drop':
      return 'Price drop!';
    case 'first_notification':
    default:
      return 'Deal alert';
  }
}

export interface ScanResult {
  requestId: string;
  groupsScanned: number;
  listingsFound: number;
  listingsStored: number;
  matchesFound: number;
  alertsCreated: number;
  alertsDeduplicated: number;
  alertsBlocked: number;
  alertsQueued: number;
  pushQueued: number;
  skippedNoChange: number;
  filteredByQuality: number;
  filteredByShipping: number;
  filteredByCondition: number;
  errors: string[];
  durationMs: number;
}

export async function runScanCycle(): Promise<ScanResult> {
  // Night pause check
  if (!shouldScanNow()) {
    return {
      requestId: 'night-pause',
      groupsScanned: 0,
      listingsFound: 0,
      listingsStored: 0,
      matchesFound: 0,
      alertsCreated: 0,
      alertsDeduplicated: 0,
      alertsBlocked: 0,
      alertsQueued: 0,
      pushQueued: 0,
      skippedNoChange: 0,
      filteredByQuality: 0,
      filteredByShipping: 0,
      filteredByCondition: 0,
      errors: [],
      durationMs: 0,
    };
  }

  const requestId = uuidv4().slice(0, 8);
  const startTime = Date.now();
  
  const result: ScanResult = {
    requestId,
    groupsScanned: 0,
    listingsFound: 0,
    listingsStored: 0,
    matchesFound: 0,
    alertsCreated: 0,
    alertsDeduplicated: 0,
    alertsBlocked: 0,
    alertsQueued: 0,
    pushQueued: 0,
    skippedNoChange: 0,
    filteredByQuality: 0,
    filteredByShipping: 0,
    filteredByCondition: 0,
    errors: [],
    durationMs: 0,
  };

  console.log(`[${requestId}] Starting scan cycle`);

  try {
    const scanGroups = await getActiveScanGroups();
    console.log(`[${requestId}] Found ${scanGroups.length} scan groups`);

    for (const group of scanGroups) {
      try {
        await processScanGroup(group.set_number, group.ship_to_country, requestId, result);
        result.groupsScanned++;
      } catch (error) {
        const errorMsg = `Error scanning ${group.set_number}/${group.ship_to_country}: ${error}`;
        console.error(`[${requestId}] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

  } catch (error) {
    const errorMsg = `Scan cycle error: ${error}`;
    console.error(`[${requestId}] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  result.durationMs = Date.now() - startTime;
  console.log(`[${requestId}] Scan cycle complete:`, result);

  return result;
}

async function processScanGroup(
  setNumber: string,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<void> {
  console.log(`[${requestId}] Scanning group: ${setNumber} -> ${shipToCountry}`);

  const setInfo = await getSet(setNumber);
  const setName = setInfo?.name ?? null;

  const searchResponse = await searchEbay(setNumber, shipToCountry);
  const rawListings = searchResponse.itemSummaries ?? [];
  result.listingsFound += rawListings.length;

  if (rawListings.length === 0) {
    console.log(`[${requestId}] No listings found for ${setNumber}/${shipToCountry}`);
    return;
  }

  const normalizedListings = rawListings.map((item) =>
    normalizeEbayListing(item, setNumber, shipToCountry)
  );

  const storedCount = await upsertListings(normalizedListings);
  result.listingsStored += storedCount;

  const activeIds = normalizedListings.map((l) => l.id);
  await markListingsInactive(setNumber, shipToCountry, activeIds);

  const watches = await getWatchesForScanGroup(setNumber, shipToCountry);
  console.log(`[${requestId}] Found ${watches.length} watches for ${setNumber}/${shipToCountry}`);

  for (const watch of watches) {
    await processWatchMatches(watch, normalizedListings, setName, shipToCountry, requestId, result);
  }
}

/**
 * Check if listing has valid shipping info
 */
function hasValidShipping(listing: NormalizedListing, shipToCountry: string): boolean {
  if (listing.shipping_eur > 0) {
    return true;
  }
  
  if (listing.ship_from_country === shipToCountry) {
    return true;
  }
  
  const fromUK = listing.ship_from_country?.toUpperCase() === 'GB' || 
                 listing.ship_from_country?.toUpperCase() === 'UK';
  const toUK = shipToCountry.toUpperCase() === 'GB' || 
               shipToCountry.toUpperCase() === 'UK';
  
  if (fromUK && toUK) {
    return true;
  }
  
  const fromUS = listing.ship_from_country?.toUpperCase() === 'US';
  const fromCA = listing.ship_from_country?.toUpperCase() === 'CA';
  const toUS = shipToCountry.toUpperCase() === 'US';
  const toCA = shipToCountry.toUpperCase() === 'CA';
  
  if (fromUS && toUS) return true;
  if (fromCA && toCA) return true;
  
  return false;
}

async function processWatchMatches(
  watch: Awaited<ReturnType<typeof getWatchesForScanGroup>>[0],
  listings: NormalizedListing[],
  setName: string | null,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<void> {
  let filtered = listings;

  // Quality filter
  const beforeQualityFilter = filtered.length;
  filtered = filtered.filter((l) => {
    const filterResult = filterListing(
      l.title, 
      watch.set_number, 
      setName, 
      l.total_eur,
      50,
      l.condition,
      watch.condition as 'new' | 'used' | 'any'
    );
    if (!filterResult.passed) {
      console.log(`[${requestId}] Quality filter rejected: "${l.title.substring(0, 60)}..." - ${filterResult.reason}`);
    }
    return filterResult.passed;
  });
  const filteredByQuality = beforeQualityFilter - filtered.length;
  result.filteredByQuality += filteredByQuality;
  if (filteredByQuality > 0) {
    console.log(`[${requestId}] Quality filter removed ${filteredByQuality} of ${beforeQualityFilter} listings`);
  }

  // Filter by ship_from_countries
  filtered = filterByShipFrom(filtered, watch.ship_from_countries);

  // Filter by seller rating
  filtered = filtered.filter((l) => 
    l.seller_rating === null || l.seller_rating >= Number(watch.min_seller_rating)
  );

  // Filter by seller feedback count
  filtered = filtered.filter((l) => 
    l.seller_feedback === null || l.seller_feedback >= watch.min_seller_feedback
  );

  // Filter by user's custom exclude words
  if (watch.exclude_words && watch.exclude_words.length > 0) {
    filtered = filtered.filter((l) => !containsExcludeWord(l.title, watch.exclude_words!));
  }

  // Filter by minimum price
  const minTotalEur = Number(watch.min_total_eur) || 0;
  if (minTotalEur > 0) {
    const beforeMinPrice = filtered.length;
    filtered = filtered.filter((l) => l.total_eur >= minTotalEur);
    const filteredByMinPrice = beforeMinPrice - filtered.length;
    if (filteredByMinPrice > 0) {
      console.log(`[${requestId}] Filtered out ${filteredByMinPrice} listings below min price €${minTotalEur}`);
    }
  }

  // Filter out suspicious zero shipping
  const beforeShippingFilter = filtered.length;
  filtered = filtered.filter((l) => hasValidShipping(l, shipToCountry));
  const filteredByShipping = beforeShippingFilter - filtered.length;
  result.filteredByShipping += filteredByShipping;
  if (filteredByShipping > 0) {
    console.log(`[${requestId}] Filtered out ${filteredByShipping} listings with no shipping to ${shipToCountry}`);
  }

  // Filter by target price
  const matches = filtered.filter((l) => l.total_eur <= Number(watch.target_total_price_eur));

  result.matchesFound += matches.length;

  if (matches.length === 0) {
    return;
  }

  // Sort by price, get best deal
  const sortedMatches = [...matches].sort((a, b) => a.total_eur - b.total_eur);
  const bestDeal = sortedMatches[0];

  // Smart notification logic
  const lastState = await getNotificationState(watch.id);
  const decision = decideNotification(
    bestDeal.total_eur,
    bestDeal.id,
    lastState,
    matches
  );

  if (!decision.shouldNotify) {
    console.log(`[${requestId}] Set ${watch.set_number}: ${decision.message} - skipping`);
    result.skippedNoChange++;
    return;
  }

  console.log(`[${requestId}] Set ${watch.set_number}: ${decision.reason.toUpperCase()} - ${decision.message}`);

  // Create alert and send notifications
  await createAlertForMatch(watch, bestDeal, setName ?? watch.set_number, shipToCountry, requestId, result, decision.reason);

  // Update notification state
  await updateNotificationState(
    watch.id,
    bestDeal.id,
    bestDeal.total_eur,
    bestDeal.title,
    bestDeal.url,
    decision.reason
  );
}

async function createAlertForMatch(
  watch: Awaited<ReturnType<typeof getWatchesForScanGroup>>[0],
  listing: NormalizedListing,
  setName: string,
  shipToCountry: string,
  requestId: string,
  result: ScanResult,
  notifyReason: string
): Promise<void> {
  const savings = Number(watch.target_total_price_eur) - listing.total_eur;
  const dealScore = Math.round((savings / Number(watch.target_total_price_eur)) * 100);

  const user = await getUserById(watch.user_id);
  if (!user) {
    console.log(`[${requestId}] User ${watch.user_id} not found`);
    return;
  }

  const tierLimits = await getTierLimitsFromDb(user.subscription_tier);

  const delay = await calculateDelay(
    watch.user_id,
    user.telegram_user_id,
    listing.set_number,
    watch.quiet_hours_start,
    watch.quiet_hours_end,
    watch.timezone,
    tierLimits
  );

  if (delay.blocked) {
    console.log(`[${requestId}] Alert blocked for user ${watch.user_id}: ${delay.reason}`);
    result.alertsBlocked++;
    return;
  }

  // Generate affiliate URL
  const marketplace = getMarketplaceForCountry(shipToCountry);
  const affiliateUrl = generateAffiliateUrlForCountry(listing.url, shipToCountry);
  
  if (affiliateUrl !== listing.url) {
    console.log(`[${requestId}] Affiliate URL generated for marketplace ${marketplace}`);
  }

  // Create the alert with listing_url and set_name
  const alert = await createAlert({
    user_id: watch.user_id,
    watch_id: watch.id,
    platform: 'ebay',
    listing_id: listing.id,
    listing_scanned_for_country: listing.scanned_for_country,
    set_number: listing.set_number,
    set_name: setName,
    alert_source: 'ebay',
    price_eur: listing.price_eur,
    shipping_eur: listing.shipping_eur,
    import_charges_eur: listing.import_charges_eur,
    import_charges_estimated: listing.import_charges_estimated,
    total_eur: listing.total_eur,
    target_price_eur: Number(watch.target_total_price_eur),
    seller_id: listing.seller_id,
    listing_fingerprint: listing.listing_fingerprint,
    listing_url: affiliateUrl,
    deal_score: dealScore,
    notification_type: notifyReason,
    delay_reason: delay.reason ?? undefined,
    scheduled_for: delay.scheduledFor ?? undefined,
    request_id: requestId,
  });

  if (!alert) {
    result.alertsDeduplicated++;
    return;
  }

  result.alertsCreated++;

  // ============================================
  // TELEGRAM NOTIFICATION
  // ============================================
  if (watch.telegram_chat_id) {
    const messageText = formatDealAlertMessage({
      setNumber: listing.set_number,
      setName: setName,
      price: listing.price_eur,
      shipping: listing.shipping_eur,
      total: listing.total_eur,
      target: watch.target_total_price_eur,
      savings: savings,
      sellerName: listing.seller_username,
      condition: listing.condition ?? 'Unknown',
      listingUrl: affiliateUrl,
      shipFromCountry: listing.ship_from_country,
      notifyReason: notifyReason,
      importCharges: listing.import_charges_eur,
      importChargesEstimated: listing.import_charges_estimated,
      currency: listing.currency_original,
    });

    await enqueueTelegramAlert(
      {
        alertId: alert.id,
        chatId: watch.telegram_chat_id,
        message: {
          text: messageText,
          reply_markup: {
            inline_keyboard: [[
              { text: '🔗 View on eBay', url: affiliateUrl },
            ]],
          },
        },
      },
      {
        delay: delay.delayMs,
        jobId: `alert-${alert.id}-tg`,
      }
    );

    result.alertsQueued++;
    console.log(`[${requestId}] Telegram alert ${alert.id} queued for user ${watch.user_id} (reason: ${notifyReason}, delay: ${delay.reason ?? 'none'})`);
  }

  // ============================================
  // WEB PUSH NOTIFICATION
  // ============================================
  const hasPush = await userHasPushEnabled(watch.user_id);
  if (hasPush) {
    const reasonText = getNotificationReasonText(notifyReason);
    const currencySymbol = getCurrencySymbol(listing.currency_original);
    
    await enqueuePushAlert(
      {
        alertId: alert.id,
        userId: watch.user_id,
        payload: {
          title: `${listing.set_number} — ${reasonText}`,
          body: `${currencySymbol}${listing.total_eur.toFixed(2)} (save ${currencySymbol}${savings.toFixed(2)})`,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: {
            alertId: alert.id,
            setNumber: listing.set_number,
            listingUrl: affiliateUrl,
            url: `${config.appBaseUrl}/alerts/${alert.id}`,
          },
          actions: [
            { action: 'buy', title: '🛒 Buy Now' },
            { action: 'view', title: '👁 View' },
          ],
        },
      },
      {
        delay: delay.delayMs,
        jobId: `alert-${alert.id}-push`,
      }
    );

    result.pushQueued++;
    console.log(`[${requestId}] Push alert ${alert.id} queued for user ${watch.user_id}`);
  }

  await incrementWatchAlertCount(watch.id);
}

/**
 * Get currency symbol for display
 */
function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return '€';
  const symbols: Record<string, string> = {
    'EUR': '€',
    'GBP': '£',
    'USD': '$',
    'CAD': 'C$',
  };
  return symbols[currency.toUpperCase()] || '€';
}

export async function scanSingleSet(
  setNumber: string,
  shipToCountry: string
): Promise<NormalizedListing[]> {
  const searchResponse = await searchEbay(setNumber, shipToCountry);
  const rawListings = searchResponse.itemSummaries ?? [];
  
  return rawListings.map((item) =>
    normalizeEbayListing(item, setNumber, shipToCountry)
  );
}
