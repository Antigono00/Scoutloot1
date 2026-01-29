/**
 * Minifigs Routes
 * 
 * API endpoints for minifigure search and details.
 * V24: Initial implementation for minifig watch support.
 */

import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';

const router = Router();

// Rebrickable API key
const REBRICKABLE_API_KEY = process.env.REBRICKABLE_API_KEY || '05480b178b7ab764c21069f710e1380f';

// ============================================
// TYPES
// ============================================

interface RebrickableMinifig {
  set_num: string;      // This is the minifig ID (e.g., sw0001, fig-000001)
  name: string;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

interface RebrickableMinifigSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RebrickableMinifig[];
}

// ============================================
// SEARCH MINIFIGS
// GET /api/minifigs/search?q=darth+vader
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
      `SELECT minifig_id, name, num_parts, image_url 
       FROM minifigs 
       WHERE name IS NOT NULL 
         AND (minifig_id ILIKE $1 OR name ILIKE $2)
       ORDER BY 
         CASE WHEN minifig_id ILIKE $1 THEN 0 ELSE 1 END,
         name
       LIMIT 10`,
      [`${searchQuery}%`, `%${searchQuery}%`]
    );

    // If we have local results, return them (faster)
    if (localResults.rows.length >= 5) {
      res.json({
        results: localResults.rows.map(row => ({
          fig_num: row.minifig_id,
          name: row.name,
          num_parts: row.num_parts,
          set_img_url: row.image_url,
        })),
        source: 'cache',
      });
      return;
    }

    // Otherwise, search Rebrickable
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

    const data = await response.json() as RebrickableMinifigSearchResponse;

    // Cache results in database (fire and forget)
    for (const minifig of data.results) {
      cacheMinifig(minifig).catch(err => 
        console.error(`[Minifigs] Cache error for ${minifig.set_num}:`, err)
      );
    }

    // Return formatted results
    res.json({
      results: data.results.map(minifig => ({
        fig_num: minifig.set_num,  // Rebrickable uses set_num for minifigs too
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
    const normalizedFigNum = figNum.toLowerCase();

    // Check local database first
    const local = await query(
      `SELECT minifig_id, name, num_parts, image_url, rebrickable_url, set_numbers
       FROM minifigs WHERE minifig_id = $1`,
      [normalizedFigNum]
    );

    if (local.rows[0]?.name) {
      res.json({
        fig_num: local.rows[0].minifig_id,
        name: local.rows[0].name,
        num_parts: local.rows[0].num_parts,
        image_url: local.rows[0].image_url,
        rebrickable_url: local.rows[0].rebrickable_url,
        set_numbers: local.rows[0].set_numbers,
      });
      return;
    }

    // Fetch from Rebrickable
    const url = `https://rebrickable.com/api/v3/lego/minifigs/${normalizedFigNum}/`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        res.status(404).json({ error: 'Minifig not found' });
        return;
      }
      throw new Error(`Rebrickable API error: ${response.status}`);
    }

    const data = await response.json() as RebrickableMinifig;

    // Cache the result
    await cacheMinifig(data);

    res.json({
      fig_num: data.set_num,
      name: data.name,
      num_parts: data.num_parts,
      image_url: data.set_img_url,
      rebrickable_url: data.set_url,
    });

  } catch (error) {
    console.error('Get minifig error:', error);
    res.status(500).json({ error: 'Failed to get minifig' });
  }
});

// ============================================
// HELPER: Cache minifig in database
// ============================================
async function cacheMinifig(minifig: RebrickableMinifig): Promise<void> {
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
