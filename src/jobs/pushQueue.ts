import { Queue, Job } from 'bullmq';
import { config } from '../config.js';
import { query } from '../db/index.js';

export interface PushJobData {
  alertId: number;
  userId: number;
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    data?: {
      alertId: number;
      setNumber: string;
      listingUrl?: string;
      url?: string; // Deep link to inbox
      [key: string]: unknown;
    };
    actions?: Array<{ action: string; title: string; icon?: string }>;
  };
}

export interface PushJobResult {
  status: 'sent' | 'partial' | 'failed' | 'no_subscriptions';
  sent?: number;
  failed?: number;
  error?: string;
}

export const pushQueue = new Queue<PushJobData, PushJobResult, string>('push', {
  connection: {
    url: config.redisUrl,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

pushQueue.on('error', (err) => {
  console.error('Push queue error:', err);
});

/**
 * Enqueue a push notification for an alert
 */
export async function enqueuePushAlert(
  data: PushJobData,
  options?: {
    delay?: number;
    jobId?: string;
  }
): Promise<Job<PushJobData, PushJobResult, string>> {
  const job = await pushQueue.add('send-push', data, {
    delay: options?.delay,
    jobId: options?.jobId,
  });

  // Note: We don't update alert_history status here because
  // push and telegram are separate channels - alert status
  // is managed by the primary channel (telegram)

  return job;
}

/**
 * Get push queue statistics
 */
export async function getPushQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    pushQueue.getWaitingCount(),
    pushQueue.getActiveCount(),
    pushQueue.getCompletedCount(),
    pushQueue.getFailedCount(),
    pushQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

export default pushQueue;
