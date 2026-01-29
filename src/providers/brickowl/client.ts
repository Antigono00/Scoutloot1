/**
 * BrickOwl API Client
 * 
 * V26: Updated with proper minifig ID mapping support
 * 
 * Handles all communication with BrickOwl's Catalog API:
 * - Search for items (sets, minifigures)
 * - Lookup item details
 * - Get availability (listings)
 * 
 * Key Changes in V26:
 * - findBoidForMinifig() now checks minifigs table for cached BOID first
 * - Supports Bricklink codes (sw0010) for minifig searches
 * - Better minifig search matching logic
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
 * @param query - Search term (set number, name, or Bricklink minifig code)
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
// BOID RESOLUTION - SETS
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

// ============================================
// BOID RESOLUTION - MINIFIGS (V26 UPDATED)
// ============================================

/**
 * Check if a string looks like a Bricklink minifig code
 */
function isBricklinkCode(input: string): boolean {
  return /^[a-z]{2,4}\d+[a-z]?$/i.test(input.trim());
}

/**
 * Find BOID for a minifigure
 * 
 * V26: Now checks minifigs table for cached BOID first, supports Bricklink codes
 * 
 * @param figNum - Minifigure ID (Bricklink code like "sw0010" or Rebrickable like "fig-003509")
 * @returns BOID or null if not found
 */
export async function findBoidForMinifig(figNum: string): Promise<string | null> {
  const normalizedFigNum = figNum.toLowerCase().trim();
  
  // ============================================
  // Step 1: Check minifigs table for cached BOID (V26)
  // ============================================
  try {
    const minifigResult = await query<{ brickowl_boid: string | null; name: string | null }>(
      `SELECT brickowl_boid, name FROM minifigs 
       WHERE minifig_id = $1 OR bricklink_id = $1 
       LIMIT 1`,
      [normalizedFigNum]
    );
    
    if (minifigResult.rows[0]?.brickowl_boid) {
      console.log(`[BrickOwl] Minifig BOID from minifigs table: ${minifigResult.rows[0].brickowl_boid}`);
      return minifigResult.rows[0].brickowl_boid;
    }
    
    // If we have a name but no BOID, we can search BrickOwl by name
    if (minifigResult.rows[0]?.name) {
      console.log(`[BrickOwl] Have name "${minifigResult.rows[0].name}" but no BOID, will search`);
    }
  } catch (error) {
    // Table might not have bricklink_id column yet - continue with search
    console.log(`[BrickOwl] Minifigs table check failed, continuing with search`);
  }
  
  // ============================================
  // Step 2: Check brickowl_boids cache table
  // ============================================
  const cached = await getBoidFromCache(normalizedFigNum, 'minifig');
  if (cached) {
    console.log(`[BrickOwl] BOID cache hit for minifig ${figNum}: ${cached}`);
    return cached;
  }
  
  // ============================================
  // Step 3: Search BrickOwl
  // ============================================
  // For Bricklink codes (sw0010), search directly - BrickOwl understands these
  // For Rebrickable IDs (fig-003509), BrickOwl doesn't understand them, so we need name
  
  let searchQuery = normalizedFigNum;
  
  // If it's a Rebrickable ID, try to get the name from our database first
  if (normalizedFigNum.startsWith('fig-')) {
    try {
      const nameResult = await query<{ name: string }>(
        `SELECT name FROM minifigs WHERE minifig_id = $1 AND name IS NOT NULL`,
        [normalizedFigNum]
      );
      if (nameResult.rows[0]?.name) {
        searchQuery = nameResult.rows[0].name;
        console.log(`[BrickOwl] Using name for search: "${searchQuery}"`);
      }
    } catch (error) {
      // Continue with figNum as search
    }
  }
  
  const results = await searchBrickOwl(searchQuery, 'Minifigure');
  
  if (!results.results || results.results.length === 0) {
    console.log(`[BrickOwl] No results found for minifig ${figNum}`);
    return null;
  }
  
  // Find best match
  const searchLower = searchQuery.toLowerCase();
  
  for (const result of results.results) {
    if (result.type !== 'Minifigure') continue;
    
    const nameLower = (result.name || '').toLowerCase();
    const permalinkLower = (result.permalink || '').toLowerCase();
    
    // For Bricklink codes, check if it appears in the name or permalink
    if (isBricklinkCode(normalizedFigNum)) {
      if (nameLower.includes(normalizedFigNum) || permalinkLower.includes(normalizedFigNum)) {
        // Cache the BOID
        await cacheBoid(normalizedFigNum, 'minifig', result.boid, result.name);
        
        // Also update minifigs table with the BOID (V26)
        await updateMinifigBoid(normalizedFigNum, result.boid, result.name);
        
        console.log(`[BrickOwl] Found BOID for minifig ${figNum}: ${result.boid}`);
        return result.boid;
      }
    }
    
    // For name searches or if code not found, use first minifigure result
    await cacheBoid(normalizedFigNum, 'minifig', result.boid, result.name);
    await updateMinifigBoid(normalizedFigNum, result.boid, result.name);
    
    console.log(`[BrickOwl] Using first result for minifig ${figNum}: ${result.boid}`);
    return result.boid;
  }
  
  // If no exact match found but we have results, return first minifigure
  const firstMinifig = results.results.find(r => r.type === 'Minifigure');
  if (firstMinifig) {
    await cacheBoid(normalizedFigNum, 'minifig', firstMinifig.boid, firstMinifig.name);
    await updateMinifigBoid(normalizedFigNum, firstMinifig.boid, firstMinifig.name);
    
    console.log(`[BrickOwl] Using first minifig result for ${figNum}: ${firstMinifig.boid}`);
    return firstMinifig.boid;
  }
  
  console.log(`[BrickOwl] No matching minifig found for ${figNum}`);
  return null;
}

/**
 * Update minifigs table with BrickOwl BOID (V26)
 */
async function updateMinifigBoid(figNum: string, boid: string, name: string | null): Promise<void> {
  try {
    // Check if figNum looks like a Bricklink code
    const isBricklink = isBricklinkCode(figNum);
    
    if (isBricklink) {
      // Update by bricklink_id
      await query(
        `UPDATE minifigs SET 
           brickowl_boid = $2,
           name = COALESCE(name, $3),
           updated_at = NOW()
         WHERE bricklink_id = $1 OR minifig_id = $1`,
        [figNum.toLowerCase(), boid, decodeHtmlEntities(name || '')]
      );
    } else {
      // Update by minifig_id
      await query(
        `UPDATE minifigs SET 
           brickowl_boid = $2,
           name = COALESCE(name, $3),
           updated_at = NOW()
         WHERE minifig_id = $1`,
        [figNum.toLowerCase(), boid, decodeHtmlEntities(name || '')]
      );
    }
  } catch (error) {
    // Non-fatal - just log
    console.log(`[BrickOwl] Failed to update minifigs table with BOID:`, error);
  }
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
 * V26: Uses proper ID resolution through minifigs table
 * 
 * @param figNum - Minifigure ID (Bricklink code or any stored ID)
 * @param destinationCountry - User's destination country
 * @returns Array of listings (raw, not normalized)
 */
export async function scanBrickOwlForMinifig(
  figNum: string,
  destinationCountry: string
): Promise<BrickOwlListing[]> {
  try {
    // Find BOID for this minifig (V26: now checks minifigs table first)
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
