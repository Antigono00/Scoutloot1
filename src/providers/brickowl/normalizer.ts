/**
 * BrickOwl Listing Normalizer
 * 
 * Converts BrickOwl API responses to ScoutLoot's NormalizedListing format
 * for consistent handling across eBay and BrickOwl sources.
 */

import { BrickOwlListing, BrickOwlNormalizedListing } from './types.js';
import {
  estimateSetShipping,
  estimateMinifigShipping,
  calculateImportCharges,
  filterByRegionalBlock,
  convertToEur,
  CURRENCY_TO_EUR,
} from './shipping.js';
import { decodeHtmlEntities } from './client.js';
import { generateListingFingerprint } from '../../utils/fingerprint.js';
import { normalizeTitle, normalizeCondition } from '../../utils/normalize.js';

// ============================================
// EX-VAT SELLER HANDLING
// ============================================

// Known B2B sellers that report prices ex-VAT (without VAT included)
const EX_VAT_SELLERS = ['vivid bricks', 'mt-bricks', 'secondbricks'];

function isExVatSeller(storeName: string): boolean {
  const normalized = storeName.toLowerCase().trim();
  return EX_VAT_SELLERS.some(seller => normalized.includes(seller));
}

// VAT rates by country
function getVatRateForCountry(country: string): number {
  const rates: Record<string, number> = {
    'ES': 0.21, 'DE': 0.19, 'FR': 0.20, 'IT': 0.22, 'NL': 0.21,
    'BE': 0.21, 'AT': 0.20, 'PL': 0.23, 'PT': 0.23, 'IE': 0.23,
    'GR': 0.24, 'FI': 0.24, 'SE': 0.25, 'DK': 0.25, 'CZ': 0.21,
    'HU': 0.27, 'RO': 0.19, 'BG': 0.20, 'SK': 0.20, 'HR': 0.25,
    'SI': 0.22, 'LT': 0.21, 'LV': 0.21, 'EE': 0.22, 'LU': 0.17,
    'MT': 0.18, 'CY': 0.19, 'GB': 0.20, 'UK': 0.20,
  };
  return rates[country.toUpperCase()] || 0.21;
}

// ============================================
// MAIN NORMALIZER - SETS
// ============================================

/**
 * Normalize a BrickOwl set listing to ScoutLoot format
 * 
 * @param listing - Raw BrickOwl listing
 * @param setNumber - LEGO set number
 * @param buyerCountry - Destination country
 * @param pieceCount - Set piece count (for shipping estimation)
 * @param setName - Optional set name for title
 */
export function normalizeBrickOwlSetListing(
  listing: BrickOwlListing,
  setNumber: string,
  buyerCountry: string,
  pieceCount: number,
  setName?: string | null
): BrickOwlNormalizedListing {
  // Parse price from string
  const priceOriginal = parseFloat(listing.price);
  const currencyOriginal = listing.base_currency;
  let priceEur = convertToEur(priceOriginal, currencyOriginal);
  
  // Adjust for known ex-VAT B2B sellers
  if (isExVatSeller(listing.store_name)) {
    const vatRate = getVatRateForCountry(buyerCountry);
    priceEur = Math.round(priceEur * (1 + vatRate) * 100) / 100;
    console.log(`[BrickOwl VAT] ${listing.store_name}: +${(vatRate * 100).toFixed(0)}% VAT → €${priceEur}`);
  }
  
  // Estimate shipping
  const shippingEstimate = estimateSetShipping(
    listing.country,
    buyerCountry,
    pieceCount
  );
  const shippingEur = convertToEur(shippingEstimate.amount, shippingEstimate.currency);
  
  // Calculate import charges
  const importResult = calculateImportCharges(
    priceEur,
    shippingEur,
    listing.country,
    buyerCountry
  );
  
  // Calculate total
  const totalEur = Math.round((priceEur + shippingEur + importResult.amount) * 100) / 100;
  
  // Decode HTML entities in store name
  const sellerName = decodeHtmlEntities(listing.store_name);
  
  // Build title
  const title = setName 
    ? `LEGO ${setNumber} ${setName} - ${sellerName}`
    : `LEGO ${setNumber} - ${sellerName}`;
  
  // Generate fingerprint (consistent with eBay)
  const fingerprint = generateListingFingerprint({
    platform: 'brickowl',
    seller_id: listing.store_id,
    title: `LEGO ${setNumber}`,
    price_eur: priceEur,
  });
  
  // Normalize condition
  const conditionNormalized = listing.con === 'new' ? 'new' : 'used';
  const conditionDisplay = listing.con === 'new' ? 'New' : 'Used';
  
  return {
    platform: 'brickowl',
    id: listing.lot_id,
    scanned_for_country: buyerCountry,
    item_type: 'set',
    item_id: setNumber,
    title: title,
    title_normalized: normalizeTitle(`LEGO ${setNumber}`),
    url: listing.url,
    image_url: null, // BrickOwl doesn't provide listing images
    listing_fingerprint: fingerprint,
    price_original: priceOriginal,
    shipping_original: shippingEstimate.amount,
    currency_original: currencyOriginal,
    price_eur: priceEur,
    shipping_eur: shippingEur,
    shipping_estimated: shippingEstimate.isEstimate,
    import_charges_eur: importResult.amount,
    import_charges_estimated: importResult.isEstimate || shippingEstimate.isEstimate,
    total_eur: totalEur,
    seller_id: listing.store_id,
    seller_username: sellerName,
    seller_rating: null, // BrickOwl doesn't provide percentage rating
    seller_feedback: parseInt(listing.feedback_count) || null,
    ship_from_country: listing.country,
    condition: conditionDisplay,
    condition_normalized: conditionNormalized,
    photo_count: 0, // Not provided
    returns_accepted: false, // Not provided
    listing_type: 'fixed_price',
    fetched_at: new Date(),
    is_active: listing.open,
  };
}

// ============================================
// MAIN NORMALIZER - MINIFIGURES
// ============================================

/**
 * Normalize a BrickOwl minifigure listing to ScoutLoot format
 * 
 * @param listing - Raw BrickOwl listing
 * @param figNum - Minifigure ID (e.g., "sw0001")
 * @param buyerCountry - Destination country
 * @param figName - Optional minifig name for title
 */
export function normalizeBrickOwlMinifigListing(
  listing: BrickOwlListing,
  figNum: string,
  buyerCountry: string,
  figName?: string | null
): BrickOwlNormalizedListing {
  // Parse price from string
  const priceOriginal = parseFloat(listing.price);
  const currencyOriginal = listing.base_currency;
  let priceEur = convertToEur(priceOriginal, currencyOriginal);
  
  // Adjust for known ex-VAT B2B sellers
  if (isExVatSeller(listing.store_name)) {
    const vatRate = getVatRateForCountry(buyerCountry);
    priceEur = Math.round(priceEur * (1 + vatRate) * 100) / 100;
    console.log(`[BrickOwl VAT] ${listing.store_name}: +${(vatRate * 100).toFixed(0)}% VAT → €${priceEur}`);
  }
  
  // Estimate shipping (flat rate for minifigs)
  const shippingEstimate = estimateMinifigShipping(
    listing.country,
    buyerCountry
  );
  const shippingEur = convertToEur(shippingEstimate.amount, shippingEstimate.currency);
  
  // Calculate import charges
  const importResult = calculateImportCharges(
    priceEur,
    shippingEur,
    listing.country,
    buyerCountry
  );
  
  // Calculate total
  const totalEur = Math.round((priceEur + shippingEur + importResult.amount) * 100) / 100;
  
  // Decode HTML entities in store name
  const sellerName = decodeHtmlEntities(listing.store_name);
  
  // Build title
  const title = figName 
    ? `LEGO ${figNum} ${figName} - ${sellerName}`
    : `LEGO Minifigure ${figNum} - ${sellerName}`;
  
  // Generate fingerprint
  const fingerprint = generateListingFingerprint({
    platform: 'brickowl',
    seller_id: listing.store_id,
    title: `LEGO ${figNum}`,
    price_eur: priceEur,
  });
  
  // Normalize condition
  const conditionNormalized = listing.con === 'new' ? 'new' : 'used';
  const conditionDisplay = listing.con === 'new' ? 'New (Sealed)' : 'Used';
  
  return {
    platform: 'brickowl',
    id: listing.lot_id,
    scanned_for_country: buyerCountry,
    item_type: 'minifig',
    item_id: figNum,
    title: title,
    title_normalized: normalizeTitle(`LEGO ${figNum}`),
    url: listing.url,
    image_url: null,
    listing_fingerprint: fingerprint,
    price_original: priceOriginal,
    shipping_original: shippingEstimate.amount,
    currency_original: currencyOriginal,
    price_eur: priceEur,
    shipping_eur: shippingEur,
    shipping_estimated: shippingEstimate.isEstimate,
    import_charges_eur: importResult.amount,
    import_charges_estimated: importResult.isEstimate || shippingEstimate.isEstimate,
    total_eur: totalEur,
    seller_id: listing.store_id,
    seller_username: sellerName,
    seller_rating: null,
    seller_feedback: parseInt(listing.feedback_count) || null,
    ship_from_country: listing.country,
    condition: conditionDisplay,
    condition_normalized: conditionNormalized,
    photo_count: 0,
    returns_accepted: false,
    listing_type: 'fixed_price',
    fetched_at: new Date(),
    is_active: listing.open,
  };
}

// ============================================
// BATCH NORMALIZERS
// ============================================

/**
 * Normalize multiple BrickOwl set listings
 * 
 * Applies regional filtering AND incomplete detection automatically
 */
export function normalizeBrickOwlSetListings(
  listings: BrickOwlListing[],
  setNumber: string,
  buyerCountry: string,
  pieceCount: number,
  setName?: string | null
): BrickOwlNormalizedListing[] {
  // Filter by regional block first
  const regionalFiltered = filterByRegionalBlock(listings, buyerCountry);
  
  console.log(`[BrickOwl] Normalizing ${regionalFiltered.length} of ${listings.length} listings for set ${setNumber} (filtered by region)`);
  
  // Normalize all listings
  const normalized = regionalFiltered.map(listing => 
    normalizeBrickOwlSetListing(listing, setNumber, buyerCountry, pieceCount, setName)
  );
  
  // Apply "suspiciously cheap" filter - catches minifig-only listings
  // If a listing is >35% cheaper than the second cheapest, it's likely incomplete
  const completeOnly = filterSuspiciouslyCheap(normalized, 35);
  
  return completeOnly;
}

/**
 * Normalize multiple BrickOwl minifig listings
 */
export function normalizeBrickOwlMinifigListings(
  listings: BrickOwlListing[],
  figNum: string,
  buyerCountry: string,
  figName?: string | null
): BrickOwlNormalizedListing[] {
  // Filter by regional block first
  const filteredListings = filterByRegionalBlock(listings, buyerCountry);
  
  console.log(`[BrickOwl] Normalizing ${filteredListings.length} of ${listings.length} listings for minifig ${figNum} (filtered by region)`);
  
  return filteredListings.map(listing => 
    normalizeBrickOwlMinifigListing(listing, figNum, buyerCountry, figName)
  );
}

// ============================================
// CONDITION FILTERING
// ============================================

/**
 * Filter BrickOwl listings by condition preference
 * 
 * @param listings - Normalized listings
 * @param condition - User's condition preference: 'new', 'used', or 'any'
 */
export function filterByCondition(
  listings: BrickOwlNormalizedListing[],
  condition: 'new' | 'used' | 'any'
): BrickOwlNormalizedListing[] {
  if (condition === 'any') {
    return listings;
  }
  
  return listings.filter(l => l.condition_normalized === condition);
}

// ============================================
// SELLER FILTERING
// ============================================

/**
 * Filter by minimum seller feedback count
 * 
 * Note: BrickOwl doesn't provide seller rating percentage,
 * only feedback count. We use feedback count as a trust indicator.
 */
export function filterBySellerFeedback(
  listings: BrickOwlNormalizedListing[],
  minFeedback: number
): BrickOwlNormalizedListing[] {
  return listings.filter(l => {
    // If no feedback count, exclude (or include if minFeedback is 0)
    if (l.seller_feedback === null) {
      return minFeedback === 0;
    }
    return l.seller_feedback >= minFeedback;
  });
}

// ============================================
// PRICE FILTERING
// ============================================

/**
 * Filter by minimum price (anti-scam)
 */
export function filterByMinPrice(
  listings: BrickOwlNormalizedListing[],
  minPriceEur: number
): BrickOwlNormalizedListing[] {
  if (minPriceEur <= 0) {
    return listings;
  }
  return listings.filter(l => l.total_eur >= minPriceEur);
}

/**
 * Filter out likely incomplete sets using RELATIVE pricing
 * 
 * BrickOwl API doesn't distinguish between complete sets and minifig-only listings.
 * However, BrickOwl is an efficient marketplace where sellers know their prices.
 * 
 * Logic: If a listing is significantly cheaper than the rest, it's likely incomplete.
 * We compare the cheapest listing to the second cheapest - if the gap is too big,
 * the cheapest is probably minifigs-only or incomplete.
 * 
 * @param listings - Normalized listings (will be sorted by price)
 * @param maxDiscountPercent - Maximum allowed discount vs second cheapest (default 35%)
 * @returns Filtered listings with suspicious cheap ones removed
 * 
 * Example:
 * - Second cheapest 75810: €900
 * - 35% threshold: €585
 * - Listing at €398 (minifigs only) → FILTERED
 * - Listing at €750 (legit deal) → KEPT
 */
export function filterSuspiciouslyCheap(
  listings: BrickOwlNormalizedListing[],
  maxDiscountPercent: number = 35
): BrickOwlNormalizedListing[] {
  if (listings.length < 2) {
    // Need at least 2 listings to compare
    return listings;
  }
  
  // Sort by price (not total - we want item value comparison)
  const sorted = [...listings].sort((a, b) => a.price_eur - b.price_eur);
  
  // Find the "market price" - use second cheapest as reference
  // This avoids one bad listing affecting the threshold
  const referencePrice = sorted[1].price_eur;
  const minAllowedPrice = referencePrice * (1 - maxDiscountPercent / 100);
  
  const filtered = listings.filter(l => {
    if (l.price_eur < minAllowedPrice) {
      const discountPct = ((referencePrice - l.price_eur) / referencePrice * 100).toFixed(0);
      console.log(`[BrickOwl] Filtered suspiciously cheap: €${l.price_eur.toFixed(2)} is ${discountPct}% below market (€${referencePrice.toFixed(2)}), max allowed: ${maxDiscountPercent}%`);
      return false;
    }
    return true;
  });
  
  if (filtered.length < listings.length) {
    console.log(`[BrickOwl] Removed ${listings.length - filtered.length} suspiciously cheap listings (>${maxDiscountPercent}% below €${referencePrice.toFixed(2)})`);
  }
  
  return filtered;
}

/**
 * DEPRECATED: Old piece-based filter - kept for backwards compatibility
 * Use filterSuspiciouslyCheap instead for better accuracy
 */
export function filterLikelyIncomplete(
  listings: BrickOwlNormalizedListing[],
  pieceCount: number,
  overrideMinPerPiece?: number
): BrickOwlNormalizedListing[] {
  // Now just a wrapper around the relative filter
  return filterSuspiciouslyCheap(listings, 35);
}

/**
 * Filter by target price (for notifications)
 */
export function filterByTargetPrice(
  listings: BrickOwlNormalizedListing[],
  targetPriceEur: number
): BrickOwlNormalizedListing[] {
  return listings.filter(l => l.total_eur <= targetPriceEur);
}

// ============================================
// COMBINED FILTER PIPELINE
// ============================================

export interface BrickOwlFilterOptions {
  condition: 'new' | 'used' | 'any';
  minFeedback: number;
  minPriceEur: number;
  shipFromCountries?: string[];
}

/**
 * Apply all filters to BrickOwl listings
 */
export function applyBrickOwlFilters(
  listings: BrickOwlNormalizedListing[],
  options: BrickOwlFilterOptions
): BrickOwlNormalizedListing[] {
  let filtered = listings;
  
  // Condition filter
  filtered = filterByCondition(filtered, options.condition);
  
  // Seller feedback filter
  if (options.minFeedback > 0) {
    filtered = filterBySellerFeedback(filtered, options.minFeedback);
  }
  
  // Min price filter (anti-scam)
  if (options.minPriceEur > 0) {
    filtered = filterByMinPrice(filtered, options.minPriceEur);
  }
  
  // Ship from countries filter (if provided)
  if (options.shipFromCountries && options.shipFromCountries.length > 0) {
    const normalizedCountries = options.shipFromCountries.map(c => c.toUpperCase());
    filtered = filtered.filter(l => {
      const shipFrom = l.ship_from_country.toUpperCase();
      return normalizedCountries.includes(shipFrom);
    });
  }
  
  return filtered;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get currency symbol for display
 */
export function getCurrencySymbol(currency: string | null | undefined): string {
  if (!currency) return '€';
  const symbols: Record<string, string> = {
    'EUR': '€',
    'GBP': '£',
    'USD': '$',
    'CAD': 'C$',
  };
  return symbols[currency.toUpperCase()] || '€';
}

/**
 * Check if listing has estimated shipping/import
 * Used to add warning indicator in notifications
 */
export function hasEstimatedCharges(listing: BrickOwlNormalizedListing): boolean {
  return listing.shipping_estimated || listing.import_charges_estimated;
}
