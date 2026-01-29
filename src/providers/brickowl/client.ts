/**
 * BrickOwl API Client
 * 
 * Handles all communication with BrickOwl's Catalog API:
 * - Search for items (sets, minifigures)
 * - Lookup item details
 * - Get availability (listings)
 */

import { config } from '../../config.js';
import { query } from '../../db/index.js';
import {
  BrickOwlSearchResponse,
  BrickOwlCatalogItem,
  BrickOwlAvailabilityResponse,
  BrickOwlListing,
  BoidCacheEntry,
} from './types.js';

const BASE_URL = 'https://api.brickowl.com/v1';

// Rate limiting: BrickOwl is slower than eBay, but be respectful
const RATE_LIMIT_MS = 500; // 500ms between requests
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  
  lastRequestTime = Date.now();
  return fetch(url);
}

// ============================================
// CATALOG SEARCH
// ============================================

/**
 * Search BrickOwl catalog by query and type
 * 
 * @param query - Search term (set number, name, or fig_num)
 * @param type - Item type: 'Set', 'Minifigure', 'Part', 'Gear'
 */
export async function searchBrickOwl(
  searchQuery: string,
  type: 'Set' | 'Minifigure' | 'Part' | 'Gear' = 'Set'
): Promise<BrickOwlSearchResponse> {
  const apiKey = config.brickOwlApiKey;
  
  if (!apiKey) {
    throw new Error('BRICKOWL_API_KEY not configured');
  }
  
  const url = `${BASE_URL}/catalog/search?key=${apiKey}&query=${encodeURIComponent(searchQuery)}&type=${type}`;
  
  console.log(`[BrickOwl] Searching: "${searchQuery}" (type: ${type})`);
  
  const response = await rateLimitedFetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BrickOwl search failed (${response.status}): ${errorText}`);
  }
  
  const data = await response.json() as BrickOwlSearchResponse;
  
  console.log(`[BrickOwl] Search returned ${data.results?.length ?? 0} results`);
  
  return data;
}

// ============================================
// CATALOG LOOKUP
// ============================================

/**
 * Lookup detailed item info by BOID
 */
export async function lookupBrickOwl(boid: string): Promise<BrickOwlCatalogItem> {
  const apiKey = config.brickOwlApiKey;
  
  if (!apiKey) {
    throw new Error('BRICKOWL_API_KEY not configured');
  }
  
  const url = `${BASE_URL}/catalog/lookup?key=${apiKey}&boid=${boid}`;
  
  console.log(`[BrickOwl] Lookup: BOID ${boid}`);
  
  const response = await rateLimitedFetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BrickOwl lookup failed (${response.status}): ${errorText}`);
  }
  
  return response.json() as Promise<BrickOwlCatalogItem>;
}

// ============================================
// CATALOG AVAILABILITY (MAIN ENDPOINT)
// ============================================

/**
 * Get all available listings for an item
 * 
 * @param boid - BrickOwl item ID
 * @param country - Destination country (ISO 2-letter code) - REQUIRED
 */
export async function getAvailability(
  boid: string,
  country: string
): Promise<BrickOwlAvailabilityResponse> {
  const apiKey = config.brickOwlApiKey;
  
  if (!apiKey) {
    throw new Error('BRICKOWL_API_KEY not configured');
  }
  
  const url = `${BASE_URL}/catalog/availability?key=${apiKey}&boid=${boid}&country=${country.toUpperCase()}`;
  
  console.log(`[BrickOwl] Getting availability: BOID ${boid}, destination ${country}`);
  
  const response = await rateLimitedFetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BrickOwl availability failed (${response.status}): ${errorText}`);
  }
  
  const data = await response.json() as BrickOwlAvailabilityResponse;
  
  // Count active listings
  const listings = Object.values(data);
  const activeCount = listings.filter(l => l.open).length;
  
  console.log(`[BrickOwl] Availability: ${activeCount} active listings (${listings.length} total)`);
  
  return data;
}

// ============================================
// BOID RESOLUTION HELPERS
// ============================================

/**
 * Find BOID for a LEGO set number
 * 
 * @param setNumber - LEGO set number (e.g., "75192" or "75192-1")
 * @returns BOID or null if not found
 */
export async function findBoidForSet(setNumber: string): Promise<string | null> {
  // First check cache
  const cached = await getBoidFromCache(setNumber, 'set');
  if (cached) {
    console.log(`[BrickOwl] BOID cache hit for set ${setNumber}: ${cached}`);
    return cached;
  }
  
  // Search BrickOwl
  const results = await searchBrickOwl(setNumber, 'Set');
  
  if (!results.results || results.results.length === 0) {
    console.log(`[BrickOwl] No results found for set ${setNumber}`);
    return null;
  }
  
  // Normalize set number for matching (remove -1 suffix if present)
  const normalizedSetNum = setNumber.replace(/-\d+$/, '');
  
  // Find best match: exact set number in name
  for (const result of results.results) {
    const nameContainsSetNum = result.name.includes(setNumber) || 
                               result.name.includes(normalizedSetNum) ||
                               result.name.toLowerCase().includes(`set ${normalizedSetNum}`) ||
                               result.name.toLowerCase().includes(`${normalizedSetNum}-1`);
    
    if (nameContainsSetNum) {
      // Cache and return
      await cacheBoid(setNumber, 'set', result.boid, result.name);
      console.log(`[BrickOwl] Found BOID for set ${setNumber}: ${result.boid}`);
      return result.boid;
    }
  }
  
  // If no exact match, try first result if it looks like a set
  if (results.results[0]?.type === 'Set') {
    const boid = results.results[0].boid;
    const name = results.results[0].name;
    await cacheBoid(setNumber, 'set', boid, name);
    console.log(`[BrickOwl] Using first result for set ${setNumber}: ${boid}`);
    return boid;
  }
  
  console.log(`[BrickOwl] No matching set found for ${setNumber}`);
  return null;
}

/**
 * Find BOID for a minifigure
 * 
 * @param figNum - Minifigure ID (e.g., "sw0001" or "sh001")
 * @returns BOID or null if not found
 */
export async function findBoidForMinifig(figNum: string): Promise<string | null> {
  // First check cache
  const cached = await getBoidFromCache(figNum, 'minifig');
  if (cached) {
    console.log(`[BrickOwl] BOID cache hit for minifig ${figNum}: ${cached}`);
    return cached;
  }
  
  // Search BrickOwl
  const results = await searchBrickOwl(figNum, 'Minifigure');
  
  if (!results.results || results.results.length === 0) {
    console.log(`[BrickOwl] No results found for minifig ${figNum}`);
    return null;
  }
  
  // Find exact match by fig_num
  for (const result of results.results) {
    // Check if the name or permalink contains the fig_num
    const figNumLower = figNum.toLowerCase();
    const nameContainsFig = result.name.toLowerCase().includes(figNumLower) ||
                            result.permalink.toLowerCase().includes(figNumLower);
    
    if (nameContainsFig) {
      // Cache and return
      await cacheBoid(figNum, 'minifig', result.boid, result.name);
      console.log(`[BrickOwl] Found BOID for minifig ${figNum}: ${result.boid}`);
      return result.boid;
    }
  }
  
  // If no exact match, try first result if it's a minifigure
  if (results.results[0]?.type === 'Minifigure') {
    const boid = results.results[0].boid;
    const name = results.results[0].name;
    await cacheBoid(figNum, 'minifig', boid, name);
    console.log(`[BrickOwl] Using first result for minifig ${figNum}: ${boid}`);
    return boid;
  }
  
  console.log(`[BrickOwl] No matching minifig found for ${figNum}`);
  return null;
}

// ============================================
// BOID CACHING (Database)
// ============================================

/**
 * Get BOID from cache
 */
async function getBoidFromCache(
  itemNumber: string,
  itemType: 'set' | 'minifig'
): Promise<string | null> {
  try {
    const result = await query<BoidCacheEntry>(
      `SELECT boid FROM brickowl_boids 
       WHERE item_id = $1 AND item_type = $2
       AND updated_at > NOW() - INTERVAL '30 days'`,
      [itemNumber.toLowerCase(), itemType]
    );
    
    return result.rows[0]?.boid ?? null;
  } catch (error) {
    // Table might not exist yet
    console.log(`[BrickOwl] BOID cache lookup failed:`, error);
    return null;
  }
}

/**
 * Cache BOID for future lookups
 */
async function cacheBoid(
  itemNumber: string,
  itemType: 'set' | 'minifig',
  boid: string,
  name: string | null
): Promise<void> {
  try {
    await query(
      `INSERT INTO brickowl_boids (item_id, item_type, boid, name, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (item_id, item_type) 
       DO UPDATE SET boid = $3, name = $4, updated_at = NOW()`,
      [itemNumber.toLowerCase(), itemType, boid, name]
    );
  } catch (error) {
    // Table might not exist yet - non-fatal
    console.log(`[BrickOwl] BOID cache write failed:`, error);
  }
}

// ============================================
// HIGH-LEVEL SCAN FUNCTIONS
// ============================================

/**
 * Scan BrickOwl for a LEGO set
 * 
 * @param setNumber - Set number to scan
 * @param destinationCountry - User's destination country
 * @returns Array of listings (raw, not normalized)
 */
export async function scanBrickOwlForSet(
  setNumber: string,
  destinationCountry: string
): Promise<BrickOwlListing[]> {
  try {
    // Find BOID for this set
    const boid = await findBoidForSet(setNumber);
    
    if (!boid) {
      console.log(`[BrickOwl] No BOID found for set ${setNumber}, skipping`);
      return [];
    }
    
    // Get availability
    const availability = await getAvailability(boid, destinationCountry);
    
    // Convert to array and filter for active listings
    const listings = Object.values(availability).filter(l => l.open);
    
    console.log(`[BrickOwl] Set ${setNumber}: ${listings.length} active listings`);
    
    return listings;
  } catch (error) {
    console.error(`[BrickOwl] Error scanning set ${setNumber}:`, error);
    return [];
  }
}

/**
 * Scan BrickOwl for a minifigure
 * 
 * @param figNum - Minifigure ID to scan
 * @param destinationCountry - User's destination country
 * @returns Array of listings (raw, not normalized)
 */
export async function scanBrickOwlForMinifig(
  figNum: string,
  destinationCountry: string
): Promise<BrickOwlListing[]> {
  try {
    // Find BOID for this minifig
    const boid = await findBoidForMinifig(figNum);
    
    if (!boid) {
      console.log(`[BrickOwl] No BOID found for minifig ${figNum}, skipping`);
      return [];
    }
    
    // Get availability
    const availability = await getAvailability(boid, destinationCountry);
    
    // Convert to array and filter for active listings
    const listings = Object.values(availability).filter(l => l.open);
    
    console.log(`[BrickOwl] Minifig ${figNum}: ${listings.length} active listings`);
    
    return listings;
  } catch (error) {
    console.error(`[BrickOwl] Error scanning minifig ${figNum}:`, error);
    return [];
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Decode HTML entities in store names
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x26;/g, '&')
    .replace(/&#x3C;/g, '<')
    .replace(/&#x3E;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Check if BrickOwl API is configured
 */
export function isBrickOwlConfigured(): boolean {
  return !!config.brickOwlApiKey;
}
