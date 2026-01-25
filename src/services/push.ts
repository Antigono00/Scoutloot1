import webpush from 'web-push';
import { query } from '../db/index.js';
import { config } from '../config.js';

// Configure web-push with VAPID keys
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey
  );
  console.log('✅ Web Push VAPID configured');
} else {
  console.warn('⚠️ Web Push VAPID keys not configured - push notifications disabled');
}

export interface PushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  device_name: string | null;
  is_active: boolean;
  created_at: Date;
  last_used_at: Date;
  failure_count: number;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Save or update a push subscription for a user
 */
export async function savePushSubscription(
  userId: number,
  subscription: PushSubscriptionInput,
  deviceName?: string
): Promise<PushSubscription> {
  const result = await query<PushSubscription>(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh_key, auth_key, device_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = $1,
       p256dh_key = $3,
       auth_key = $4,
       device_name = COALESCE($5, push_subscriptions.device_name),
       is_active = true,
       failure_count = 0,
       last_used_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, deviceName || null]
  );
  
  return result.rows[0];
}

/**
 * Get all active push subscriptions for a user
 */
export async function getUserPushSubscriptions(userId: number): Promise<PushSubscription[]> {
  const result = await query<PushSubscription>(
    `SELECT * FROM push_subscriptions 
     WHERE user_id = $1 AND is_active = true
     ORDER BY last_used_at DESC`,
    [userId]
  );
  
  return result.rows;
}

/**
 * Remove a push subscription by endpoint
 */
export async function removePushSubscription(endpoint: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1`,
    [endpoint]
  );
  
  const deleted = (result.rowCount ?? 0) > 0;
  if (deleted) {
    console.log(`[Push] Subscription removed: ${endpoint.substring(0, 50)}...`);
  }
  return deleted;
}

/**
 * Mark a subscription as inactive after failures
 */
export async function deactivatePushSubscription(endpoint: string): Promise<void> {
  await query(
    `UPDATE push_subscriptions 
     SET is_active = false, updated_at = NOW() 
     WHERE endpoint = $1`,
    [endpoint]
  );
  console.log(`[Push] Subscription deactivated: ${endpoint.substring(0, 50)}...`);
}

/**
 * Increment failure count for a subscription
 */
export async function incrementFailureCount(endpoint: string): Promise<number> {
  const result = await query<{ failure_count: number }>(
    `UPDATE push_subscriptions 
     SET failure_count = failure_count + 1, updated_at = NOW() 
     WHERE endpoint = $1
     RETURNING failure_count`,
    [endpoint]
  );
  
  return result.rows[0]?.failure_count ?? 0;
}

/**
 * Reset failure count on successful send
 */
export async function resetFailureCount(endpoint: string): Promise<void> {
  await query(
    `UPDATE push_subscriptions 
     SET failure_count = 0, last_used_at = NOW(), updated_at = NOW() 
     WHERE endpoint = $1`,
    [endpoint]
  );
}

/**
 * Send a push notification to a subscription
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
    actions?: Array<{ action: string; title: string; icon?: string }>;
  }
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    return { success: false, error: 'VAPID not configured' };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh_key,
      auth: subscription.auth_key,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    
    // Reset failure count on success
    await resetFailureCount(subscription.endpoint);
    
    return { success: true };
  } catch (error: unknown) {
    const err = error as { statusCode?: number; body?: string; message?: string };
    const statusCode = err.statusCode;
    const errorMessage = err.body || err.message || 'Unknown error';
    
    console.error(`[Push] Send error (${statusCode}):`, errorMessage);
    
    // Handle specific error codes
    if (statusCode === 410 || statusCode === 404) {
      // Subscription expired or invalid - remove it
      await removePushSubscription(subscription.endpoint);
      return { success: false, error: 'Subscription expired', statusCode };
    }
    
    if (statusCode === 429) {
      // Rate limited - don't count as failure
      return { success: false, error: 'Rate limited', statusCode };
    }
    
    // Increment failure count for other errors
    const failureCount = await incrementFailureCount(subscription.endpoint);
    
    // Deactivate after 3 consecutive failures
    if (failureCount >= 3) {
      await deactivatePushSubscription(subscription.endpoint);
    }
    
    return { success: false, error: errorMessage, statusCode };
  }
}

/**
 * Send push notification to all active subscriptions for a user
 */
export async function sendPushToUser(
  userId: number,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
    actions?: Array<{ action: string; title: string; icon?: string }>;
  }
): Promise<{ sent: number; failed: number }> {
  const subscriptions = await getUserPushSubscriptions(userId);
  
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const result = await sendPushNotification(subscription, payload);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Check if a user has any active push subscriptions
 */
export async function userHasPushEnabled(userId: number): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM push_subscriptions 
     WHERE user_id = $1 AND is_active = true`,
    [userId]
  );
  
  return parseInt(result.rows[0].count, 10) > 0;
}

/**
 * Get push subscription count for a user
 */
export async function getUserPushSubscriptionCount(userId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM push_subscriptions 
     WHERE user_id = $1 AND is_active = true`,
    [userId]
  );
  
  return parseInt(result.rows[0].count, 10);
}
