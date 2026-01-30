/**
 * Minifig Price History Service
 * 
 * Manages the minifig_price_history table which stores daily price snapshots.
 * Used for price charts on minifig detail pages.
 * 
 * V27: Mirrors the set price history service for minifigs.
 * Handles both BrickLink IDs (sw0001) and Rebrickable IDs (fig-003509).
 */

import { query } from '../db/index.js';

// ============================================
// TYPES
// ============================================

export interface MinifigPriceHistoryPoint {
  minifig_id: string;
  condition: string;
  ship_to_country: string;
  min_price_eur: number | null;
  avg_price_eur: number | null;
  max_price_eur: number | null;
  listing_count: number;
  recorded_date: string;  // ISO date string
}

export interface MinifigPriceHistorySummary {
  days_tracked: number;
  first_tracked: string | null;
  lowest_seen: number | null;
  lowest_date: string | null;
  highest_seen: number | null;
  highest_date: string | null;
  current_avg: number | null;
  trend_7d: number | null;
  trend_30d: number | null;
}

// ============================================
// ID RESOLUTION HELPER
// ============================================

/**
 * Resolve a minifig ID to the canonical minifig_id used in the database.
 * Handles both BrickLink format (sw0001) and Rebrickable format (fig-003509).
 * Returns the input if no mapping is found.
 */
async function resolveMinifigId(inputId: string): Promise<string> {
  const normalizedInput = inputId.toLowerCase();
  
  // Check if this ID exists in minifigs table (either as minifig_id or bricklink_id)
  const result = await query<{ minifig_id: string }>(`
    SELECT minifig_id 
    FROM minifigs 
    WHERE minifig_id = $1 OR bricklink_id = $1
    LIMIT 1
  `, [normalizedInput]);
  
  if (result.rows.length > 0) {
    return result.rows[0].minifig_id;
  }
  
  // No mapping found, return the input as-is
  return normalizedInput;
}

// ============================================
// SNAPSHOT FUNCTIONS
// ============================================

/**
 * Snapshot daily minifig prices from current deals
 * Should run once daily (e.g., 00:05 UTC alongside set snapshots)
 */
export async function snapshotMinifigDailyPrices(): Promise<{
  minifigsProcessed: number;
  rowsInserted: number;
}> {
  const result = await query(`
    INSERT INTO minifig_price_history 
      (minifig_id, condition, ship_to_country, min_price_eur, avg_price_eur, max_price_eur, listing_count, recorded_date)
    SELECT 
      minifig_id,
      condition,
      COALESCE(ship_to_country, 'all'),
      MIN(total_eur),
      AVG(total_eur),
      MAX(total_eur),
      COUNT(*),
      CURRENT_DATE
    FROM minifig_current_deals
    WHERE expires_at > NOW()
      AND condition IS NOT NULL
    GROUP BY minifig_id, condition, ship_to_country
    ON CONFLICT (minifig_id, ship_to_country, condition, recorded_date) 
    DO UPDATE SET
      min_price_eur = LEAST(minifig_price_history.min_price_eur, EXCLUDED.min_price_eur),
      avg_price_eur = (minifig_price_history.avg_price_eur + EXCLUDED.avg_price_eur) / 2,
      max_price_eur = GREATEST(minifig_price_history.max_price_eur, EXCLUDED.max_price_eur),
      listing_count = minifig_price_history.listing_count + EXCLUDED.listing_count
    RETURNING minifig_id
  `);

  const minifigsProcessed = new Set(result.rows.map((r: any) => r.minifig_id)).size;
  
  console.log(`[MinifigDailySnapshot] Processed ${minifigsProcessed} minifigs, ${result.rowCount} rows`);
  
  return {
    minifigsProcessed,
    rowsInserted: result.rowCount || 0,
  };
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get price history for a minifig
 * Checks both minifig_id and bricklink_id to handle different ID formats
 */
export async function getMinifigPriceHistory(
  minifigId: string,
  days: number = 90,
  condition?: string
): Promise<MinifigPriceHistoryPoint[]> {
  // First resolve the canonical minifig_id (could be fig-XXXXXX or bricklink format)
  const resolvedId = await resolveMinifigId(minifigId);
  
  let whereClause = 'WHERE minifig_id = $1 AND recorded_date >= CURRENT_DATE - $2::interval';
  const params: (string | number)[] = [resolvedId, `${days} days`];
  
  if (condition && condition !== 'any') {
    whereClause += ' AND condition = $3';
    params.push(condition);
  }
  
  const result = await query<MinifigPriceHistoryPoint>(`
    SELECT 
      minifig_id,
      condition,
      ship_to_country,
      min_price_eur,
      avg_price_eur,
      max_price_eur,
      listing_count,
      recorded_date::text as recorded_date
    FROM minifig_price_history
    ${whereClause}
    ORDER BY recorded_date ASC
  `, params);
  
  return result.rows;
}

/**
 * Get price statistics for a minifig
 * Handles both BrickLink and Rebrickable ID formats.
 */
export async function getMinifigPriceStats(
  minifigId: string,
  condition: string = 'new'
): Promise<MinifigPriceHistorySummary> {
  // Resolve to canonical ID
  const resolvedId = await resolveMinifigId(minifigId);
  
  // Get overall stats
  const statsResult = await query<{
    days_tracked: number;
    first_tracked: string;
    lowest_seen: number;
    lowest_date: string;
    highest_seen: number;
    highest_date: string;
  }>(`
    SELECT 
      COUNT(DISTINCT recorded_date) as days_tracked,
      MIN(recorded_date)::text as first_tracked,
      MIN(min_price_eur) as lowest_seen,
      (SELECT recorded_date::text FROM minifig_price_history 
       WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any')
       ORDER BY min_price_eur ASC NULLS LAST LIMIT 1) as lowest_date,
      MAX(max_price_eur) as highest_seen,
      (SELECT recorded_date::text FROM minifig_price_history 
       WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any')
       ORDER BY max_price_eur DESC NULLS LAST LIMIT 1) as highest_date
    FROM minifig_price_history
    WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any')
  `, [resolvedId, condition]);

  const stats = statsResult.rows[0];

  // Get current average (last 3 days)
  const currentResult = await query<{ avg: number }>(`
    SELECT AVG(avg_price_eur) as avg
    FROM minifig_price_history
    WHERE minifig_id = $1 
      AND (condition = $2 OR $2 = 'any')
      AND recorded_date >= CURRENT_DATE - INTERVAL '3 days'
  `, [resolvedId, condition]);

  // Calculate 7-day trend
  const trend7d = await calculateMinifigTrend(resolvedId, condition, 7);
  
  // Calculate 30-day trend
  const trend30d = await calculateMinifigTrend(resolvedId, condition, 30);

  return {
    days_tracked: Number(stats?.days_tracked) || 0,
    first_tracked: stats?.first_tracked || null,
    lowest_seen: stats?.lowest_seen ?? null,
    lowest_date: stats?.lowest_date || null,
    highest_seen: stats?.highest_seen ?? null,
    highest_date: stats?.highest_date || null,
    current_avg: currentResult.rows[0]?.avg ?? null,
    trend_7d: trend7d,
    trend_30d: trend30d,
  };
}

/**
 * Calculate price trend over a period
 * Returns percentage change (negative = prices dropping)
 * Note: minifigId should already be resolved/lowercase
 */
async function calculateMinifigTrend(
  minifigId: string,
  condition: string,
  days: number
): Promise<number | null> {
  const result = await query<{ old_avg: number; new_avg: number }>(`
    WITH period_data AS (
      SELECT 
        recorded_date,
        avg_price_eur,
        CASE 
          WHEN recorded_date <= CURRENT_DATE - ($3::int / 2)::int THEN 'old'
          ELSE 'new'
        END as period
      FROM minifig_price_history
      WHERE minifig_id = $1 
        AND (condition = $2 OR $2 = 'any')
        AND recorded_date >= CURRENT_DATE - $3::int
    )
    SELECT 
      AVG(CASE WHEN period = 'old' THEN avg_price_eur END) as old_avg,
      AVG(CASE WHEN period = 'new' THEN avg_price_eur END) as new_avg
    FROM period_data
  `, [minifigId, condition, days]);

  const { old_avg, new_avg } = result.rows[0] || {};
  
  if (!old_avg || !new_avg || old_avg === 0) {
    return null;
  }

  return Number(((new_avg - old_avg) / old_avg * 100).toFixed(1));
}

/**
 * Get minifigs with price history data
 */
export async function getMinifigsWithHistory(limit: number = 100): Promise<string[]> {
  const result = await query<{ minifig_id: string }>(`
    SELECT DISTINCT minifig_id
    FROM minifig_price_history
    ORDER BY minifig_id
    LIMIT $1
  `, [limit]);

  return result.rows.map(r => r.minifig_id);
}

/**
 * Aggregate price history by condition for chart display
 * Handles both BrickLink and Rebrickable ID formats.
 */
export async function getMinifigChartData(
  minifigId: string,
  days: number = 90
): Promise<{
  labels: string[];
  new: { min: (number | null)[]; avg: (number | null)[] };
  used: { min: (number | null)[]; avg: (number | null)[] };
}> {
  // Resolve to canonical ID (getMinifigPriceHistory will also resolve, but this is clearer)
  const history = await getMinifigPriceHistory(minifigId, days);
  
  // Get all unique dates
  const dates = [...new Set(history.map(h => h.recorded_date))].sort();
  
  // Build data arrays
  const newData: { min: (number | null)[]; avg: (number | null)[] } = { min: [], avg: [] };
  const usedData: { min: (number | null)[]; avg: (number | null)[] } = { min: [], avg: [] };
  
  for (const date of dates) {
    const newPoint = history.find(h => h.recorded_date === date && h.condition === 'new');
    const usedPoint = history.find(h => h.recorded_date === date && h.condition === 'used');
    
    newData.min.push(newPoint?.min_price_eur ?? null);
    newData.avg.push(newPoint?.avg_price_eur ?? null);
    usedData.min.push(usedPoint?.min_price_eur ?? null);
    usedData.avg.push(usedPoint?.avg_price_eur ?? null);
  }
  
  return {
    labels: dates,
    new: newData,
    used: usedData,
  };
}
