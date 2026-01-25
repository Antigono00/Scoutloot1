import { query } from '../db/index.js';
import { generateEbayIdempotencyKey } from '../utils/fingerprint.js';
import { utcDate } from '../utils/time.js';

export interface Alert {
  id: number;
  user_id: number;
  watch_id: number | null;
  platform: string;
  listing_id: string | null;
  listing_scanned_for_country: string | null;
  set_number: string;
  alert_source: 'ebay' | 'bricklink';
  price_eur: number | null;
  shipping_eur: number | null;
  total_eur: number | null;
  target_price_eur: number | null;
  seller_id: string | null;
  listing_fingerprint: string | null;
  deal_score: number | null;
  notification_type: string | null;
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed';
  delay_reason: string | null;
  scheduled_for: Date | null;
  created_at: Date;
  queued_at: Date | null;
  sent_at: Date | null;
  delivered_at: Date | null;
  idempotency_key: string;
  request_id: string | null;
}

export interface CreateAlertData {
  user_id: number;
  watch_id: number;
  platform?: string;
  listing_id: string;
  listing_scanned_for_country: string;
  set_number: string;
  alert_source: 'ebay' | 'bricklink';
  price_eur: number;
  shipping_eur: number;
  total_eur: number;
  target_price_eur: number;
  seller_id: string | null;
  listing_fingerprint: string;
  deal_score?: number;
  notification_type?: string;
  delay_reason?: string;
  scheduled_for?: Date;
  request_id?: string;
}

export async function createAlert(data: CreateAlertData): Promise<Alert | null> {
  const idempotencyKey = generateEbayIdempotencyKey(
    data.user_id,
    data.listing_fingerprint,
    utcDate()
  );

  try {
    const result = await query<Alert>(
      `INSERT INTO alert_history (
         user_id, watch_id, platform, listing_id, listing_scanned_for_country,
         set_number, alert_source, price_eur, shipping_eur, total_eur,
         target_price_eur, seller_id, listing_fingerprint, deal_score,
         notification_type, status, delay_reason, scheduled_for,
         idempotency_key, request_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        data.user_id,
        data.watch_id,
        data.platform ?? 'ebay',
        data.listing_id,
        data.listing_scanned_for_country,
        data.set_number,
        data.alert_source,
        data.price_eur,
        data.shipping_eur,
        data.total_eur,
        data.target_price_eur,
        data.seller_id,
        data.listing_fingerprint,
        data.deal_score ?? null,
        data.notification_type ?? null,
        'pending',
        data.delay_reason ?? null,
        data.scheduled_for ?? null,
        idempotencyKey,
        data.request_id ?? null,
      ]
    );

    return result.rows[0];
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === '23505') {
      console.log(`Alert dedupe: ${idempotencyKey} already exists`);
      return null;
    }
    throw error;
  }
}

export async function getAlertsByUserId(
  userId: number,
  limit = 50
): Promise<Alert[]> {
  const result = await query<Alert>(
    `SELECT * FROM alert_history 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

export async function countUserAlertsToday(userId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history 
     WHERE user_id = $1 
       AND CAST(created_at AT TIME ZONE 'UTC' AS date) = CAST(NOW() AT TIME ZONE 'UTC' AS date)`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function countUserAlertsThisHour(userId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history 
     WHERE user_id = $1 
       AND created_at >= DATE_TRUNC('hour', NOW())`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function countUserAlertsLast10Min(userId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history 
     WHERE user_id = $1 
       AND created_at >= NOW() - INTERVAL '10 minutes'`,
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function countUserAlertsPerSetToday(
  userId: number,
  setNumber: string
): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history 
     WHERE user_id = $1 
       AND set_number = $2
       AND CAST(created_at AT TIME ZONE 'UTC' AS date) = CAST(NOW() AT TIME ZONE 'UTC' AS date)`,
    [userId, setNumber]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function countTelegramAlertsToday(telegramUserId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history ah
     JOIN users u ON ah.user_id = u.id
     WHERE u.telegram_user_id = $1 
       AND CAST(ah.created_at AT TIME ZONE 'UTC' AS date) = CAST(NOW() AT TIME ZONE 'UTC' AS date)`,
    [telegramUserId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function countTelegramAlertsThisHour(telegramUserId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history ah
     JOIN users u ON ah.user_id = u.id
     WHERE u.telegram_user_id = $1 
       AND ah.created_at >= DATE_TRUNC('hour', NOW())`,
    [telegramUserId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Get the best (lowest) total price we've alerted for a specific set today
 * Returns null if no alerts sent today for this set
 */
export async function getBestAlertedPriceToday(
  userId: number,
  setNumber: string
): Promise<number | null> {
  const result = await query<{ min_total: string | null }>(
    `SELECT MIN(total_eur) as min_total FROM alert_history 
     WHERE user_id = $1 
       AND set_number = $2
       AND CAST(created_at AT TIME ZONE 'UTC' AS date) = CAST(NOW() AT TIME ZONE 'UTC' AS date)`,
    [userId, setNumber]
  );
  
  const minTotal = result.rows[0]?.min_total;
  return minTotal ? parseFloat(minTotal) : null;
}

/**
 * Check if a specific listing (by fingerprint) was alerted in the last N days
 * Used to avoid sending the same offer repeatedly
 */
export async function wasListingAlertedRecently(
  userId: number,
  fingerprint: string,
  days: number = 7
): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM alert_history 
     WHERE user_id = $1 
       AND listing_fingerprint = $2
       AND created_at >= NOW() - INTERVAL '${days} days'`,
    [userId, fingerprint]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}
