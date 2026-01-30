/**
 * Minifigs Routes
 * 
 * V27: Added detail endpoint with deals, history, and stats for minifig pages
 * V26: Updated to use cross-marketplace ID lookup
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { lookupMinifig, isBricklinkCode, searchMinifigs, getThemeName } from '../services/minifigs.js';
import { getMinifigDeals, getMinifigWatcherCount, trackMinifigPageView } from '../services/minifigCurrentDeals.js';
import { getMinifigPriceHistory, getMinifigPriceStats } from '../services/minifigPriceHistory.js';

const router = Router();

// Rebrickable API key
const REBRICKABLE_API_KEY = process.env.REBRICKABLE_API_KEY || '05480b178b7ab764c21069f710e1380f';

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

    // V26: If it looks like a Bricklink code, use the lookup service
    if (isBricklinkCode(searchQuery)) {
      console.log(`[Minifigs Route] Bricklink code detected: ${searchQuery}`);
      
      const lookupResult = await lookupMinifig(searchQuery);
      
      if (lookupResult.success && lookupResult.name) {
        res.json({
          results: [{
            fig_num: lookupResult.bricklink_id || lookupResult.minifig_id,
            name: lookupResult.name,
            num_parts: lookupResult.num_parts,
            set_img_url: lookupResult.image_url,
            bricklink_id: lookupResult.bricklink_id,
            brickowl_boid: lookupResult.brickowl_boid,
          }],
          source: lookupResult.source,
        });
        return;
      }
    }

    // Check local database first
    const localResults = await searchMinifigs(searchQuery, 10);

    if (localResults.length >= 3) {
      res.json({
        results: localResults.map(row => ({
          fig_num: row.bricklink_id || row.minifig_id,
          name: row.name,
          num_parts: row.num_parts,
          set_img_url: row.image_url,
          bricklink_id: row.bricklink_id,
          brickowl_boid: row.brickowl_boid,
        })),
        source: 'cache',
      });
      return;
    }

    // Search Rebrickable by name
    const url = new URL('https://rebrickable.com/api/v3/lego/minifigs/');
    url.searchParams.set('search', searchQuery);
    url.searchParams.set('page_size', '10');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Rebrickable API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.results || data.results.length === 0) {
      // Try BrickOwl as fallback for name searches
      const lookupResult = await lookupMinifig(searchQuery);
      if (lookupResult.success && lookupResult.name) {
        res.json({
          results: [{
            fig_num: lookupResult.bricklink_id || lookupResult.minifig_id,
            name: lookupResult.name,
            num_parts: lookupResult.num_parts,
            set_img_url: lookupResult.image_url,
          }],
          source: lookupResult.source,
        });
        return;
      }
      
      res.json({ results: [], source: 'rebrickable' });
      return;
    }

    // Cache results in database (fire and forget)
    for (const minifig of data.results) {
      cacheMinifig(minifig).catch((err: Error) => 
        console.error(`[Minifigs] Cache error for ${minifig.set_num}:`, err)
      );
    }

    res.json({
      results: data.results.map((minifig: any) => ({
        fig_num: minifig.set_num,
        name: minifig.name,
        num_parts: minifig.num_parts,
        set_img_url: minifig.set_img_url,
      })),
      source: 'rebrickable',
    });

  } catch (error) {
    console.error('Minifig search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      results: [],
    });
  }
});

// ============================================
// V27: GET MINIFIG DETAIL WITH DEALS & HISTORY
// GET /api/minifigs/:figNum/detail
// ============================================
router.get('/:figNum/detail', async (req: Request, res: Response): Promise<void> => {
  try {
    const { figNum } = req.params;
    const normalizedFigNum = figNum.toLowerCase();
    
    // 1. Get minifig info (lookup or from database)
    const lookupResult = await lookupMinifig(figNum);
    
    if (!lookupResult.success || !lookupResult.name) {
      res.status(404).json({ error: 'Minifig not found' });
      return;
    }
    
    // Build minifig info object
    const minifigInfo = {
      fig_num: lookupResult.bricklink_id || lookupResult.minifig_id,
      name: lookupResult.name,
      num_parts: lookupResult.num_parts,
      image_url: lookupResult.image_url,
      bricklink_id: lookupResult.bricklink_id,
      brickowl_boid: lookupResult.brickowl_boid,
      theme: getThemeName(lookupResult.bricklink_id || lookupResult.minifig_id || figNum),
    };
    
    // 2. Get current deals
    const deals = await getMinifigDeals(normalizedFigNum, 10);
    
    // 3. Get price history (last 90 days)
    const [newHistory, usedHistory] = await Promise.all([
      getMinifigPriceHistory(normalizedFigNum, 90, 'new'),
      getMinifigPriceHistory(normalizedFigNum, 90, 'used'),
    ]);
    
    // 4. Get price stats
    const priceStats = await getMinifigPriceStats(normalizedFigNum, 'new');
    
    // 5. Get watcher count
    const watchers = await getMinifigWatcherCount(normalizedFigNum);
    
    // 6. Track page view (fire and forget)
    trackMinifigPageView(normalizedFigNum).catch(err => 
      console.error('Failed to track minifig page view:', err)
    );
    
    // 7. Build response
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
    console.error('Minifig detail error:', error);
    res.status(500).json({ error: 'Failed to get minifig details' });
  }
});

// ============================================
// V27: PRICE HISTORY ENDPOINT
// GET /api/minifigs/:figNum/history?days=90&condition=new
// ============================================
router.get('/:figNum/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { figNum } = req.params;
    const normalizedFigNum = figNum.toLowerCase();
    const days = Math.min(parseInt(req.query.days as string) || 90, 365);
    const condition = (req.query.condition as string) || 'new';
    
    // Validate condition
    if (!['new', 'used', 'any'].includes(condition)) {
      res.status(400).json({ error: 'Invalid condition. Must be: new, used, or any' });
      return;
    }
    
    // Get history for requested condition
    const history = await getMinifigPriceHistory(normalizedFigNum, days, condition === 'any' ? 'new' : condition);
    
    // Get stats
    const stats = await getMinifigPriceStats(normalizedFigNum, condition === 'any' ? 'new' : condition);
    
    res.json({
      fig_num: normalizedFigNum,
      condition,
      days_requested: days,
      days_tracked: stats.days_tracked,
      first_tracked: stats.first_tracked,
      stats: {
        lowest_seen: stats.lowest_seen,
        lowest_date: stats.lowest_date,
        highest_seen: stats.highest_seen,
        trend_7d: stats.trend_7d,
        trend_30d: stats.trend_30d,
      },
      data: history,
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

    // V26: Use the lookup service
    const lookupResult = await lookupMinifig(figNum);

    if (lookupResult.success && lookupResult.name) {
      res.json({
        fig_num: lookupResult.bricklink_id || lookupResult.minifig_id,
        name: lookupResult.name,
        num_parts: lookupResult.num_parts,
        image_url: lookupResult.image_url,
        bricklink_id: lookupResult.bricklink_id,
        brickowl_boid: lookupResult.brickowl_boid,
        theme: getThemeName(lookupResult.bricklink_id || lookupResult.minifig_id || figNum),
      });
      return;
    }

    res.status(404).json({ error: 'Minifig not found' });

  } catch (error) {
    console.error('Get minifig error:', error);
    res.status(500).json({ error: 'Failed to get minifig' });
  }
});

// ============================================
// HELPER: Cache minifig in database
// ============================================
async function cacheMinifig(minifig: { set_num: string; name: string; num_parts: number; set_img_url: string | null; set_url: string }): Promise<void> {
  const figNum = minifig.set_num.toLowerCase();
  
  await query(
    `INSERT INTO minifigs (minifig_id, name, num_parts, image_url, rebrickable_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (minifig_id) 
     DO UPDATE SET 
       name = COALESCE(EXCLUDED.name, minifigs.name),
       num_parts = COALESCE(EXCLUDED.num_parts, minifigs.num_parts),
       image_url = COALESCE(EXCLUDED.image_url, minifigs.image_url),
       rebrickable_url = COALESCE(EXCLUDED.rebrickable_url, minifigs.rebrickable_url),
       updated_at = NOW()`,
    [figNum, minifig.name, minifig.num_parts, minifig.set_img_url, minifig.set_url]
  );
}

export default router;
