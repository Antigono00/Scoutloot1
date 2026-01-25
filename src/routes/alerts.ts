import { Router, Request, Response } from 'express';
import { getAlertsByUserId, countUserAlertsToday } from '../services/alerts.js';
import { getQueueStats } from '../jobs/telegramQueue.js';

const router = Router();

router.get('/user/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;

    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }

    const alerts = await getAlertsByUserId(userId, limit);
    const todayCount = await countUserAlertsToday(userId);

    res.json({
      alerts,
      count: alerts.length,
      todayCount,
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

router.get('/queue', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Get queue stats error:', error);
    res.status(500).json({ error: 'Failed to get queue stats' });
  }
});

export default router;
