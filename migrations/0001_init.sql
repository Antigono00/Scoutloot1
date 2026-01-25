-- ============================================
-- 0001_init.sql — LEGO Deal Radar EU (V1.3.0)
-- ============================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- SETS (must exist before watches/listings)
-- ============================================
CREATE TABLE IF NOT EXISTS sets (
  set_number VARCHAR(20) PRIMARY KEY,
  set_number_base VARCHAR(15),
  name VARCHAR(255),
  theme VARCHAR(100),
  year INT,
  pieces INT,
  msrp_eur DECIMAL(10,2),
  image_url TEXT,
  bricklink_url TEXT,
  rebrickable_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sets_name_trgm ON sets USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_base ON sets(set_number_base);

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255) NOT NULL,

  telegram_chat_id BIGINT UNIQUE,
  telegram_user_id BIGINT,
  telegram_username VARCHAR(100),
  telegram_connected_at TIMESTAMPTZ,

  subscription_tier VARCHAR(20) DEFAULT 'free',
  subscription_status VARCHAR(20) DEFAULT 'active',
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  subscription_ends_at TIMESTAMPTZ,

  ship_to_country CHAR(2) NOT NULL DEFAULT 'DE',
  ship_to_postal_code VARCHAR(20),

  strictness VARCHAR(10) DEFAULT 'balanced',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'Europe/Berlin',
  global_exclude_words TEXT[],

  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_tier CHECK (subscription_tier IN ('free','collector','dealer')),
  CONSTRAINT valid_status CHECK (subscription_status IN ('active','cancelled','past_due','trialing')),
  CONSTRAINT valid_strictness CHECK (strictness IN ('loose','balanced','strict')),
  CONSTRAINT valid_country CHECK (ship_to_country ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_ship_to ON users(ship_to_country) WHERE deleted_at IS NULL;

-- ============================================
-- WATCHES
-- ============================================
CREATE TABLE IF NOT EXISTS watches (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,

  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_number VARCHAR(20) NOT NULL REFERENCES sets(set_number),

  target_total_price_eur DECIMAL(10,2) NOT NULL,

  bricklink_shipping_buffer DECIMAL(10,2) DEFAULT 15.00,
  enable_bricklink_alerts BOOLEAN DEFAULT TRUE,

  condition VARCHAR(10) DEFAULT 'any',

  ship_from_countries TEXT[] DEFAULT ARRAY['DE','FR','ES','IT','NL','BE','AT'],
  min_seller_rating DECIMAL(4,2) DEFAULT 95.0,
  min_seller_feedback INT DEFAULT 10,
  exclude_words TEXT[],

  require_below_market BOOLEAN DEFAULT FALSE,
  min_discount_percent INT DEFAULT 10,

  min_price_drop_eur DECIMAL(10,2) DEFAULT 5.00,
  min_price_drop_percent INT DEFAULT 5,

  status VARCHAR(20) DEFAULT 'active',
  snoozed_until TIMESTAMPTZ,

  total_alerts_sent INT DEFAULT 0,
  last_alert_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_condition CHECK (condition IN ('new','used','any')),
  CONSTRAINT valid_status CHECK (status IN ('active','stopped')),
  CONSTRAINT unique_user_set UNIQUE (user_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_watches_active ON watches(status, set_number) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_watches_user ON watches(user_id, status);

-- ============================================
-- LISTINGS (multi-country storage)
-- ============================================
CREATE TABLE IF NOT EXISTS listings (
  platform VARCHAR(20) NOT NULL DEFAULT 'ebay',
  id VARCHAR(50) NOT NULL,

  scanned_for_country CHAR(2) NOT NULL,
  scanned_for_postal VARCHAR(20),

  set_number VARCHAR(20) NOT NULL REFERENCES sets(set_number),

  title TEXT NOT NULL,
  title_normalized TEXT,
  url TEXT NOT NULL,
  image_url TEXT,

  listing_fingerprint VARCHAR(16),

  price_original DECIMAL(10,2) NOT NULL,
  shipping_original DECIMAL(10,2) DEFAULT 0,
  currency_original VARCHAR(3) DEFAULT 'EUR',

  price_eur DECIMAL(10,2) NOT NULL,
  shipping_eur DECIMAL(10,2) DEFAULT 0,
  total_eur DECIMAL(10,2) GENERATED ALWAYS AS (price_eur + shipping_eur) STORED,

  seller_id VARCHAR(100),
  seller_username VARCHAR(100),
  seller_rating DECIMAL(5,2),
  seller_feedback INT,

  ship_from_country VARCHAR(2),

  condition VARCHAR(50),
  condition_normalized VARCHAR(10),

  photo_count INT DEFAULT 0,
  returns_accepted BOOLEAN DEFAULT FALSE,

  listing_type VARCHAR(20) DEFAULT 'fixed_price',

  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,

  PRIMARY KEY (platform, id, scanned_for_country),
  CONSTRAINT valid_listing_type CHECK (listing_type IN ('fixed_price','auction'))
);

CREATE INDEX IF NOT EXISTS idx_listings_scan_key
  ON listings(set_number, scanned_for_country, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_active
  ON listings(set_number, scanned_for_country, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_listings_ship_from ON listings(ship_from_country);
CREATE INDEX IF NOT EXISTS idx_listings_fingerprint ON listings(listing_fingerprint);

-- ============================================
-- ALERT HISTORY (INSERT-first source of truth)
-- ============================================
CREATE TABLE IF NOT EXISTS alert_history (
  id SERIAL PRIMARY KEY,

  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watch_id INT REFERENCES watches(id) ON DELETE SET NULL,

  platform VARCHAR(20) DEFAULT 'ebay',

  listing_id VARCHAR(50),
  listing_scanned_for_country CHAR(2),

  set_number VARCHAR(20) NOT NULL REFERENCES sets(set_number),

  alert_source VARCHAR(20) NOT NULL,

  price_eur DECIMAL(10,2),
  shipping_eur DECIMAL(10,2),
  total_eur DECIMAL(10,2),
  target_price_eur DECIMAL(10,2),

  seller_id VARCHAR(100),
  listing_fingerprint VARCHAR(16),

  deal_score INT,
  notification_type VARCHAR(20),

  status VARCHAR(20) DEFAULT 'pending',

  delay_reason VARCHAR(20),
  scheduled_for TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  idempotency_key VARCHAR(150) UNIQUE NOT NULL,
  request_id VARCHAR(50),

  CONSTRAINT valid_source CHECK (alert_source IN ('ebay','bricklink')),
  CONSTRAINT valid_status CHECK (status IN ('pending','queued','sent','delivered','failed'))
);

CREATE INDEX IF NOT EXISTS idx_alert_user ON alert_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_pending ON alert_history(status) WHERE status IN ('pending','queued');
CREATE INDEX IF NOT EXISTS idx_alert_user_date
  ON alert_history(user_id, CAST(created_at AT TIME ZONE 'UTC' AS date));
CREATE INDEX IF NOT EXISTS idx_alert_fingerprint
  ON alert_history(user_id, listing_fingerprint, created_at DESC)
  WHERE listing_fingerprint IS NOT NULL;

-- ============================================
-- SUBSCRIPTION TIERS
-- ============================================
CREATE TABLE IF NOT EXISTS subscription_tiers (
  tier_id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  max_watches INT NOT NULL,
  telegram_enabled BOOLEAN DEFAULT FALSE,
  instant_alerts BOOLEAN DEFAULT FALSE,
  max_alerts_per_day INT DEFAULT 50,
  max_alerts_per_hour INT DEFAULT 20,
  scan_priority VARCHAR(10) DEFAULT 'low',
  price_monthly_eur DECIMAL(10,2),
  price_yearly_eur DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO subscription_tiers (
  tier_id,
  name,
  max_watches,
  telegram_enabled,
  instant_alerts,
  max_alerts_per_day,
  max_alerts_per_hour,
  scan_priority,
  price_monthly_eur,
  price_yearly_eur
)
VALUES
  ('free', 'Free', 3, FALSE, FALSE, 3, 3, 'low', 0, 0),
  ('collector', 'Collector', 25, TRUE, TRUE, 100, 30, 'normal', 6.99, 69.00),
  ('dealer', 'Dealer', 100, TRUE, TRUE, 500, 100, 'high', 14.99, 149.00)
ON CONFLICT (tier_id) DO NOTHING;

COMMIT;
