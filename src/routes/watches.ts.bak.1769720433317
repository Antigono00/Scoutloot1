/**
 * Watches Routes
 * 
 * V24: Updated to support both sets and minifigures
 * - Now joins with both sets AND minifigs tables
 * - Supports item_type + item_id in POST body
 */

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
const REBRICKABLE_API_KEY = process.env.REBRICKABLE_API_KEY || '05480b178b7ab764c21069f710e1380f';

interface RebrickableSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

interface RebrickableMinifig {
  set_num: string;
  name: string;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

/**
 * Fetch set info from Rebrickable and update database
 */
async function fetchAndUpdateSetInfo(setNumber: string): Promise<void> {
  const existing = await query(
    `SELECT name FROM sets WHERE set_number = $1`,
    [setNumber]
  );
  
  if (existing.rows[0]?.name) {
    console.log(`Set ${setNumber} already has info, skipping Rebrickable fetch`);
    return;
  }

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
  }
}

/**
 * Fetch minifig info from Rebrickable and update database
 */
async function fetchAndUpdateMinifigInfo(figNum: string): Promise<void> {
  const existing = await query(
    `SELECT name FROM minifigs WHERE minifig_id = $1`,
    [figNum.toLowerCase()]
  );
  
  if (existing.rows[0]?.name) {
    console.log(`Minifig ${figNum} already has info, skipping Rebrickable fetch`);
    return;
  }

  const url = `https://rebrickable.com/api/v3/lego/minifigs/${figNum}/`;

  try {
    console.log(`Fetching minifig info from Rebrickable: ${figNum}`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Minifig ${figNum} not found on Rebrickable`);
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as RebrickableMinifig;

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
      [figNum.toLowerCase(), data.name, data.num_parts, data.set_img_url, data.set_url]
    );

    console.log(`✅ Updated minifig ${figNum}: ${data.name}`);
  } catch (error) {
    console.error(`Error fetching minifig ${figNum} from Rebrickable:`, error);
  }
}

// ============================================
// CREATE WATCH
// POST /api/watches
// ============================================
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      user_id,
      set_number,      // Legacy support
      item_type,       // NEW: 'set' or 'minifig'
      item_id,         // NEW: set number or minifig ID
      target_total_price_eur,
      min_total_eur,
      condition,
      ship_from_countries,
      min_seller_rating,
      min_seller_feedback,
      exclude_words,
      enable_brickowl_alerts,
    } = req.body;

    // Validate required fields
    const actualItemId = item_id || set_number;
    if (!user_id || !actualItemId || !target_total_price_eur) {
      res.status(400).json({
        error: 'Missing required fields: user_id, item_id (or set_number), target_total_price_eur',
      });
      return;
    }

    // Create the watch
    const watch = await createWatch({
      user_id,
      set_number: item_type === 'set' ? actualItemId : undefined,
      item_type: item_type || 'set',
      item_id: actualItemId,
      target_total_price_eur,
      min_total_eur,
      condition,
      ship_from_countries,
      min_seller_rating,
      min_seller_feedback,
      exclude_words,
      enable_brickowl_alerts,
    });

    // Fetch item info from Rebrickable in background
    const watchItemType = item_type || 'set';
    if (watchItemType === 'minifig') {
      fetchAndUpdateMinifigInfo(actualItemId).catch(err => {
        console.error('Background Rebrickable minifig fetch failed:', err);
      });
    } else {
      fetchAndUpdateSetInfo(actualItemId).catch(err => {
        console.error('Background Rebrickable set fetch failed:', err);
      });
    }

    // Return watch with item info if available
    const result = await query(
      `SELECT w.*, 
              s.name as set_name, s.image_url as set_image_url, s.year as set_year, s.pieces as set_pieces,
              m.name as minifig_name, m.image_url as minifig_image_url, m.num_parts as minifig_parts
       FROM watches w
       LEFT JOIN sets s ON w.item_type = 'set' AND w.item_id = s.set_number
       LEFT JOIN minifigs m ON w.item_type = 'minifig' AND LOWER(w.item_id) = m.minifig_id
       WHERE w.id = $1`,
      [watch.id]
    );

    res.status(201).json(result.rows[0] || watch);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') {
      res.status(409).json({
        error: 'Watch already exists for this user and item',
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

// ============================================
// GET USER'S WATCHES
// GET /api/watches/user/:userId
// ============================================
router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    // Get watches with BOTH set and minifig info
    const result = await query(
      `SELECT w.*, 
              s.name as set_name, s.image_url as set_image_url, s.year as set_year, s.pieces as set_pieces,
              m.name as minifig_name, m.image_url as minifig_image_url, m.num_parts as minifig_parts
       FROM watches w
       LEFT JOIN sets s ON w.item_type = 'set' AND w.item_id = s.set_number
       LEFT JOIN minifigs m ON w.item_type = 'minifig' AND LOWER(w.item_id) = m.minifig_id
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

// ============================================
// GET SINGLE WATCH
// GET /api/watches/:id
// ============================================
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

// ============================================
// UPDATE WATCH
// PATCH /api/watches/:id
// ============================================
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid watch ID' });
      return;
    }

    const { target_total_price_eur, min_total_eur, condition } = req.body;

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

// ============================================
// UPDATE TARGET PRICE ONLY
// PATCH /api/watches/:id/target
// ============================================
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

// ============================================
// STOP WATCH
// POST /api/watches/:id/stop
// ============================================
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

// ============================================
// RESUME WATCH
// POST /api/watches/:id/resume
// ============================================
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

// ============================================
// DELETE WATCH
// DELETE /api/watches/:id
// ============================================
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
