import { Worker, Job } from 'bullmq';
import { config } from '../config.js';
import { query } from '../db/index.js';
import { sendMessage, isBlockedError, isRateLimitError, InlineButton } from '../telegram/bot.js';
import { TelegramJobData, TelegramJobResult } from './telegramQueue.js';

function convertReplyMarkup(
  replyMarkup?: TelegramJobData['message']['reply_markup']
): InlineButton[][] | undefined {
  if (!replyMarkup?.inline_keyboard) return undefined;
  return replyMarkup.inline_keyboard;
}

export function createTelegramWorker(): Worker<TelegramJobData, TelegramJobResult, string> {
  const worker = new Worker<TelegramJobData, TelegramJobResult, string>(
    'telegram',
    async (job: Job<TelegramJobData, TelegramJobResult, string>) => {
      const { alertId, chatId, message } = job.data;

      console.log(`Processing telegram job ${job.id} for alert ${alertId}`);

      const result = await sendMessage(chatId, message.text, {
        parse_mode: 'MarkdownV2',
        buttons: convertReplyMarkup(message.reply_markup),
      });

      if (result.success) {
        await query(
          `UPDATE alert_history SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [alertId]
        );
        return { status: 'sent' };
      }

      if (isBlockedError(result.errorCode)) {
        console.log(`User blocked bot, detaching chat_id ${chatId}`);
        
        await query(
          `UPDATE users 
           SET telegram_chat_id = NULL, telegram_user_id = NULL 
           WHERE telegram_chat_id = $1`,
          [chatId]
        );
        
        await query(
          `UPDATE alert_history SET status = 'failed' WHERE id = $1`,
          [alertId]
        );
        
        return { status: 'blocked', error: result.error };
      }

      if (isRateLimitError(result.errorCode)) {
        console.log(`Rate limited, will retry job ${job.id}`);
        throw new Error(`Rate limited: ${result.error}`);
      }

      await query(
        `UPDATE alert_history SET status = 'failed' WHERE id = $1`,
        [alertId]
      );
      throw new Error(`Telegram error: ${result.error}`);
    },
    {
      connection: {
        url: config.redisUrl,
      },
      concurrency: 10,
      limiter: {
        max: 30,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`Telegram job ${job.id} completed:`, result.status);
  });

  worker.on('failed', (job, err) => {
    console.error(`Telegram job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Telegram worker error:', err);
  });

  return worker;
}

export default createTelegramWorker;
