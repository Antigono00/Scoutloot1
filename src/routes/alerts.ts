import { Router, Request, Response } from 'express';
import { query } from '../db/index.js';
import { getAlertsByUserId } from '../services/alerts.js';

const router = Router();

/**
 * GET /api/alerts/user/:userId
 * Get alerts for a user (existing endpoint)
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const alerts = await getAlertsByUserId(userId, limit);
    res.json({ alerts, count: alerts.length });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// ============================================
// NOTIFICATIONS INBOX ENDPOINTS (New for Web Push)
// ============================================

interface InboxAlert {
  id: number;
  set_number: string;
  set_name: string | null;
  price_eur: number;
  shipping_eur: number;
  import_charges_eur: number;
  total_eur: number;
  target_price_eur: number;
  notification_type: string | null;
  listing_url: string | null;
  listing_id: string | null;
  seller_id: string | null;
  created_at: Date;
  read_at: Date | null;
  platform: string;
}

/**
 * GET /api/alerts/inbox/:userId
 * Get notifications inbox with pagination
 * 
 * Query params:
 * - limit: number (default 30, max 100)
 * - cursor: ISO date string (for pagination, get alerts before this date)
 * - unread_only: boolean (default false)
 */
router.get('/inbox/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 30, 100);
    const cursor = req.query.cursor as string | undefined;
    const unreadOnly = req.query.unread_only === 'true';

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    let queryText = `
      SELECT 
        ah.id,
        ah.set_number,
        ah.set_name,
        ah.price_eur,
        ah.shipping_eur,
        ah.import_charges_eur,
        ah.total_eur,
        ah.target_price_eur,
        ah.notification_type,
        ah.listing_url,
        ah.listing_id,
        ah.seller_id,
        ah.created_at,
        ah.read_at,
        ah.platform,
        s.name as set_name_from_sets,
        s.image_url as set_image_url
      FROM alert_history ah
      LEFT JOIN sets s ON ah.set_number = s.set_number
      WHERE ah.user_id = $1
    `;
    
    const params: (number | string)[] = [userId];
    let paramIndex = 2;

    if (cursor) {
      queryText += ` AND ah.created_at < $${paramIndex}`;
      params.push(cursor);
      paramIndex++;
    }

    if (unreadOnly) {
      queryText += ` AND ah.read_at IS NULL`;
    }

    queryText += ` ORDER BY ah.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query<InboxAlert & { set_name_from_sets: string | null; set_image_url: string | null }>(
      queryText,
      params
    );

    // Map results and use set name from sets table if alert doesn't have it
    const alerts = result.rows.map(row => ({
      id: row.id,
      set_number: row.set_number,
      set_name: row.set_name || row.set_name_from_sets || row.set_number,
      set_image_url: row.set_image_url,
      price_eur: parseFloat(row.price_eur as unknown as string) || 0,
      shipping_eur: parseFloat(row.shipping_eur as unknown as string) || 0,
      import_charges_eur: parseFloat(row.import_charges_eur as unknown as string) || 0,
      total_eur: parseFloat(row.total_eur as unknown as string) || 0,
      target_price_eur: parseFloat(row.target_price_eur as unknown as string) || 0,
      savings: (parseFloat(row.target_price_eur as unknown as string) || 0) - (parseFloat(row.total_eur as unknown as string) || 0),
      notification_type: row.notification_type,
      listing_url: row.listing_url,
      listing_id: row.listing_id,
      seller_id: row.seller_id,
      created_at: row.created_at,
      read_at: row.read_at,
      is_read: row.read_at !== null,
      platform: row.platform,
    }));

    // Get next cursor for pagination
    const nextCursor = alerts.length === limit 
      ? alerts[alerts.length - 1].created_at.toISOString()
      : null;

    res.json({
      alerts,
      count: alerts.length,
      next_cursor: nextCursor,
      has_more: alerts.length === limit,
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

/**
 * GET /api/alerts/:alertId
 * Get a single alert by ID (for deep linking from push notification)
 */
router.get('/:alertId', async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.alertId, 10);

    if (isNaN(alertId)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const result = await query<InboxAlert & { set_name_from_sets: string | null; set_image_url: string | null }>(
      `SELECT 
        ah.id,
        ah.user_id,
        ah.set_number,
        ah.set_name,
        ah.price_eur,
        ah.shipping_eur,
        ah.import_charges_eur,
        ah.total_eur,
        ah.target_price_eur,
        ah.notification_type,
        ah.listing_url,
        ah.listing_id,
        ah.seller_id,
        ah.created_at,
        ah.read_at,
        ah.platform,
        s.name as set_name_from_sets,
        s.image_url as set_image_url,
        s.year as set_year,
        s.pieces as set_pieces
      FROM alert_history ah
      LEFT JOIN sets s ON ah.set_number = s.set_number
      WHERE ah.id = $1`,
      [alertId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    const row = result.rows[0];
    const alert = {
      id: row.id,
      set_number: row.set_number,
      set_name: row.set_name || row.set_name_from_sets || row.set_number,
      set_image_url: row.set_image_url,
      price_eur: parseFloat(row.price_eur as unknown as string) || 0,
      shipping_eur: parseFloat(row.shipping_eur as unknown as string) || 0,
      import_charges_eur: parseFloat(row.import_charges_eur as unknown as string) || 0,
      total_eur: parseFloat(row.total_eur as unknown as string) || 0,
      target_price_eur: parseFloat(row.target_price_eur as unknown as string) || 0,
      savings: (parseFloat(row.target_price_eur as unknown as string) || 0) - (parseFloat(row.total_eur as unknown as string) || 0),
      notification_type: row.notification_type,
      listing_url: row.listing_url,
      listing_id: row.listing_id,
      seller_id: row.seller_id,
      created_at: row.created_at,
      read_at: row.read_at,
      is_read: row.read_at !== null,
      platform: row.platform,
    };

    res.json(alert);
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

/**
 * POST /api/alerts/:alertId/read
 * Mark an alert as read
 */
router.post('/:alertId/read', async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.alertId, 10);

    if (isNaN(alertId)) {
      res.status(400).json({ error: 'Invalid alert ID' });
      return;
    }

    const result = await query(
      `UPDATE alert_history 
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1
       RETURNING id, read_at`,
      [alertId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json({
      success: true,
      alert_id: alertId,
      read_at: result.rows[0].read_at,
    });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
});

/**
 * POST /api/alerts/mark-all-read/:userId
 * Mark all alerts as read for a user
 */
router.post('/mark-all-read/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const result = await query(
      `UPDATE alert_history 
       SET read_at = NOW()
       WHERE user_id = $1 AND read_at IS NULL
       RETURNING id`,
      [userId]
    );

    res.json({
      success: true,
      marked_count: result.rowCount,
    });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Failed to mark alerts as read' });
  }
});

/**
 * GET /api/alerts/unread-count/:userId
 * Get count of unread alerts for a user (for badge display)
 */
router.get('/unread-count/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM alert_history 
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );

    res.json({
      unread_count: parseInt(result.rows[0].count, 10),
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

export default router;
