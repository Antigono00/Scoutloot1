import { Router } from 'express';
import scanRoutes from './scan.js';
import watchesRoutes from './watches.js';
import usersRoutes from './users.js';
import alertsRoutes from './alerts.js';
import testRoutes from './test.js';
import setsRoutes from './sets.js';
import jobsRoutes from './jobs.js';

const router = Router();

router.use('/scan', scanRoutes);
router.use('/watches', watchesRoutes);
router.use('/users', usersRoutes);
router.use('/alerts', alertsRoutes);
router.use('/test', testRoutes);
router.use('/sets', setsRoutes);
router.use('/jobs', jobsRoutes);

export default router;
