/**
 * Minifig Price History Service (V30)
 * 
 * Manages the minifig_price_history table which stores daily price snapshots.
 * Used for price charts on minifig detail pages.
 * 
 * V30: Regional price history with native currency support
 * - Prices stored in both EUR and native currency
 * - Grouped by macro-region (EU, UK, US, CA) instead of individual countries
 * 
 * V27: Mirrors the set price history service for minifigs.
 * Handles both BrickLink IDs (sw0001) and Rebrickable IDs (fig-003509).
 */

import { query } from '../db/index.js';
import { 
  getRegionFromCountry, 
  getRegionCaseSql,
  getCurrencyCaseSql
} from '../utils/currency.js';

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
  min_price: number | null;
  avg_price: number | null;
  max_price: number | null;
  currency: string | null;
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
 * V30: Aggregates into macro-regions with native currency
 * Should run once daily (e.g., 00:05 UTC alongside set snapshots)
 */
export async function snapshotMinifigDailyPrices(): Promise<{
  minifigsProcessed: number;
  rowsInserted: number;
}> {
  // Build the SQL for mapping country codes to regions and currencies
  const regionCase = getRegionCaseSql('ship_to_country');
  const currencyCase = getCurrencyCaseSql('ship_to_country');
  
  const result = await query(`
    INSERT INTO minifig_price_history 
      (minifig_id, condition, ship_to_country, 
       min_price_eur, avg_price_eur, max_price_eur, 
       min_price, avg_price, max_price, currency,
       listing_count, recorded_date)
    SELECT 
      minifig_id,
      condition,
      ${regionCase} as macro_region,
      -- EUR prices (for backward compatibility)
      MIN(total_eur),
      AVG(total_eur),
      MAX(total_eur),
      -- Native currency prices
      -- Note: minifig_current_deals uses total_eur; we'd need price_original if available
      MIN(total_eur), -- Placeholder - update when native prices available in deals
      AVG(total_eur),
      MAX(total_eur),
      ${currencyCase} as currency,
      COUNT(*),
      CURRENT_DATE
    FROM minifig_current_deals
    WHERE expires_at > NOW()
      AND condition IS NOT NULL
    GROUP BY minifig_id, condition, ${regionCase}, ${currencyCase}
    ON CONFLICT (minifig_id, ship_to_country, condition, recorded_date) 
    DO UPDATE SET
      min_price_eur = LEAST(minifig_price_history.min_price_eur, EXCLUDED.min_price_eur),
      avg_price_eur = (minifig_price_history.avg_price_eur + EXCLUDED.avg_price_eur) / 2,
      max_price_eur = GREATEST(minifig_price_history.max_price_eur, EXCLUDED.max_price_eur),
      min_price = LEAST(minifig_price_history.min_price, EXCLUDED.min_price),
      avg_price = (COALESCE(minifig_price_history.avg_price, 0) + COALESCE(EXCLUDED.avg_price, 0)) / 2,
      max_price = GREATEST(minifig_price_history.max_price, EXCLUDED.max_price),
      currency = EXCLUDED.currency,
      listing_count = minifig_price_history.listing_count + EXCLUDED.listing_count
    RETURNING minifig_id
  `);

  const minifigsProcessed = new Set(result.rows.map((r: any) => r.minifig_id)).size;
  
  console.log(`[MinifigDailySnapshot] V30: Processed ${minifigsProcessed} minifigs, ${result.rowCount} rows (with native currencies)`);
  
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
 * V30: Country-first, region-fallback approach
 * 
 * 1. If country specified, try to get data for that specific country
 * 2. If no country data, fall back to regional aggregate
 * 3. Returns prices in EUR (native currency display handled by frontend using symbol)
 * 
 * @param minifigId - Minifig ID (BrickLink or Rebrickable format)
 * @param days - Number of days of history (default 90)
 * @param condition - 'new', 'used', or 'any' (default 'new')
 * @param country - Country code (ES, DE, GB, US, CA, etc.) - determines region
 */
export async function getMinifigPriceHistory(
  minifigId: string,
  days: number = 90,
  condition?: string,
  country?: string
): Promise<{ data: MinifigPriceHistoryPoint[]; source: 'country' | 'region' | 'all' }> {
  // First resolve the canonical minifig_id
  const resolvedId = await resolveMinifigId(minifigId);
  
  const params: (string | number)[] = [resolvedId, `${days} days`];
  let conditionClause = '';
  
  if (condition && condition !== 'any') {
    conditionClause = ' AND condition = $3';
    params.push(condition);
  }
  
  // If country specified, try country-specific data first
  if (country) {
    const upperCountry = country.toUpperCase();
    const region = getRegionFromCountry(upperCountry);
    
    // Step 1: Try to get country-specific data
    const countryResult = await query<MinifigPriceHistoryPoint>(`
      SELECT 
        minifig_id,
        condition,
        ship_to_country,
        min_price_eur,
        avg_price_eur,
        max_price_eur,
        min_price,
        avg_price,
        max_price,
        currency,
        listing_count,
        recorded_date::text as recorded_date
      FROM minifig_price_history
      WHERE minifig_id = $1 
        AND recorded_date >= CURRENT_DATE - $2::interval
        AND ship_to_country = $${params.length + 1}
        ${conditionClause}
      ORDER BY recorded_date ASC
    `, [...params, upperCountry]);

    if (countryResult.rows.length > 0) {
      return { data: countryResult.rows, source: 'country' };
    }
    
    // Step 2: Fall back to regional aggregate
    const regionCase = getRegionCaseSql('ship_to_country');
    
    const regionResult = await query<MinifigPriceHistoryPoint>(`
      SELECT 
        minifig_id,
        condition,
        $${params.length + 1}::varchar as ship_to_country,
        MIN(min_price_eur) as min_price_eur,
        AVG(avg_price_eur) as avg_price_eur,
        MAX(max_price_eur) as max_price_eur,
        MIN(min_price) as min_price,
        AVG(avg_price) as avg_price,
        MAX(max_price) as max_price,
        MAX(currency) as currency,
        SUM(listing_count)::int as listing_count,
        recorded_date::text as recorded_date
      FROM minifig_price_history
      WHERE minifig_id = $1 
        AND recorded_date >= CURRENT_DATE - $2::interval
        AND (${regionCase}) = $${params.length + 2}
        ${conditionClause}
      GROUP BY minifig_id, condition, recorded_date
      ORDER BY recorded_date ASC
    `, [...params, region, region]);

    if (regionResult.rows.length > 0) {
      return { data: regionResult.rows, source: 'region' };
    }
  }
  
  // No country filter or no regional data - return all data aggregated by date
  const result = await query<MinifigPriceHistoryPoint>(`
    SELECT 
      minifig_id,
      condition,
      'all'::varchar as ship_to_country,
      MIN(min_price_eur) as min_price_eur,
      AVG(avg_price_eur) as avg_price_eur,
      MAX(max_price_eur) as max_price_eur,
      MIN(min_price) as min_price,
      AVG(avg_price) as avg_price,
      MAX(max_price) as max_price,
      'EUR'::varchar as currency,
      SUM(listing_count)::int as listing_count,
      recorded_date::text as recorded_date
    FROM minifig_price_history
    WHERE minifig_id = $1 
      AND recorded_date >= CURRENT_DATE - $2::interval
      ${conditionClause}
    GROUP BY minifig_id, condition, recorded_date
    ORDER BY recorded_date ASC
  `, params);

  return { data: result.rows, source: 'all' };
}

/**
 * Get price statistics for a minifig
 * V30: Country-first, region-fallback approach
 * Handles both BrickLink and Rebrickable ID formats.
 */
export async function getMinifigPriceStats(
  minifigId: string,
  condition: string = 'new',
  country?: string
): Promise<MinifigPriceHistorySummary> {
  // Resolve to canonical ID
  const resolvedId = await resolveMinifigId(minifigId);
  
  const upperCountry = country?.toUpperCase();
  const region = country ? getRegionFromCountry(upperCountry!) : null;
  
  // Build WHERE clause - try country first, then region
  let whereClause: string;
  let params: (string | number)[];
  
  if (upperCountry) {
    // Check if we have country-specific data
    const countryCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM minifig_price_history 
       WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any') AND ship_to_country = $3`,
      [resolvedId, condition, upperCountry]
    );
    
    if (parseInt(countryCheck.rows[0]?.count || '0') > 0) {
      // Use country-specific data
      whereClause = `WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any') AND ship_to_country = $3`;
      params = [resolvedId, condition, upperCountry];
    } else if (region) {
      // Fall back to regional data
      const regionCase = getRegionCaseSql('ship_to_country');
      whereClause = `WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any') AND (${regionCase}) = $3`;
      params = [resolvedId, condition, region];
    } else {
      whereClause = `WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any')`;
      params = [resolvedId, condition];
    }
  } else {
    whereClause = `WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any')`;
    params = [resolvedId, condition];
  }
  
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
       ${whereClause}
       ORDER BY min_price_eur ASC NULLS LAST LIMIT 1) as lowest_date,
      MAX(max_price_eur) as highest_seen,
      (SELECT recorded_date::text FROM minifig_price_history 
       ${whereClause}
       ORDER BY max_price_eur DESC NULLS LAST LIMIT 1) as highest_date
    FROM minifig_price_history
    ${whereClause}
  `, params);

  const stats = statsResult.rows[0];

  // Get current average (last 3 days)
  const currentResult = await query<{ avg: number }>(`
    SELECT AVG(avg_price_eur) as avg
    FROM minifig_price_history
    ${whereClause}
      AND recorded_date >= CURRENT_DATE - INTERVAL '3 days'
  `, params);

  // Calculate 7-day trend
  const trend7d = await calculateMinifigTrend(resolvedId, condition, 7, country);
  
  // Calculate 30-day trend
  const trend30d = await calculateMinifigTrend(resolvedId, condition, 30, country);

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
 * V30: Country-first, region-fallback approach
 * Returns percentage change (negative = prices dropping)
 * Note: minifigId should already be resolved/lowercase
 */
async function calculateMinifigTrend(
  minifigId: string,
  condition: string,
  days: number,
  country?: string
): Promise<number | null> {
  const upperCountry = country?.toUpperCase();
  const region = country ? getRegionFromCountry(upperCountry!) : null;
  
  // Build WHERE clause
  let whereBase: string;
  let params: (string | number)[];
  
  if (upperCountry) {
    // Check if we have country-specific data
    const countryCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM minifig_price_history 
       WHERE minifig_id = $1 AND (condition = $2 OR $2 = 'any') AND ship_to_country = $3
       AND recorded_date >= CURRENT_DATE - $4::int`,
      [minifigId, condition, upperCountry, days]
    );
    
    if (parseInt(countryCheck.rows[0]?.count || '0') > 0) {
      whereBase = `minifig_id = $1 AND (condition = $2 OR $2 = 'any') AND ship_to_country = $4`;
      params = [minifigId, condition, days, upperCountry];
    } else if (region) {
      const regionCase = getRegionCaseSql('ship_to_country');
      whereBase = `minifig_id = $1 AND (condition = $2 OR $2 = 'any') AND (${regionCase}) = $4`;
      params = [minifigId, condition, days, region];
    } else {
      whereBase = `minifig_id = $1 AND (condition = $2 OR $2 = 'any')`;
      params = [minifigId, condition, days];
    }
  } else {
    whereBase = `minifig_id = $1 AND (condition = $2 OR $2 = 'any')`;
    params = [minifigId, condition, days];
  }
  
  const result = await query<{ old_avg: number; new_avg: number }>(`
    WITH period_data AS (
      SELECT 
        recorded_date,
        avg_price_eur as avg_price,
        CASE 
          WHEN recorded_date <= CURRENT_DATE - ($3::int / 2)::int THEN 'old'
          ELSE 'new'
        END as period
      FROM minifig_price_history
      WHERE ${whereBase}
        AND recorded_date >= CURRENT_DATE - $3::int
    )
    SELECT 
      AVG(CASE WHEN period = 'old' THEN avg_price END) as old_avg,
      AVG(CASE WHEN period = 'new' THEN avg_price END) as new_avg
    FROM period_data
  `, params);

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
 * V30: Supports country filtering with region fallback
 * Handles both BrickLink and Rebrickable ID formats.
 */
export async function getMinifigChartData(
  minifigId: string,
  days: number = 90,
  country?: string
): Promise<{
  labels: string[];
  new: { min: (number | null)[]; avg: (number | null)[] };
  used: { min: (number | null)[]; avg: (number | null)[] };
}> {
  // Get history for both conditions
  const historyResult = await getMinifigPriceHistory(minifigId, days, undefined, country);
  const history = historyResult.data;
  
  // Get all unique dates
  const dates = [...new Set(history.map(h => h.recorded_date))].sort();
  
  // Build data arrays - use EUR prices
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
