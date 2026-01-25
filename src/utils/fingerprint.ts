import crypto from 'crypto';
import { getPriceBucket } from './money.js';
import { DateTime } from 'luxon';

export function generateListingFingerprint(listing: {
  platform?: string;
  seller_id?: string | null;
  title?: string | null;
  price_eur?: number | null;
}): string {
  const components = [
    listing.platform ?? 'ebay',
    listing.seller_id ?? 'unknown',
    (listing.title ?? '').toLowerCase().trim().slice(0, 50),
    getPriceBucket(listing.price_eur ?? 0),
  ].join('|');

  return crypto.createHash('sha256').update(components).digest('hex').slice(0, 16);
}

/**
 * Get the current UTC date string (YYYY-MM-DD)
 */
function getUtcDate(): string {
  return DateTime.utc().toISODate()!;
}

/**
 * Generate idempotency key for eBay alerts
 * 
 * DAILY deduplication per listing fingerprint:
 * - Same listing (same fingerprint) won't alert twice in the same day
 * - Different listing (different fingerprint) CAN alert same day
 * - This allows new better deals to come through while preventing spam
 */
export function generateEbayIdempotencyKey(
  userId: number,
  fingerprint: string,
  _utcDateStr?: string // kept for backwards compatibility but we generate fresh
): string {
  const dateStr = getUtcDate();
  const key = `ebay:${userId}:${fingerprint}:${dateStr}`;
  
  if (key.length > 150) {
    throw new Error(`idempotency_key too long (${key.length} chars, max 150)`);
  }
  
  return key;
}
