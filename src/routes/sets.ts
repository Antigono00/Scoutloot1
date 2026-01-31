/**
 * Sets Routes (V30)
 * 
 * V30: Regional price history with native currency support
 * - /history endpoint accepts region parameter
 * - Returns currency and symbol in response
 * - Supports EU, UK, US, CA regions
 * 
 * Handles:
 * - GET /api/sets/popular - Most watched sets
 * - GET /api/sets/search?q=... - Search sets
 * - GET /api/sets/:setNumber/detail - Full set details
 * - GET /api/sets/:setNumber/history?days=90&condition=new&region=EU - Price history
 * - POST /api/sets/:setNumber/view - Track page view
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { 
  getCurrentDeals, 
  getPriceHistory, 
  getPriceStats,
  getSetWatcherCount,
  trackSetPageView,
  getMostViewedSets
} from '../services/currentDeals.js';
import { 
  getCurrencyForRegion, 
  getSymbolForRegion, 
  getRegionFromCountry 
} from '../utils/currency.js';

const router = Router();

// Rebrickable API key
const REBRICKABLE_API_KEY = '05480b178b7ab764c21069f710e1380f';

interface RebrickableSearchResult {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

interface RebrickableSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RebrickableSearchResult[];
}

// Helper: Get most watched sets from watches table
async function getMostWatchedSets(limit: number = 20): Promise<Array<{
  set_number: string;
  name: string | null;
  image_url: string | null;
  watch_count: number;
}>> {
  const result = await query<{
    set_number: string;
    name: string | null;
    image_url: string | null;
    watch_count: string;
  }>(
    `SELECT 
       w.set_number, 
       s.name, 
       s.image_url,
       COUNT(*) as watch_count
     FROM watches w
     LEFT JOIN sets s ON w.set_number = s.set_number
     WHERE w.status = 'active' AND w.set_number IS NOT NULL
     GROUP BY w.set_number, s.name, s.image_url
     ORDER BY watch_count DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(r => ({
    set_number: r.set_number,
    name: r.name,
    image_url: r.image_url,
    watch_count: parseInt(r.watch_count),
  }));
}

// ============================================
// Popular Sets Endpoint
// GET /api/sets/popular?limit=20
// Must be BEFORE /:setNumber routes!
// ============================================
router.get('/popular', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const popularSets = await getMostWatchedSets(limit);
    
    res.json({
      sets: popularSets,
      count: popularSets.length,
    });
    
  } catch (error) {
    console.error('Popular sets error:', error);
    res.status(500).json({ error: 'Failed to get popular sets' });
  }
});

// ============================================
// Set Detail Endpoint
// GET /api/sets/:setNumber/detail
// ============================================
router.get('/:setNumber/detail', async (req: Request, res: Response): Promise<void> => {
  try {
    const { setNumber } = req.params;
    const normalizedSetNumber = setNumber.replace(/-\d+$/, ''); // Remove "-1" suffix if present
    
    // 1. Get set info from our database
    const setResult = await query(
      `SELECT set_number, name, year, pieces, image_url, theme
       FROM sets WHERE set_number = $1`,
      [normalizedSetNumber]
    );
    
    let setInfo = setResult.rows[0];
    
    // If not in our DB, fetch from Rebrickable
    if (!setInfo || !setInfo.name) {
      try {
        const rebrickableSetNum = normalizedSetNumber.includes('-') 
          ? normalizedSetNumber 
          : `${normalizedSetNumber}-1`;
        const url = `https://rebrickable.com/api/v3/lego/sets/${rebrickableSetNum}/`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `key ${REBRICKABLE_API_KEY}`,
            'Accept': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json() as RebrickableSearchResult;
          setInfo = {
            set_number: normalizedSetNumber,
            name: data.name,
            year: data.year,
            pieces: data.num_parts,
            image_url: data.set_img_url,
            theme: null, // Rebrickable returns theme_id, not name
          };
          
          // Optionally upsert to our sets table for future use
          await query(
            `INSERT INTO sets (set_number, name, year, pieces, image_url)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (set_number) DO UPDATE SET
               name = COALESCE(sets.name, EXCLUDED.name),
               year = COALESCE(sets.year, EXCLUDED.year),
               pieces = COALESCE(sets.pieces, EXCLUDED.pieces),
               image_url = COALESCE(sets.image_url, EXCLUDED.image_url),
               updated_at = NOW()`,
            [normalizedSetNumber, data.name, data.year, data.num_parts, data.set_img_url]
          );
        }
      } catch (rebrickableError) {
        console.error('Rebrickable fetch error:', rebrickableError);
        // Continue with partial data
      }
    }
    
    // If still no set info, return 404
    if (!setInfo) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }
    
    // 2. Get current deals
    const deals = await getCurrentDeals(normalizedSetNumber);
    
    // 3. Get price history (last 90 days)
    const [newHistory, usedHistory] = await Promise.all([
      getPriceHistory(normalizedSetNumber, 90, 'new'),
      getPriceHistory(normalizedSetNumber, 90, 'used'),
    ]);
    
    // 4. Get price stats
    const priceStats = await getPriceStats(normalizedSetNumber, 'new');
    
    // 5. Get watcher count
    const watchers = await getSetWatcherCount(normalizedSetNumber);
    
    // 6. Track page view (fire and forget)
    trackSetPageView(normalizedSetNumber).catch(err => 
      console.error('Failed to track page view:', err)
    );
    
    // 7. Build response
    res.json({
      set: {
        set_number: setInfo.set_number,
        name: setInfo.name,
        year: setInfo.year,
        pieces: setInfo.pieces,
        theme: setInfo.theme,
        image_url: setInfo.image_url,
      },
      deals: {
        new: deals.new.map(d => ({
          source: d.source,
          marketplace: d.marketplace,
          total_eur: parseFloat(String(d.total_eur)),
          price_eur: parseFloat(String(d.price_eur)),
          shipping_eur: parseFloat(String(d.shipping_eur)),
          import_charges_eur: parseFloat(String(d.import_charges_eur)),
          condition: d.condition,
          seller_country: d.seller_country,
          seller_username: d.seller_username,
          seller_rating: d.seller_rating ? parseFloat(String(d.seller_rating)) : null,
          url: d.listing_url,
          image_url: d.image_url,
          title: d.title,
          // V30: Include original currency info
          currency_original: d.currency_original,
          price_original: d.price_original,
        })),
        used: deals.used.map(d => ({
          source: d.source,
          marketplace: d.marketplace,
          total_eur: parseFloat(String(d.total_eur)),
          price_eur: parseFloat(String(d.price_eur)),
          shipping_eur: parseFloat(String(d.shipping_eur)),
          import_charges_eur: parseFloat(String(d.import_charges_eur)),
          condition: d.condition,
          seller_country: d.seller_country,
          seller_username: d.seller_username,
          seller_rating: d.seller_rating ? parseFloat(String(d.seller_rating)) : null,
          url: d.listing_url,
          image_url: d.image_url,
          title: d.title,
          // V30: Include original currency info
          currency_original: d.currency_original,
          price_original: d.price_original,
        })),
      },
      history: {
        days_tracked: priceStats.days_tracked,
        first_tracked: priceStats.first_tracked,
        data: {
          new: newHistory,
          used: usedHistory,
        },
      },
      stats: {
        watchers,
        lowest_seen: priceStats.lowest_seen,
        lowest_date: priceStats.lowest_date,
        trend_7d: priceStats.trend_7d,
        trend_30d: priceStats.trend_30d,
      },
    });
    
  } catch (error) {
    console.error('Set detail error:', error);
    res.status(500).json({ error: 'Failed to get set details' });
  }
});

// ============================================
// V30: Price History Endpoint with Country/Region Support
// GET /api/sets/:setNumber/history?days=90&condition=new&country=ES
// 
// Parameters:
// - days: Number of days (default 90, max 365)
// - condition: 'new', 'used', or 'any' (default 'new')
// - country: Country code (ES, DE, GB, US, CA, etc.) - optional
//
// Logic:
// 1. If country specified, try country-specific data first
// 2. If no country data, fall back to regional aggregate
// 3. Returns currency symbol based on country's region
//
// Response includes:
// - country: The requested country (or null)
// - region: Derived region (EU, UK, US, CA)
// - currency: Currency code (EUR, GBP, USD, CAD)
// - symbol: Currency symbol (€, £, $, C$)
// - source: 'country', 'region', or 'all' (indicates data source)
// ============================================
router.get('/:setNumber/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { setNumber } = req.params;
    const normalizedSetNumber = setNumber.replace(/-\d+$/, '');
    const days = Math.min(parseInt(req.query.days as string) || 90, 365);
    const condition = (req.query.condition as string) || 'new';
    const country = (req.query.country as string)?.toUpperCase() || null;
    
    // Validate condition
    if (!['new', 'used', 'any'].includes(condition)) {
      res.status(400).json({ error: 'Invalid condition. Must be: new, used, or any' });
      return;
    }
    
    // Get history for requested condition and country
    const effectiveCondition = condition === 'any' ? 'new' : condition;
    const historyResult = await getPriceHistory(normalizedSetNumber, days, effectiveCondition, country || undefined);
    
    // Get stats for the same country
    const stats = await getPriceStats(normalizedSetNumber, effectiveCondition, country || undefined);
    
    // Determine region and currency info from country
    const region = country ? getRegionFromCountry(country) : 'EU';
    const currency = getCurrencyForRegion(region);
    const symbol = getSymbolForRegion(region);
    
    res.json({
      set_number: normalizedSetNumber,
      condition,
      days_requested: days,
      // V30: Country/region info
      country: country,
      region: region,
      currency,
      symbol,
      source: historyResult.source, // 'country', 'region', or 'all'
      // Stats
      days_tracked: stats.days_tracked,
      first_tracked: stats.first_tracked,
      stats: {
        lowest_seen: stats.lowest_seen,
        lowest_date: stats.lowest_date,
        highest_seen: stats.highest_seen,
        trend_7d: stats.trend_7d,
        trend_30d: stats.trend_30d,
      },
      // Price data
      data: historyResult.data,
    });
    
  } catch (error) {
    console.error('Price history error:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

// ============================================
// Track Page View Endpoint
// POST /api/sets/:setNumber/view
// ============================================
router.post('/:setNumber/view', async (req: Request, res: Response): Promise<void> => {
  try {
    const { setNumber } = req.params;
    const normalizedSetNumber = setNumber.replace(/-\d+$/, '');
    
    // Check if set exists
    const setExists = await query(
      `SELECT 1 FROM sets WHERE set_number = $1`,
      [normalizedSetNumber]
    );
    
    if (setExists.rows.length === 0) {
      // Try to create the set entry first
      await query(
        `INSERT INTO sets (set_number) VALUES ($1) ON CONFLICT DO NOTHING`,
        [normalizedSetNumber]
      );
    }
    
    await trackSetPageView(normalizedSetNumber);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Track view error:', error);
    // Don't fail the request, just log
    res.json({ success: true });
  }
});

// ============================================
// Search sets on Rebrickable
// GET /api/sets/search?q=millennium
// ============================================
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const searchQuery = req.query.q as string;
    
    if (!searchQuery || searchQuery.length < 2) {
      res.json({ results: [] });
      return;
    }

    // First check our local database for cached results
    const localResults = await query(
      `SELECT set_number, name, year, pieces, image_url 
       FROM sets 
       WHERE name IS NOT NULL 
         AND (set_number ILIKE $1 OR name ILIKE $2)
       ORDER BY year DESC
       LIMIT 10`,
      [`${searchQuery}%`, `%${searchQuery}%`]
    );

    // If we have local results, return them (faster)
    if (localResults.rows.length >= 5) {
      res.json({
        results: localResults.rows.map(row => ({
          set_num: row.set_number,
          name: row.name,
          year: row.year,
          num_parts: row.pieces,
          set_img_url: row.image_url,
        })),
        source: 'cache',
      });
      return;
    }

    // Otherwise, search Rebrickable
    const url = new URL('https://rebrickable.com/api/v3/lego/sets/');
    url.searchParams.set('search', searchQuery);
    url.searchParams.set('page_size', '10');
    url.searchParams.set('ordering', '-year'); // Newest first

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Rebrickable API error: ${response.status}`);
    }

    const data = await response.json() as RebrickableSearchResponse;
    
    // Cache the results in our database
    for (const result of data.results) {
      const setNum = result.set_num.replace(/-\d+$/, ''); // Normalize "75192-1" to "75192"
      try {
        await query(
          `INSERT INTO sets (set_number, name, year, pieces, image_url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (set_number) DO UPDATE SET
             name = COALESCE(sets.name, EXCLUDED.name),
             year = COALESCE(sets.year, EXCLUDED.year),
             pieces = COALESCE(sets.pieces, EXCLUDED.pieces),
             image_url = COALESCE(sets.image_url, EXCLUDED.image_url),
             updated_at = NOW()`,
          [setNum, result.name, result.year, result.num_parts, result.set_img_url]
        );
      } catch (cacheError) {
        // Ignore caching errors, just continue
      }
    }

    res.json({
      results: data.results,
      source: 'rebrickable',
    });
    
  } catch (error) {
    console.error('Set search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
