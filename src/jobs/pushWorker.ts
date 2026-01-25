import { Worker, Job } from 'bullmq';
import { config } from '../config.js';
import { getUserPushSubscriptions, sendPushNotification } from '../services/push.js';
import { PushJobData, PushJobResult } from './pushQueue.js';

export function createPushWorker(): Worker<PushJobData, PushJobResult, string> {
  const worker = new Worker<PushJobData, PushJobResult, string>(
    'push',
    async (job: Job<PushJobData, PushJobResult, string>) => {
      const { alertId, userId, payload } = job.data;

      console.log(`[Push Worker] Processing job ${job.id} for alert ${alertId}, user ${userId}`);

      // Get all active subscriptions for this user
      const subscriptions = await getUserPushSubscriptions(userId);

      if (subscriptions.length === 0) {
        console.log(`[Push Worker] No active subscriptions for user ${userId}`);
        return { status: 'no_subscriptions' };
      }

      console.log(`[Push Worker] Sending to ${subscriptions.length} subscription(s)`);

      let sent = 0;
      let failed = 0;

      // Send to all subscriptions
      for (const subscription of subscriptions) {
        try {
          const success = await sendPushNotification(subscription, payload);
          if (success) {
            sent++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error(`[Push Worker] Error sending to subscription ${subscription.id}:`, error);
          failed++;
        }
      }

      // Determine result status
      if (sent === 0 && failed > 0) {
        return { status: 'failed', sent, failed };
      } else if (sent > 0 && failed > 0) {
        return { status: 'partial', sent, failed };
      } else {
        return { status: 'sent', sent, failed };
      }
    },
    {
      connection: {
        url: config.redisUrl,
      },
      concurrency: 10, // Process up to 10 push jobs concurrently
      limiter: {
        max: 50,      // Max 50 jobs per second
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Push Worker] Job ${job.id} completed: ${result.status} (sent: ${result.sent || 0}, failed: ${result.failed || 0})`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Push Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Push Worker] Error:', err);
  });

  return worker;
}

export default createPushWorker;
