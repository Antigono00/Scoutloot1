import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';

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

/**
 * Search sets on Rebrickable
 * GET /api/sets/search?q=millennium
 */
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

    // Return formatted results
    res.json({
      results: data.results.map(set => ({
        set_num: set.set_num.replace(/-\d+$/, ''), // Remove "-1" suffix
        name: set.name,
        year: set.year,
        num_parts: set.num_parts,
        set_img_url: set.set_img_url,
      })),
      source: 'rebrickable',
    });

  } catch (error) {
    console.error('Set search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      results: [],
    });
  }
});

/**
 * Get a specific set by number
 * GET /api/sets/:setNumber
 */
router.get('/:setNumber', async (req: Request, res: Response): Promise<void> => {
  try {
    const { setNumber } = req.params;

    // Check local database first
    const local = await query(
      `SELECT set_number, name, year, pieces, image_url, theme, msrp_eur
       FROM sets WHERE set_number = $1`,
      [setNumber]
    );

    if (local.rows[0]?.name) {
      res.json(local.rows[0]);
      return;
    }

    // Fetch from Rebrickable
    const rebrickableSetNum = setNumber.includes('-') ? setNumber : `${setNumber}-1`;
    const url = `https://rebrickable.com/api/v3/lego/sets/${rebrickableSetNum}/`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        res.status(404).json({ error: 'Set not found' });
        return;
      }
      throw new Error(`Rebrickable API error: ${response.status}`);
    }

    const data = await response.json() as RebrickableSearchResult;

    res.json({
      set_number: setNumber,
      name: data.name,
      year: data.year,
      pieces: data.num_parts,
      image_url: data.set_img_url,
    });

  } catch (error) {
    console.error('Get set error:', error);
    res.status(500).json({ error: 'Failed to get set' });
  }
});

export default router;
