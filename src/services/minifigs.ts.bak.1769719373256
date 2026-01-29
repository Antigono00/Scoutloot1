/**
 * Minifigures Service
 * 
 * V26: Complete rewrite with cross-marketplace ID mapping
 * 
 * ID Formats:
 * - Bricklink: sw0010, sh0001, hp0001 (collector standard, used in eBay titles)
 * - BrickOwl BOID: 547141 (internal ID for BrickOwl API)
 * - Rebrickable: fig-003509 (used for images)
 * 
 * Lookup Flow:
 * 1. User enters Bricklink code (sw0010) or name
 * 2. Query BrickOwl → get BOID + name
 * 3. Query Rebrickable with name → get fig-XXXXXX + image
 * 4. Cache all IDs in database
 */

import { query } from '../db/index.js';

// Rebrickable API key
const REBRICKABLE_API_KEY = process.env.REBRICKABLE_API_KEY || '05480b178b7ab764c21069f710e1380f';

// BrickOwl API key (from config)
const BRICKOWL_API_KEY = process.env.BRICKOWL_API_KEY || '';

// ============================================
// INTERFACES
// ============================================

export interface Minifig {
  minifig_id: string;        // Rebrickable ID (fig-003509) or Bricklink if no Rebrickable
  bricklink_id: string | null;  // Bricklink code (sw0010) - for eBay searches
  brickowl_boid: string | null; // BrickOwl internal ID - for BrickOwl API
  name: string | null;
  num_parts: number | null;
  image_url: string | null;
  rebrickable_url: string | null;
  set_numbers: string[] | null;
  theme: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MinifigSearchResult {
  minifig_id: string;
  bricklink_id: string | null;
  brickowl_boid: string | null;
  name: string;
  num_parts: number | null;
  image_url: string | null;
}

export interface MinifigLookupResult {
  success: boolean;
  minifig_id: string;        // Primary ID (Rebrickable or Bricklink)
  bricklink_id: string | null;
  brickowl_boid: string | null;
  name: string | null;
  image_url: string | null;
  num_parts: number | null;
  source: 'cache' | 'brickowl' | 'rebrickable';
}

// ============================================
// ID FORMAT DETECTION
// ============================================

/**
 * Detect the format of a minifig ID
 */
export function detectMinifigIdFormat(input: string): 'bricklink' | 'rebrickable' | 'brickowl_boid' | 'name' {
  const normalized = input.trim().toLowerCase();
  
  // Rebrickable format: fig-XXXXXX
  if (/^fig-\d{6}$/.test(normalized)) {
    return 'rebrickable';
  }
  
  // BrickOwl BOID: Pure numeric
  if (/^\d+$/.test(normalized)) {
    return 'brickowl_boid';
  }
  
  // Bricklink format: 2-4 letters followed by numbers (optionally ending in a letter)
  // Examples: sw0010, sh0001, hp0001, col123, cty0456a
  if (/^[a-z]{2,4}\d+[a-z]?$/i.test(normalized)) {
    return 'bricklink';
  }
  
  // Otherwise treat as name search
  return 'name';
}

/**
 * Check if string looks like a Bricklink minifig code
 */
export function isBricklinkCode(input: string): boolean {
  return detectMinifigIdFormat(input) === 'bricklink';
}

/**
 * Normalize Bricklink code to standard format (lowercase)
 */
export function normalizeBricklinkCode(code: string): string {
  return code.trim().toLowerCase();
}

// ============================================
// MAIN LOOKUP FUNCTION
// ============================================

/**
 * Look up a minifig by any identifier (Bricklink code, name, or Rebrickable ID)
 * This is the main entry point for minifig resolution.
 * 
 * @param input - Bricklink code (sw0010), Rebrickable ID (fig-003509), or name
 * @returns Complete minifig data with all ID mappings
 */
export async function lookupMinifig(input: string): Promise<MinifigLookupResult> {
  const inputType = detectMinifigIdFormat(input);
  const normalizedInput = input.trim().toLowerCase();
  
  console.log(`[Minifigs] Looking up "${input}" (detected type: ${inputType})`);
  
  // Step 1: Check local cache first
  const cached = await findInCache(normalizedInput, inputType);
  if (cached && cached.name) {
    console.log(`[Minifigs] Cache hit for "${input}": ${cached.name}`);
    return {
      success: true,
      minifig_id: cached.minifig_id,
      bricklink_id: cached.bricklink_id,
      brickowl_boid: cached.brickowl_boid,
      name: cached.name,
      image_url: cached.image_url,
      num_parts: cached.num_parts,
      source: 'cache',
    };
  }
  
  // Step 2: Query BrickOwl for Bricklink codes or names
  if (inputType === 'bricklink' || inputType === 'name') {
    const brickOwlResult = await searchBrickOwlMinifig(normalizedInput);
    
    if (brickOwlResult) {
      console.log(`[Minifigs] BrickOwl found: BOID=${brickOwlResult.boid}, name="${brickOwlResult.name}"`);
      
      // Step 3: Try to get Rebrickable info for image
      const rebrickableInfo = await searchRebrickableByName(brickOwlResult.name);
      
      // Step 4: Cache the result
      const minifig = await cacheMinifigData({
        bricklink_id: inputType === 'bricklink' ? normalizedInput : null,
        brickowl_boid: brickOwlResult.boid,
        name: brickOwlResult.name,
        rebrickable_id: rebrickableInfo?.rebrickable_id || null,
        image_url: rebrickableInfo?.image_url || null,
        num_parts: rebrickableInfo?.num_parts || null,
      });
      
      return {
        success: true,
        minifig_id: minifig.minifig_id,
        bricklink_id: minifig.bricklink_id,
        brickowl_boid: minifig.brickowl_boid,
        name: minifig.name,
        image_url: minifig.image_url,
        num_parts: minifig.num_parts,
        source: 'brickowl',
      };
    }
  }
  
  // Step 5: If BrickOwl didn't find it, try Rebrickable directly
  if (inputType === 'rebrickable') {
    const rebrickableInfo = await getRebrickableMinifig(normalizedInput);
    if (rebrickableInfo) {
      const minifig = await cacheMinifigData({
        rebrickable_id: normalizedInput,
        name: rebrickableInfo.name,
        image_url: rebrickableInfo.image_url,
        num_parts: rebrickableInfo.num_parts,
        bricklink_id: null,
        brickowl_boid: null,
      });
      
      return {
        success: true,
        minifig_id: minifig.minifig_id,
        bricklink_id: minifig.bricklink_id,
        brickowl_boid: minifig.brickowl_boid,
        name: minifig.name,
        image_url: minifig.image_url,
        num_parts: minifig.num_parts,
        source: 'rebrickable',
      };
    }
  }
  
  // Nothing found
  console.log(`[Minifigs] No results found for "${input}"`);
  return {
    success: false,
    minifig_id: normalizedInput,
    bricklink_id: inputType === 'bricklink' ? normalizedInput : null,
    brickowl_boid: null,
    name: null,
    image_url: null,
    num_parts: null,
    source: 'cache',
  };
}

// ============================================
// CACHE OPERATIONS
// ============================================

/**
 * Find minifig in local cache by any ID type
 */
async function findInCache(
  input: string, 
  inputType: 'bricklink' | 'rebrickable' | 'brickowl_boid' | 'name'
): Promise<Minifig | null> {
  let result;
  
  switch (inputType) {
    case 'bricklink':
      result = await query<Minifig>(
        `SELECT * FROM minifigs WHERE bricklink_id = $1 OR minifig_id = $1`,
        [input]
      );
      break;
      
    case 'rebrickable':
      result = await query<Minifig>(
        `SELECT * FROM minifigs WHERE minifig_id = $1`,
        [input]
      );
      break;
      
    case 'brickowl_boid':
      result = await query<Minifig>(
        `SELECT * FROM minifigs WHERE brickowl_boid = $1`,
        [input]
      );
      break;
      
    case 'name':
      result = await query<Minifig>(
        `SELECT * FROM minifigs WHERE LOWER(name) LIKE $1 ORDER BY updated_at DESC LIMIT 1`,
        [`%${input}%`]
      );
      break;
  }
  
  return result.rows[0] ?? null;
}

/**
 * Cache minifig data from external APIs
 */
async function cacheMinifigData(data: {
  bricklink_id: string | null;
  brickowl_boid: string | null;
  rebrickable_id: string | null;
  name: string | null;
  image_url: string | null;
  num_parts: number | null;
}): Promise<Minifig> {
  // Determine primary ID (prefer Rebrickable, then Bricklink, then BOID)
  const primaryId = data.rebrickable_id || data.bricklink_id || data.brickowl_boid || 'unknown';
  
  const result = await query<Minifig>(
    `INSERT INTO minifigs (minifig_id, bricklink_id, brickowl_boid, name, num_parts, image_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (minifig_id) DO UPDATE SET
       bricklink_id = COALESCE(EXCLUDED.bricklink_id, minifigs.bricklink_id),
       brickowl_boid = COALESCE(EXCLUDED.brickowl_boid, minifigs.brickowl_boid),
       name = COALESCE(EXCLUDED.name, minifigs.name),
       num_parts = COALESCE(EXCLUDED.num_parts, minifigs.num_parts),
       image_url = COALESCE(EXCLUDED.image_url, minifigs.image_url),
       updated_at = NOW()
     RETURNING *`,
    [primaryId, data.bricklink_id, data.brickowl_boid, data.name, data.num_parts, data.image_url]
  );
  
  // If we have a Bricklink ID different from primary, also try to update by bricklink_id
  if (data.bricklink_id && data.bricklink_id !== primaryId) {
    await query(
      `UPDATE minifigs SET 
         brickowl_boid = COALESCE($2, brickowl_boid),
         name = COALESCE($3, name),
         image_url = COALESCE($4, image_url)
       WHERE bricklink_id = $1 OR minifig_id = $1`,
      [data.bricklink_id, data.brickowl_boid, data.name, data.image_url]
    );
  }
  
  return result.rows[0];
}

// ============================================
// BRICKOWL API
// ============================================

interface BrickOwlMinifigResult {
  boid: string;
  name: string;
}

/**
 * Search BrickOwl for a minifig by Bricklink code or name
 */
async function searchBrickOwlMinifig(searchQuery: string): Promise<BrickOwlMinifigResult | null> {
  if (!BRICKOWL_API_KEY) {
    console.log('[Minifigs] BrickOwl API key not configured');
    return null;
  }
  
  try {
    const url = `https://api.brickowl.com/v1/catalog/search?key=${BRICKOWL_API_KEY}&query=${encodeURIComponent(searchQuery)}&type=Minifigure`;
    
    console.log(`[Minifigs] Querying BrickOwl: ${searchQuery}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[Minifigs] BrickOwl API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json() as any;
    
    if (!data.results || data.results.length === 0) {
      console.log(`[Minifigs] BrickOwl: No results for "${searchQuery}"`);
      return null;
    }
    
    // Find the best match
    const searchLower = searchQuery.toLowerCase();
    
    for (const result of data.results) {
      if (result.type !== 'Minifigure') continue;
      
      // Check if the result matches our search (by ID in name or permalink)
      const nameLower = (result.name || '').toLowerCase();
      const permalinkLower = (result.permalink || '').toLowerCase();
      
      // For Bricklink codes, check if it appears in the name or permalink
      if (isBricklinkCode(searchQuery)) {
        if (nameLower.includes(searchLower) || permalinkLower.includes(searchLower)) {
          return {
            boid: result.boid,
            name: decodeHtmlEntities(result.name),
          };
        }
      }
      
      // For name searches, return first minifigure result
      return {
        boid: result.boid,
        name: decodeHtmlEntities(result.name),
      };
    }
    
    // If no exact match found but we have results, return first minifigure
    const firstMinifig = data.results.find((r: any) => r.type === 'Minifigure');
    if (firstMinifig) {
      return {
        boid: firstMinifig.boid,
        name: decodeHtmlEntities(firstMinifig.name),
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Minifigs] BrickOwl search error:', error);
    return null;
  }
}

/**
 * Decode HTML entities in BrickOwl responses
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x26;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

// ============================================
// REBRICKABLE API
// ============================================

interface RebrickableMinifigResult {
  rebrickable_id: string;
  name: string;
  image_url: string | null;
  num_parts: number | null;
}

/**
 * Search Rebrickable by minifig name
 */
async function searchRebrickableByName(name: string): Promise<RebrickableMinifigResult | null> {
  try {
    // Clean up name for search (remove "LEGO" prefix if present)
    const cleanName = name.replace(/^LEGO\s+/i, '').replace(/ Minifigure$/i, '').replace(/ Minifig$/i, '').replace(/[()]+/g, '').trim();
    
    const url = `https://rebrickable.com/api/v3/lego/minifigs/?search=${encodeURIComponent(cleanName)}&page_size=5`;
    
    console.log(`[Minifigs] Querying Rebrickable by name: "${cleanName}"`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`[Minifigs] Rebrickable API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json() as any;
    
    if (!data.results || data.results.length === 0) {
      console.log(`[Minifigs] Rebrickable: No results for "${cleanName}"`);
      return null;
    }
    
    // Return best match (first result)
    const match = data.results[0];
    return {
      rebrickable_id: match.set_num,  // Rebrickable uses set_num for minifigs too
      name: match.name,
      image_url: match.set_img_url,
      num_parts: match.num_parts,
    };
  } catch (error) {
    console.error('[Minifigs] Rebrickable search error:', error);
    return null;
  }
}

/**
 * Get specific minifig from Rebrickable by ID
 */
async function getRebrickableMinifig(figId: string): Promise<RebrickableMinifigResult | null> {
  try {
    const url = `https://rebrickable.com/api/v3/lego/minifigs/${figId}/`;
    
    console.log(`[Minifigs] Querying Rebrickable by ID: ${figId}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[Minifigs] Rebrickable: Minifig ${figId} not found`);
        return null;
      }
      console.error(`[Minifigs] Rebrickable API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json() as any;
    
    return {
      rebrickable_id: data.set_num,
      name: data.name,
      image_url: data.set_img_url,
      num_parts: data.num_parts,
    };
  } catch (error) {
    console.error('[Minifigs] Rebrickable get error:', error);
    return null;
  }
}

// ============================================
// CRUD OPERATIONS (kept from original)
// ============================================

/**
 * Ensure a minifig exists in the database
 * Creates a placeholder if it doesn't exist
 */
export async function ensureMinifigExists(figNum: string): Promise<void> {
  const idType = detectMinifigIdFormat(figNum);
  const normalized = figNum.toLowerCase();
  
  if (idType === 'bricklink') {
    await query(
      `INSERT INTO minifigs (minifig_id, bricklink_id) 
       VALUES ($1, $1) 
       ON CONFLICT (minifig_id) DO NOTHING`,
      [normalized]
    );
  } else {
    await query(
      `INSERT INTO minifigs (minifig_id) 
       VALUES ($1) 
       ON CONFLICT (minifig_id) DO NOTHING`,
      [normalized]
    );
  }
}

/**
 * Get a minifig by its ID (any format)
 */
export async function getMinifig(figNum: string): Promise<Minifig | null> {
  const normalized = figNum.toLowerCase();
  
  // Try all ID columns
  const result = await query<Minifig>(
    `SELECT * FROM minifigs 
     WHERE minifig_id = $1 OR bricklink_id = $1 OR brickowl_boid = $1
     LIMIT 1`,
    [normalized]
  );
  
  return result.rows[0] ?? null;
}

/**
 * Get minifig by Bricklink code specifically
 */
export async function getMinifigByBricklinkCode(code: string): Promise<Minifig | null> {
  const normalized = normalizeBricklinkCode(code);
  
  const result = await query<Minifig>(
    `SELECT * FROM minifigs WHERE bricklink_id = $1`,
    [normalized]
  );
  
  return result.rows[0] ?? null;
}

/**
 * Get minifig by BrickOwl BOID
 */
export async function getMinifigByBoid(boid: string): Promise<Minifig | null> {
  const result = await query<Minifig>(
    `SELECT * FROM minifigs WHERE brickowl_boid = $1`,
    [boid]
  );
  
  return result.rows[0] ?? null;
}

/**
 * Update minifig info
 */
export async function updateMinifig(
  figNum: string,
  data: {
    bricklink_id?: string | null;
    brickowl_boid?: string | null;
    name?: string | null;
    num_parts?: number | null;
    image_url?: string | null;
    rebrickable_url?: string | null;
    set_numbers?: string[] | null;
    theme?: string | null;
  }
): Promise<Minifig | null> {
  const result = await query<Minifig>(
    `UPDATE minifigs SET 
       bricklink_id = COALESCE($2, bricklink_id),
       brickowl_boid = COALESCE($3, brickowl_boid),
       name = COALESCE($4, name),
       num_parts = COALESCE($5, num_parts),
       image_url = COALESCE($6, image_url),
       rebrickable_url = COALESCE($7, rebrickable_url),
       set_numbers = COALESCE($8, set_numbers),
       theme = COALESCE($9, theme),
       updated_at = NOW()
     WHERE minifig_id = $1 OR bricklink_id = $1
     RETURNING *`,
    [
      figNum.toLowerCase(),
      data.bricklink_id,
      data.brickowl_boid,
      data.name,
      data.num_parts,
      data.image_url,
      data.rebrickable_url,
      data.set_numbers,
      data.theme,
    ]
  );
  return result.rows[0] ?? null;
}

/**
 * Upsert minifig (create or update)
 */
export async function upsertMinifig(
  figNum: string,
  data: {
    bricklink_id?: string | null;
    brickowl_boid?: string | null;
    name?: string | null;
    num_parts?: number | null;
    image_url?: string | null;
    rebrickable_url?: string | null;
    set_numbers?: string[] | null;
    theme?: string | null;
  }
): Promise<Minifig> {
  const result = await query<Minifig>(
    `INSERT INTO minifigs (minifig_id, bricklink_id, brickowl_boid, name, num_parts, image_url, rebrickable_url, set_numbers, theme)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (minifig_id) DO UPDATE SET
       bricklink_id = COALESCE(EXCLUDED.bricklink_id, minifigs.bricklink_id),
       brickowl_boid = COALESCE(EXCLUDED.brickowl_boid, minifigs.brickowl_boid),
       name = COALESCE(EXCLUDED.name, minifigs.name),
       num_parts = COALESCE(EXCLUDED.num_parts, minifigs.num_parts),
       image_url = COALESCE(EXCLUDED.image_url, minifigs.image_url),
       rebrickable_url = COALESCE(EXCLUDED.rebrickable_url, minifigs.rebrickable_url),
       set_numbers = COALESCE(EXCLUDED.set_numbers, minifigs.set_numbers),
       theme = COALESCE(EXCLUDED.theme, minifigs.theme),
       updated_at = NOW()
     RETURNING *`,
    [
      figNum.toLowerCase(),
      data.bricklink_id ?? null,
      data.brickowl_boid ?? null,
      data.name ?? null,
      data.num_parts ?? null,
      data.image_url ?? null,
      data.rebrickable_url ?? null,
      data.set_numbers ?? null,
      data.theme ?? null,
    ]
  );
  return result.rows[0];
}

// ============================================
// SEARCH OPERATIONS
// ============================================

/**
 * Search minifigs by name or any ID
 */
export async function searchMinifigs(
  searchQuery: string,
  limit: number = 20
): Promise<MinifigSearchResult[]> {
  const result = await query<MinifigSearchResult>(
    `SELECT minifig_id, bricklink_id, brickowl_boid, name, num_parts, image_url
     FROM minifigs
     WHERE name IS NOT NULL
       AND (
         minifig_id ILIKE $1
         OR bricklink_id ILIKE $1
         OR name ILIKE $2
       )
     ORDER BY 
       CASE WHEN bricklink_id ILIKE $1 THEN 0
            WHEN minifig_id ILIKE $1 THEN 1
            ELSE 2 END,
       name
     LIMIT $3`,
    [`${searchQuery}%`, `%${searchQuery}%`, limit]
  );
  return result.rows;
}

/**
 * Get minifigs for a specific LEGO set
 */
export async function getMinifigsForSet(setNumber: string): Promise<MinifigSearchResult[]> {
  const result = await query<MinifigSearchResult>(
    `SELECT minifig_id, bricklink_id, brickowl_boid, name, num_parts, image_url
     FROM minifigs
     WHERE $1 = ANY(set_numbers)
     ORDER BY minifig_id`,
    [setNumber]
  );
  return result.rows;
}

/**
 * Get popular/watched minifigs
 */
export async function getPopularMinifigs(limit: number = 20): Promise<MinifigSearchResult[]> {
  const result = await query<MinifigSearchResult>(
    `SELECT m.minifig_id, m.bricklink_id, m.brickowl_boid, m.name, m.num_parts, m.image_url
     FROM minifigs m
     JOIN (
       SELECT item_id, COUNT(*) as watch_count
       FROM watches
       WHERE item_type = 'minifig' AND status = 'active'
       GROUP BY item_id
     ) w ON m.minifig_id = w.item_id OR m.bricklink_id = w.item_id
     WHERE m.name IS NOT NULL
     ORDER BY watch_count DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get theme prefix from Bricklink minifig_id
 * e.g., "sw0001" -> "sw" (Star Wars)
 * e.g., "sh001" -> "sh" (Super Heroes)
 */
export function getMinifigThemePrefix(figNum: string): string | null {
  const match = figNum.match(/^([a-z]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Map theme prefix to human-readable theme name
 */
export const MINIFIG_THEME_MAP: Record<string, string> = {
  'sw': 'Star Wars',
  'sh': 'Super Heroes',
  'hp': 'Harry Potter',
  'cty': 'City',
  'njo': 'Ninjago',
  'col': 'Collectible Minifigures',
  'poc': 'Pirates of the Caribbean',
  'lor': 'Lord of the Rings',
  'idea': 'Ideas',
  'mk': 'Monkie Kid',
  'hs': 'Hidden Side',
  'tw': 'The LEGO Movie',
  'dp': 'Disney Princess',
  'dis': 'Disney',
  'mar': 'Marvel',
  'mof': 'Monster Fighters',
  'cas': 'Castle',
  'pir': 'Pirates',
  'sp': 'Space',
  'adv': 'Adventurers',
  'rac': 'Racers',
  'iaj': 'Indiana Jones',
  'hol': 'Holiday',
  'ava': 'Avatar',
  'jw': 'Jurassic World',
  'sr': 'Speed Racer',
  'spp': 'SpongeBob',
  'min': 'Minecraft',
  'ow': 'Overwatch',
  'vid': 'VIDIYO',
  'fab': 'Fabuland',
  'fig': 'Minifigure',
};

export function getThemeName(figNum: string): string | null {
  const prefix = getMinifigThemePrefix(figNum);
  if (!prefix) return null;
  return MINIFIG_THEME_MAP[prefix] ?? null;
}

/**
 * Get IDs needed for scanner
 * Returns the correct ID to use for each marketplace
 */
export async function getMinifigScannerIds(figNum: string): Promise<{
  ebay_search: string;      // What to search on eBay (Bricklink code or name)
  brickowl_boid: string | null;  // BOID for BrickOwl API
  display_name: string | null;   // Human-readable name
  image_url: string | null;      // Display image
}> {
  const minifig = await getMinifig(figNum);
  
  if (!minifig) {
    // Try to look it up
    const lookup = await lookupMinifig(figNum);
    return {
      ebay_search: lookup.bricklink_id || lookup.name || figNum,
      brickowl_boid: lookup.brickowl_boid,
      display_name: lookup.name,
      image_url: lookup.image_url,
    };
  }
  
  // Prefer Bricklink code for eBay search (it's in listing titles)
  const ebaySearch = minifig.bricklink_id || minifig.name || minifig.minifig_id;
  
  return {
    ebay_search: ebaySearch,
    brickowl_boid: minifig.brickowl_boid,
    display_name: minifig.name,
    image_url: minifig.image_url,
  };
}

// ============================================
// BATCH OPERATIONS (for sync-minifigs.ts)
// ============================================

/**
 * Get minifigs that need info updated (missing name)
 */
export async function getMinifigsNeedingUpdate(limit: number = 50): Promise<string[]> {
  const result = await query<{ minifig_id: string }>(
    `SELECT minifig_id FROM minifigs 
     WHERE name IS NULL OR name = ''
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(r => r.minifig_id);
}

/**
 * Count minifigs in database
 */
export async function countMinifigs(): Promise<{
  total: number;
  withInfo: number;
  needsUpdate: number;
}> {
  const result = await query<{
    total: string;
    with_info: string;
    needs_update: string;
  }>(
    `SELECT 
       COUNT(*) as total,
       COUNT(CASE WHEN name IS NOT NULL AND name != '' THEN 1 END) as with_info,
       COUNT(CASE WHEN name IS NULL OR name = '' THEN 1 END) as needs_update
     FROM minifigs`
  );
  
  const row = result.rows[0];
  return {
    total: parseInt(row.total),
    withInfo: parseInt(row.with_info),
    needsUpdate: parseInt(row.needs_update),
  };
}
