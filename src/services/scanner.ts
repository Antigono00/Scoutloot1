import { v4 as uuidv4 } from 'uuid';
import { searchEbay, normalizeEbayListing, filterByShipFrom, filterByValidShipping } from '../providers/ebay/index.js';
import { NormalizedListing } from '../providers/ebay/types.js';
import { getActiveScanGroups, getWatchesForScanGroup, incrementWatchAlertCount } from './watches.js';
import { upsertListings, markListingsInactive } from './listings.js';
import { createAlert } from './alerts.js';
import { calculateDelay, getTierLimitsFromDb } from './delay.js';
import { enqueueTelegramAlert } from '../jobs/telegramQueue.js';
import { formatDealAlertMessage } from '../telegram/escape.js';
import { containsExcludeWord } from '../utils/normalize.js';
import { getSet } from './sets.js';
import { getUserById } from './users.js';
import { filterListing } from '../utils/listingFilter.js';
import { generateAffiliateUrlForCountry } from '../utils/affiliate.js';
import { getMarketplaceForCountry } from '../providers/ebay/client.js';
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
 * 
 * v6 IMPROVED: Don't trust title keywords for cross-border shipping
 * 
 * "versandkostenfrei" in title often means domestic free shipping, not international.
 * Sellers use these keywords for SEO but don't actually ship internationally.
 * 
 * Returns true if:
 * 1. shipping_eur > 0 (explicit shipping cost from eBay API)
 * 2. Same-country shipping (domestic, shipping=0 is likely free)
 * 
 * Returns false if:
 * - shipping_eur = 0 AND cross-border (even with "free shipping" in title)
 *   (likely means "no shipping available" to destination country)
 */
function hasValidShipping(listing: NormalizedListing, shipToCountry: string): boolean {
  // Case 1: Explicit positive shipping cost from eBay API - always valid
  // This means eBay calculated a shipping cost to the destination country
  if (listing.shipping_eur > 0) {
    return true;
  }
  
  // Case 2: Same-country shipping - shipping=0 likely means free domestic shipping
  if (listing.ship_from_country === shipToCountry) {
    return true;
  }
  
  // Handle UK/GB aliases
  const fromUK = listing.ship_from_country?.toUpperCase() === 'GB' || 
                 listing.ship_from_country?.toUpperCase() === 'UK';
  const toUK = shipToCountry.toUpperCase() === 'GB' || 
               shipToCountry.toUpperCase() === 'UK';
  
  if (fromUK && toUK) {
    return true; // UK to UK domestic
  }
  
  // Handle US/CA within North America block
  const fromUS = listing.ship_from_country?.toUpperCase() === 'US';
  const fromCA = listing.ship_from_country?.toUpperCase() === 'CA';
  const toUS = shipToCountry.toUpperCase() === 'US';
  const toCA = shipToCountry.toUpperCase() === 'CA';
  
  if (fromUS && toUS) return true; // US domestic
  if (fromCA && toCA) return true; // CA domestic
  
  // Case 3: Cross-border with shipping=0 = NO SHIPPING AVAILABLE
  // Don't trust title keywords like "versandkostenfrei" - they refer to domestic shipping
  // eBay returns shipping=0 when seller doesn't ship to destination country
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

  // ============================================
  // SMART QUALITY FILTER (v6)
  // Now includes:
  // - Brand filtering (rejects COBI, Mega Bloks, etc.)
  // - LEGO brand requirement (filters out bearings, unrelated products)
  // - Condition filtering ("Neu: Sonstige" rejection when user wants new)
  // - LED lighting kit filtering (V12)
  // ============================================
  const beforeQualityFilter = filtered.length;
  filtered = filtered.filter((l) => {
    // v6: Pass condition info to filter
    const filterResult = filterListing(
      l.title, 
      watch.set_number, 
      setName, 
      l.total_eur,
      50, // minQualityScore
      l.condition, // raw condition string from eBay
      watch.condition as 'new' | 'used' | 'any' // user's condition preference
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

  // ============================================
  // REMAINING FILTERS
  // ============================================
  
  // Filter by ship_from_countries
  filtered = filterByShipFrom(filtered, watch.ship_from_countries);

  // NOTE: Condition filter is now handled in filterListing above
  // This catches "Neu: Sonstige" and other edge cases properly

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

  // Filter by minimum price (user's floor)
  const minTotalEur = Number(watch.min_total_eur) || 0;
  if (minTotalEur > 0) {
    const beforeMinPrice = filtered.length;
    filtered = filtered.filter((l) => l.total_eur >= minTotalEur);
    const filteredByMinPrice = beforeMinPrice - filtered.length;
    if (filteredByMinPrice > 0) {
      console.log(`[${requestId}] Filtered out ${filteredByMinPrice} listings below min price €${minTotalEur}`);
    }
  }

  // Filter out suspicious zero shipping (v5: improved logic)
  const beforeShippingFilter = filtered.length;
  filtered = filtered.filter((l) => hasValidShipping(l, shipToCountry));
  const filteredByShipping = beforeShippingFilter - filtered.length;
  result.filteredByShipping += filteredByShipping;
  if (filteredByShipping > 0) {
    console.log(`[${requestId}] Filtered out ${filteredByShipping} listings with no shipping to ${shipToCountry}`);
  }

  // Filter by target price (must be at or below target)
  // NOTE: total_eur now includes import charges
  const matches = filtered.filter((l) => l.total_eur <= Number(watch.target_total_price_eur));

  result.matchesFound += matches.length;

  if (matches.length === 0) {
    return; // Nothing below target
  }

  // Sort by price, get best deal
  const sortedMatches = [...matches].sort((a, b) => a.total_eur - b.total_eur);
  const bestDeal = sortedMatches[0];

  // ============================================
  // SMART NOTIFICATION LOGIC
  // Only notify when something changes
  // ============================================
  
  const lastState = await getNotificationState(watch.id);
  const decision = decideNotification(
    bestDeal.total_eur,
    bestDeal.id,
    lastState,
    matches  // Pass all matches to check if previous listing still exists
  );

  if (!decision.shouldNotify) {
    console.log(`[${requestId}] Set ${watch.set_number}: ${decision.message} - skipping`);
    result.skippedNoChange++;
    return;
  }

  // Log the notification reason
  console.log(`[${requestId}] Set ${watch.set_number}: ${decision.reason.toUpperCase()} - ${decision.message}`);

  // Create alert and send notification
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

  const alert = await createAlert({
    user_id: watch.user_id,
    watch_id: watch.id,
    platform: 'ebay',
    listing_id: listing.id,
    listing_scanned_for_country: listing.scanned_for_country,
    set_number: listing.set_number,
    alert_source: 'ebay',
    price_eur: listing.price_eur,
    shipping_eur: listing.shipping_eur,
    import_charges_eur: listing.import_charges_eur,
    import_charges_estimated: listing.import_charges_estimated,
    total_eur: listing.total_eur,
    target_price_eur: Number(watch.target_total_price_eur),
    seller_id: listing.seller_id,
    listing_fingerprint: listing.listing_fingerprint,
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

  if (!watch.telegram_chat_id) {
    console.log(`[${requestId}] User ${watch.user_id} has no Telegram connected`);
    return;
  }

  // ============================================
  // AFFILIATE LINK GENERATION (V13)
  // Convert listing URL to affiliate-tracked URL
  // ============================================
  const marketplace = getMarketplaceForCountry(shipToCountry);
  const affiliateUrl = generateAffiliateUrlForCountry(listing.url, shipToCountry);
  
  // Log if affiliate tracking is active
  if (affiliateUrl !== listing.url) {
    console.log(`[${requestId}] Affiliate URL generated for marketplace ${marketplace}`);
  }

  // V12: Include currency in message formatting
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
    listingUrl: affiliateUrl, // Use affiliate URL in message
    shipFromCountry: listing.ship_from_country,
    notifyReason: notifyReason,
    // Import charges
    importCharges: listing.import_charges_eur,
    importChargesEstimated: listing.import_charges_estimated,
    // Currency (V12) - use original currency from listing
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
            { text: '🔗 View on eBay', url: affiliateUrl }, // Use affiliate URL in button
          ]],
        },
      },
    },
    {
      delay: delay.delayMs,
      jobId: `alert-${alert.id}`,
    }
  );

  await incrementWatchAlertCount(watch.id);

  result.alertsQueued++;
  console.log(`[${requestId}] Alert ${alert.id} queued for user ${watch.user_id} (reason: ${notifyReason}, delay: ${delay.reason ?? 'none'})`);
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
