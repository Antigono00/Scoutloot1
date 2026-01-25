/**
 * Scheduled Jobs Routes
 * 
 * API endpoints for manually triggering scheduled jobs (for testing)
 */

import { Router, Request, Response } from 'express';
import { runWeeklyDigest, runStillAvailableReminders } from '../jobs/scheduledJobs.js';

const router = Router();

/**
 * POST /api/jobs/weekly-digest
 * Manually trigger the weekly digest job
 */
router.post('/weekly-digest', async (_req: Request, res: Response): Promise<void> => {
  console.log('[API] Manual trigger: Weekly Digest');
  
  try {
    const result = await runWeeklyDigest();
    res.json({
      success: true,
      job: 'weekly-digest',
      result,
    });
  } catch (error) {
    console.error('[API] Weekly digest error:', error);
    res.status(500).json({
      success: false,
      job: 'weekly-digest',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/jobs/still-available
 * Manually trigger the still-available reminders job
 */
router.post('/still-available', async (_req: Request, res: Response): Promise<void> => {
  console.log('[API] Manual trigger: Still-Available Reminders');
  
  try {
    const result = await runStillAvailableReminders();
    res.json({
      success: true,
      job: 'still-available',
      result,
    });
  } catch (error) {
    console.error('[API] Still-available error:', error);
    res.status(500).json({
      success: false,
      job: 'still-available',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/jobs/status
 * Get status of scheduled jobs
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();
  
  res.json({
    currentTimeUTC: now.toISOString(),
    jobs: [
      {
        name: 'weekly-digest',
        schedule: 'Sunday 09:00 UTC',
        description: 'Sends weekly summary to users with digest enabled',
        manualTrigger: 'POST /api/jobs/weekly-digest',
      },
      {
        name: 'still-available',
        schedule: 'Daily 10:00 UTC',
        description: 'Sends reminders for 3-day-old deals >20% off',
        manualTrigger: 'POST /api/jobs/still-available',
      },
    ],
  });
});

export default router;
