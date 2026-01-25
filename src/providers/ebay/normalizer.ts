import { EbayItemSummary, NormalizedListing } from './types.js';
import { generateListingFingerprint } from '../../utils/fingerprint.js';
import { normalizeTitle, normalizeCondition } from '../../utils/normalize.js';
import { parsePrice, roundEur } from '../../utils/money.js';
import { processImportCharges, calculateTotalWithImport } from '../../utils/importCharges.js';

/**
 * Currency conversion rates to EUR
 * Updated periodically - these are approximate rates for internal storage
 * 
 * Note: Display to user uses original currency, these are only for 
 * database storage and comparison purposes
 */
const CURRENCY_TO_EUR: Record<string, number> = {
  'EUR': 1.00,
  'GBP': 1.18,    // 1 GBP ≈ 1.18 EUR
  'USD': 0.92,    // 1 USD ≈ 0.92 EUR
  'CAD': 0.68,    // 1 CAD ≈ 0.68 EUR
  'PLN': 0.23,    // 1 PLN ≈ 0.23 EUR
  'SEK': 0.087,   // 1 SEK ≈ 0.087 EUR
  'DKK': 0.134,   // 1 DKK ≈ 0.134 EUR
  'CZK': 0.040,   // 1 CZK ≈ 0.040 EUR
  'HUF': 0.0025,  // 1 HUF ≈ 0.0025 EUR
  'RON': 0.20,    // 1 RON ≈ 0.20 EUR
  'BGN': 0.51,    // 1 BGN ≈ 0.51 EUR
};

/**
 * Convert a price from a given currency to EUR
 * Used for internal storage - user display should use original currency
 */
export function convertToEur(amount: number, currency: string): number {
  const rate = CURRENCY_TO_EUR[currency.toUpperCase()] ?? 1.0;
  return roundEur(amount * rate);
}

/**
 * Get the conversion rate for a currency to EUR
 */
export function getEurConversionRate(currency: string): number {
  return CURRENCY_TO_EUR[currency.toUpperCase()] ?? 1.0;
}

export function normalizeEbayListing(
  item: EbayItemSummary,
  setNumber: string,
  scannedForCountry: string
): NormalizedListing {
  const priceOriginal = parsePrice(item.price.value);
  const currencyOriginal = item.price.currency || 'EUR';
  
  let shippingOriginal = 0;
  if (item.shippingOptions && item.shippingOptions.length > 0) {
    const shipping = item.shippingOptions[0];
    if (shipping.shippingCost) {
      shippingOriginal = parsePrice(shipping.shippingCost.value);
    }
  }

  // Convert to EUR for internal storage
  // This allows comparison across different marketplaces/currencies
  const priceEur = convertToEur(priceOriginal, currencyOriginal);
  const shippingEur = convertToEur(shippingOriginal, currencyOriginal);

  const sellerId = item.seller.username;
  const sellerUsername = item.seller.username;
  const sellerRating = item.seller.feedbackPercentage 
    ? parseFloat(item.seller.feedbackPercentage) 
    : null;
  const sellerFeedback = item.seller.feedbackScore ?? null;

  const shipFromCountry = item.itemLocation?.country ?? null;
  const condition = item.condition ?? null;
  const conditionNormalized = normalizeCondition(condition);
  const photoCount = item.thumbnailImages?.length ?? (item.image ? 1 : 0);

  // Process import charges
  // eBay may provide actual import charges for cross-border shipments
  const ebayImportCharges = item.importCharges 
    ? parsePrice(item.importCharges.value)
    : null;
  
  // Convert eBay import charges to EUR if provided in different currency
  const ebayImportChargesEur = ebayImportCharges !== null
    ? convertToEur(ebayImportCharges, item.importCharges?.currency || currencyOriginal)
    : null;
  
  const importChargeResult = processImportCharges(
    ebayImportChargesEur,
    priceEur,
    shippingEur,
    shipFromCountry,
    scannedForCountry
  );

  // Calculate total including import charges
  const totalEur = calculateTotalWithImport(
    priceEur,
    shippingEur,
    importChargeResult.amount
  );

  // Generate fingerprint (does NOT include shipping or import charges - those vary by destination)
  const fingerprint = generateListingFingerprint({
    platform: 'ebay',
    seller_id: sellerId,
    title: item.title,
    price_eur: priceEur,
  });

  return {
    platform: 'ebay',
    id: item.itemId,
    scanned_for_country: scannedForCountry,
    set_number: setNumber,
    title: item.title,
    title_normalized: normalizeTitle(item.title),
    url: item.itemWebUrl,
    image_url: item.image?.imageUrl ?? null,
    listing_fingerprint: fingerprint,
    price_original: priceOriginal,
    shipping_original: shippingOriginal,
    currency_original: currencyOriginal,
    price_eur: priceEur,
    shipping_eur: shippingEur,
    import_charges_eur: importChargeResult.amount,
    import_charges_estimated: importChargeResult.isEstimate,
    total_eur: totalEur,
    seller_id: sellerId,
    seller_username: sellerUsername,
    seller_rating: sellerRating,
    seller_feedback: sellerFeedback,
    ship_from_country: shipFromCountry,
    condition: condition,
    condition_normalized: conditionNormalized,
    photo_count: photoCount,
    returns_accepted: false,
    listing_type: 'fixed_price',
    fetched_at: new Date(),
    is_active: true,
  };
}

export function filterByShipFrom(
  listings: NormalizedListing[],
  shipFromCountries: string[]
): NormalizedListing[] {
  if (!shipFromCountries || shipFromCountries.length === 0) {
    return listings;
  }
  
  // Normalize country codes for comparison
  const normalizedCountries = shipFromCountries.map(c => c.toUpperCase());
  
  return listings.filter((listing) => {
    const country = listing.ship_from_country;
    if (!country) return false;
    
    // Handle UK aliases
    const normalizedShipFrom = country.toUpperCase() === 'UK' ? 'GB' : country.toUpperCase();
    
    return normalizedCountries.includes(normalizedShipFrom);
  });
}

/**
 * Filter listings by whether they have valid shipping to destination
 * Enhanced for UK support - handles EU/UK border correctly
 * Also handles US/CA cross-border
 */
export function filterByValidShipping(
  listings: NormalizedListing[],
  shipToCountry: string
): NormalizedListing[] {
  return listings.filter((listing) => {
    // If we have positive shipping, eBay calculated it - valid
    if (listing.shipping_eur > 0) {
      return true;
    }
    
    // Same country = domestic, shipping=0 is likely free shipping
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
    
    // Handle US/CA - treat as domestic within North America block
    const fromUS = listing.ship_from_country?.toUpperCase() === 'US';
    const fromCA = listing.ship_from_country?.toUpperCase() === 'CA';
    const toUS = shipToCountry.toUpperCase() === 'US';
    const toCA = shipToCountry.toUpperCase() === 'CA';
    
    // US domestic
    if (fromUS && toUS) {
      return true;
    }
    
    // CA domestic
    if (fromCA && toCA) {
      return true;
    }
    
    // Cross-border with shipping=0 = NO SHIPPING AVAILABLE
    // This applies to both EU→UK and UK→EU, and any other cross-border
    return false;
  });
}
