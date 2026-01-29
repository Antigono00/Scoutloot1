/**
 * BrickOwl Shipping Estimation
 * 
 * Since BrickOwl API doesn't provide shipping costs, we estimate based on:
 * - Seller country
 * - Buyer country (destination)
 * - Item size (piece count for sets, flat rate for minifigs)
 */

import { ShippingEstimate, ImportChargeResult, EU_COUNTRIES, NORTH_AMERICA_COUNTRIES } from './types.js';

// ============================================
// COUNTRY HELPERS
// ============================================

export function isEuCountry(country: string): boolean {
  return EU_COUNTRIES.includes(country.toUpperCase() as typeof EU_COUNTRIES[number]);
}

export function isEuUkCountry(country: string): boolean {
  const upper = country.toUpperCase();
  return isEuCountry(upper) || upper === 'GB' || upper === 'UK';
}

export function isNorthAmericaCountry(country: string): boolean {
  return NORTH_AMERICA_COUNTRIES.includes(country.toUpperCase() as typeof NORTH_AMERICA_COUNTRIES[number]);
}

export function getRegionalBlock(country: string): 'eu_uk' | 'north_america' {
  return isNorthAmericaCountry(country) ? 'north_america' : 'eu_uk';
}

// ============================================
// NEIGHBORING COUNTRIES (for EU shipping)
// ============================================

const EU_NEIGHBORS: Record<string, string[]> = {
  'DE': ['AT', 'BE', 'CZ', 'DK', 'FR', 'LU', 'NL', 'PL', 'CH'],
  'FR': ['BE', 'DE', 'ES', 'IT', 'LU', 'MC', 'CH'],
  'ES': ['FR', 'PT', 'AD'],
  'IT': ['AT', 'FR', 'SI', 'SM', 'VA', 'CH'],
  'NL': ['BE', 'DE'],
  'BE': ['DE', 'FR', 'LU', 'NL'],
  'AT': ['CZ', 'DE', 'HU', 'IT', 'LI', 'SI', 'SK', 'CH'],
  'PL': ['CZ', 'DE', 'LT', 'SK', 'UA', 'BY'],
  'PT': ['ES'],
  'DK': ['DE'],
  'SE': ['DK', 'FI', 'NO'],
  'FI': ['SE', 'NO', 'RU', 'EE'],
  'IE': [],  // Island
  'GR': ['BG', 'TR', 'AL', 'MK'],
  'HU': ['AT', 'HR', 'RO', 'RS', 'SI', 'SK', 'UA'],
  'CZ': ['AT', 'DE', 'PL', 'SK'],
  'SK': ['AT', 'CZ', 'HU', 'PL', 'UA'],
  'SI': ['AT', 'HR', 'HU', 'IT'],
  'HR': ['HU', 'SI', 'RS', 'BA', 'ME'],
  'RO': ['BG', 'HU', 'MD', 'RS', 'UA'],
  'BG': ['GR', 'RO', 'RS', 'MK', 'TR'],
  'LT': ['LV', 'PL', 'BY', 'RU'],
  'LV': ['EE', 'LT', 'BY', 'RU'],
  'EE': ['LV', 'RU', 'FI'],
  'LU': ['BE', 'DE', 'FR'],
  'MT': [],  // Island
  'CY': [],  // Island
  'GB': ['IE'],  // Only land border with Ireland
  'UK': ['IE'],
};

function areNeighbors(country1: string, country2: string): boolean {
  const c1 = country1.toUpperCase();
  const c2 = country2.toUpperCase();
  const neighbors1 = EU_NEIGHBORS[c1] || [];
  const neighbors2 = EU_NEIGHBORS[c2] || [];
  return neighbors1.includes(c2) || neighbors2.includes(c1);
}

// ============================================
// SIZE MULTIPLIER (for sets by piece count)
// ============================================

function getSizeMultiplier(pieceCount: number): number {
  if (pieceCount < 200) return 1.0;      // Polybag/Small
  if (pieceCount < 500) return 1.2;      // Small set
  if (pieceCount < 1000) return 1.5;     // Medium set
  if (pieceCount < 2000) return 1.8;     // Large set
  if (pieceCount < 4000) return 2.2;     // Very large
  return 2.8;                             // UCS/Giant
}

// ============================================
// SHIPPING CAPS
// ============================================

const SHIPPING_CAPS: Record<string, Record<string, number>> = {
  domestic: {
    'EUR': 12,
    'GBP': 10,
    'USD': 15,
    'CAD': 18,
  },
  eu_to_eu: {
    'EUR': 35,
  },
  uk_eu: {
    'EUR': 45,
    'GBP': 38,
  },
  us_ca: {
    'USD': 35,
    'CAD': 45,
  },
};

// ============================================
// SHIPPING ESTIMATION - SETS
// ============================================

export function estimateSetShipping(
  sellerCountry: string,
  buyerCountry: string,
  pieceCount: number
): ShippingEstimate {
  const seller = sellerCountry.toUpperCase();
  const buyer = buyerCountry.toUpperCase();
  const sizeMultiplier = getSizeMultiplier(pieceCount);
  
  // ============================================
  // DOMESTIC SHIPPING
  // ============================================
  if (seller === buyer || (seller === 'UK' && buyer === 'GB') || (seller === 'GB' && buyer === 'UK')) {
    // EU domestic
    if (isEuCountry(buyer)) {
      const base = 5;
      const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.domestic['EUR']);
      return { amount, currency: 'EUR', isEstimate: true };
    }
    // UK domestic
    if (buyer === 'GB' || buyer === 'UK') {
      const base = 4;
      const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.domestic['GBP']);
      return { amount, currency: 'GBP', isEstimate: true };
    }
    // US domestic
    if (buyer === 'US') {
      const base = 6;
      const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.domestic['USD']);
      return { amount, currency: 'USD', isEstimate: true };
    }
    // CA domestic
    if (buyer === 'CA') {
      const base = 8;
      const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.domestic['CAD']);
      return { amount, currency: 'CAD', isEstimate: true };
    }
  }
  
  // ============================================
  // EU TO EU
  // ============================================
  if (isEuCountry(seller) && isEuCountry(buyer)) {
    const base = areNeighbors(seller, buyer) ? 8 : 12;
    const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.eu_to_eu['EUR']);
    return { amount, currency: 'EUR', isEstimate: true };
  }
  
  // ============================================
  // UK <-> EU
  // ============================================
  const sellerIsUk = seller === 'GB' || seller === 'UK';
  const buyerIsUk = buyer === 'GB' || buyer === 'UK';
  
  if ((sellerIsUk && isEuCountry(buyer)) || (isEuCountry(seller) && buyerIsUk)) {
    const base = 15;
    const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.uk_eu['EUR']);
    // Return in buyer's preferred currency
    if (buyerIsUk) {
      return { amount: Math.round(amount / 1.18 * 100) / 100, currency: 'GBP', isEstimate: true };
    }
    return { amount, currency: 'EUR', isEstimate: true };
  }
  
  // ============================================
  // US <-> CA
  // ============================================
  if ((seller === 'US' && buyer === 'CA') || (seller === 'CA' && buyer === 'US')) {
    const base = 10;
    const amount = Math.min(Math.round(base * sizeMultiplier * 100) / 100, SHIPPING_CAPS.us_ca['USD']);
    return { amount, currency: 'USD', isEstimate: true };
  }
  
  // ============================================
  // FALLBACK (shouldn't happen with regional filtering)
  // ============================================
  return { amount: 20, currency: 'EUR', isEstimate: true };
}

// ============================================
// SHIPPING ESTIMATION - MINIFIGURES
// ============================================

/**
 * Minifigures have flat-rate shipping since they're small and light
 */
export function estimateMinifigShipping(
  sellerCountry: string,
  buyerCountry: string
): ShippingEstimate {
  const seller = sellerCountry.toUpperCase();
  const buyer = buyerCountry.toUpperCase();
  
  // ============================================
  // DOMESTIC SHIPPING (flat rate for small item)
  // ============================================
  if (seller === buyer || (seller === 'UK' && buyer === 'GB') || (seller === 'GB' && buyer === 'UK')) {
    if (isEuCountry(buyer)) {
      return { amount: 3, currency: 'EUR', isEstimate: true };
    }
    if (buyer === 'GB' || buyer === 'UK') {
      return { amount: 2.50, currency: 'GBP', isEstimate: true };
    }
    if (buyer === 'US') {
      return { amount: 4, currency: 'USD', isEstimate: true };
    }
    if (buyer === 'CA') {
      return { amount: 5, currency: 'CAD', isEstimate: true };
    }
  }
  
  // ============================================
  // EU TO EU (letter/small parcel)
  // ============================================
  if (isEuCountry(seller) && isEuCountry(buyer)) {
    const base = areNeighbors(seller, buyer) ? 4 : 6;
    return { amount: base, currency: 'EUR', isEstimate: true };
  }
  
  // ============================================
  // UK <-> EU
  // ============================================
  const sellerIsUk = seller === 'GB' || seller === 'UK';
  const buyerIsUk = buyer === 'GB' || buyer === 'UK';
  
  if ((sellerIsUk && isEuCountry(buyer)) || (isEuCountry(seller) && buyerIsUk)) {
    if (buyerIsUk) {
      return { amount: 6, currency: 'GBP', isEstimate: true };
    }
    return { amount: 7, currency: 'EUR', isEstimate: true };
  }
  
  // ============================================
  // US <-> CA
  // ============================================
  if ((seller === 'US' && buyer === 'CA') || (seller === 'CA' && buyer === 'US')) {
    return { amount: 6, currency: 'USD', isEstimate: true };
  }
  
  // Fallback
  return { amount: 8, currency: 'EUR', isEstimate: true };
}

// ============================================
// IMPORT CHARGES CALCULATION
// ============================================

// Currency conversion rates to EUR (approximate)
const CURRENCY_TO_EUR: Record<string, number> = {
  'EUR': 1.00,
  'GBP': 1.18,
  'USD': 0.92,
  'CAD': 0.68,
};

function convertToEur(amount: number, currency: string): number {
  const rate = CURRENCY_TO_EUR[currency.toUpperCase()] ?? 1.0;
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Calculate import charges for cross-border shipments
 */
export function calculateImportCharges(
  priceEur: number,
  shippingEur: number,
  sellerCountry: string,
  buyerCountry: string
): ImportChargeResult {
  const seller = sellerCountry.toUpperCase();
  const buyer = buyerCountry.toUpperCase();
  
  // Same country = no import charges
  if (seller === buyer) {
    return { amount: 0, isEstimate: false };
  }
  
  // Within EU = no import charges (single market)
  if (isEuCountry(seller) && isEuCountry(buyer)) {
    return { amount: 0, isEstimate: false };
  }
  
  // UK-UK = no import
  const sellerIsUk = seller === 'GB' || seller === 'UK';
  const buyerIsUk = buyer === 'GB' || buyer === 'UK';
  if (sellerIsUk && buyerIsUk) {
    return { amount: 0, isEstimate: false };
  }
  
  // US-US = no import
  if (seller === 'US' && buyer === 'US') {
    return { amount: 0, isEstimate: false };
  }
  
  // CA-CA = no import
  if (seller === 'CA' && buyer === 'CA') {
    return { amount: 0, isEstimate: false };
  }
  
  const totalValue = priceEur + shippingEur;
  
  // ============================================
  // EU → UK: 20% VAT + £10 handling
  // ============================================
  if (isEuCountry(seller) && buyerIsUk) {
    const vatGbp = totalValue / 1.18 * 0.20; // Convert to GBP, apply 20% VAT
    const handlingGbp = 10;
    const totalGbp = vatGbp + handlingGbp;
    // Convert back to EUR for storage
    return { amount: Math.round(totalGbp * 1.18 * 100) / 100, isEstimate: true };
  }
  
  // ============================================
  // UK → EU: ~21% VAT + €10 handling
  // ============================================
  if (sellerIsUk && isEuCountry(buyer)) {
    const vat = totalValue * 0.21;
    const handling = 10;
    return { amount: Math.round((vat + handling) * 100) / 100, isEstimate: true };
  }
  
  // ============================================
  // CA → US: De minimis $800, then 5% duty + $15 handling
  // ============================================
  if (seller === 'CA' && buyer === 'US') {
    const valueUsd = totalValue / 0.92; // EUR to USD
    if (valueUsd < 800) {
      return { amount: 0, isEstimate: false }; // De minimis threshold
    }
    const dutyUsd = valueUsd * 0.05;
    const handlingUsd = 15;
    // Convert back to EUR
    return { amount: Math.round((dutyUsd + handlingUsd) * 0.92 * 100) / 100, isEstimate: true };
  }
  
  // ============================================
  // US → CA: 13% GST/HST + C$12 handling
  // ============================================
  if (seller === 'US' && buyer === 'CA') {
    const valueCad = totalValue / 0.68; // EUR to CAD
    const gstCad = valueCad * 0.13;
    const handlingCad = 12;
    // Convert back to EUR
    return { amount: Math.round((gstCad + handlingCad) * 0.68 * 100) / 100, isEstimate: true };
  }
  
  // No import charges for same block
  return { amount: 0, isEstimate: false };
}

// ============================================
// FILTER LISTINGS BY REGIONAL BLOCK
// ============================================

export function filterByRegionalBlock<T extends { country: string }>(
  listings: T[],
  buyerCountry: string
): T[] {
  const buyerBlock = getRegionalBlock(buyerCountry);
  
  return listings.filter(listing => {
    const sellerCountry = listing.country.toUpperCase();
    
    if (buyerBlock === 'eu_uk') {
      return isEuUkCountry(sellerCountry);
    } else {
      return isNorthAmericaCountry(sellerCountry);
    }
  });
}

// Export currency converter for normalizer
export { convertToEur, CURRENCY_TO_EUR };
