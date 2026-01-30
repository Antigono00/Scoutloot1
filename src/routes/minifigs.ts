/**
 * Minifigs Routes
 * 
 * V28: BrickLink-only ID policy
 * - Only BrickLink codes (sw0001, st005) are accepted for watching
 * - Rebrickable IDs (fig-XXXXXX) are rejected with helpful message
 * - Search results from Rebrickable are displayed but NOT cached
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

    // V26: If it looks like a Bricklink code, use the lookup service
    if (isBricklinkCode(searchQuery)) {
      console.log(`[Minifigs Route] Bricklink code detected: ${searchQuery}`);
      
      const lookupResult = await lookupMinifig(searchQuery);
      
      if (lookupResult.success && lookupResult.name) {
        // Cache this result since it has a valid BrickLink code
        await cacheMinifigWithBricklink(
          lookupResult.bricklink_id || searchQuery.toLowerCase(),
          lookupResult.name,
          lookupResult.num_parts,
          lookupResult.image_url,
          lookupResult.brickowl_boid
        );
        
        res.json({
          results: [{
            fig_num: lookupResult.bricklink_id || searchQuery.toLowerCase(),
            name: lookupResult.name,
            num_parts: lookupResult.num_parts,
            set_img_url: lookupResult.image_url,
            bricklink_id: lookupResult.bricklink_id || searchQuery.toLowerCase(),
            brickowl_boid: lookupResult.brickowl_boid,
          }],
          source: lookupResult.source,
        });
        return;
      }
    }

    // Check local database for name searches
    // Our database only contains entries with valid BrickLink IDs
    const localResults = await searchMinifigs(searchQuery, 10);

    if (localResults.length > 0) {
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

    // Try BrickOwl lookup as fallback (might find something by partial name)
    const lookupResult = await lookupMinifig(searchQuery);
    if (lookupResult.success && lookupResult.name && lookupResult.bricklink_id) {
      // Found with BrickLink ID - cache it and return
      await cacheMinifigWithBricklink(
        lookupResult.bricklink_id,
        lookupResult.name,
        lookupResult.num_parts,
        lookupResult.image_url,
        lookupResult.brickowl_boid
      );
      
      res.json({
        results: [{
          fig_num: lookupResult.bricklink_id,
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

    // Nothing found in our database or BrickOwl
    // Suggest user search with LEGO minifig code
    res.json({ 
      results: [], 
      source: 'none',
      notice: 'No minifig found. Try searching with the LEGO minifig code (e.g., sw0001, st005). As our database grows, more name searches will work!',
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
    
    // V28: Reject Rebrickable IDs
    if (isRebrickableId(figNum)) {
      res.status(400).json({ 
        error: 'Please use LEGO minifig code (e.g., sw0001) instead of Rebrickable ID',
      });
      return;
    }
    
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

    // V28: Reject Rebrickable IDs
    if (isRebrickableId(figNum)) {
      res.status(400).json({ 
        error: 'Please use LEGO minifig code (e.g., sw0001) instead of Rebrickable ID',
      });
      return;
    }

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
// V28: HELPER: Cache minifig ONLY with BrickLink ID
// ============================================
async function cacheMinifigWithBricklink(
  bricklinkId: string,
  name: string | null,
  numParts: number | null,
  imageUrl: string | null,
  brickowlBoid: string | null
): Promise<void> {
  if (!bricklinkId) {
    console.log('[Minifigs] Skipping cache - no BrickLink ID');
    return;
  }
  
  const normalizedId = bricklinkId.toLowerCase();
  
  // Validate it looks like a BrickLink code
  if (!isBricklinkCode(normalizedId)) {
    console.log(`[Minifigs] Skipping cache - invalid BrickLink code: ${normalizedId}`);
    return;
  }
  
  await query(
    `INSERT INTO minifigs (minifig_id, bricklink_id, brickowl_boid, name, num_parts, image_url, updated_at)
     VALUES ($1, $1, $2, $3, $4, $5, NOW())
     ON CONFLICT (minifig_id) 
     DO UPDATE SET 
       bricklink_id = COALESCE(EXCLUDED.bricklink_id, minifigs.bricklink_id),
       brickowl_boid = COALESCE(EXCLUDED.brickowl_boid, minifigs.brickowl_boid),
       name = COALESCE(EXCLUDED.name, minifigs.name),
       num_parts = COALESCE(EXCLUDED.num_parts, minifigs.num_parts),
       image_url = COALESCE(EXCLUDED.image_url, minifigs.image_url),
       updated_at = NOW()`,
    [normalizedId, brickowlBoid, name, numParts, imageUrl]
  );
  
  console.log(`[Minifigs] Cached minifig with BrickLink ID: ${normalizedId}`);
}

export default router;
