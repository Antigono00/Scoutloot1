/**
 * Price History Service
 * 
 * Manages the set_price_history table which stores daily price snapshots.
 * Used for price charts on set detail pages.
 */

import { query } from '../db/index.js';

export interface PriceHistoryPoint {
  set_number: string;
  condition: string;
  source: string;
  region: string;
  min_price_eur: number | null;
  avg_price_eur: number | null;
  max_price_eur: number | null;
  listing_count: number;
  recorded_date: string;  // ISO date string
}

export interface PriceHistorySummary {
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

/**
 * Snapshot daily prices from current deals
 * Should run once daily (e.g., 00:05 UTC)
 */
export async function snapshotDailyPrices(): Promise<number> {
  const result = await query(`
    INSERT INTO set_price_history 
      (set_number, condition, source, region, min_price_eur, avg_price_eur, max_price_eur, listing_count, recorded_date)
    SELECT 
      set_number,
      condition,
      source,
      COALESCE(region, 'all'),
      MIN(total_eur),
      AVG(total_eur),
      MAX(total_eur),
      COUNT(*),
      CURRENT_DATE
    FROM set_current_deals
    WHERE expires_at > NOW()
      AND condition IS NOT NULL
    GROUP BY set_number, condition, source, region
    ON CONFLICT (set_number, condition, source, region, recorded_date) 
    DO UPDATE SET
      min_price_eur = LEAST(set_price_history.min_price_eur, EXCLUDED.min_price_eur),
      avg_price_eur = (set_price_history.avg_price_eur + EXCLUDED.avg_price_eur) / 2,
      max_price_eur = GREATEST(set_price_history.max_price_eur, EXCLUDED.max_price_eur),
      listing_count = GREATEST(set_price_history.listing_count, EXCLUDED.listing_count)
  `);
  
  return result.rowCount ?? 0;
}

/**
 * Get price history for a set
 */
export async function getPriceHistory(
  setNumber: string,
  condition?: string,
  days: number = 90
): Promise<PriceHistoryPoint[]> {
  let whereClause = 'WHERE set_number = $1 AND recorded_date >= CURRENT_DATE - $2::interval';
  const params: (string | number)[] = [setNumber, `${days} days`];
  
  if (condition && condition !== 'any') {
    whereClause += ' AND condition = $3';
    params.push(condition);
  }
  
  const result = await query<PriceHistoryPoint>(`
    SELECT 
      set_number,
      condition,
      source,
      region,
      min_price_eur,
      avg_price_eur,
      max_price_eur,
      listing_count,
      recorded_date::text as recorded_date
    FROM set_price_history
    ${whereClause}
    ORDER BY recorded_date ASC
  `, params);
  
  return result.rows;
}

/**
 * Get price history summary for a set
 */
export async function getPriceHistorySummary(
  setNumber: string,
  condition: string = 'new'
): Promise<PriceHistorySummary> {
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
      (SELECT recorded_date::text FROM set_price_history 
       WHERE set_number = $1 AND (condition = $2 OR $2 = 'any')
       ORDER BY min_price_eur ASC NULLS LAST LIMIT 1) as lowest_date,
      MAX(max_price_eur) as highest_seen,
      (SELECT recorded_date::text FROM set_price_history 
       WHERE set_number = $1 AND (condition = $2 OR $2 = 'any')
       ORDER BY max_price_eur DESC NULLS LAST LIMIT 1) as highest_date
    FROM set_price_history
    WHERE set_number = $1 AND (condition = $2 OR $2 = 'any')
  `, [setNumber, condition]);

  const stats = statsResult.rows[0];

  // Get current average (last 3 days)
  const currentResult = await query<{ avg: number }>(`
    SELECT AVG(avg_price_eur) as avg
    FROM set_price_history
    WHERE set_number = $1 
      AND (condition = $2 OR $2 = 'any')
      AND recorded_date >= CURRENT_DATE - INTERVAL '3 days'
  `, [setNumber, condition]);

  // Calculate 7-day trend
  const trend7d = await calculateTrend(setNumber, condition, 7);
  
  // Calculate 30-day trend
  const trend30d = await calculateTrend(setNumber, condition, 30);

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
 */
async function calculateTrend(
  setNumber: string,
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
      FROM set_price_history
      WHERE set_number = $1 
        AND (condition = $2 OR $2 = 'any')
        AND recorded_date >= CURRENT_DATE - $3::int
    )
    SELECT 
      AVG(CASE WHEN period = 'old' THEN avg_price_eur END) as old_avg,
      AVG(CASE WHEN period = 'new' THEN avg_price_eur END) as new_avg
    FROM period_data
  `, [setNumber, condition, days]);

  const { old_avg, new_avg } = result.rows[0] || {};
  
  if (!old_avg || !new_avg || old_avg === 0) {
    return null;
  }

  return Number(((new_avg - old_avg) / old_avg * 100).toFixed(1));
}

/**
 * Check how many days of data we have for a set
 */
export async function getDataDaysCount(setNumber: string): Promise<number> {
  const result = await query<{ count: number }>(`
    SELECT COUNT(DISTINCT recorded_date) as count
    FROM set_price_history
    WHERE set_number = $1
  `, [setNumber]);

  return Number(result.rows[0]?.count) || 0;
}

/**
 * Get sets with price history data
 */
export async function getSetsWithHistory(limit: number = 100): Promise<string[]> {
  const result = await query<{ set_number: string }>(`
    SELECT DISTINCT set_number
    FROM set_price_history
    ORDER BY set_number
    LIMIT $1
  `, [limit]);

  return result.rows.map(r => r.set_number);
}

/**
 * Aggregate price history by condition for chart display
 */
export async function getChartData(
  setNumber: string,
  days: number = 90
): Promise<{
  labels: string[];
  new: { min: (number | null)[]; avg: (number | null)[] };
  used: { min: (number | null)[]; avg: (number | null)[] };
}> {
  const history = await getPriceHistory(setNumber, undefined, days);
  
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
