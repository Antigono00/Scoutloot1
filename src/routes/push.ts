import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { query } from '../db/index.js';
import {
  savePushSubscription,
  getUserPushSubscriptions,
  removePushSubscription,
  getUserPushSubscriptionCount,
  PushSubscriptionInput,
} from '../services/push.js';
import { getPushQueueStats } from '../jobs/pushQueue.js';

const router = Router();

/**
 * GET /api/push/vapid-public-key
 * Get the VAPID public key for push subscription
 */
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  if (!config.vapidPublicKey) {
    res.status(503).json({ error: 'Push notifications not configured' });
    return;
  }
  
  res.json({ publicKey: config.vapidPublicKey });
});

/**
 * POST /api/push/subscribe
 * Subscribe to push notifications
 */
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { userId, subscription, deviceName } = req.body as {
      userId: number;
      subscription: PushSubscriptionInput;
      deviceName?: string;
    };

    if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const saved = await savePushSubscription(userId, subscription, deviceName);
    
    console.log(`[Push] Subscription saved for user ${userId}: ${subscription.endpoint.substring(0, 50)}...`);
    
    res.json({
      success: true,
      subscription: {
        id: saved.id,
        device_name: saved.device_name,
        created_at: saved.created_at,
      },
    });
  } catch (error) {
    console.error('[Push] Subscribe error:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

/**
 * POST /api/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body as { endpoint: string };

    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint' });
      return;
    }

    const removed = await removePushSubscription(endpoint);
    
    res.json({
      success: removed,
      message: removed ? 'Subscription removed' : 'Subscription not found',
    });
  } catch (error) {
    console.error('[Push] Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

/**
 * GET /api/push/subscriptions/:userId
 * Get all push subscriptions for a user
 */
router.get('/subscriptions/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const subscriptions = await getUserPushSubscriptions(userId);
    
    res.json({
      count: subscriptions.length,
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        device_name: s.device_name,
        is_active: s.is_active,
        created_at: s.created_at,
        last_used_at: s.last_used_at,
        // Don't expose endpoint/keys for security
      })),
    });
  } catch (error) {
    console.error('[Push] Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

/**
 * GET /api/push/status/:userId
 * Get push notification status for a user
 */
router.get('/status/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const count = await getUserPushSubscriptionCount(userId);
    
    res.json({
      enabled: count > 0,
      deviceCount: count,
    });
  } catch (error) {
    console.error('[Push] Get status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * DELETE /api/push/subscription/:id
 * Delete a specific subscription by ID
 */
router.delete('/subscription/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid subscription ID' });
      return;
    }

    const result = await query(
      `DELETE FROM push_subscriptions WHERE id = $1`,
      [id]
    );
    
    const deleted = (result.rowCount ?? 0) > 0;
    
    res.json({
      success: deleted,
      message: deleted ? 'Subscription removed' : 'Subscription not found',
    });
  } catch (error) {
    console.error('[Push] Delete subscription error:', error);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

/**
 * GET /api/push/queue-stats
 * Get push queue statistics
 */
router.get('/queue-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getPushQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('[Push] Queue stats error:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

/**
 * POST /api/push/test/:userId
 * Send a test push notification (for debugging)
 */
router.post('/test/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const { sendPushToUser } = await import('../services/push.js');
    
    const result = await sendPushToUser(userId, {
      title: '🧱 ScoutLoot Test',
      body: 'Push notifications are working! You\'ll receive deal alerts here.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: 'test-notification',
      data: {
        type: 'test',
        timestamp: Date.now(),
      },
    });
    
    res.json({
      success: result.sent > 0,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    console.error('[Push] Test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

export default router;
