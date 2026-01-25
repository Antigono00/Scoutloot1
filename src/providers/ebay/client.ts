import { getEbayToken } from './auth.js';
import { EbaySearchResponse } from './types.js';

const EBAY_API_URL = 'https://api.ebay.com';

/**
 * Map country codes to eBay marketplace IDs
 * When searching, use the marketplace matching the user's destination country
 * This returns better results than always using EBAY_DE
 * 
 * Countries without their own eBay marketplace use the closest/largest one
 */
const COUNTRY_TO_MARKETPLACE: Record<string, string> = {
  // ============================================
  // NORTH AMERICA BLOCK
  // ============================================
  'US': 'EBAY_US',
  'CA': 'EBAY_CA',
  
  // ============================================
  // UK BLOCK
  // ============================================
  'GB': 'EBAY_GB',
  'UK': 'EBAY_GB',  // Alias
  
  // ============================================
  // EU BLOCK - Countries with their own eBay marketplace
  // ============================================
  'DE': 'EBAY_DE',
  'FR': 'EBAY_FR',
  'ES': 'EBAY_ES',
  'IT': 'EBAY_IT',
  'NL': 'EBAY_NL',
  'BE': 'EBAY_BE',
  'AT': 'EBAY_AT',
  'IE': 'EBAY_IE',
  'PL': 'EBAY_PL',
  
  // EU - Countries without eBay marketplace - mapped to closest/best option
  'PT': 'EBAY_ES',    // Portugal → Spain
  'LU': 'EBAY_DE',    // Luxembourg → Germany
  'GR': 'EBAY_DE',    // Greece → Germany
  'MT': 'EBAY_IT',    // Malta → Italy
  'CY': 'EBAY_DE',    // Cyprus → Germany
  'SE': 'EBAY_DE',    // Sweden → Germany
  'DK': 'EBAY_DE',    // Denmark → Germany
  'FI': 'EBAY_DE',    // Finland → Germany
  'EE': 'EBAY_DE',    // Estonia → Germany
  'LV': 'EBAY_DE',    // Latvia → Germany
  'LT': 'EBAY_DE',    // Lithuania → Germany
  'CZ': 'EBAY_DE',    // Czechia → Germany
  'SK': 'EBAY_DE',    // Slovakia → Germany
  'HU': 'EBAY_DE',    // Hungary → Germany
  'SI': 'EBAY_AT',    // Slovenia → Austria
  'HR': 'EBAY_DE',    // Croatia → Germany
  'RO': 'EBAY_DE',    // Romania → Germany
  'BG': 'EBAY_DE',    // Bulgaria → Germany
};

// Fallback marketplace if country not in map
const DEFAULT_MARKETPLACE = 'EBAY_DE';

/**
 * EU countries that have their own eBay marketplace
 * For these, the itemLocationRegion:EUROPEAN_UNION filter works correctly
 */
const EU_COUNTRIES_WITH_MARKETPLACE = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'IE', 'PL'];

/**
 * Get the eBay marketplace ID for a given country
 */
export function getMarketplaceForCountry(country: string): string {
  return COUNTRY_TO_MARKETPLACE[country.toUpperCase()] ?? DEFAULT_MARKETPLACE;
}

/**
 * Check if a country is in the North America block (US + CA)
 */
export function isNorthAmericaCountry(countryCode: string): boolean {
  const upper = countryCode.toUpperCase();
  return upper === 'US' || upper === 'CA';
}

/**
 * Check if a country is in the EU+UK block
 */
export function isEuUkCountry(countryCode: string): boolean {
  return !isNorthAmericaCountry(countryCode);
}

/**
 * Get the regional block for a country
 * Returns 'north_america' or 'eu_uk'
 */
export function getRegionalBlock(countryCode: string): 'north_america' | 'eu_uk' {
  return isNorthAmericaCountry(countryCode) ? 'north_america' : 'eu_uk';
}

/**
 * Determine the item location region filter based on destination country
 * 
 * IMPORTANT: The itemLocationRegion:EUROPEAN_UNION filter only works correctly
 * when combined with deliveryCountry for countries that have their own eBay marketplace.
 * 
 * For minor EU markets (SK, CZ, PT, etc.), using this filter causes eBay to return
 * incorrect results (e.g., US listings instead of EU). For these countries, we rely
 * on the ship_from_countries post-filter to keep only EU sellers.
 * 
 * The deliveryCountry filter still ensures shipping costs are calculated correctly.
 */
function getItemLocationRegion(shipToCountry: string): string {
  const upper = shipToCountry.toUpperCase();
  
  // North America: No region filter - use post-filter by ship_from_countries
  if (isNorthAmericaCountry(upper)) {
    return '';
  }
  
  // UK: No region filter - allows finding both UK domestic and EU imports
  if (upper === 'GB' || upper === 'UK') {
    return '';
  }
  
  // EU countries WITH their own eBay marketplace: use EUROPEAN_UNION filter
  // This works correctly for DE, FR, ES, IT, NL, BE, AT, IE, PL
  if (EU_COUNTRIES_WITH_MARKETPLACE.includes(upper)) {
    return 'EUROPEAN_UNION';
  }
  
  // EU countries WITHOUT their own marketplace (SK, CZ, PT, LU, GR, etc.):
  // No region filter - it causes eBay to return incorrect results
  // The ship_from_countries post-filter will keep only EU sellers
  // deliveryCountry still ensures correct shipping calculation
  return '';
}

function buildFilters(shipToCountry: string): string {
  const filters: string[] = [
    'buyingOptions:{FIXED_PRICE}',
    `deliveryCountry:${shipToCountry}`,
  ];
  
  // Add location region filter if applicable
  const locationRegion = getItemLocationRegion(shipToCountry);
  if (locationRegion) {
    filters.push(`itemLocationRegion:${locationRegion}`);
  }
  
  return filters.join(',');
}

export async function searchEbay(
  setNumber: string,
  shipToCountry: string,
  options?: { limit?: number; offset?: number }
): Promise<EbaySearchResponse> {
  const token = await getEbayToken();
  
  // Increased limit to get more results
  const limit = options?.limit ?? 200;
  const offset = options?.offset ?? 0;
  
  // Use marketplace matching user's country for better results
  const marketplace = getMarketplaceForCountry(shipToCountry);
  
  // Build filters
  const filterString = buildFilters(shipToCountry);
  
  // Search query: just "LEGO {setNumber}"
  // Don't sort by price - it returns only cheap individual parts
  // Let eBay's relevance algorithm find complete sets
  const params = new URLSearchParams({
    q: `LEGO ${setNumber}`,
    filter: filterString,
    limit: String(limit),
    offset: String(offset),
    // No sort parameter = relevance-based (default)
  });

  const url = `${EBAY_API_URL}/buy/browse/v1/item_summary/search?${params}`;

  console.log(`eBay search: set=${setNumber}, country=${shipToCountry}, marketplace=${marketplace}, limit=${limit}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplace,
      'X-EBAY-C-ENDUSERCTX': `contextualLocation=country=${shipToCountry}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eBay search failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as EbaySearchResponse;
  
  console.log(`eBay returned ${data.itemSummaries?.length ?? 0} listings (total available: ${data.total})`);

  return data;
}

/**
 * Search eBay for UK users - includes both UK and EU listings
 * This is a specialized search that handles the UK's unique position
 * (outside EU single market but close trading partner)
 */
export async function searchEbayForUK(
  setNumber: string,
  options?: { limit?: number; offset?: number; includeEU?: boolean }
): Promise<EbaySearchResponse> {
  const token = await getEbayToken();
  
  const limit = options?.limit ?? 200;
  const offset = options?.offset ?? 0;
  const includeEU = options?.includeEU ?? true;
  
  // Use UK marketplace
  const marketplace = 'EBAY_GB';
  
  // Build filters for UK delivery
  const filters: string[] = [
    'buyingOptions:{FIXED_PRICE}',
    'deliveryCountry:GB',
  ];
  
  // If not including EU, restrict to UK items only
  if (!includeEU) {
    filters.push('itemLocationCountry:GB');
  }
  
  const params = new URLSearchParams({
    q: `LEGO ${setNumber}`,
    filter: filters.join(','),
    limit: String(limit),
    offset: String(offset),
  });

  const url = `${EBAY_API_URL}/buy/browse/v1/item_summary/search?${params}`;

  console.log(`eBay UK search: set=${setNumber}, marketplace=${marketplace}, includeEU=${includeEU}, limit=${limit}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplace,
      'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=GB',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eBay UK search failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as EbaySearchResponse;
  
  console.log(`eBay UK returned ${data.itemSummaries?.length ?? 0} listings (total available: ${data.total})`);

  return data;
}

/**
 * Search eBay for North America users (US or CA)
 * Handles cross-border US↔CA searching
 */
export async function searchEbayForNorthAmerica(
  setNumber: string,
  shipToCountry: 'US' | 'CA',
  options?: { limit?: number; offset?: number }
): Promise<EbaySearchResponse> {
  const token = await getEbayToken();
  
  const limit = options?.limit ?? 200;
  const offset = options?.offset ?? 0;
  
  // Use marketplace matching destination country
  const marketplace = shipToCountry === 'US' ? 'EBAY_US' : 'EBAY_CA';
  
  // Build filters - no region restriction, post-filter handles ship_from
  const filters: string[] = [
    'buyingOptions:{FIXED_PRICE}',
    `deliveryCountry:${shipToCountry}`,
  ];
  
  const params = new URLSearchParams({
    q: `LEGO ${setNumber}`,
    filter: filters.join(','),
    limit: String(limit),
    offset: String(offset),
  });

  const url = `${EBAY_API_URL}/buy/browse/v1/item_summary/search?${params}`;

  console.log(`eBay NA search: set=${setNumber}, country=${shipToCountry}, marketplace=${marketplace}, limit=${limit}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplace,
      'X-EBAY-C-ENDUSERCTX': `contextualLocation=country=${shipToCountry}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`eBay NA search failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as EbaySearchResponse;
  
  console.log(`eBay NA returned ${data.itemSummaries?.length ?? 0} listings (total available: ${data.total})`);

  return data;
}
