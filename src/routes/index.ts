/**
 * Main Router
 * 
 * Aggregates all API route modules.
 * V24: Added minifigs routes for minifigure watch support.
 */

import { Router } from 'express';

// Import route modules
import alertsRoutes from './alerts.js';
import jobsRoutes from './jobs.js';
import scanRoutes from './scan.js';
import setsRoutes from './sets.js';
import pushRoutes from './push.js';
import usersRoutes from './users.js';
import watchesRoutes from './watches.js';
import minifigsRoutes from './minifigs.js';  // NEW V24

const router = Router();

// Mount routes
router.use('/alerts', alertsRoutes);
router.use('/jobs', jobsRoutes);
router.use('/scan', scanRoutes);
router.use('/sets', setsRoutes);
router.use('/push', pushRoutes);
router.use('/users', usersRoutes);
router.use('/watches', watchesRoutes);
router.use('/minifigs', minifigsRoutes);  // NEW V24: /api/minifigs/*

export default router;
