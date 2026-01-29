import { v4 as uuidv4 } from 'uuid';
// eBay imports
import { searchEbay, normalizeEbayListing, filterByShipFrom, filterByValidShipping } from '../providers/ebay/index.js';
import { NormalizedListing } from '../providers/ebay/types.js';
// BrickOwl imports
import {
  scanBrickOwlForSet,
  scanBrickOwlForMinifig,
  normalizeBrickOwlSetListings,
  normalizeBrickOwlMinifigListings,
  applyBrickOwlFilters,
  isBrickOwlConfigured,
  BrickOwlNormalizedListing,
} from '../providers/brickowl/index.js';
// Services
import { getActiveScanGroups, getWatchesForScanGroup, incrementWatchAlertCount, Watch } from './watches.js';
import { upsertListings, markListingsInactive } from './listings.js';
import { createAlert } from './alerts.js';
import { calculateDelay, getTierLimitsFromDb } from './delay.js';
import { enqueueTelegramAlert } from '../jobs/telegramQueue.js';
import { enqueuePushAlert } from '../jobs/pushQueue.js';
import { formatDealAlertMessage } from '../telegram/escape.js';
import { containsExcludeWord } from '../utils/normalize.js';
import { getSet } from './sets.js';
import { getMinifig } from './minifigs.js';
import { getUserById } from './users.js';
import { userHasPushEnabled } from './push.js';
// Filters
import { filterListing } from '../utils/listingFilter.js';
import { filterMinifigListing } from '../utils/listingFilterMinifig.js';
// Utils
import { generateAffiliateUrlForCountry } from '../utils/affiliate.js';
import { getMarketplaceForCountry } from '../providers/ebay/client.js';
import { config, isBrickOwlEnabled } from '../config.js';
import { 
  getNotificationState, 
  updateNotificationState, 
  decideNotification,
  NotificationDecision 
} from './notificationState.js';
import { updateSetCurrentDeals } from './currentDeals.js';

// ============================================
// RATE LIMITING CONFIG
// ============================================

// Delay between eBay API calls (milliseconds)
const DELAY_BETWEEN_EBAY_SCANS_MS = 1500; // 1.5 seconds

// Delay between BrickOwl API calls (milliseconds)
const DELAY_BETWEEN_BRICKOWL_SCANS_MS = 600; // 0.6 seconds (BrickOwl is more lenient)

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

// ============================================
// SCAN RESULT TYPES
// ============================================

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
  currentDealsUpdated: number;
  // New: BrickOwl stats
  brickOwlListingsFound: number;
  brickOwlMatchesFound: number;
  // New: Item type breakdown
  setsScanned: number;
  minifigsScanned: number;
  errors: string[];
  durationMs: number;
}

// ============================================
// MAIN SCAN CYCLE
// ============================================

export async function runScanCycle(): Promise<ScanResult> {
  // Night pause check
  if (!shouldScanNow()) {
    return createEmptyResult('night-pause');
  }

  const requestId = uuidv4().slice(0, 8);
  const startTime = Date.now();
  
  const result: ScanResult = createEmptyResult(requestId);
  
  console.log(`[${requestId}] Starting scan cycle`);
  console.log(`[${requestId}] BrickOwl enabled: ${isBrickOwlEnabled()}`);

  try {
    const scanGroups = await getActiveScanGroups();
    console.log(`[${requestId}] Found ${scanGroups.length} scan groups`);

    for (let i = 0; i < scanGroups.length; i++) {
      const group = scanGroups[i];
      
      try {
        if (group.item_type === 'set') {
          await processScanGroupSet(group, requestId, result);
          result.setsScanned++;
        } else if (group.item_type === 'minifig') {
          await processScanGroupMinifig(group, requestId, result);
          result.minifigsScanned++;
        }
        
        result.groupsScanned++;
        
        // Rate limiting: delay between API calls (except after last one)
        if (i < scanGroups.length - 1) {
          await sleep(DELAY_BETWEEN_EBAY_SCANS_MS);
        }
      } catch (error) {
        const errorMsg = `Error scanning ${group.item_type}/${group.item_id}/${group.ship_to_country}: ${error}`;
        console.error(`[${requestId}] ${errorMsg}`);
        result.errors.push(errorMsg);
        
        // If we hit rate limits (429), add extra delay
        if (String(error).includes('429')) {
          console.log(`[${requestId}] Rate limited - adding 5s cooldown`);
          await sleep(5000);
        }
      }
    }

  } catch (error) {
    const errorMsg = `Scan cycle error: ${error}`;
    console.error(`[${requestId}] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  result.durationMs = Date.now() - startTime;
  console.log(`[${requestId}] Scan cycle complete:`, JSON.stringify(result, null, 2));

  return result;
}

function createEmptyResult(requestId: string): ScanResult {
  return {
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
    currentDealsUpdated: 0,
    brickOwlListingsFound: 0,
    brickOwlMatchesFound: 0,
    setsScanned: 0,
    minifigsScanned: 0,
    errors: [],
    durationMs: 0,
  };
}

// ============================================
// PROCESS SCAN GROUP - SETS
// ============================================

async function processScanGroupSet(
  group: { item_id: string; ship_to_country: string; enable_brickowl: boolean },
  requestId: string,
  result: ScanResult
): Promise<void> {
  const setNumber = group.item_id;
  const shipToCountry = group.ship_to_country;
  
  console.log(`[${requestId}] Scanning SET: ${setNumber} -> ${shipToCountry}`);

  // Get set info for filtering
  const setInfo = await getSet(setNumber);
  const setName = setInfo?.name ?? null;
  const pieceCount = setInfo?.pieces ?? 500; // Default for shipping estimation

  // ============================================
  // EBAY SCAN
  // ============================================
  const ebayListings = await scanEbayForSet(setNumber, shipToCountry, requestId, result);
  
  // ============================================
  // BRICKOWL SCAN (if enabled)
  // ============================================
  let brickOwlListings: BrickOwlNormalizedListing[] = [];
  
  if (group.enable_brickowl && isBrickOwlEnabled()) {
    console.log(`[${requestId}] Scanning BrickOwl for set ${setNumber}`);
    
    const rawBrickOwlListings = await scanBrickOwlForSet(setNumber, shipToCountry);
    result.brickOwlListingsFound += rawBrickOwlListings.length;
    
    if (rawBrickOwlListings.length > 0) {
      brickOwlListings = normalizeBrickOwlSetListings(
        rawBrickOwlListings,
        setNumber,
        shipToCountry,
        pieceCount,
        setName
      );
      console.log(`[${requestId}] BrickOwl: ${brickOwlListings.length} normalized listings`);
    }
    
    await sleep(DELAY_BETWEEN_BRICKOWL_SCANS_MS);
  }

  // ============================================
  // PROCESS WATCHES
  // ============================================
  const watches = await getWatchesForScanGroup('set', setNumber, shipToCountry);
  console.log(`[${requestId}] Found ${watches.length} watches for set ${setNumber}/${shipToCountry}`);

  for (const watch of watches) {
    await processSetWatchMatches(
      watch, 
      ebayListings, 
      brickOwlListings,
      setName, 
      shipToCountry, 
      requestId, 
      result
    );
  }
}

async function scanEbayForSet(
  setNumber: string,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<NormalizedListing[]> {
  try {
    const searchResponse = await searchEbay(setNumber, shipToCountry);
    const rawListings = searchResponse.itemSummaries ?? [];
    result.listingsFound += rawListings.length;

    if (rawListings.length === 0) {
      console.log(`[${requestId}] eBay: No listings found for ${setNumber}/${shipToCountry}`);
      return [];
    }

    const normalizedListings = rawListings.map((item) =>
      normalizeEbayListing(item, setNumber, shipToCountry)
    );

    const storedCount = await upsertListings(normalizedListings);
    result.listingsStored += storedCount;

    const activeIds = normalizedListings.map((l) => l.id);
    await markListingsInactive(setNumber, shipToCountry, activeIds);

    return normalizedListings;
  } catch (error) {
    console.error(`[${requestId}] eBay scan error for ${setNumber}:`, error);
    return [];
  }
}

// ============================================
// PROCESS SCAN GROUP - MINIFIGS
// ============================================

async function processScanGroupMinifig(
  group: { item_id: string; ship_to_country: string; enable_brickowl: boolean },
  requestId: string,
  result: ScanResult
): Promise<void> {
  const figNum = group.item_id;
  const shipToCountry = group.ship_to_country;
  
  console.log(`[${requestId}] Scanning MINIFIG: ${figNum} -> ${shipToCountry}`);

  // Get minifig info
  const minifigInfo = await getMinifig(figNum);
  const figName = minifigInfo?.name ?? null;

  // ============================================
  // EBAY SCAN (with minifig-specific filter)
  // ============================================
  const ebayListings = await scanEbayForMinifig(figNum, figName, shipToCountry, requestId, result);
  
  // ============================================
  // BRICKOWL SCAN (if enabled)
  // ============================================
  let brickOwlListings: BrickOwlNormalizedListing[] = [];
  
  if (group.enable_brickowl && isBrickOwlEnabled()) {
    console.log(`[${requestId}] Scanning BrickOwl for minifig ${figNum}`);
    
    const rawBrickOwlListings = await scanBrickOwlForMinifig(figNum, shipToCountry);
    result.brickOwlListingsFound += rawBrickOwlListings.length;
    
    if (rawBrickOwlListings.length > 0) {
      brickOwlListings = normalizeBrickOwlMinifigListings(
        rawBrickOwlListings,
        figNum,
        shipToCountry,
        figName
      );
      console.log(`[${requestId}] BrickOwl: ${brickOwlListings.length} normalized minifig listings`);
    }
    
    await sleep(DELAY_BETWEEN_BRICKOWL_SCANS_MS);
  }

  // ============================================
  // PROCESS WATCHES
  // ============================================
  const watches = await getWatchesForScanGroup('minifig', figNum, shipToCountry);
  console.log(`[${requestId}] Found ${watches.length} watches for minifig ${figNum}/${shipToCountry}`);

  for (const watch of watches) {
    await processMinifigWatchMatches(
      watch, 
      ebayListings, 
      brickOwlListings,
      figName, 
      shipToCountry, 
      requestId, 
      result
    );
  }
}

async function scanEbayForMinifig(
  figNum: string,
  figName: string | null,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<NormalizedListing[]> {
  try {
    // Search for minifig on eBay
    // Use fig_num + "minifigure" to get relevant results
    const searchQuery = figNum;
    const searchResponse = await searchEbay(searchQuery, shipToCountry);
    const rawListings = searchResponse.itemSummaries ?? [];
    result.listingsFound += rawListings.length;

    if (rawListings.length === 0) {
      console.log(`[${requestId}] eBay: No listings found for minifig ${figNum}/${shipToCountry}`);
      return [];
    }

    // Normalize listings (reuse eBay normalizer but mark as minifig)
    const normalizedListings = rawListings.map((item) =>
      normalizeEbayListing(item, figNum, shipToCountry)
    );

    // Apply MINIFIG filter (different from set filter!)
    const filteredListings = normalizedListings.filter(listing => {
      const filterResult = filterMinifigListing(
        listing.title,
        figNum,
        figName,
        listing.total_eur,
        40, // Lower quality threshold for minifigs
        listing.condition
      );
      
      if (!filterResult.passed) {
        console.log(`[${requestId}] Minifig filter rejected: "${listing.title.substring(0, 50)}..." - ${filterResult.reason}`);
      }
      
      return filterResult.passed;
    });

    const filteredCount = normalizedListings.length - filteredListings.length;
    if (filteredCount > 0) {
      console.log(`[${requestId}] Minifig filter removed ${filteredCount} of ${normalizedListings.length} listings`);
    }

    return filteredListings;
  } catch (error) {
    console.error(`[${requestId}] eBay minifig scan error for ${figNum}:`, error);
    return [];
  }
}

// ============================================
// PROCESS WATCH MATCHES - SETS
// ============================================

async function processSetWatchMatches(
  watch: Awaited<ReturnType<typeof getWatchesForScanGroup>>[0],
  ebayListings: NormalizedListing[],
  brickOwlListings: BrickOwlNormalizedListing[],
  setName: string | null,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<void> {
  // ============================================
  // FILTER EBAY LISTINGS
  // ============================================
  let filteredEbay = [...ebayListings];

  // Quality filter
  const beforeQualityFilter = filteredEbay.length;
  filteredEbay = filteredEbay.filter((l) => {
    const filterResult = filterListing(
      l.title, 
      watch.item_id, 
      setName, 
      l.total_eur,
      50,
      l.condition,
      watch.condition as 'new' | 'used' | 'any'
    );
    return filterResult.passed;
  });
  result.filteredByQuality += beforeQualityFilter - filteredEbay.length;

  // Ship from filter
  filteredEbay = filterByShipFrom(filteredEbay, watch.ship_from_countries);

  // Seller filters
  filteredEbay = filteredEbay.filter((l) => 
    l.seller_rating === null || l.seller_rating >= Number(watch.min_seller_rating)
  );
  filteredEbay = filteredEbay.filter((l) => 
    l.seller_feedback === null || l.seller_feedback >= watch.min_seller_feedback
  );

  // Exclude words
  if (watch.exclude_words && watch.exclude_words.length > 0) {
    filteredEbay = filteredEbay.filter((l) => !containsExcludeWord(l.title, watch.exclude_words!));
  }

  // Min price
  const minTotalEur = Number(watch.min_total_eur) || 0;
  if (minTotalEur > 0) {
    filteredEbay = filteredEbay.filter((l) => l.total_eur >= minTotalEur);
  }

  // Valid shipping
  const beforeShippingFilter = filteredEbay.length;
  filteredEbay = filteredEbay.filter((l) => hasValidShipping(l, shipToCountry));
  result.filteredByShipping += beforeShippingFilter - filteredEbay.length;

  // ============================================
  // FILTER BRICKOWL LISTINGS
  // ============================================
  let filteredBrickOwl = applyBrickOwlFilters(brickOwlListings, {
    condition: watch.condition as 'new' | 'used' | 'any',
    minFeedback: watch.min_seller_feedback,
    minPriceEur: minTotalEur,
    shipFromCountries: watch.ship_from_countries,
  });

  // ============================================
  // COMBINE AND FIND BEST DEAL
  // ============================================
  const allListings = [
    ...filteredEbay.map(l => ({ ...l, source: 'ebay' as const })),
    ...filteredBrickOwl.map(l => ({ ...l, source: 'brickowl' as const })),
  ];

  // Update current deals (for set pages)
  if (filteredEbay.length > 0) {
    try {
      await updateSetCurrentDeals(watch.item_id, filteredEbay, shipToCountry);
      result.currentDealsUpdated++;
    } catch (error) {
      console.error(`[${requestId}] Failed to update current deals:`, error);
    }
  }

  // Filter by target price
  const targetPrice = Number(watch.target_total_price_eur);
  const matches = allListings.filter((l) => l.total_eur <= targetPrice);
  
  result.matchesFound += matches.length;
  if (matches.some(m => m.source === 'brickowl')) {
    result.brickOwlMatchesFound++;
  }

  if (matches.length === 0) {
    return;
  }

  // Sort and get best
  const sortedMatches = [...matches].sort((a, b) => a.total_eur - b.total_eur);
  const bestDeal = sortedMatches[0];

  // Notification decision
  const lastState = await getNotificationState(watch.id);
  const decision = decideNotification(
    bestDeal.total_eur,
    bestDeal.id,
    lastState,
    matches as any
  );

  if (!decision.shouldNotify) {
    console.log(`[${requestId}] Set ${watch.item_id}: ${decision.message} - skipping`);
    result.skippedNoChange++;
    return;
  }

  console.log(`[${requestId}] Set ${watch.item_id}: ${decision.reason.toUpperCase()} from ${bestDeal.source}`);

  // Create alert
  await createAlertForSetMatch(
    watch, 
    bestDeal as any, 
    setName ?? watch.item_id, 
    shipToCountry, 
    requestId, 
    result, 
    decision.reason
  );

  // Update state
  await updateNotificationState(
    watch.id,
    bestDeal.id,
    bestDeal.total_eur,
    bestDeal.title,
    bestDeal.url,
    decision.reason
  );
}

// ============================================
// PROCESS WATCH MATCHES - MINIFIGS
// ============================================

async function processMinifigWatchMatches(
  watch: Awaited<ReturnType<typeof getWatchesForScanGroup>>[0],
  ebayListings: NormalizedListing[],
  brickOwlListings: BrickOwlNormalizedListing[],
  figName: string | null,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<void> {
  // ============================================
  // FILTER EBAY LISTINGS (already filtered by minifig filter during scan)
  // ============================================
  let filteredEbay = [...ebayListings];

  // Ship from filter
  filteredEbay = filterByShipFrom(filteredEbay, watch.ship_from_countries);

  // Seller filters (lower thresholds for minifigs)
  filteredEbay = filteredEbay.filter((l) => 
    l.seller_rating === null || l.seller_rating >= Number(watch.min_seller_rating)
  );
  filteredEbay = filteredEbay.filter((l) => 
    l.seller_feedback === null || l.seller_feedback >= watch.min_seller_feedback
  );

  // Exclude words
  if (watch.exclude_words && watch.exclude_words.length > 0) {
    filteredEbay = filteredEbay.filter((l) => !containsExcludeWord(l.title, watch.exclude_words!));
  }

  // Min price
  const minTotalEur = Number(watch.min_total_eur) || 0;
  if (minTotalEur > 0) {
    filteredEbay = filteredEbay.filter((l) => l.total_eur >= minTotalEur);
  }

  // ============================================
  // FILTER BRICKOWL LISTINGS
  // ============================================
  let filteredBrickOwl = applyBrickOwlFilters(brickOwlListings, {
    condition: watch.condition as 'new' | 'used' | 'any',
    minFeedback: watch.min_seller_feedback,
    minPriceEur: minTotalEur,
    shipFromCountries: watch.ship_from_countries,
  });

  // ============================================
  // COMBINE AND FIND BEST DEAL
  // ============================================
  const allListings = [
    ...filteredEbay.map(l => ({ ...l, source: 'ebay' as const })),
    ...filteredBrickOwl.map(l => ({ ...l, source: 'brickowl' as const })),
  ];

  // Filter by target price
  const targetPrice = Number(watch.target_total_price_eur);
  const matches = allListings.filter((l) => l.total_eur <= targetPrice);
  
  result.matchesFound += matches.length;
  if (matches.some(m => m.source === 'brickowl')) {
    result.brickOwlMatchesFound++;
  }

  if (matches.length === 0) {
    return;
  }

  // Sort and get best
  const sortedMatches = [...matches].sort((a, b) => a.total_eur - b.total_eur);
  const bestDeal = sortedMatches[0];

  // Notification decision
  const lastState = await getNotificationState(watch.id);
  const decision = decideNotification(
    bestDeal.total_eur,
    bestDeal.id,
    lastState,
    matches as any
  );

  if (!decision.shouldNotify) {
    console.log(`[${requestId}] Minifig ${watch.item_id}: ${decision.message} - skipping`);
    result.skippedNoChange++;
    return;
  }

  console.log(`[${requestId}] Minifig ${watch.item_id}: ${decision.reason.toUpperCase()} from ${bestDeal.source}`);

  // Create alert
  await createAlertForMinifigMatch(
    watch, 
    bestDeal as any, 
    figName ?? watch.item_id, 
    shipToCountry, 
    requestId, 
    result, 
    decision.reason
  );

  // Update state
  await updateNotificationState(
    watch.id,
    bestDeal.id,
    bestDeal.total_eur,
    bestDeal.title,
    bestDeal.url,
    decision.reason
  );
}

// ============================================
// CREATE ALERT - SETS
// ============================================

async function createAlertForSetMatch(
  watch: Awaited<ReturnType<typeof getWatchesForScanGroup>>[0],
  listing: NormalizedListing & { source: 'ebay' | 'brickowl' },
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
    watch.item_id,
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

  // Generate affiliate URL for eBay listings
  const listingUrl = listing.source === 'ebay' 
    ? generateAffiliateUrlForCountry(listing.url, shipToCountry)
    : listing.url;

  // Create the alert
  const alert = await createAlert({
    user_id: watch.user_id,
    watch_id: watch.id,
    platform: listing.source,
    listing_id: listing.id,
    listing_scanned_for_country: listing.scanned_for_country,
    set_number: listing.set_number || watch.item_id,
    set_name: setName,
    alert_source: listing.source,
    price_eur: listing.price_eur,
    shipping_eur: listing.shipping_eur,
    import_charges_eur: listing.import_charges_eur,
    import_charges_estimated: listing.import_charges_estimated,
    total_eur: listing.total_eur,
    target_price_eur: Number(watch.target_total_price_eur),
    seller_id: listing.seller_id,
    listing_fingerprint: listing.listing_fingerprint,
    listing_url: listingUrl,
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

  // Send notifications
  await sendNotifications(
    watch, user, alert, listing, setName, listingUrl, 
    savings, notifyReason, delay, requestId, result
  );

  await incrementWatchAlertCount(watch.id);
}

// ============================================
// CREATE ALERT - MINIFIGS
// ============================================

async function createAlertForMinifigMatch(
  watch: Awaited<ReturnType<typeof getWatchesForScanGroup>>[0],
  listing: (NormalizedListing | BrickOwlNormalizedListing) & { source: 'ebay' | 'brickowl' },
  figName: string,
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
    watch.item_id,
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

  // Generate affiliate URL for eBay listings
  const listingUrl = listing.source === 'ebay' 
    ? generateAffiliateUrlForCountry(listing.url, shipToCountry)
    : listing.url;

  // Create the alert
  const alert = await createAlert({
    user_id: watch.user_id,
    watch_id: watch.id,
    platform: listing.source,
    listing_id: listing.id,
    listing_scanned_for_country: listing.scanned_for_country,
    set_number: watch.item_id, // fig_num for minifigs
    set_name: figName,
    alert_source: listing.source,
    price_eur: listing.price_eur,
    shipping_eur: listing.shipping_eur,
    import_charges_eur: listing.import_charges_eur,
    import_charges_estimated: listing.import_charges_estimated,
    total_eur: listing.total_eur,
    target_price_eur: Number(watch.target_total_price_eur),
    seller_id: listing.seller_id,
    listing_fingerprint: listing.listing_fingerprint,
    listing_url: listingUrl,
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

  // Send notifications
  await sendNotifications(
    watch, user, alert, listing as any, figName, listingUrl, 
    savings, notifyReason, delay, requestId, result,
    true // isMinifig flag
  );

  await incrementWatchAlertCount(watch.id);
}

// ============================================
// SEND NOTIFICATIONS
// ============================================

async function sendNotifications(
  watch: any,
  user: any,
  alert: any,
  listing: any,
  itemName: string,
  listingUrl: string,
  savings: number,
  notifyReason: string,
  delay: any,
  requestId: string,
  result: ScanResult,
  isMinifig: boolean = false
): Promise<void> {
  const itemNumber = watch.item_id;
  const source = listing.source || 'ebay';
  
  // Format source for display
  const sourceName = source === 'brickowl' ? 'BrickOwl' : 'eBay';
  const sourceEmoji = source === 'brickowl' ? '🦉' : '🛒';

  // ============================================
  // TELEGRAM NOTIFICATION
  // ============================================
  if (watch.telegram_chat_id) {
    const messageText = formatDealAlertMessage({
      setNumber: itemNumber,
      setName: itemName,
      price: listing.price_eur,
      shipping: listing.shipping_eur,
      total: listing.total_eur,
      target: watch.target_total_price_eur,
      savings: savings,
      sellerName: listing.seller_username,
      condition: listing.condition ?? 'Unknown',
      listingUrl: listingUrl,
      shipFromCountry: listing.ship_from_country,
      notifyReason: notifyReason,
      importCharges: listing.import_charges_eur,
      importChargesEstimated: listing.import_charges_estimated,
      currency: listing.currency_original,
    });

    // Add source indicator to message
    const sourceIndicator = source === 'brickowl' ? '\n\n🦉 _via BrickOwl_' : '';
    const minifigIndicator = isMinifig ? '\n👤 _Minifigure_' : '';
    const fullMessage = messageText + sourceIndicator + minifigIndicator;

    await enqueueTelegramAlert(
      {
        alertId: alert.id,
        chatId: watch.telegram_chat_id,
        message: {
          text: fullMessage,
          reply_markup: {
            inline_keyboard: [[
              { text: `${sourceEmoji} View on ${sourceName}`, url: listingUrl },
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
    console.log(`[${requestId}] Telegram alert ${alert.id} queued (source: ${source})`);
  }

  // ============================================
  // WEB PUSH NOTIFICATION
  // ============================================
  const hasPush = await userHasPushEnabled(watch.user_id);
  if (hasPush) {
    const reasonText = getNotificationReasonText(notifyReason);
    const currencySymbol = getCurrencySymbol(listing.currency_original);
    const typeIndicator = isMinifig ? '👤 ' : '';
    
    await enqueuePushAlert(
      {
        alertId: alert.id,
        userId: watch.user_id,
        payload: {
          title: `${typeIndicator}${itemNumber} — ${reasonText}`,
          body: `${currencySymbol}${listing.total_eur.toFixed(2)} (save ${currencySymbol}${savings.toFixed(2)}) via ${sourceName}`,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          data: {
            alertId: alert.id,
            setNumber: itemNumber,
            listingUrl: listingUrl,
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
    console.log(`[${requestId}] Push alert ${alert.id} queued`);
  }
}

// ============================================
// HELPERS
// ============================================

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

// ============================================
// SINGLE SET SCAN (for API/testing)
// ============================================

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
