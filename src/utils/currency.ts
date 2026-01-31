/**
 * Currency Utilities for V30 Regional Price History
 * 
 * Maps countries to macro-regions (EU, UK, US, CA) and provides
 * currency symbols and codes for each region.
 * 
 * NOTE: EU_COUNTRIES is imported from importCharges.ts to avoid duplication.
 */

import { EU_COUNTRIES } from './importCharges.js';

// ============================================
// REGION CONFIGURATION
// ============================================

export interface RegionConfig {
  currency: string;
  symbol: string;
  countries: string[];
}

export const REGION_CONFIG: Record<string, RegionConfig> = {
  'EU': {
    currency: 'EUR',
    symbol: '€',
    // All 27 EU countries - converted from the Set in importCharges.ts
    countries: Array.from(EU_COUNTRIES),
  },
  'UK': {
    currency: 'GBP',
    symbol: '£',
    countries: ['GB'],
  },
  'US': {
    currency: 'USD',
    symbol: '$',
    countries: ['US'],
  },
  'CA': {
    currency: 'CAD',
    symbol: 'C$',
    countries: ['CA'],
  },
};

// Pre-compute reverse lookup map for performance
const COUNTRY_TO_REGION_MAP: Record<string, string> = {};
for (const [region, config] of Object.entries(REGION_CONFIG)) {
  for (const country of config.countries) {
    COUNTRY_TO_REGION_MAP[country.toUpperCase()] = region;
  }
}

// ============================================
// REGION HELPERS
// ============================================

/**
 * Get the macro-region (EU, UK, US, CA) from a country code
 * @param countryCode - Two-letter country code (e.g., 'DE', 'GB', 'US')
 * @returns Region code ('EU', 'UK', 'US', 'CA') or 'US' as default for unknown
 */
export function getRegionFromCountry(countryCode: string | null | undefined): string {
  if (!countryCode) return 'US'; // Default for non-logged-in users
  const upper = countryCode.toUpperCase();
  return COUNTRY_TO_REGION_MAP[upper] || 'US'; // Default to US for unknown countries
}

/**
 * Get the currency code for a region
 * @param region - Region code ('EU', 'UK', 'US', 'CA')
 * @returns Currency code ('EUR', 'GBP', 'USD', 'CAD')
 */
export function getCurrencyForRegion(region: string): string {
  return REGION_CONFIG[region]?.currency || 'USD';
}

/**
 * Get the currency symbol for a region
 * @param region - Region code ('EU', 'UK', 'US', 'CA')
 * @returns Currency symbol ('€', '£', '$', 'C$')
 */
export function getSymbolForRegion(region: string): string {
  return REGION_CONFIG[region]?.symbol || '$';
}

/**
 * Get all countries for a region
 * @param region - Region code ('EU', 'UK', 'US', 'CA')
 * @returns Array of country codes
 */
export function getCountriesForRegion(region: string): string[] {
  return REGION_CONFIG[region]?.countries || [];
}

/**
 * Check if a region code is valid
 */
export function isValidRegion(region: string): boolean {
  return region in REGION_CONFIG;
}

/**
 * Get all valid region codes
 */
export function getAllRegions(): string[] {
  return Object.keys(REGION_CONFIG);
}

// ============================================
// SQL HELPER - Region mapping for queries
// ============================================

/**
 * Generate SQL CASE statement for mapping country codes to regions
 * Useful in aggregate queries
 */
export function getRegionCaseSql(countryColumn: string = 'region'): string {
  const euCountries = Array.from(EU_COUNTRIES).map(c => `'${c}'`).join(', ');
  
  return `
    CASE 
      WHEN ${countryColumn} IN (${euCountries}) THEN 'EU'
      WHEN ${countryColumn} = 'GB' THEN 'UK'
      WHEN ${countryColumn} = 'US' THEN 'US'
      WHEN ${countryColumn} = 'CA' THEN 'CA'
      ELSE 'US'
    END
  `;
}

/**
 * Generate SQL CASE statement for currency based on country/region
 */
export function getCurrencyCaseSql(countryColumn: string = 'region'): string {
  const euCountries = Array.from(EU_COUNTRIES).map(c => `'${c}'`).join(', ');
  
  return `
    CASE 
      WHEN ${countryColumn} IN (${euCountries}) THEN 'EUR'
      WHEN ${countryColumn} = 'GB' THEN 'GBP'
      WHEN ${countryColumn} = 'US' THEN 'USD'
      WHEN ${countryColumn} = 'CA' THEN 'CAD'
      ELSE 'USD'
    END
  `;
}

// ============================================
// EXPORTS
// ============================================

export default {
  REGION_CONFIG,
  getRegionFromCountry,
  getCurrencyForRegion,
  getSymbolForRegion,
  getCountriesForRegion,
  isValidRegion,
  getAllRegions,
  getRegionCaseSql,
  getCurrencyCaseSql,
};
