import { query, withTransaction } from '../db/index.js';

// ============================================
// REGIONAL DEFAULTS
// ============================================

// EU+UK users can buy from any EU or UK seller
const EU_UK_SHIP_FROM = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'
];

// US/CA users buy from US or CA sellers only (no international complications)
const NA_SHIP_FROM = ['US', 'CA'];

// Countries in each region
const EU_UK_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'UK'
]);

const NA_COUNTRIES = new Set(['US', 'CA']);

/**
 * Get default ship_from_countries based on user's destination country
 */
export function getDefaultShipFromCountries(shipToCountry: string): string[] {
  const country = shipToCountry.toUpperCase();
  
  if (NA_COUNTRIES.has(country)) {
    return NA_SHIP_FROM;
  }
  
  if (EU_UK_COUNTRIES.has(country)) {
    return EU_UK_SHIP_FROM;
  }
  
  // Default to EU+UK for unknown countries
  return EU_UK_SHIP_FROM;
}

/**
 * Check if a country is in North America region
 */
export function isNorthAmericaCountry(country: string): boolean {
  return NA_COUNTRIES.has(country.toUpperCase());
}

/**
 * Check if a country is in EU/UK region
 */
export function isEUUKCountry(country: string): boolean {
  return EU_UK_COUNTRIES.has(country.toUpperCase());
}

// ============================================
// INTERFACES
// ============================================

export interface Watch {
  id: number;
  uuid: string;
  user_id: number;
  // NEW: item_type and item_id replace set_number for flexibility
  item_type: 'set' | 'minifig';
  item_id: string;  // set_number OR fig_num
  // Legacy alias (for backwards compatibility during migration)
  set_number?: string;
  target_total_price_eur: number;
  min_total_eur: number;
  bricklink_shipping_buffer: number;
  enable_bricklink_alerts: boolean;
  // NEW: enable_brickowl_alerts for BrickOwl integration
  enable_brickowl_alerts: boolean;
  condition: 'new' | 'used' | 'any';
  ship_from_countries: string[];
  min_seller_rating: number;
  min_seller_feedback: number;
  exclude_words: string[] | null;
  require_below_market: boolean;
  min_discount_percent: number;
  min_price_drop_eur: number;
  min_price_drop_percent: number;
  status: 'active' | 'stopped';
  snoozed_until: Date | null;
  total_alerts_sent: number;
  last_alert_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWatchData {
  user_id: number;
  // NEW: Support both set_number (legacy) and item_id/item_type
  set_number?: string;  // Legacy - will be converted to item_id + item_type='set'
  item_type?: 'set' | 'minifig';
  item_id?: string;
  target_total_price_eur: number;
  min_total_eur?: number;
  condition?: 'new' | 'used' | 'any';
  ship_from_countries?: string[];
  min_seller_rating?: number;
  min_seller_feedback?: number;
  exclude_words?: string[];
  enable_brickowl_alerts?: boolean;
}

// ============================================
// CREATE WATCH
// ============================================

export async function createWatch(data: CreateWatchData): Promise<Watch> {
  return withTransaction(async (client) => {
    // Handle legacy set_number vs new item_type/item_id
    let itemType: 'set' | 'minifig' = 'set';
    let itemNumber: string;
    
    if (data.item_id && data.item_type) {
      itemType = data.item_type;
      itemNumber = data.item_id;
    } else if (data.set_number) {
      // Legacy: set_number becomes item_id with item_type='set'
      itemType = 'set';
      itemNumber = data.set_number;
    } else {
      throw new Error('Either set_number or item_id+item_type must be provided');
    }
    
    // Ensure item exists in appropriate table
    if (itemType === 'set') {
      await client.query(
        `INSERT INTO sets (set_number) VALUES ($1) ON CONFLICT (set_number) DO NOTHING`,
        [itemNumber]
      );
    } else {
      await client.query(
        `INSERT INTO minifigs (fig_num) VALUES ($1) ON CONFLICT (fig_num) DO NOTHING`,
        [itemNumber.toLowerCase()]
      );
      itemNumber = itemNumber.toLowerCase(); // Normalize minifig IDs to lowercase
    }

    // Get user's ship_to_country to determine default ship_from_countries
    const userResult = await client.query<{ ship_to_country: string }>(
      `SELECT ship_to_country FROM users WHERE id = $1`,
      [data.user_id]
    );
    
    const userCountry = userResult.rows[0]?.ship_to_country || 'DE';
    
    // Use provided ship_from_countries or calculate default based on user's region
    const shipFromCountries = data.ship_from_countries ?? getDefaultShipFromCountries(userCountry);
    
    // Default seller filters based on item type
    // Minifigs have lower default feedback requirement since market is smaller
    const defaultMinFeedback = itemType === 'minifig' ? 5 : 10;

    const result = await client.query<Watch>(
      `INSERT INTO watches (
         user_id, item_type, item_id, set_number,
         target_total_price_eur, min_total_eur,
         condition, ship_from_countries, min_seller_rating, 
         min_seller_feedback, exclude_words, enable_brickowl_alerts
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.user_id,
        itemType,
        itemNumber,
        itemType === 'set' ? itemNumber : null, // Legacy set_number column
        data.target_total_price_eur,
        data.min_total_eur ?? 0,
        data.condition ?? 'any',
        shipFromCountries,
        data.min_seller_rating ?? 95.0,
        data.min_seller_feedback ?? defaultMinFeedback,
        data.exclude_words ?? null,
        data.enable_brickowl_alerts ?? true, // Default: enable BrickOwl for new watches
      ]
    );

    return result.rows[0];
  });
}

// ============================================
// READ OPERATIONS
// ============================================

export async function getWatchById(id: number): Promise<Watch | null> {
  const result = await query<Watch>(
    `SELECT * FROM watches WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getWatchesByUserId(userId: number): Promise<Watch[]> {
  const result = await query<Watch>(
    `SELECT * FROM watches 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getActiveWatchesByUserId(userId: number): Promise<Watch[]> {
  const result = await query<Watch>(
    `SELECT * FROM watches 
     WHERE user_id = $1 
       AND status = 'active'
       AND (snoozed_until IS NULL OR snoozed_until < NOW())
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getWatchCountByUserId(userId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM watches WHERE user_id = $1`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

// ============================================
// UPDATE OPERATIONS
// ============================================

export async function updateWatch(
  watchId: number,
  updates: Partial<Pick<Watch, 
    'target_total_price_eur' | 'min_total_eur' | 'condition' | 
    'ship_from_countries' | 'min_seller_rating' | 'min_seller_feedback' | 
    'exclude_words' | 'enable_brickowl_alerts'
  >>
): Promise<Watch | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.target_total_price_eur !== undefined) {
    setClauses.push(`target_total_price_eur = $${paramIndex++}`);
    values.push(updates.target_total_price_eur);
  }
  if (updates.min_total_eur !== undefined) {
    setClauses.push(`min_total_eur = $${paramIndex++}`);
    values.push(updates.min_total_eur);
  }
  if (updates.condition !== undefined) {
    setClauses.push(`condition = $${paramIndex++}`);
    values.push(updates.condition);
  }
  if (updates.ship_from_countries !== undefined) {
    setClauses.push(`ship_from_countries = $${paramIndex++}`);
    values.push(updates.ship_from_countries);
  }
  if (updates.min_seller_rating !== undefined) {
    setClauses.push(`min_seller_rating = $${paramIndex++}`);
    values.push(updates.min_seller_rating);
  }
  if (updates.min_seller_feedback !== undefined) {
    setClauses.push(`min_seller_feedback = $${paramIndex++}`);
    values.push(updates.min_seller_feedback);
  }
  if (updates.exclude_words !== undefined) {
    setClauses.push(`exclude_words = $${paramIndex++}`);
    values.push(updates.exclude_words);
  }
  if (updates.enable_brickowl_alerts !== undefined) {
    setClauses.push(`enable_brickowl_alerts = $${paramIndex++}`);
    values.push(updates.enable_brickowl_alerts);
  }

  if (setClauses.length === 0) {
    return getWatchById(watchId);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(watchId);

  const result = await query<Watch>(
    `UPDATE watches SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function updateWatchTargetPrice(
  watchId: number,
  targetPrice: number
): Promise<Watch | null> {
  const result = await query<Watch>(
    `UPDATE watches SET 
       target_total_price_eur = $2,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [watchId, targetPrice]
  );
  return result.rows[0] ?? null;
}

export async function stopWatch(watchId: number): Promise<Watch | null> {
  const result = await query<Watch>(
    `UPDATE watches SET 
       status = 'stopped',
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [watchId]
  );
  return result.rows[0] ?? null;
}

export async function resumeWatch(watchId: number): Promise<Watch | null> {
  const result = await query<Watch>(
    `UPDATE watches SET 
       status = 'active',
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [watchId]
  );
  return result.rows[0] ?? null;
}

export async function deleteWatch(watchId: number): Promise<void> {
  await query(`DELETE FROM watches WHERE id = $1`, [watchId]);
}

export async function incrementWatchAlertCount(watchId: number): Promise<void> {
  await query(
    `UPDATE watches SET 
       total_alerts_sent = total_alerts_sent + 1,
       last_alert_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [watchId]
  );
}

// ============================================
// SCAN GROUP QUERIES
// ============================================

export interface ScanGroup {
  item_type: 'set' | 'minifig';
  item_id: string;
  // Legacy alias
  set_number?: string;
  ship_to_country: string;
  watcher_count: number;
  max_scan_priority: string;
  enable_brickowl: boolean;
}

/**
 * Get active scan groups for the scanner
 * Groups by (item_type, item_id, ship_to_country)
 */
export async function getActiveScanGroups(): Promise<ScanGroup[]> {
  const result = await query<ScanGroup>(
    `SELECT 
       w.item_type,
       w.item_id,
       w.set_number,
       u.ship_to_country,
       COUNT(*) as watcher_count,
       MAX(t.scan_priority) as max_scan_priority,
       BOOL_OR(w.enable_brickowl_alerts) as enable_brickowl
     FROM watches w
     JOIN users u ON w.user_id = u.id
     JOIN subscription_tiers t ON u.subscription_tier = t.tier_id
     WHERE w.status = 'active'
       AND u.deleted_at IS NULL
       AND u.subscription_status = 'active'
       AND (w.snoozed_until IS NULL OR w.snoozed_until < NOW())
     GROUP BY w.item_type, w.item_id, w.set_number, u.ship_to_country
     ORDER BY max_scan_priority DESC, watcher_count DESC`
  );
  return result.rows;
}

/**
 * Get watches for a specific scan group
 */
export async function getWatchesForScanGroup(
  itemType: 'set' | 'minifig',
  itemNumber: string,
  shipToCountry: string
): Promise<(Watch & { 
  telegram_chat_id: number | null; 
  timezone: string; 
  quiet_hours_start: string | null; 
  quiet_hours_end: string | null;
})[]> {
  const result = await query<Watch & { 
    telegram_chat_id: number | null; 
    timezone: string; 
    quiet_hours_start: string | null; 
    quiet_hours_end: string | null;
  }>(
    `SELECT w.*, u.telegram_chat_id, u.timezone, u.quiet_hours_start, u.quiet_hours_end
     FROM watches w
     JOIN users u ON w.user_id = u.id
     WHERE w.item_type = $1
       AND w.item_id = $2
       AND u.ship_to_country = $3
       AND w.status = 'active'
       AND u.deleted_at IS NULL
       AND u.subscription_status = 'active'
       AND (w.snoozed_until IS NULL OR w.snoozed_until < NOW())`,
    [itemType, itemNumber, shipToCountry]
  );
  return result.rows;
}

// Legacy function for backwards compatibility
export async function getWatchesForSetScanGroup(
  setNumber: string,
  shipToCountry: string
): Promise<(Watch & { 
  telegram_chat_id: number | null; 
  timezone: string; 
  quiet_hours_start: string | null; 
  quiet_hours_end: string | null;
})[]> {
  return getWatchesForScanGroup('set', setNumber, shipToCountry);
}

// ============================================
// REGION UPDATE
// ============================================

/**
 * Update ship_from_countries for all watches of a user
 * Called when user changes their ship_to_country
 */
export async function updateUserWatchesShipFrom(
  userId: number,
  newShipToCountry: string
): Promise<number> {
  const newShipFrom = getDefaultShipFromCountries(newShipToCountry);
  
  const result = await query(
    `UPDATE watches 
     SET ship_from_countries = $2, updated_at = NOW()
     WHERE user_id = $1`,
    [userId, newShipFrom]
  );
  
  return result.rowCount ?? 0;
}

// ============================================
// MINIFIG-SPECIFIC QUERIES
// ============================================

/**
 * Get all active minifig watches
 */
export async function getActiveMinifigWatches(): Promise<Watch[]> {
  const result = await query<Watch>(
    `SELECT w.* FROM watches w
     JOIN users u ON w.user_id = u.id
     WHERE w.item_type = 'minifig'
       AND w.status = 'active'
       AND u.deleted_at IS NULL
       AND u.subscription_status = 'active'
       AND (w.snoozed_until IS NULL OR w.snoozed_until < NOW())
     ORDER BY w.created_at DESC`
  );
  return result.rows;
}

/**
 * Get count of watches by item type
 */
export async function getWatchCountsByType(): Promise<{
  sets: number;
  minifigs: number;
  total: number;
}> {
  const result = await query<{ item_type: string; count: string }>(
    `SELECT item_type, COUNT(*) as count 
     FROM watches 
     WHERE status = 'active'
     GROUP BY item_type`
  );
  
  let sets = 0;
  let minifigs = 0;
  
  for (const row of result.rows) {
    if (row.item_type === 'set') sets = parseInt(row.count);
    if (row.item_type === 'minifig') minifigs = parseInt(row.count);
  }
  
  return { sets, minifigs, total: sets + minifigs };
}
