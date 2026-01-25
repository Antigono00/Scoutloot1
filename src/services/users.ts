import { query } from '../db/index.js';
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
    `INSERT INTO users (email, password_hash, ship_to_country, timezone)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      data.email,
      passwordHash,
      data.ship_to_country ?? 'DE',
      data.timezone ?? 'Europe/Berlin',
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

export async function updateUserLocation(
  userId: number,
  country: string,
  postalCode?: string
): Promise<User | null> {
  const result = await query<User>(
    `UPDATE users SET 
       ship_to_country = $2,
       ship_to_postal_code = $3,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [userId, country, postalCode ?? null]
  );
  return result.rows[0] ?? null;
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
