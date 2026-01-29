/**
 * Minifigures Service
 * 
 * Manages LEGO minifigure catalog data from Rebrickable.
 */

import { query } from '../db/index.js';

// ============================================
// INTERFACES
// ============================================

export interface Minifig {
  fig_num: string;
  name: string | null;
  num_parts: number | null;
  image_url: string | null;
  rebrickable_url: string | null;
  set_nums: string[] | null;  // Sets this minifig appears in
  theme: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MinifigSearchResult {
  fig_num: string;
  name: string;
  num_parts: number | null;
  image_url: string | null;
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Ensure a minifig exists in the database
 * Creates a placeholder if it doesn't exist
 */
export async function ensureMinifigExists(figNum: string): Promise<void> {
  await query(
    `INSERT INTO minifigs (fig_num) 
     VALUES ($1) 
     ON CONFLICT (fig_num) DO NOTHING`,
    [figNum.toLowerCase()]
  );
}

/**
 * Get a minifig by its ID
 */
export async function getMinifig(figNum: string): Promise<Minifig | null> {
  const result = await query<Minifig>(
    `SELECT * FROM minifigs WHERE fig_num = $1`,
    [figNum.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

/**
 * Update minifig info from Rebrickable
 */
export async function updateMinifig(
  figNum: string,
  data: {
    name?: string | null;
    num_parts?: number | null;
    image_url?: string | null;
    rebrickable_url?: string | null;
    set_nums?: string[] | null;
    theme?: string | null;
  }
): Promise<Minifig | null> {
  const result = await query<Minifig>(
    `UPDATE minifigs SET 
       name = COALESCE($2, name),
       num_parts = COALESCE($3, num_parts),
       image_url = COALESCE($4, image_url),
       rebrickable_url = COALESCE($5, rebrickable_url),
       set_nums = COALESCE($6, set_nums),
       theme = COALESCE($7, theme),
       updated_at = NOW()
     WHERE fig_num = $1
     RETURNING *`,
    [
      figNum.toLowerCase(),
      data.name,
      data.num_parts,
      data.image_url,
      data.rebrickable_url,
      data.set_nums,
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
    name?: string | null;
    num_parts?: number | null;
    image_url?: string | null;
    rebrickable_url?: string | null;
    set_nums?: string[] | null;
    theme?: string | null;
  }
): Promise<Minifig> {
  const result = await query<Minifig>(
    `INSERT INTO minifigs (fig_num, name, num_parts, image_url, rebrickable_url, set_nums, theme)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (fig_num) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, minifigs.name),
       num_parts = COALESCE(EXCLUDED.num_parts, minifigs.num_parts),
       image_url = COALESCE(EXCLUDED.image_url, minifigs.image_url),
       rebrickable_url = COALESCE(EXCLUDED.rebrickable_url, minifigs.rebrickable_url),
       set_nums = COALESCE(EXCLUDED.set_nums, minifigs.set_nums),
       theme = COALESCE(EXCLUDED.theme, minifigs.theme),
       updated_at = NOW()
     RETURNING *`,
    [
      figNum.toLowerCase(),
      data.name ?? null,
      data.num_parts ?? null,
      data.image_url ?? null,
      data.rebrickable_url ?? null,
      data.set_nums ?? null,
      data.theme ?? null,
    ]
  );
  return result.rows[0];
}

// ============================================
// SEARCH OPERATIONS
// ============================================

/**
 * Search minifigs by name or fig_num
 */
export async function searchMinifigs(
  searchQuery: string,
  limit: number = 20
): Promise<MinifigSearchResult[]> {
  const result = await query<MinifigSearchResult>(
    `SELECT fig_num, name, num_parts, image_url
     FROM minifigs
     WHERE name IS NOT NULL
       AND (
         fig_num ILIKE $1
         OR name ILIKE $2
       )
     ORDER BY 
       CASE WHEN fig_num ILIKE $1 THEN 0 ELSE 1 END,
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
  // Uses the set_nums array column
  const result = await query<MinifigSearchResult>(
    `SELECT fig_num, name, num_parts, image_url
     FROM minifigs
     WHERE $1 = ANY(set_nums)
     ORDER BY fig_num`,
    [setNumber]
  );
  return result.rows;
}

/**
 * Get popular/watched minifigs
 */
export async function getPopularMinifigs(limit: number = 20): Promise<MinifigSearchResult[]> {
  const result = await query<MinifigSearchResult>(
    `SELECT m.fig_num, m.name, m.num_parts, m.image_url
     FROM minifigs m
     JOIN (
       SELECT item_id, COUNT(*) as watch_count
       FROM watches
       WHERE item_type = 'minifig' AND status = 'active'
       GROUP BY item_id
     ) w ON m.fig_num = w.item_id
     WHERE m.name IS NOT NULL
     ORDER BY watch_count DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Get minifigs that need info updated (missing name)
 */
export async function getMinifigsNeedingUpdate(limit: number = 50): Promise<string[]> {
  const result = await query<{ fig_num: string }>(
    `SELECT fig_num FROM minifigs 
     WHERE name IS NULL OR name = ''
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(r => r.fig_num);
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

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize minifig ID format
 * - Star Wars: sw0001 -> sw0001
 * - Super Heroes: sh001 -> sh001
 * - City: cty0001 -> cty0001
 */
export function normalizeMinifigId(figNum: string): string {
  return figNum.toLowerCase().trim();
}

/**
 * Get theme prefix from fig_num
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
