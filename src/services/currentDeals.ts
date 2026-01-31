/**
 * Current Deals Service (V30)
 * 
 * Handles saving and retrieving current best deals for set detail pages.
 * Called by scanner after each scan cycle to persist best deals.
 * 
 * V30: Regional price history with native currency support
 * - Prices stored in both EUR and native currency
 * - Grouped by macro-region (EU, UK, US, CA) instead of individual countries
 */

import { query } from '../db/index.js';
import { NormalizedListing } from '../providers/ebay/types.js';
import { getMarketplaceForCountry } from '../providers/ebay/client.js';
import { 
  getRegionFromCountry, 
  getCurrencyForRegion, 
  getSymbolForRegion,
  getRegionCaseSql,
  getCurrencyCaseSql,
  isValidRegion 
} from '../utils/currency.js';

export interface CurrentDeal {
  id: number;
  set_number: string;
  source: string;
  marketplace: string | null;
  region: string | null;
  listing_id: string | null;
  listing_url: string;
  image_url: string | null;
  title: string | null;
  condition: string | null;
  price_eur: number;
  shipping_eur: number;
  import_charges_eur: number;
  total_eur: number;
  currency_original: string | null;
  price_original: number | null;
  shipping_original: number | null;
  seller_country: string | null;
  seller_username: string | null;
  seller_rating: number | null;
  seller_feedback: number | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

export interface PriceHistoryPoint {
  date: string;
  min: number;
  avg: number;
  max: number;
  count: number;
}

export interface SetPriceStats {
  days_tracked: number;
  first_tracked: string | null;
  lowest_seen: number | null;
  lowest_date: string | null;
  highest_seen: number | null;
  trend_7d: number | null;
  trend_30d: number | null;
}

/**
 * Update current best deals for a set after a scan
 * Called by scanner.ts processScanGroup()
 */
export async function updateSetCurrentDeals(
  setNumber: string,
  listings: NormalizedListing[],
  shipToCountry: string
): Promise<void> {
  if (listings.length === 0) return;

  const marketplace = getMarketplaceForCountry(shipToCountry);
  
  // Separate by condition
  const newListings = listings.filter(l => 
    l.condition_normalized === 'new' || l.condition?.toLowerCase().includes('new')
  );
  const usedListings = listings.filter(l => 
    l.condition_normalized === 'used' || 
    (l.condition?.toLowerCase().includes('used') || l.condition?.toLowerCase().includes('pre-owned'))
  );

  // Sort by total price and get best deal for each condition
  const bestNew = newListings.sort((a, b) => a.total_eur - b.total_eur)[0];
  const bestUsed = usedListings.sort((a, b) => a.total_eur - b.total_eur)[0];

  // Upsert best new deal
  if (bestNew) {
    await upsertCurrentDeal(setNumber, bestNew, shipToCountry, marketplace, 'new');
  }

  // Upsert best used deal
  if (bestUsed) {
    await upsertCurrentDeal(setNumber, bestUsed, shipToCountry, marketplace, 'used');
  }

  console.log(`[CurrentDeals] Updated deals for ${setNumber}/${shipToCountry}: new=${bestNew ? '€' + bestNew.total_eur : 'none'}, used=${bestUsed ? '€' + bestUsed.total_eur : 'none'}`);
}

/**
 * Upsert a single current deal
 */
async function upsertCurrentDeal(
  setNumber: string,
  listing: NormalizedListing,
  region: string,
  marketplace: string,
  condition: string
): Promise<void> {
  await query(
    `INSERT INTO set_current_deals (
       set_number, source, marketplace, region,
       listing_id, listing_url, image_url, title, condition,
       price_eur, shipping_eur, import_charges_eur, total_eur,
       currency_original, price_original, shipping_original,
       seller_country, seller_username, seller_rating, seller_feedback,
       updated_at, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (set_number, source, marketplace, condition) 
     DO UPDATE SET
       listing_id = EXCLUDED.listing_id,
       listing_url = EXCLUDED.listing_url,
       image_url = EXCLUDED.image_url,
       title = EXCLUDED.title,
       price_eur = EXCLUDED.price_eur,
       shipping_eur = EXCLUDED.shipping_eur,
       import_charges_eur = EXCLUDED.import_charges_eur,
       total_eur = EXCLUDED.total_eur,
       currency_original = EXCLUDED.currency_original,
       price_original = EXCLUDED.price_original,
       shipping_original = EXCLUDED.shipping_original,
       seller_country = EXCLUDED.seller_country,
       seller_username = EXCLUDED.seller_username,
       seller_rating = EXCLUDED.seller_rating,
       seller_feedback = EXCLUDED.seller_feedback,
       updated_at = NOW(),
       expires_at = NOW() + INTERVAL '24 hours'`,
    [
      setNumber,
      listing.platform,
      marketplace,
      region,
      listing.id,
      listing.url,
      listing.image_url,
      listing.title,
      condition,
      listing.price_eur,
      listing.shipping_eur,
      listing.import_charges_eur,
      listing.total_eur,
      listing.currency_original,
      listing.price_original,
      listing.shipping_original || null,
      listing.ship_from_country,
      listing.seller_username,
      listing.seller_rating,
      listing.seller_feedback,
    ]
  );
}

/**
 * Get current best deals for a set
 */
export async function getCurrentDeals(setNumber: string): Promise<{
  new: CurrentDeal[];
  used: CurrentDeal[];
}> {
  const result = await query<CurrentDeal>(
    `SELECT * FROM set_current_deals 
     WHERE set_number = $1 
       AND expires_at > NOW()
     ORDER BY condition, total_eur ASC`,
    [setNumber]
  );

  const deals = {
    new: result.rows.filter(d => d.condition === 'new'),
    used: result.rows.filter(d => d.condition === 'used'),
  };

  return deals;
}

/**
 * Get price history for a set
 * V30: Country-first, region-fallback approach
 * 
 * 1. If country specified, try to get data for that specific country
 * 2. If no country data (or not enough), fall back to regional aggregate
 * 3. Returns prices in EUR (native currency display handled by frontend using symbol)
 * 
 * @param setNumber - The set number
 * @param days - Number of days of history (default 90)
 * @param condition - 'new', 'used', or 'any' (default 'new')
 * @param country - Country code (ES, DE, GB, US, CA, etc.) - determines region
 */
export async function getPriceHistory(
  setNumber: string,
  days: number = 90,
  condition: string = 'new',
  country?: string
): Promise<{ data: PriceHistoryPoint[]; source: 'country' | 'region' | 'all' }> {
  const params: (string | number)[] = [setNumber, condition, days];
  
  // If country specified, try country-specific data first
  if (country) {
    const upperCountry = country.toUpperCase();
    const region = getRegionFromCountry(upperCountry);
    
    // Step 1: Try to get country-specific data
    const countryResult = await query<{
      recorded_date: Date;
      min_price_eur: string;
      avg_price_eur: string;
      max_price_eur: string;
      listing_count: number;
    }>(
      `SELECT 
         recorded_date, 
         min_price_eur, avg_price_eur, max_price_eur,
         listing_count
       FROM set_price_history
       WHERE set_number = $1 
         AND condition = $2
         AND recorded_date >= CURRENT_DATE - $3::int
         AND region = $4
       ORDER BY recorded_date ASC`,
      [...params, upperCountry]
    );

    // If we have country-specific data, return it
    if (countryResult.rows.length > 0) {
      return {
        data: countryResult.rows.map(row => ({
          date: row.recorded_date.toISOString().split('T')[0],
          min: parseFloat(row.min_price_eur),
          avg: parseFloat(row.avg_price_eur),
          max: parseFloat(row.max_price_eur),
          count: row.listing_count,
        })),
        source: 'country',
      };
    }
    
    // Step 2: Fall back to regional aggregate
    const regionCase = getRegionCaseSql('region');
    
    const regionResult = await query<{
      recorded_date: Date;
      min_price: string;
      avg_price: string;
      max_price: string;
      listing_count: string;
    }>(
      `SELECT 
         recorded_date,
         MIN(min_price_eur) as min_price,
         AVG(avg_price_eur) as avg_price,
         MAX(max_price_eur) as max_price,
         SUM(listing_count) as listing_count
       FROM set_price_history
       WHERE set_number = $1 
         AND condition = $2
         AND recorded_date >= CURRENT_DATE - $3::int
         AND (${regionCase}) = $4
       GROUP BY recorded_date
       ORDER BY recorded_date ASC`,
      [...params, region]
    );

    if (regionResult.rows.length > 0) {
      return {
        data: regionResult.rows.map(row => ({
          date: row.recorded_date.toISOString().split('T')[0],
          min: parseFloat(row.min_price),
          avg: parseFloat(row.avg_price),
          max: parseFloat(row.max_price),
          count: parseInt(row.listing_count),
        })),
        source: 'region',
      };
    }
  }
  
  // No country filter or no regional data - return all data aggregated by date
  const result = await query<{
    recorded_date: Date;
    min_price: string;
    avg_price: string;
    max_price: string;
    listing_count: string;
  }>(
    `SELECT 
       recorded_date,
       MIN(min_price_eur) as min_price,
       AVG(avg_price_eur) as avg_price,
       MAX(max_price_eur) as max_price,
       SUM(listing_count) as listing_count
     FROM set_price_history
     WHERE set_number = $1 
       AND condition = $2
       AND recorded_date >= CURRENT_DATE - $3::int
     GROUP BY recorded_date
     ORDER BY recorded_date ASC`,
    params
  );

  return {
    data: result.rows.map(row => ({
      date: row.recorded_date.toISOString().split('T')[0],
      min: parseFloat(row.min_price),
      avg: parseFloat(row.avg_price),
      max: parseFloat(row.max_price),
      count: parseInt(row.listing_count),
    })),
    source: 'all',
  };
}

/**
 * Get price statistics for a set
 * V30: Country-first, region-fallback approach
 */
export async function getPriceStats(
  setNumber: string,
  condition: string = 'new',
  country?: string
): Promise<SetPriceStats> {
  const upperCountry = country?.toUpperCase();
  const region = country ? getRegionFromCountry(upperCountry!) : null;
  
  // Build WHERE clause - try country first, then region
  let whereClause: string;
  let params: (string | number)[];
  
  if (upperCountry) {
    // Check if we have country-specific data
    const countryCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM set_price_history 
       WHERE set_number = $1 AND condition = $2 AND region = $3`,
      [setNumber, condition, upperCountry]
    );
    
    if (parseInt(countryCheck.rows[0]?.count || '0') > 0) {
      // Use country-specific data
      whereClause = `WHERE set_number = $1 AND condition = $2 AND region = $3`;
      params = [setNumber, condition, upperCountry];
    } else if (region) {
      // Fall back to regional data
      const regionCase = getRegionCaseSql('region');
      whereClause = `WHERE set_number = $1 AND condition = $2 AND (${regionCase}) = $3`;
      params = [setNumber, condition, region];
    } else {
      whereClause = `WHERE set_number = $1 AND condition = $2`;
      params = [setNumber, condition];
    }
  } else {
    whereClause = `WHERE set_number = $1 AND condition = $2`;
    params = [setNumber, condition];
  }
  
  // Get basic stats
  const statsResult = await query<{
    days_tracked: string;
    first_tracked: Date | null;
    lowest_seen: string | null;
    highest_seen: string | null;
  }>(
    `SELECT 
       COUNT(DISTINCT recorded_date) as days_tracked,
       MIN(recorded_date) as first_tracked,
       MIN(min_price_eur) as lowest_seen,
       MAX(max_price_eur) as highest_seen
     FROM set_price_history
     ${whereClause}`,
    params
  );

  const stats = statsResult.rows[0];
  const daysTracked = parseInt(stats?.days_tracked || '0');

  // Get date of lowest price
  let lowestDate: string | null = null;
  if (stats?.lowest_seen) {
    const lowestResult = await query<{ recorded_date: Date }>(
      `SELECT recorded_date FROM set_price_history
       ${whereClause} AND min_price_eur = $${params.length + 1}
       ORDER BY recorded_date DESC LIMIT 1`,
      [...params, stats.lowest_seen]
    );
    if (lowestResult.rows[0]) {
      lowestDate = lowestResult.rows[0].recorded_date.toISOString().split('T')[0];
    }
  }

  // Calculate trends (compare avg price)
  let trend7d: number | null = null;
  let trend30d: number | null = null;

  if (daysTracked >= 7) {
    const trend7Result = await query<{ old_avg: string; new_avg: string }>(
      `WITH recent AS (
         SELECT avg_price_eur as avg FROM set_price_history
         ${whereClause}
         ORDER BY recorded_date DESC LIMIT 1
       ),
       week_ago AS (
         SELECT avg_price_eur as avg FROM set_price_history
         ${whereClause}
           AND recorded_date <= CURRENT_DATE - 7
         ORDER BY recorded_date DESC LIMIT 1
       )
       SELECT 
         (SELECT avg FROM week_ago) as old_avg,
         (SELECT avg FROM recent) as new_avg`,
      params
    );
    
    if (trend7Result.rows[0]?.old_avg && trend7Result.rows[0]?.new_avg) {
      const oldAvg = parseFloat(trend7Result.rows[0].old_avg);
      const newAvg = parseFloat(trend7Result.rows[0].new_avg);
      trend7d = ((newAvg - oldAvg) / oldAvg) * 100;
    }
  }

  if (daysTracked >= 30) {
    const trend30Result = await query<{ old_avg: string; new_avg: string }>(
      `WITH recent AS (
         SELECT avg_price_eur as avg FROM set_price_history
         ${whereClause}
         ORDER BY recorded_date DESC LIMIT 1
       ),
       month_ago AS (
         SELECT avg_price_eur as avg FROM set_price_history
         ${whereClause}
           AND recorded_date <= CURRENT_DATE - 30
         ORDER BY recorded_date DESC LIMIT 1
       )
       SELECT 
         (SELECT avg FROM month_ago) as old_avg,
         (SELECT avg FROM recent) as new_avg`,
      params
    );
    
    if (trend30Result.rows[0]?.old_avg && trend30Result.rows[0]?.new_avg) {
      const oldAvg = parseFloat(trend30Result.rows[0].old_avg);
      const newAvg = parseFloat(trend30Result.rows[0].new_avg);
      trend30d = ((newAvg - oldAvg) / oldAvg) * 100;
    }
  }

  return {
    days_tracked: daysTracked,
    first_tracked: stats?.first_tracked?.toISOString().split('T')[0] || null,
    lowest_seen: stats?.lowest_seen ? parseFloat(stats.lowest_seen) : null,
    lowest_date: lowestDate,
    highest_seen: stats?.highest_seen ? parseFloat(stats.highest_seen) : null,
    trend_7d: trend7d ? Math.round(trend7d * 10) / 10 : null,
    trend_30d: trend30d ? Math.round(trend30d * 10) / 10 : null,
  };
}

/**
 * Get number of users watching a set
 */
export async function getSetWatcherCount(setNumber: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT user_id) as count
     FROM watches
     WHERE set_number = $1 AND status = 'active'`,
    [setNumber]
  );
  return parseInt(result.rows[0]?.count || '0');
}

/**
 * Snapshot daily prices (called by cron at 00:05 UTC)
 * V30: Aggregates into macro-regions with native currency
 * 
 * Groups countries by region (EU/UK/US/CA) and stores both EUR and native prices.
 */
export async function snapshotDailyPrices(): Promise<{
  setsProcessed: number;
  rowsInserted: number;
}> {
  // Build the SQL for mapping country codes to regions and currencies
  const regionCase = getRegionCaseSql('region');
  const currencyCase = getCurrencyCaseSql('region');
  
  // Aggregate all current deals into daily snapshots
  // Groups by macro-region and stores both native and EUR prices
  const result = await query(
    `INSERT INTO set_price_history 
       (set_number, condition, source, region, 
        min_price_eur, avg_price_eur, max_price_eur, 
        min_price, avg_price, max_price, currency,
        listing_count, recorded_date)
     SELECT 
       set_number,
       condition,
       source,
       ${regionCase} as macro_region,
       -- EUR prices (for backward compatibility)
       MIN(total_eur),
       AVG(total_eur),
       MAX(total_eur),
       -- Native currency prices (price_original + shipping_original)
       CASE 
         WHEN ${regionCase} IN ('EU', 'UK', 'US', 'CA') THEN
           MIN(COALESCE(price_original, 0) + COALESCE(shipping_original, 0))
         ELSE MIN(total_eur)
       END,
       CASE 
         WHEN ${regionCase} IN ('EU', 'UK', 'US', 'CA') THEN
           AVG(COALESCE(price_original, 0) + COALESCE(shipping_original, 0))
         ELSE AVG(total_eur)
       END,
       CASE 
         WHEN ${regionCase} IN ('EU', 'UK', 'US', 'CA') THEN
           MAX(COALESCE(price_original, 0) + COALESCE(shipping_original, 0))
         ELSE MAX(total_eur)
       END,
       ${currencyCase} as currency,
       COUNT(*),
       CURRENT_DATE
     FROM set_current_deals
     WHERE expires_at > NOW()
       AND condition IS NOT NULL
     GROUP BY set_number, condition, source, ${regionCase}, ${currencyCase}
     ON CONFLICT (set_number, condition, source, region, recorded_date) 
     DO UPDATE SET
       min_price_eur = LEAST(set_price_history.min_price_eur, EXCLUDED.min_price_eur),
       avg_price_eur = (set_price_history.avg_price_eur + EXCLUDED.avg_price_eur) / 2,
       max_price_eur = GREATEST(set_price_history.max_price_eur, EXCLUDED.max_price_eur),
       min_price = LEAST(set_price_history.min_price, EXCLUDED.min_price),
       avg_price = (COALESCE(set_price_history.avg_price, 0) + COALESCE(EXCLUDED.avg_price, 0)) / 2,
       max_price = GREATEST(set_price_history.max_price, EXCLUDED.max_price),
       currency = EXCLUDED.currency,
       listing_count = set_price_history.listing_count + EXCLUDED.listing_count
     RETURNING set_number`
  );

  const setsProcessed = new Set(result.rows.map((r: any) => r.set_number)).size;
  
  console.log(`[DailySnapshot] V30: Processed ${setsProcessed} sets, ${result.rowCount} rows (with native currencies)`);
  
  return {
    setsProcessed,
    rowsInserted: result.rowCount || 0,
  };
}

/**
 * Clean up expired deals
 * Called periodically to remove stale data
 */
export async function cleanupExpiredDeals(): Promise<number> {
  const result = await query(
    `DELETE FROM set_current_deals WHERE expires_at < NOW()`
  );
  return result.rowCount || 0;
}

/**
 * Track a page view for a set
 */
export async function trackSetPageView(setNumber: string): Promise<void> {
  await query(
    `INSERT INTO set_page_views (set_number, view_date, view_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (set_number, view_date)
     DO UPDATE SET view_count = set_page_views.view_count + 1`,
    [setNumber]
  );
}

/**
 * Get most viewed sets
 */
export async function getMostViewedSets(
  days: number = 7,
  limit: number = 20
): Promise<Array<{ set_number: string; views: number }>> {
  const result = await query<{ set_number: string; total_views: string }>(
    `SELECT set_number, SUM(view_count) as total_views
     FROM set_page_views
     WHERE view_date >= CURRENT_DATE - $1
     GROUP BY set_number
     ORDER BY total_views DESC
     LIMIT $2`,
    [days, limit]
  );

  return result.rows.map(row => ({
    set_number: row.set_number,
    views: parseInt(row.total_views),
  }));
}
