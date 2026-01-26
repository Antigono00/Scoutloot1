import { query } from '../db/index.js';
import { updateUserWatchesShipFrom } from './watches.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_HOURS = 1;

export interface User {
  id: number;
  uuid: string;
  email: string;
  email_verified: boolean;
  password_hash: string;
  telegram_chat_id: number | null;
  telegram_user_id: number | null;
  telegram_username: string | null;
  telegram_connected_at: Date | null;
  subscription_tier: 'free' | 'collector' | 'dealer';
  subscription_status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_ends_at: Date | null;
  ship_to_country: string;
  ship_to_postal_code: string | null;
  strictness: 'loose' | 'balanced' | 'strict';
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  global_exclude_words: string[] | null;
  weekly_digest_enabled: boolean;
  still_available_reminders: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_active_at: Date;
  reset_token: string | null;
  reset_token_expires: Date | null;
}

export type CreateUserData = {
  email: string;
  password: string;  // Plain password - we hash it here
  ship_to_country?: string;
  timezone?: string;
  weekly_digest_enabled?: boolean;
  still_available_reminders?: boolean;
};

/**
 * Hash a plain password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plain password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if a hash looks like bcrypt (starts with $2a$, $2b$, or $2y$)
 */
function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

/**
 * Check if password matches a legacy base64-encoded hash
 * Legacy format: btoa(password) was stored directly
 */
function verifyLegacyPassword(password: string, storedHash: string): boolean {
  try {
    // The old system stored btoa(password) directly
    const expectedHash = Buffer.from(password).toString('base64');
    return expectedHash === storedHash;
  } catch {
    return false;
  }
}

/**
 * Upgrade a user's password from legacy base64 to bcrypt
 */
async function upgradePasswordHash(userId: number, plainPassword: string): Promise<void> {
  const newHash = await hashPassword(plainPassword);
  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [newHash, userId]
  );
  console.log(`[AUTH] Upgraded password hash for user ${userId} to bcrypt`);
}

/**
 * Generate a secure random reset token
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new user with hashed password
 */
export async function createUser(data: CreateUserData): Promise<User> {
  // Hash the password before storing
  const passwordHash = await hashPassword(data.password);
  
  const result = await query<User>(
    `INSERT INTO users (
      email, 
      password_hash, 
      ship_to_country, 
      timezone,
      weekly_digest_enabled,
      still_available_reminders
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      data.email,
      passwordHash,
      data.ship_to_country ?? 'DE',
      data.timezone ?? 'Europe/Berlin',
      data.weekly_digest_enabled ?? true,  // Default ON
      data.still_available_reminders ?? false,  // Default OFF
    ]
  );
  return result.rows[0];
}

/**
 * Authenticate user with email and password
 * Supports both bcrypt (new) and base64 (legacy) passwords
 * Auto-upgrades legacy passwords to bcrypt on successful login
 */
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  
  const user = result.rows[0];
  if (!user) {
    return null;
  }
  
  let isValid = false;
  let needsUpgrade = false;
  
  // Check if it's a bcrypt hash
  if (isBcryptHash(user.password_hash)) {
    // Modern bcrypt verification
    isValid = await verifyPassword(password, user.password_hash);
  } else {
    // Legacy base64 verification
    isValid = verifyLegacyPassword(password, user.password_hash);
    if (isValid) {
      needsUpgrade = true;
    }
  }
  
  if (!isValid) {
    return null;
  }
  
  // Upgrade legacy password to bcrypt
  if (needsUpgrade) {
    await upgradePasswordHash(user.id, password);
  }
  
  // Update last_active_at
  await query(
    `UPDATE users SET last_active_at = NOW() WHERE id = $1`,
    [user.id]
  );
  
  return user;
}

/**
 * Create a password reset token for a user
 * Returns the token (to be sent via email) or null if user not found
 */
export async function createPasswordResetToken(email: string): Promise<{ token: string; user: User } | null> {
  // Find user by email
  const result = await query<User>(
    `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  
  const user = result.rows[0];
  if (!user) {
    return null;
  }
  
  // Generate token and expiry
  const token = generateResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  
  // Store token in database
  await query(
    `UPDATE users SET 
       reset_token = $1, 
       reset_token_expires = $2,
       updated_at = NOW()
     WHERE id = $3`,
    [token, expiresAt, user.id]
  );
  
  console.log(`[AUTH] Created password reset token for user ${user.id} (${email}), expires: ${expiresAt.toISOString()}`);
  
  return { token, user };
}

/**
 * Verify a password reset token and return the user if valid
 */
export async function verifyResetToken(token: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users 
     WHERE reset_token = $1 
       AND reset_token_expires > NOW()
       AND deleted_at IS NULL`,
    [token]
  );
  
  return result.rows[0] ?? null;
}

/**
 * Reset a user's password using a valid reset token
 */
export async function resetPassword(token: string, newPassword: string): Promise<User | null> {
  // Verify token first
  const user = await verifyResetToken(token);
  if (!user) {
    return null;
  }
  
  // Hash the new password
  const passwordHash = await hashPassword(newPassword);
  
  // Update password and clear reset token
  const result = await query<User>(
    `UPDATE users SET 
       password_hash = $1,
       reset_token = NULL,
       reset_token_expires = NULL,
       updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [passwordHash, user.id]
  );
  
  console.log(`[AUTH] Password reset completed for user ${user.id} (${user.email})`);
  
  return result.rows[0] ?? null;
}

/**
 * Clear any existing reset token for a user (e.g., after successful login)
 */
export async function clearResetToken(userId: number): Promise<void> {
  await query(
    `UPDATE users SET 
       reset_token = NULL, 
       reset_token_expires = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

export async function getUserById(id: number): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function connectTelegram(
  userId: number,
  data: {
    telegram_chat_id: number;
    telegram_user_id: number;
    telegram_username?: string;
  }
): Promise<User | null> {
  const result = await query<User>(
    `UPDATE users SET 
       telegram_chat_id = $2,
       telegram_user_id = $3,
       telegram_username = $4,
       telegram_connected_at = NOW(),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [userId, data.telegram_chat_id, data.telegram_user_id, data.telegram_username ?? null]
  );
  return result.rows[0] ?? null;
}

export async function disconnectTelegram(userId: number): Promise<void> {
  await query(
    `UPDATE users SET 
       telegram_chat_id = NULL,
       telegram_user_id = NULL,
       telegram_username = NULL,
       telegram_connected_at = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Update user location (country)
 * IMPORTANT: When country changes, we reset notification state so user gets fresh alerts
 */
export async function updateUserLocation(
  userId: number,
  newCountry: string,
  postalCode?: string
): Promise<User | null> {
  // First, get current country to check if it changed
  const currentUser = await getUserById(userId);
  if (!currentUser) {
    return null;
  }
  
  const countryChanged = currentUser.ship_to_country !== newCountry;
  
  // Update user location
  const result = await query<User>(
    `UPDATE users SET 
       ship_to_country = $2,
       ship_to_postal_code = $3,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [userId, newCountry, postalCode ?? null]
  );
  
  const updatedUser = result.rows[0];
  if (!updatedUser) {
    return null;
  }
  
  // If country changed, reset notification state for fresh alerts
  if (countryChanged) {
    console.log(`[USER] Country changed for user ${userId}: ${currentUser.ship_to_country} -> ${newCountry}`);
    await resetNotificationsForUser(userId, currentUser.ship_to_country);
    await updateUserWatchesShipFrom(userId, newCountry);
    console.log(`[USER] Updated ship_from_countries for all watches to match new country ${newCountry}`);
  }
  
  return updatedUser;
}

/**
 * Reset notification state when user changes country
 * This ensures they get fresh alerts for their new region
 */
async function resetNotificationsForUser(userId: number, oldCountry: string): Promise<void> {
  try {
    // 1. Clear watch_notification_state for all user's watches
    const clearNotificationState = await query(
      `DELETE FROM watch_notification_state 
       WHERE watch_id IN (SELECT id FROM watches WHERE user_id = $1)`,
      [userId]
    );
    console.log(`[USER] Cleared ${clearNotificationState.rowCount} notification states for user ${userId}`);
    
    // 2. Delete listings cached for the old country that are related to user's watches
    // Only delete listings that were scanned specifically for this user's old country
    const clearListings = await query(
      `DELETE FROM listings 
       WHERE scanned_for_country = $1
         AND set_number IN (SELECT set_number FROM watches WHERE user_id = $2)`,
      [oldCountry, userId]
    );
    console.log(`[USER] Cleared ${clearListings.rowCount} cached listings for old country ${oldCountry}`);
    
    // 3. Note: We keep alert_history for historical record
    // The user can still see their past alerts
    
    console.log(`[USER] Notification reset complete for user ${userId} after country change`);
  } catch (error) {
    console.error(`[USER] Error resetting notifications for user ${userId}:`, error);
    // Don't throw - we don't want to fail the location update
  }
}

export async function updateQuietHours(
  userId: number,
  start: string | null,
  end: string | null
): Promise<User | null> {
  const result = await query<User>(
    `UPDATE users SET 
       quiet_hours_start = $2,
       quiet_hours_end = $3,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [userId, start, end]
  );
  return result.rows[0] ?? null;
}

/**
 * Update user settings (generic)
 */
export async function updateUserSettings(
  userId: number,
  settings: {
    ship_to_country?: string;
    timezone?: string;
    weekly_digest_enabled?: boolean;
    still_available_reminders?: boolean;
  }
): Promise<User | null> {
  // Check if country is changing
  if (settings.ship_to_country) {
    // Use updateUserLocation which handles the notification reset
    const user = await updateUserLocation(userId, settings.ship_to_country);
    if (!user) return null;
    
    // Now update the other settings if provided
    const otherSettings = { ...settings };
    delete otherSettings.ship_to_country;
    
    if (Object.keys(otherSettings).length > 0) {
      return await updateUserSettingsOnly(userId, otherSettings);
    }
    return user;
  }
  
  // No country change, just update settings
  return await updateUserSettingsOnly(userId, settings);
}

/**
 * Update user settings without country change logic
 */
async function updateUserSettingsOnly(
  userId: number,
  settings: {
    timezone?: string;
    weekly_digest_enabled?: boolean;
    still_available_reminders?: boolean;
  }
): Promise<User | null> {
  const updates: string[] = [];
  const values: (string | boolean | number)[] = [];
  let paramCount = 1;

  if (settings.timezone !== undefined) {
    updates.push(`timezone = $${paramCount++}`);
    values.push(settings.timezone);
  }
  if (settings.weekly_digest_enabled !== undefined) {
    updates.push(`weekly_digest_enabled = $${paramCount++}`);
    values.push(settings.weekly_digest_enabled);
  }
  if (settings.still_available_reminders !== undefined) {
    updates.push(`still_available_reminders = $${paramCount++}`);
    values.push(settings.still_available_reminders);
  }

  if (updates.length === 0) {
    return await getUserById(userId);
  }

  updates.push('updated_at = NOW()');
  values.push(userId);

  const result = await query<User>(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING *`,
    values
  );

  return result.rows[0] ?? null;
}

// ============================================
// GDPR FUNCTIONS (NEW)
// ============================================

/**
 * Delete user account (soft delete with data cleanup)
 * 
 * This performs a GDPR-compliant deletion:
 * 1. Anonymizes user record (email, password, telegram)
 * 2. Deletes all watches (cascades to watch_notification_state)
 * 3. Deletes push subscriptions
 * 4. Keeps alert_history for analytics (anonymized via watch_id SET NULL cascade)
 */
export async function deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Check if user exists and is not already deleted
    const user = await getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found or already deleted' };
    }

    console.log(`[GDPR] Starting account deletion for user ${userId} (${user.email})`);

    // 2. Anonymize user record (soft delete)
    // We keep the record for audit purposes but clear all PII
    await query(
      `UPDATE users SET
         email = 'deleted_' || id || '@deleted.local',
         password_hash = 'DELETED',
         telegram_chat_id = NULL,
         telegram_user_id = NULL,
         telegram_username = NULL,
         telegram_connected_at = NULL,
         reset_token = NULL,
         reset_token_expires = NULL,
         ship_to_postal_code = NULL,
         global_exclude_words = NULL,
         deleted_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    console.log(`[GDPR] Anonymized user record for user ${userId}`);

    // 3. Delete all watches (this cascades to watch_notification_state)
    const watchesResult = await query(
      `DELETE FROM watches WHERE user_id = $1`,
      [userId]
    );
    console.log(`[GDPR] Deleted ${watchesResult.rowCount} watches for user ${userId}`);

    // 4. Delete push subscriptions
    const pushResult = await query(
      `DELETE FROM push_subscriptions WHERE user_id = $1`,
      [userId]
    );
    console.log(`[GDPR] Deleted ${pushResult.rowCount} push subscriptions for user ${userId}`);

    // 5. Note: alert_history is kept for analytics
    // The watch_id will be set to NULL via CASCADE, anonymizing the connection
    // We could optionally delete it too, but it's useful for aggregate stats

    console.log(`[GDPR] Account deletion complete for user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error(`[GDPR] Error deleting user ${userId}:`, error);
    return { success: false, error: 'Failed to delete account' };
  }
}

/**
 * Change user password (while logged in)
 * 
 * Verifies the old password before allowing change.
 * Clears any existing reset tokens.
 */
export async function changePassword(
  userId: number,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get user
    const user = await getUserById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // 2. Verify old password
    let isValid = false;
    
    if (isBcryptHash(user.password_hash)) {
      isValid = await verifyPassword(oldPassword, user.password_hash);
    } else {
      // Legacy base64 verification
      isValid = verifyLegacyPassword(oldPassword, user.password_hash);
    }

    if (!isValid) {
      console.log(`[AUTH] Password change failed for user ${userId}: incorrect current password`);
      return { success: false, error: 'Current password is incorrect' };
    }

    // 3. Hash new password
    const newHash = await hashPassword(newPassword);

    // 4. Update password and clear any reset tokens
    await query(
      `UPDATE users SET
         password_hash = $1,
         reset_token = NULL,
         reset_token_expires = NULL,
         updated_at = NOW()
       WHERE id = $2`,
      [newHash, userId]
    );

    console.log(`[AUTH] Password changed successfully for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error(`[AUTH] Error changing password for user ${userId}:`, error);
    return { success: false, error: 'Failed to change password' };
  }
}

/**
 * Export all user data (GDPR data portability)
 * 
 * Returns all personal data in a structured format.
 */
export interface UserDataExport {
  exportedAt: string;
  user: {
    id: number;
    email: string;
    ship_to_country: string;
    ship_to_postal_code: string | null;
    timezone: string;
    subscription_tier: string;
    subscription_status: string;
    telegram_username: string | null;
    telegram_connected: boolean;
    weekly_digest_enabled: boolean;
    still_available_reminders: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    created_at: string;
    last_active_at: string | null;
  };
  watches: Array<{
    id: number;
    set_number: string;
    set_name: string | null;
    target_total_price_eur: string;
    condition: string;
    ship_from_countries: string[] | null;
    status: string;
    created_at: string;
  }>;
  alertHistory: Array<{
    id: number;
    set_number: string;
    price_eur: string | null;
    shipping_eur: string | null;
    total_eur: string | null;
    platform: string;
    notification_type: string | null;
    status: string;
    created_at: string;
    sent_at: string | null;
  }>;
  pushSubscriptions: Array<{
    id: number;
    device_name: string | null;
    created_at: string;
    last_used_at: string | null;
  }>;
}

export async function exportUserData(userId: number): Promise<UserDataExport | null> {
  try {
    // 1. Get user profile
    const userResult = await query<{
      id: number;
      email: string;
      ship_to_country: string;
      ship_to_postal_code: string | null;
      timezone: string;
      subscription_tier: string;
      subscription_status: string;
      telegram_username: string | null;
      telegram_chat_id: number | null;
      weekly_digest_enabled: boolean;
      still_available_reminders: boolean;
      quiet_hours_start: string | null;
      quiet_hours_end: string | null;
      created_at: Date;
      last_active_at: Date | null;
    }>(
      `SELECT 
         id, email, ship_to_country, ship_to_postal_code, timezone,
         subscription_tier, subscription_status, telegram_username, telegram_chat_id,
         weekly_digest_enabled, still_available_reminders,
         quiet_hours_start, quiet_hours_end, created_at, last_active_at
       FROM users 
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const userData = userResult.rows[0];

    // 2. Get watches with set names
    const watchesResult = await query<{
      id: number;
      set_number: string;
      set_name: string | null;
      target_total_price_eur: string;
      condition: string;
      ship_from_countries: string[] | null;
      status: string;
      created_at: Date;
    }>(
      `SELECT 
         w.id, w.set_number, s.name as set_name, w.target_total_price_eur,
         w.condition, w.ship_from_countries, w.status, w.created_at
       FROM watches w
       LEFT JOIN sets s ON w.set_number = s.set_number
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    );

    // 3. Get alert history (limit to last 1000 for reasonable file size)
    const alertsResult = await query<{
      id: number;
      set_number: string;
      price_eur: string | null;
      shipping_eur: string | null;
      total_eur: string | null;
      platform: string;
      notification_type: string | null;
      status: string;
      created_at: Date;
      sent_at: Date | null;
    }>(
      `SELECT 
         id, set_number, price_eur, shipping_eur, total_eur,
         platform, notification_type, status, created_at, sent_at
       FROM alert_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1000`,
      [userId]
    );

    // 4. Get push subscriptions
    const pushResult = await query<{
      id: number;
      device_name: string | null;
      created_at: Date;
      last_used_at: Date | null;
    }>(
      `SELECT id, device_name, created_at, last_used_at
       FROM push_subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    // 5. Build export object
    const exportData: UserDataExport = {
      exportedAt: new Date().toISOString(),
      user: {
        id: userData.id,
        email: userData.email,
        ship_to_country: userData.ship_to_country,
        ship_to_postal_code: userData.ship_to_postal_code,
        timezone: userData.timezone,
        subscription_tier: userData.subscription_tier,
        subscription_status: userData.subscription_status,
        telegram_username: userData.telegram_username,
        telegram_connected: userData.telegram_chat_id !== null,
        weekly_digest_enabled: userData.weekly_digest_enabled,
        still_available_reminders: userData.still_available_reminders,
        quiet_hours_start: userData.quiet_hours_start,
        quiet_hours_end: userData.quiet_hours_end,
        created_at: userData.created_at.toISOString(),
        last_active_at: userData.last_active_at?.toISOString() ?? null,
      },
      watches: watchesResult.rows.map(w => ({
        id: w.id,
        set_number: w.set_number,
        set_name: w.set_name,
        target_total_price_eur: w.target_total_price_eur,
        condition: w.condition,
        ship_from_countries: w.ship_from_countries,
        status: w.status,
        created_at: w.created_at.toISOString(),
      })),
      alertHistory: alertsResult.rows.map(a => ({
        id: a.id,
        set_number: a.set_number,
        price_eur: a.price_eur,
        shipping_eur: a.shipping_eur,
        total_eur: a.total_eur,
        platform: a.platform,
        notification_type: a.notification_type,
        status: a.status,
        created_at: a.created_at.toISOString(),
        sent_at: a.sent_at?.toISOString() ?? null,
      })),
      pushSubscriptions: pushResult.rows.map(p => ({
        id: p.id,
        device_name: p.device_name,
        created_at: p.created_at.toISOString(),
        last_used_at: p.last_used_at?.toISOString() ?? null,
      })),
    };

    console.log(`[GDPR] Exported data for user ${userId}: ${watchesResult.rows.length} watches, ${alertsResult.rows.length} alerts, ${pushResult.rows.length} push subscriptions`);

    return exportData;
  } catch (error) {
    console.error(`[GDPR] Error exporting data for user ${userId}:`, error);
    return null;
  }
}
