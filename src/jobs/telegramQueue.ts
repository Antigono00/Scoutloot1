import { Queue, Job } from 'bullmq';
import { config } from '../config.js';
import { query } from '../db/index.js';

export interface TelegramJobData {
  alertId: number;
  chatId: number;
  message: {
    text: string;
    reply_markup?: {
      inline_keyboard: Array<Array<{
        text: string;
        url?: string;
        callback_data?: string;
      }>>;
    };
  };
}

export interface TelegramJobResult {
  status: 'sent' | 'blocked' | 'failed';
  error?: string;
}

export const telegramQueue = new Queue<TelegramJobData, TelegramJobResult, string>('telegram', {
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

telegramQueue.on('error', (err) => {
  console.error('Telegram queue error:', err);
});

export async function enqueueTelegramAlert(
  data: TelegramJobData,
  options?: {
    delay?: number;
    jobId?: string;
  }
): Promise<Job<TelegramJobData, TelegramJobResult, string>> {
  const job = await telegramQueue.add('send-alert', data, {
    delay: options?.delay,
    jobId: options?.jobId,
  });

  await query(
    `UPDATE alert_history 
     SET status = 'queued', queued_at = NOW() 
     WHERE id = $1`,
    [data.alertId]
  );

  return job;
}

export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    telegramQueue.getWaitingCount(),
    telegramQueue.getActiveCount(),
    telegramQueue.getCompletedCount(),
    telegramQueue.getFailedCount(),
    telegramQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

export default telegramQueue;
