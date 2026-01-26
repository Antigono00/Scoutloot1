/**
 * Main Router
 * 
 * Aggregates all API routes
 */

import { Router } from 'express';
import usersRouter from './users.js';
import watchesRouter from './watches.js';
import alertsRouter from './alerts.js';
import scanRouter from './scan.js';
import setsRouter from './sets.js';
import pushRouter from './push.js';
import jobsRouter from './jobs.js';

const router = Router();

// Mount routes
router.use('/users', usersRouter);
router.use('/watches', watchesRouter);
router.use('/alerts', alertsRouter);
router.use('/scan', scanRouter);
router.use('/sets', setsRouter);
router.use('/push', pushRouter);
router.use('/jobs', jobsRouter);

// Health check
router.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: 'v14.2',
  });
});

export default router;
