/**
 * Minifigs Routes (V30)
 * 
 * V30: Regional price history with native currency support
 * - /history endpoint accepts region parameter
 * - Returns currency and symbol in response
 * - Supports EU, UK, US, CA regions
 * 
 * V28: BrickLink-only ID policy
 * - Only BrickLink codes (sw0001, st005) are accepted for watching
 * - Rebrickable IDs (fig-XXXXXX) are rejected with helpful message
 * 
 * V27: Added detail endpoint with deals, history, and stats for minifig pages
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { lookupMinifig, isBricklinkCode, searchMinifigs, getThemeName } from '../services/minifigs.js';
import { getMinifigDeals, getMinifigWatcherCount, trackMinifigPageView } from '../services/minifigCurrentDeals.js';
import { getMinifigPriceHistory, getMinifigPriceStats } from '../services/minifigPriceHistory.js';
import { 
  getCurrencyForRegion, 
  getSymbolForRegion, 
  getRegionFromCountry 
} from '../utils/currency.js';

const router = Router();

// ============================================
// HELPER: Detect Rebrickable ID format
// ============================================
function isRebrickableId(input: string): boolean {
  return /^fig-\d{6}$/i.test(input.trim());
}

// ============================================
// SEARCH MINIFIGS
// GET /api/minifigs/search?q=sw0010
// ============================================
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const searchQuery = req.query.q as string;
    
    if (!searchQuery || searchQuery.length < 2) {
      res.json({ results: [] });
      return;
    }

    // V28: Reject Rebrickable IDs with helpful message
    if (isRebrickableId(searchQuery)) {
      console.log(`[Minifigs Route] Rebrickable ID rejected: ${searchQuery}`);
      res.json({
        results: [],
        error: 'rebrickable_id_not_supported',
        message: 'Please use the LEGO minifig code (e.g., sw0001, st005). You can find this code on BrickLink or BrickOwl.',
      });
      return;
    }

    // Use our enhanced search function (only returns minifigs with bricklink_id)
    const results = await searchMinifigs(searchQuery, 10);
    
    res.json({
      results: results.map(m => ({
        fig_num: m.bricklink_id || m.minifig_id, // Prefer BrickLink ID for display
        minifig_id: m.minifig_id,
        bricklink_id: m.bricklink_id,
        name: m.name,
        num_parts: m.num_parts,
        image_url: m.image_url,
      })),
      source: 'database',
    });
    
  } catch (error) {
    console.error('Minifig search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ============================================
// V27: MINIFIG DETAIL ENDPOINT
// GET /api/minifigs/:figNum/detail
// Returns full minifig data, deals, history, and stats
// ============================================
router.get('/:figNum/detail', async (req: Request, res: Response): Promise<void> => {
  try {
    const { figNum } = req.params;
    const normalizedFigNum = figNum.toLowerCase();
    
    // Look up minifig (handles both BrickLink and Rebrickable IDs)
    const minifigLookup = await lookupMinifig(normalizedFigNum);
    
    if (!minifigLookup.success) {
      res.status(404).json({ error: 'Minifig not found' });
      return;
    }
    
    // Get theme from prefix
    const theme = getThemeName(minifigLookup.bricklink_id || normalizedFigNum);
    
    // Build minifig info object
    const minifigInfo = {
      fig_num: minifigLookup.bricklink_id || minifigLookup.minifig_id,
      minifig_id: minifigLookup.minifig_id,
      bricklink_id: minifigLookup.bricklink_id,
      name: minifigLookup.name || 'Unknown Minifig',
      num_parts: minifigLookup.num_parts,
      image_url: minifigLookup.image_url,
      theme,
    };
    
    // Get current deals
    const deals = await getMinifigDeals(minifigLookup.minifig_id);
    
    // Get price history (last 90 days)
    const [newHistoryResult, usedHistoryResult] = await Promise.all([
      getMinifigPriceHistory(minifigLookup.minifig_id, 90, 'new'),
      getMinifigPriceHistory(minifigLookup.minifig_id, 90, 'used'),
    ]);
    const newHistory = newHistoryResult.data;
    const usedHistory = usedHistoryResult.data;
    
    // Get price stats
    const priceStats = await getMinifigPriceStats(minifigLookup.minifig_id, 'new');
    
    // Get watcher count
    const watchers = await getMinifigWatcherCount(minifigLookup.minifig_id);
    
    // Track page view (fire and forget)
    trackMinifigPageView(minifigLookup.minifig_id).catch(err =>
      console.error('Failed to track minifig view:', err)
    );
    
    // Build response
    res.json({
      minifig: minifigInfo,
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
        })),
      },
      history: {
        days_tracked: priceStats.days_tracked,
        first_tracked: priceStats.first_tracked,
        data: {
          new: newHistory.map(h => ({
            date: h.recorded_date,
            min: h.min_price_eur,
            avg: h.avg_price_eur,
            max: h.max_price_eur,
            count: h.listing_count,
          })),
          used: usedHistory.map(h => ({
            date: h.recorded_date,
            min: h.min_price_eur,
            avg: h.avg_price_eur,
            max: h.max_price_eur,
            count: h.listing_count,
          })),
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
    console.error('Minifig detail error:', error);
    res.status(500).json({ error: 'Failed to get minifig details' });
  }
});

// ============================================
// V30: PRICE HISTORY ENDPOINT with Country/Region Support
// GET /api/minifigs/:figNum/history?days=90&condition=new&country=ES
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
router.get('/:figNum/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { figNum } = req.params;
    const normalizedFigNum = figNum.toLowerCase();
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
    const historyResult = await getMinifigPriceHistory(normalizedFigNum, days, effectiveCondition, country || undefined);
    
    // Get stats for the same country
    const stats = await getMinifigPriceStats(normalizedFigNum, effectiveCondition, country || undefined);
    
    // Determine region and currency info from country
    const region = country ? getRegionFromCountry(country) : 'EU';
    const currency = getCurrencyForRegion(region);
    const symbol = getSymbolForRegion(region);
    
    // Format history data
    const formattedHistory = historyResult.data.map(h => ({
      date: h.recorded_date,
      min: h.min_price_eur,
      avg: h.avg_price_eur,
      max: h.max_price_eur,
      count: h.listing_count,
    }));
    
    res.json({
      fig_num: normalizedFigNum,
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
      data: formattedHistory,
    });
    
  } catch (error) {
    console.error('Minifig price history error:', error);
    res.status(500).json({ error: 'Failed to get price history' });
  }
});

// ============================================
// V27: TRACK PAGE VIEW ENDPOINT
// POST /api/minifigs/:figNum/view
// ============================================
router.post('/:figNum/view', async (req: Request, res: Response): Promise<void> => {
  try {
    const { figNum } = req.params;
    const normalizedFigNum = figNum.toLowerCase();
    
    await trackMinifigPageView(normalizedFigNum);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Track minifig view error:', error);
    // Don't fail the request - tracking is non-critical
    res.json({ success: true });
  }
});

// ============================================
// GET A SPECIFIC MINIFIG BY ID (basic info only)
// GET /api/minifigs/:figNum
// ============================================
router.get('/:figNum', async (req: Request, res: Response): Promise<void> => {
  try {
    const { figNum } = req.params;
    
    // V28: Reject Rebrickable IDs
    if (isRebrickableId(figNum)) {
      res.status(400).json({
        error: 'rebrickable_id_not_supported',
        message: 'Please use the BrickLink minifig code (e.g., sw0001, st005).',
      });
      return;
    }
    
    const minifig = await lookupMinifig(figNum);
    
    if (!minifig.success) {
      res.status(404).json({ error: 'Minifig not found' });
      return;
    }
    
    res.json({
      fig_num: minifig.bricklink_id || minifig.minifig_id,
      minifig_id: minifig.minifig_id,
      bricklink_id: minifig.bricklink_id,
      name: minifig.name,
      num_parts: minifig.num_parts,
      image_url: minifig.image_url,
      theme: getThemeName(minifig.bricklink_id || figNum),
    });
    
  } catch (error) {
    console.error('Minifig lookup error:', error);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

export default router;
