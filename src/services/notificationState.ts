/**
 * Notification State Management
 * 
 * Tracks the last notification sent for each watch to implement
 * smart notifications that only alert when something changes.
 */

import { query } from '../db/index.js';

export interface NotificationState {
  id: number;
  watch_id: number;
  listing_id: string;
  listing_price: number;
  listing_title: string | null;
  listing_url: string | null;
  notified_at: Date;
  notify_reason: string | null;
  reminder_sent_at: Date | null;
  reminder_count: number;
}

/**
 * Get the last notification state for a watch
 */
export async function getNotificationState(watchId: number): Promise<NotificationState | null> {
  const result = await query<NotificationState>(
    `SELECT * FROM watch_notification_state WHERE watch_id = $1`,
    [watchId]
  );
  return result.rows[0] ?? null;
}

/**
 * Update (upsert) the notification state for a watch
 */
export async function updateNotificationState(
  watchId: number,
  listingId: string,
  price: number,
  title: string | null,
  url: string | null,
  reason: string
): Promise<void> {
  await query(
    `INSERT INTO watch_notification_state 
       (watch_id, listing_id, listing_price, listing_title, listing_url, notify_reason, notified_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (watch_id) DO UPDATE SET
       listing_id = EXCLUDED.listing_id,
       listing_price = EXCLUDED.listing_price,
       listing_title = EXCLUDED.listing_title,
       listing_url = EXCLUDED.listing_url,
       notify_reason = EXCLUDED.notify_reason,
       notified_at = NOW(),
       updated_at = NOW()`,
    [watchId, listingId, price, title, url, reason]
  );
}

/**
 * Clear notification state for a watch (useful when watch is modified)
 */
export async function clearNotificationState(watchId: number): Promise<void> {
  await query(
    `DELETE FROM watch_notification_state WHERE watch_id = $1`,
    [watchId]
  );
}

/**
 * Check if a listing still exists in current scan results
 */
export function listingStillExists(listingId: string, listings: { id: string }[]): boolean {
  return listings.some(l => l.id === listingId);
}

/**
 * Determine notification decision based on current state and scan results
 */
export interface NotificationDecision {
  shouldNotify: boolean;
  reason: 'first_notification' | 'better_deal' | 'previous_sold' | 'price_drop' | 'no_change';
  message?: string;
}

export function decideNotification(
  currentBestPrice: number,
  currentBestListingId: string,
  lastState: NotificationState | null,
  currentListings: { id: string }[]
): NotificationDecision {
  // Case 1: First notification for this watch
  if (!lastState) {
    return {
      shouldNotify: true,
      reason: 'first_notification',
      message: 'First deal found',
    };
  }

  // Case 2: Better deal found (lower price)
  if (currentBestPrice < lastState.listing_price) {
    return {
      shouldNotify: true,
      reason: 'better_deal',
      message: `Better deal! €${currentBestPrice} < €${lastState.listing_price}`,
    };
  }

  // Case 3: Previous deal is gone (sold or expired)
  if (!listingStillExists(lastState.listing_id, currentListings)) {
    return {
      shouldNotify: true,
      reason: 'previous_sold',
      message: `Previous deal (€${lastState.listing_price}) gone, new best: €${currentBestPrice}`,
    };
  }

  // Case 4: Same listing but price dropped
  if (currentBestListingId === lastState.listing_id && currentBestPrice < lastState.listing_price) {
    return {
      shouldNotify: true,
      reason: 'price_drop',
      message: `Price drop! €${currentBestPrice} (was €${lastState.listing_price})`,
    };
  }

  // Case 5: No change - same deal still available
  return {
    shouldNotify: false,
    reason: 'no_change',
    message: `Same deal still available at €${lastState.listing_price}`,
  };
}
