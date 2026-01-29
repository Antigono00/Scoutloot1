/**
 * Minifigs Routes
 * 
 * V26: Updated to use cross-marketplace ID lookup
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { lookupMinifig, isBricklinkCode, searchMinifigs } from '../services/minifigs.js';

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
// GET A SPECIFIC MINIFIG BY ID
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
