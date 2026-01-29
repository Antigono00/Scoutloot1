import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export const config = {
  // ============================================
  // DATABASE & CACHE
  // ============================================
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: requireEnv('REDIS_URL'),
  
  // ============================================
  // TELEGRAM
  // ============================================
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  
  // ============================================
  // EBAY
  // ============================================
  ebayClientId: optionalEnv('EBAY_OAUTH_CLIENT_ID', 'placeholder'),
  ebayClientSecret: optionalEnv('EBAY_OAUTH_CLIENT_SECRET', 'placeholder'),
  ebayMarketplaceId: optionalEnv('EBAY_MARKETPLACE_ID', 'EBAY_DE'),
  ebayVerificationToken: optionalEnv('EBAY_VERIFICATION_TOKEN', ''),
  
  // ============================================
  // BRICKOWL (NEW)
  // ============================================
  brickOwlApiKey: optionalEnv('BRICKOWL_API_KEY', ''),
  
  // ============================================
  // REBRICKABLE
  // ============================================
  rebrickableApiKey: optionalEnv('REBRICKABLE_API_KEY', '05480b178b7ab764c21069f710e1380f'),
  
  // ============================================
  // APPLICATION
  // ============================================
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  appBaseUrl: optionalEnv('APP_BASE_URL', 'https://scoutloot.com'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  
  // ============================================
  // EMAIL (Resend)
  // ============================================
  resendApiKey: process.env.RESEND_API_KEY || '',
  
  // ============================================
  // AFFILIATE
  // ============================================
  epnCampaignId: optionalEnv('EPN_CAMPAIGN_ID', ''),
  
  // ============================================
  // WEB PUSH (VAPID)
  // ============================================
  vapidPublicKey: optionalEnv('VAPID_PUBLIC_KEY', ''),
  vapidPrivateKey: optionalEnv('VAPID_PRIVATE_KEY', ''),
  vapidSubject: optionalEnv('VAPID_SUBJECT', 'mailto:support@scoutloot.com'),
} as const;

export type Config = typeof config;

// ============================================
// FEATURE FLAGS
// ============================================

/**
 * Check if BrickOwl integration is enabled
 */
export function isBrickOwlEnabled(): boolean {
  return !!config.brickOwlApiKey;
}

/**
 * Check if minifigure support is enabled
 * (Always true if BrickOwl is enabled, since minifigs are primarily on BrickOwl)
 */
export function isMinifigSupportEnabled(): boolean {
  return isBrickOwlEnabled();
}
