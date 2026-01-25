/**
 * Import Charges Calculator
 * 
 * Calculates import duties, VAT, and handling fees for cross-border LEGO purchases.
 * 
 * Rules:
 * - EU → EU: No import charges (single market)
 * - UK → UK: No import charges (domestic)
 * - EU → UK: UK VAT (20%) + handling fee
 * - UK → EU: Destination country VAT + handling fee
 * - US → US: No import charges (domestic)
 * - CA → CA: No import charges (domestic)
 * - US → CA: GST/HST (~13%) + handling fee (de minimis only C$20)
 * - CA → US: $0 under $800 USD (de minimis), else ~5% + $15 handling
 * 
 * For eBay: Uses actual importCharges from API when available
 * For other sources: Calculates estimates
 */

import { roundEur } from './money.js';

// ============================================
// VAT RATES BY COUNTRY (as decimal)
// ============================================
export const VAT_RATES: Record<string, number> = {
  // UK
  'GB': 0.20,
  
  // EU countries
  'DE': 0.19,
  'FR': 0.20,
  'ES': 0.21,
  'IT': 0.22,
  'NL': 0.21,
  'BE': 0.21,
  'AT': 0.20,
  'PT': 0.23,
  'PL': 0.23,
  'IE': 0.23,
  'SE': 0.25,
  'DK': 0.25,
  'FI': 0.24,
  'GR': 0.24,
  'CZ': 0.21,
  'HU': 0.27,
  'RO': 0.19,
  'BG': 0.20,
  'SK': 0.20,
  'HR': 0.25,
  'SI': 0.22,
  'LT': 0.21,
  'LV': 0.21,
  'EE': 0.22,
  'CY': 0.19,
  'MT': 0.18,
  'LU': 0.17,
  
  // North America (sales tax at checkout, not import VAT)
  'US': 0,
  'CA': 0.13, // Average GST/HST for import purposes
};

// ============================================
// REGIONAL DEFINITIONS
// ============================================

// EU member states (post-Brexit)
export const EU_COUNTRIES = new Set([
  'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'PL', 'IE',
  'SE', 'DK', 'FI', 'GR', 'CZ', 'HU', 'RO', 'BG', 'SK', 'HR',
  'SI', 'LT', 'LV', 'EE', 'CY', 'MT', 'LU'
]);

// North America countries
export const NORTH_AMERICA_COUNTRIES = new Set(['US', 'CA']);

// ============================================
// HANDLING FEES (in local currency)
// ============================================
const HANDLING_FEE_EUR = 10;    // EU/UK handling fee in EUR
const HANDLING_FEE_USD = 15;    // US handling fee in USD
const HANDLING_FEE_CAD = 12;    // CA handling fee in CAD

// ============================================
// DE MINIMIS THRESHOLDS
// ============================================
const US_DE_MINIMIS_USD = 800;  // US: No duty under $800
const CA_DE_MINIMIS_CAD = 20;   // Canada: Very low threshold

// ============================================
// CURRENCY CONVERSION RATES (approximate, for estimate purposes)
// ============================================
const USD_TO_EUR = 0.92;
const CAD_TO_EUR = 0.68;
const EUR_TO_USD = 1.09;
const EUR_TO_CAD = 1.47;

// ============================================
// TYPE DEFINITIONS
// ============================================
export interface ImportChargeResult {
  amount: number;          // Amount in EUR
  isEstimate: boolean;
  breakdown?: {
    vat: number;
    duty: number;
    handlingFee: number;
  };
}

// ============================================
// REGIONAL HELPERS
// ============================================

/**
 * Check if a country is in the EU
 */
export function isEUCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return EU_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Check if a country is UK
 */
export function isUKCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return countryCode.toUpperCase() === 'GB' || countryCode.toUpperCase() === 'UK';
}

/**
 * Check if a country is in North America (US or CA)
 */
export function isNorthAmericaCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return NORTH_AMERICA_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Check if a country is US
 */
export function isUSCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return countryCode.toUpperCase() === 'US';
}

/**
 * Check if a country is Canada
 */
export function isCACountry(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  return countryCode.toUpperCase() === 'CA';
}

/**
 * Get the regional block for a country
 */
export function getRegionalBlock(countryCode: string | null | undefined): 'eu' | 'uk' | 'north_america' | 'other' {
  if (!countryCode) return 'other';
  if (isEUCountry(countryCode)) return 'eu';
  if (isUKCountry(countryCode)) return 'uk';
  if (isNorthAmericaCountry(countryCode)) return 'north_america';
  return 'other';
}

/**
 * Get VAT rate for a country
 */
export function getVATRate(countryCode: string | null | undefined): number {
  if (!countryCode) return 0;
  return VAT_RATES[countryCode.toUpperCase()] ?? 0.20; // Default 20% if unknown
}

// ============================================
// IMPORT CHARGE DETERMINATION
// ============================================

/**
 * Determine if import charges apply based on origin and destination
 */
export function requiresImportCharges(
  shipFromCountry: string | null | undefined,
  shipToCountry: string | null | undefined
): boolean {
  if (!shipFromCountry || !shipToCountry) return false;
  
  const fromUK = isUKCountry(shipFromCountry);
  const toUK = isUKCountry(shipToCountry);
  const fromEU = isEUCountry(shipFromCountry);
  const toEU = isEUCountry(shipToCountry);
  const fromUS = isUSCountry(shipFromCountry);
  const toUS = isUSCountry(shipToCountry);
  const fromCA = isCACountry(shipFromCountry);
  const toCA = isCACountry(shipToCountry);
  
  // ============================================
  // DOMESTIC - NO CHARGES
  // ============================================
  
  // UK → UK: No charges (domestic)
  if (fromUK && toUK) return false;
  
  // EU → EU: No charges (single market)
  if (fromEU && toEU) return false;
  
  // US → US: No charges (domestic)
  if (fromUS && toUS) return false;
  
  // CA → CA: No charges (domestic)
  if (fromCA && toCA) return false;
  
  // ============================================
  // CROSS-BORDER WITHIN BLOCKS - CHARGES APPLY
  // ============================================
  
  // UK ↔ EU: Charges apply
  if ((fromUK && toEU) || (fromEU && toUK)) return true;
  
  // US ↔ CA: Charges may apply (depends on de minimis)
  if ((fromUS && toCA) || (fromCA && toUS)) return true;
  
  // ============================================
  // CROSS-BLOCK - CHARGES WOULD APPLY
  // But ScoutLoot doesn't show cross-block listings
  // ============================================
  
  return true;
}

// ============================================
// EU/UK IMPORT CALCULATIONS
// ============================================

/**
 * Calculate import charges for EU/UK cross-border shipments
 * 
 * @param priceEur - Item price in EUR
 * @param shippingEur - Shipping cost in EUR
 * @param shipFromCountry - Origin country code
 * @param shipToCountry - Destination country code
 * @returns Import charge result with amount in EUR
 */
export function calculateEuUkImportCharges(
  priceEur: number,
  shippingEur: number,
  shipFromCountry: string | null | undefined,
  shipToCountry: string | null | undefined
): ImportChargeResult {
  // No charges if same region
  if (!requiresImportCharges(shipFromCountry, shipToCountry)) {
    return { amount: 0, isEstimate: false };
  }
  
  // Customs value = price + shipping
  const customsValue = priceEur + shippingEur;
  
  // Get destination VAT rate
  const vatRate = getVATRate(shipToCountry);
  
  // LEGO is typically classified under toy duties
  // EU/UK duty rate for toys: 0% for most, 4.7% for some
  // We'll use 0% for LEGO as it's typically duty-free
  const dutyRate = 0;
  
  // Calculate components
  const duty = roundEur(customsValue * dutyRate);
  const vatBase = customsValue + duty;
  const vat = roundEur(vatBase * vatRate);
  
  // Add handling fee for cross-border shipments
  const handlingFee = HANDLING_FEE_EUR;
  
  const totalCharges = roundEur(vat + duty + handlingFee);
  
  return {
    amount: totalCharges,
    isEstimate: true,
    breakdown: {
      vat,
      duty,
      handlingFee,
    },
  };
}

// ============================================
// NORTH AMERICA IMPORT CALCULATIONS
// ============================================

/**
 * Calculate import charges for US → Canada shipments
 * 
 * Canada has a very low de minimis (C$20), so almost all shipments
 * will incur GST/HST + handling fees.
 * 
 * @param priceEur - Item price in EUR (for internal storage)
 * @param shippingEur - Shipping cost in EUR
 * @returns Import charge result with amount in EUR
 */
export function calculateUSToCanadaImport(
  priceEur: number,
  shippingEur: number
): ImportChargeResult {
  // Convert to CAD for calculation (prices come in as USD from EBAY_US)
  // First convert EUR to USD (approximate), then USD to CAD
  const priceUsd = priceEur * EUR_TO_USD;
  const shippingUsd = shippingEur * EUR_TO_USD;
  const priceCad = priceUsd * 1.35; // USD to CAD approximate
  const shippingCad = shippingUsd * 1.35;
  
  // Customs value in CAD
  const customsValueCad = priceCad + shippingCad;
  
  // Canada de minimis is only C$20 - virtually everything gets taxed
  // GST/HST average ~13%
  const gstHstRate = 0.13;
  const gstHst = customsValueCad * gstHstRate;
  
  // LEGO toys typically have 0% duty
  const duty = 0;
  
  // Handling fee in CAD
  const handlingFeeCad = HANDLING_FEE_CAD;
  
  // Total in CAD
  const totalCad = gstHst + duty + handlingFeeCad;
  
  // Convert back to EUR for storage
  const totalEur = roundEur(totalCad * CAD_TO_EUR);
  
  return {
    amount: totalEur,
    isEstimate: true,
    breakdown: {
      vat: roundEur(gstHst * CAD_TO_EUR),
      duty: 0,
      handlingFee: roundEur(handlingFeeCad * CAD_TO_EUR),
    },
  };
}

/**
 * Calculate import charges for Canada → US shipments
 * 
 * US has a generous $800 de minimis - most LEGO sets won't incur duties.
 * 
 * @param priceEur - Item price in EUR (for internal storage)
 * @param shippingEur - Shipping cost in EUR
 * @returns Import charge result with amount in EUR
 */
export function calculateCanadaToUSImport(
  priceEur: number,
  shippingEur: number
): ImportChargeResult {
  // Convert to USD for calculation
  const priceUsd = priceEur * EUR_TO_USD;
  const shippingUsd = shippingEur * EUR_TO_USD;
  
  // Customs value in USD
  const customsValueUsd = priceUsd + shippingUsd;
  
  // Check against US de minimis ($800)
  if (customsValueUsd < US_DE_MINIMIS_USD) {
    // Under de minimis - no duties, no fees
    return { amount: 0, isEstimate: true };
  }
  
  // Over $800 - duties may apply
  // Toys typically have low duty rate (~0-5%)
  const dutyRate = 0.05;
  const duty = customsValueUsd * dutyRate;
  
  // Handling fee in USD
  const handlingFeeUsd = HANDLING_FEE_USD;
  
  // Total in USD (no VAT/sales tax on import - that's at checkout)
  const totalUsd = duty + handlingFeeUsd;
  
  // Convert back to EUR for storage
  const totalEur = roundEur(totalUsd * USD_TO_EUR);
  
  return {
    amount: totalEur,
    isEstimate: true,
    breakdown: {
      vat: 0,
      duty: roundEur(duty * USD_TO_EUR),
      handlingFee: roundEur(handlingFeeUsd * USD_TO_EUR),
    },
  };
}

/**
 * Calculate import charges for North America cross-border shipments
 */
export function calculateNorthAmericaImportCharges(
  priceEur: number,
  shippingEur: number,
  shipFromCountry: string | null | undefined,
  shipToCountry: string | null | undefined
): ImportChargeResult {
  const fromUS = isUSCountry(shipFromCountry);
  const toUS = isUSCountry(shipToCountry);
  const fromCA = isCACountry(shipFromCountry);
  const toCA = isCACountry(shipToCountry);
  
  // Domestic - no charges
  if ((fromUS && toUS) || (fromCA && toCA)) {
    return { amount: 0, isEstimate: false };
  }
  
  // US → CA
  if (fromUS && toCA) {
    return calculateUSToCanadaImport(priceEur, shippingEur);
  }
  
  // CA → US
  if (fromCA && toUS) {
    return calculateCanadaToUSImport(priceEur, shippingEur);
  }
  
  // Unknown combination
  return { amount: 0, isEstimate: true };
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

/**
 * Calculate estimated import charges based on origin and destination
 * 
 * This is used when eBay doesn't provide actual import charges,
 * or for non-eBay sources.
 * 
 * @param priceEur - Item price in EUR
 * @param shippingEur - Shipping cost in EUR
 * @param shipFromCountry - Origin country code
 * @param shipToCountry - Destination country code
 * @returns Import charge result with amount in EUR and estimate flag
 */
export function calculateImportCharges(
  priceEur: number,
  shippingEur: number,
  shipFromCountry: string | null | undefined,
  shipToCountry: string | null | undefined
): ImportChargeResult {
  // No charges if no shipping info
  if (!shipFromCountry || !shipToCountry) {
    return { amount: 0, isEstimate: true };
  }
  
  // Route to appropriate calculator based on regions
  const fromBlock = getRegionalBlock(shipFromCountry);
  const toBlock = getRegionalBlock(shipToCountry);
  
  // Same block - use block-specific calculator
  if (fromBlock === 'north_america' || toBlock === 'north_america') {
    // If either is North America, use NA calculator
    // (This also handles the case where both are NA)
    return calculateNorthAmericaImportCharges(priceEur, shippingEur, shipFromCountry, shipToCountry);
  }
  
  // EU/UK block
  return calculateEuUkImportCharges(priceEur, shippingEur, shipFromCountry, shipToCountry);
}

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Process import charges from eBay API response or calculate estimate
 * 
 * @param ebayImportCharges - Import charges from eBay API (if available, in EUR)
 * @param priceEur - Item price in EUR
 * @param shippingEur - Shipping cost in EUR
 * @param shipFromCountry - Origin country code
 * @param shipToCountry - Destination country code
 * @returns Import charge result
 */
export function processImportCharges(
  ebayImportCharges: number | null | undefined,
  priceEur: number,
  shippingEur: number,
  shipFromCountry: string | null | undefined,
  shipToCountry: string | null | undefined
): ImportChargeResult {
  // If eBay provides actual import charges, use them
  if (ebayImportCharges !== null && ebayImportCharges !== undefined && ebayImportCharges > 0) {
    return {
      amount: roundEur(ebayImportCharges),
      isEstimate: false,
    };
  }
  
  // Otherwise, calculate estimate
  return calculateImportCharges(priceEur, shippingEur, shipFromCountry, shipToCountry);
}

/**
 * Calculate total price including import charges
 */
export function calculateTotalWithImport(
  priceEur: number,
  shippingEur: number,
  importChargesEur: number
): number {
  return roundEur(priceEur + shippingEur + importChargesEur);
}

/**
 * Format import charges for display
 * 
 * @param amount - Import charge amount
 * @param isEstimate - Whether this is an estimate
 * @returns Formatted string for display
 */
export function formatImportCharges(amount: number, isEstimate: boolean): string {
  if (amount <= 0) return '';
  
  if (isEstimate) {
    // Round to nearest €5 for estimates to avoid false precision
    const rounded = Math.round(amount / 5) * 5;
    return `~€${rounded}`;
  }
  
  return `€${amount.toFixed(2)}`;
}

/**
 * Get a description of why import charges apply
 */
export function getImportChargeReason(
  shipFromCountry: string | null | undefined,
  shipToCountry: string | null | undefined
): string {
  if (!shipFromCountry || !shipToCountry) return '';
  
  const fromUK = isUKCountry(shipFromCountry);
  const toUK = isUKCountry(shipToCountry);
  const fromEU = isEUCountry(shipFromCountry);
  const toEU = isEUCountry(shipToCountry);
  const fromUS = isUSCountry(shipFromCountry);
  const toUS = isUSCountry(shipToCountry);
  const fromCA = isCACountry(shipFromCountry);
  const toCA = isCACountry(shipToCountry);
  
  // EU/UK cross-border
  if (fromEU && toUK) {
    return 'UK import VAT applies';
  }
  if (fromUK && toEU) {
    return 'EU import VAT applies';
  }
  
  // US/CA cross-border
  if (fromUS && toCA) {
    return 'Canadian GST/HST applies';
  }
  if (fromCA && toUS) {
    return 'US de minimis $800 - duties may apply';
  }
  
  return 'Import charges may apply';
}

// ============================================
// EXPORTS
// ============================================

export default {
  calculateImportCharges,
  calculateEuUkImportCharges,
  calculateNorthAmericaImportCharges,
  calculateUSToCanadaImport,
  calculateCanadaToUSImport,
  processImportCharges,
  calculateTotalWithImport,
  formatImportCharges,
  requiresImportCharges,
  isEUCountry,
  isUKCountry,
  isNorthAmericaCountry,
  isUSCountry,
  isCACountry,
  getRegionalBlock,
  getVATRate,
  getImportChargeReason,
  VAT_RATES,
  EU_COUNTRIES,
  NORTH_AMERICA_COUNTRIES,
};
