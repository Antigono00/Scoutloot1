import { Router, Request, Response } from 'express';
import {
  createWatch,
  getWatchById,
  getWatchesByUserId,
  updateWatchTargetPrice,
  stopWatch,
  resumeWatch,
  deleteWatch,
  getWatchCountByUserId,
} from '../services/watches.js';
import { query } from '../db/index.js';

const router = Router();

// Rebrickable API key
const REBRICKABLE_API_KEY = '05480b178b7ab764c21069f710e1380f';

interface RebrickableSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

/**
 * Fetch set info from Rebrickable and update database
 */
async function fetchAndUpdateSetInfo(setNumber: string): Promise<void> {
  // Check if set already has name populated
  const existing = await query(
    `SELECT name FROM sets WHERE set_number = $1`,
    [setNumber]
  );
  
  if (existing.rows[0]?.name) {
    console.log(`Set ${setNumber} already has info, skipping Rebrickable fetch`);
    return;
  }

  // Rebrickable uses format "75192-1" for set numbers
  const rebrickableSetNum = setNumber.includes('-') ? setNumber : `${setNumber}-1`;
  const url = `https://rebrickable.com/api/v3/lego/sets/${rebrickableSetNum}/`;

  try {
    console.log(`Fetching set info from Rebrickable: ${setNumber}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Set ${setNumber} not found on Rebrickable`);
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as RebrickableSet;

    // Update set in database
    await query(
      `UPDATE sets SET 
         name = $1,
         year = $2,
         pieces = $3,
         image_url = $4,
         rebrickable_url = $5,
         updated_at = NOW()
       WHERE set_number = $6`,
      [
        data.name,
        data.year,
        data.num_parts,
        data.set_img_url,
        data.set_url,
        setNumber,
      ]
    );

    console.log(`✅ Updated set ${setNumber}: ${data.name} (${data.year})`);
  } catch (error) {
    console.error(`Error fetching set ${setNumber} from Rebrickable:`, error);
    // Don't throw - we still want to create the watch even if Rebrickable fails
  }
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      user_id,
      set_number,
      target_total_price_eur,
      min_total_eur,
      condition,
      ship_from_countries,
      min_seller_rating,
      min_seller_feedback,
      exclude_words,
    } = req.body;

    if (!user_id || !set_number || !target_total_price_eur) {
      res.status(400).json({
        error: 'Missing required fields: user_id, set_number, target_total_price_eur',
      });
      return;
    }

    // Create the watch first
    const watch = await createWatch({
      user_id,
      set_number,
      target_total_price_eur,
      min_total_eur,
      condition,
      ship_from_countries,
      min_seller_rating,
      min_seller_feedback,
      exclude_words,
    });

    // Fetch set info from Rebrickable (async, don't wait for response)
    // This runs in background so user doesn't have to wait
    fetchAndUpdateSetInfo(set_number).catch(err => {
      console.error('Background Rebrickable fetch failed:', err);
    });

    // Return watch with set info if available
    const result = await query(
      `SELECT w.*, s.name as set_name, s.image_url as set_image_url, s.year as set_year, s.pieces as set_pieces
       FROM watches w
       LEFT JOIN sets s ON w.set_number = s.set_number
       WHERE w.id = $1`,
      [watch.id]
    );

    res.status(201).json(result.rows[0] || watch);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') {
      res.status(409).json({
        error: 'Watch already exists for this user and set',
      });
      return;
    }
    console.error('Create watch error:', error);
    res.status(500).json({
      error: 'Failed to create watch',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Get watches with set info (name, image)
    const result = await query(
      `SELECT w.*, s.name as set_name, s.image_url as set_image_url, s.year as set_year, s.pieces as set_pieces
       FROM watches w
       LEFT JOIN sets s ON w.set_number = s.set_number
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );

    const count = await getWatchCountByUserId(userId);

    res.json({ watches: result.rows, count });
  } catch (error) {
    console.error('Get watches error:', error);
    res.status(500).json({ error: 'Failed to get watches' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid watch ID' });
      return;
    }

    const watch = await getWatchById(id);
    if (!watch) {
      res.status(404).json({ error: 'Watch not found' });
      return;
    }

    res.json(watch);
  } catch (error) {
    console.error('Get watch error:', error);
    res.status(500).json({ error: 'Failed to get watch' });
  }
});

// Edit watch - update multiple fields
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid watch ID' });
      return;
    }

    const { target_total_price_eur, min_total_eur, condition } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramCount = 1;

    if (target_total_price_eur !== undefined) {
      updates.push(`target_total_price_eur = $${paramCount}`);
      values.push(target_total_price_eur);
      paramCount++;
    }

    if (min_total_eur !== undefined) {
      updates.push(`min_total_eur = $${paramCount}`);
      values.push(min_total_eur);
      paramCount++;
    }

    if (condition !== undefined) {
      updates.push(`condition = $${paramCount}`);
      values.push(condition);
      paramCount++;
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    const result = await query(
      `UPDATE watches SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Watch not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update watch error:', error);
    res.status(500).json({ error: 'Failed to update watch' });
  }
});

router.patch('/:id/target', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { target_total_price_eur } = req.body;

    if (isNaN(id) || !target_total_price_eur) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    const watch = await updateWatchTargetPrice(id, target_total_price_eur);
    if (!watch) {
      res.status(404).json({ error: 'Watch not found' });
      return;
    }

    res.json(watch);
  } catch (error) {
    console.error('Update watch error:', error);
    res.status(500).json({ error: 'Failed to update watch' });
  }
});

router.post('/:id/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid watch ID' });
      return;
    }

    const watch = await stopWatch(id);
    if (!watch) {
      res.status(404).json({ error: 'Watch not found' });
      return;
    }

    res.json(watch);
  } catch (error) {
    console.error('Stop watch error:', error);
    res.status(500).json({ error: 'Failed to stop watch' });
  }
});

router.post('/:id/resume', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid watch ID' });
      return;
    }

    const watch = await resumeWatch(id);
    if (!watch) {
      res.status(404).json({ error: 'Watch not found' });
      return;
    }

    res.json(watch);
  } catch (error) {
    console.error('Resume watch error:', error);
    res.status(500).json({ error: 'Failed to resume watch' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid watch ID' });
      return;
    }

    await deleteWatch(id);
    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Delete watch error:', error);
    res.status(500).json({ error: 'Failed to delete watch' });
  }
});

export default router;
