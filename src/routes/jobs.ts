/**
 * Jobs Routes
 * 
 * Manual triggers for scheduled jobs (for testing/debugging)
 */

import { Router, Request, Response } from 'express';
import { runWeeklyDigest, runStillAvailableReminders } from '../jobs/scheduledJobs.js';

const router = Router();

/**
 * POST /api/jobs/weekly-digest
 * Manually trigger the weekly digest
 */
router.post('/weekly-digest', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('[Jobs API] Manual weekly digest triggered');
    const result = await runWeeklyDigest();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Jobs API] Weekly digest error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * POST /api/jobs/still-available-reminders
 * Manually trigger still-available reminders
 */
router.post('/still-available-reminders', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('[Jobs API] Manual still-available reminders triggered');
    const result = await runStillAvailableReminders();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Jobs API] Still-available reminders error:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * GET /api/jobs/status
 * Check scheduled jobs status
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    res.json({
      serverTime: now.toISOString(),
      serverTimeUTC: {
        hour: now.getUTCHours(),
        minute: now.getUTCMinutes(),
        dayOfWeek: now.getUTCDay(), // 0 = Sunday
      },
      scheduledJobs: [
        {
          name: 'Weekly Digest',
          schedule: 'Sunday 09:00 UTC',
          nextRun: getNextRunTime(9, 0, 0),
        },
        {
          name: 'Still-Available Reminders',
          schedule: 'Daily 10:00 UTC',
          nextRun: getNextRunTime(10, 0),
        },
      ],
    });
  } catch (error) {
    console.error('[Jobs API] Status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * Calculate next run time for a scheduled job
 */
function getNextRunTime(hour: number, minute: number, dayOfWeek?: number): string {
  const now = new Date();
  const next = new Date(now);
  
  next.setUTCHours(hour, minute, 0, 0);
  
  if (dayOfWeek !== undefined) {
    // Weekly job - find next occurrence of that day
    const currentDay = now.getUTCDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && now > next)) {
      daysUntil += 7;
    }
    next.setUTCDate(next.getUTCDate() + daysUntil);
  } else {
    // Daily job - if past today's time, move to tomorrow
    if (now > next) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }
  
  return next.toISOString();
}

export default router;
