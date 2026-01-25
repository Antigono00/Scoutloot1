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
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: requireEnv('REDIS_URL'),
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  ebayClientId: optionalEnv('EBAY_OAUTH_CLIENT_ID', 'placeholder'),
  ebayClientSecret: optionalEnv('EBAY_OAUTH_CLIENT_SECRET', 'placeholder'),
  ebayMarketplaceId: optionalEnv('EBAY_MARKETPLACE_ID', 'EBAY_DE'),
  ebayVerificationToken: optionalEnv('EBAY_VERIFICATION_TOKEN', ''),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  appBaseUrl: optionalEnv('APP_BASE_URL', 'https://scoutloot.com'),
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  
  // Email (Resend)
  resendApiKey: process.env.RESEND_API_KEY || '',
  
  // eBay Partner Network (EPN) Affiliate Program
  epnCampaignId: optionalEnv('EPN_CAMPAIGN_ID', ''),
  
  // Web Push (VAPID)
  vapidPublicKey: optionalEnv('VAPID_PUBLIC_KEY', ''),
  vapidPrivateKey: optionalEnv('VAPID_PRIVATE_KEY', ''),
  vapidSubject: optionalEnv('VAPID_SUBJECT', 'mailto:support@scoutloot.com'),
} as const;

export type Config = typeof config;
