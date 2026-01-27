/**
 * ScoutLoot Worker
 * 
 * Handles:
 * - Telegram message queue processing
 * - Push notification queue processing
 * - Scheduled cron jobs:
 *   - Daily Price Snapshot: 00:05 UTC - aggregates current deals into history
 *   - Expired Deals Cleanup: 00:10 UTC - removes stale current deals
 *   - Weekly Digest: Sunday 9:00 AM UTC
 *   - Still-Available Reminders: Daily 10:00 AM UTC
 */

import { config } from './config.js';
import { createTelegramWorker } from './jobs/telegramWorker.js';
import { createPushWorker } from './jobs/pushWorker.js';
import { 
  runWeeklyDigest, 
  runStillAvailableReminders,
  runDailyPriceSnapshot,
  runExpiredDealsCleanup
} from './jobs/scheduledJobs.js';
import { closeRedis } from './db/redis.js';
import { closePool } from './db/index.js';

console.log('🚀 Starting ScoutLoot Worker');
console.log(`   Environment: ${config.nodeEnv}`);

// ============================================
// TELEGRAM QUEUE WORKER
// ============================================

const telegramWorker = createTelegramWorker();
console.log('✅ Telegram worker started');

// ============================================
// PUSH NOTIFICATION QUEUE WORKER
// ============================================

const pushWorker = createPushWorker();
console.log('✅ Push notification worker started');

// ============================================
// CRON JOB SCHEDULER
// ============================================

interface ScheduledJob {
  name: string;
  cronHour: number;      // UTC hour (0-23)
  cronMinute: number;    // UTC minute (0-59)
  cronDayOfWeek?: number; // 0 = Sunday, 1 = Monday, etc. (undefined = daily)
  handler: () => Promise<unknown>;
  lastRun?: Date;
}

const scheduledJobs: ScheduledJob[] = [
  // NEW: Daily price snapshot at 00:05 UTC
  {
    name: 'Daily Price Snapshot',
    cronHour: 0,
    cronMinute: 5,
    handler: runDailyPriceSnapshot,
  },
  // NEW: Expired deals cleanup at 00:10 UTC
  {
    name: 'Expired Deals Cleanup',
    cronHour: 0,
    cronMinute: 10,
    handler: runExpiredDealsCleanup,
  },
  // Weekly digest on Sunday at 9:00 AM UTC
  {
    name: 'Weekly Digest',
    cronHour: 9,
    cronMinute: 0,
    cronDayOfWeek: 0, // Sunday
    handler: runWeeklyDigest,
  },
  // Still-available reminders at 10:00 AM UTC daily
  {
    name: 'Still-Available Reminders',
    cronHour: 10,
    cronMinute: 0,
    // No cronDayOfWeek = runs daily
    handler: runStillAvailableReminders,
  },
];

/**
 * Check if a job should run now
 */
function shouldJobRun(job: ScheduledJob): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcDayOfWeek = now.getUTCDay();
  
  // Check day of week if specified
  if (job.cronDayOfWeek !== undefined && utcDayOfWeek !== job.cronDayOfWeek) {
    return false;
  }
  
  // Check hour and minute (within 1 minute window)
  if (utcHour !== job.cronHour || utcMinute !== job.cronMinute) {
    return false;
  }
  
  // Check if already run today/this hour
  if (job.lastRun) {
    const hoursSinceLastRun = (now.getTime() - job.lastRun.getTime()) / (1000 * 60 * 60);
    // Don't run more than once per hour
    if (hoursSinceLastRun < 1) {
      return false;
    }
  }
  
  return true;
}

/**
 * Run the cron scheduler loop
 */
async function runCronScheduler(): Promise<void> {
  console.log('✅ Cron scheduler started');
  console.log('   Scheduled jobs:');
  for (const job of scheduledJobs) {
    const dayStr = job.cronDayOfWeek !== undefined 
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][job.cronDayOfWeek]
      : 'Daily';
    console.log(`   - ${job.name}: ${dayStr} ${String(job.cronHour).padStart(2, '0')}:${String(job.cronMinute).padStart(2, '0')} UTC`);
  }
  
  // Check every minute
  setInterval(async () => {
    for (const job of scheduledJobs) {
      if (shouldJobRun(job)) {
        console.log(`[Cron] Running job: ${job.name}`);
        job.lastRun = new Date();
        
        try {
          const result = await job.handler();
          console.log(`[Cron] Job ${job.name} completed:`, JSON.stringify(result));
        } catch (error) {
          console.error(`[Cron] Job ${job.name} failed:`, error);
        }
      }
    }
  }, 60 * 1000); // Check every 60 seconds
}

// Start the cron scheduler
runCronScheduler();

// ============================================
// SHUTDOWN HANDLING
// ============================================

async function shutdown(): Promise<void> {
  console.log('Shutting down worker...');
  await telegramWorker.close();
  await pushWorker.close();
  await closeRedis();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
