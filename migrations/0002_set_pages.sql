-- ============================================
-- 0002_set_pages.sql — ScoutLoot Set Detail Pages
-- Run: PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -f 0002_set_pages.sql
-- ============================================

BEGIN;

-- ============================================
-- CURRENT BEST DEALS (updated each scan cycle)
-- Stores the best deal per set/condition/marketplace
-- ============================================
CREATE TABLE IF NOT EXISTS set_current_deals (
  id SERIAL PRIMARY KEY,
  set_number VARCHAR(20) NOT NULL REFERENCES sets(set_number) ON DELETE CASCADE,
  
  -- Source info
  source VARCHAR(20) NOT NULL DEFAULT 'ebay',
  marketplace VARCHAR(20),  -- EBAY_DE, EBAY_US, etc.
  region VARCHAR(20),       -- DE, US, GB, etc.
  
  -- Listing details  
  listing_id VARCHAR(100),
  listing_url TEXT NOT NULL,
  image_url TEXT,
  title TEXT,
  condition VARCHAR(10),    -- new, used
  
  -- Pricing (EUR converted)
  price_eur DECIMAL(10,2) NOT NULL,
  shipping_eur DECIMAL(10,2) DEFAULT 0,
  import_charges_eur DECIMAL(10,2) DEFAULT 0,
  total_eur DECIMAL(10,2) NOT NULL,
  
  -- Original currency (for non-EUR markets)
  currency_original VARCHAR(3) DEFAULT 'EUR',
  price_original DECIMAL(10,2),
  
  -- Seller info
  seller_country CHAR(2),
  seller_username VARCHAR(100),
  seller_rating DECIMAL(5,2),
  seller_feedback INT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  
  -- One deal per set/source/marketplace/condition
  UNIQUE(set_number, source, marketplace, condition)
);

CREATE INDEX IF NOT EXISTS idx_current_deals_set ON set_current_deals(set_number);
CREATE INDEX IF NOT EXISTS idx_current_deals_expires ON set_current_deals(expires_at);
CREATE INDEX IF NOT EXISTS idx_current_deals_total ON set_current_deals(set_number, total_eur);

-- ============================================
-- PRICE HISTORY (daily snapshots from our scans)
-- Aggregated once per day at 00:05 UTC
-- ============================================
CREATE TABLE IF NOT EXISTS set_price_history (
  id SERIAL PRIMARY KEY,
  set_number VARCHAR(20) NOT NULL REFERENCES sets(set_number) ON DELETE CASCADE,
  
  condition VARCHAR(10) NOT NULL,           -- new, used
  source VARCHAR(20) NOT NULL DEFAULT 'ebay',
  region VARCHAR(20) NOT NULL DEFAULT 'all', -- 'all' for global, or specific country
  
  -- Daily stats (from our scans)
  min_price_eur DECIMAL(10,2),
  avg_price_eur DECIMAL(10,2),
  max_price_eur DECIMAL(10,2),
  listing_count INT DEFAULT 0,
  
  recorded_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One row per set/condition/source/region/day
  UNIQUE(set_number, condition, source, region, recorded_date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_lookup 
  ON set_price_history(set_number, recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_date 
  ON set_price_history(recorded_date);

-- ============================================
-- PAGE VIEWS (for popularity tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS set_page_views (
  id SERIAL PRIMARY KEY,
  set_number VARCHAR(20) NOT NULL REFERENCES sets(set_number) ON DELETE CASCADE,
  view_date DATE NOT NULL DEFAULT CURRENT_DATE,
  view_count INT DEFAULT 1,
  
  UNIQUE(set_number, view_date)
);

CREATE INDEX IF NOT EXISTS idx_page_views_set ON set_page_views(set_number);
CREATE INDEX IF NOT EXISTS idx_page_views_date ON set_page_views(view_date);

-- ============================================
-- ADD scan_always FLAG TO SETS TABLE
-- For bootstrapping popular sets
-- ============================================
ALTER TABLE sets ADD COLUMN IF NOT EXISTS scan_always BOOLEAN DEFAULT FALSE;

-- ============================================
-- OPTIONAL: Seed popular sets for always-scan
-- Uncomment to enable faster data collection
-- ============================================
/*
UPDATE sets SET scan_always = TRUE WHERE set_number IN (
  -- UCS Star Wars
  '75192', '75252', '75290', '75309', '75313', '75331', '75341',
  -- Icons/Creator Expert  
  '10294', '10297', '10302', '10305', '10307', '10312', '10316',
  -- Technic flagships
  '42143', '42145', '42151', '42155',
  -- Other popular
  '10300', '10303', '21330', '76240', '76391'
);
*/

COMMIT;

-- Verify tables created
SELECT 'Migration 0002_set_pages.sql completed successfully' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('set_current_deals', 'set_price_history', 'set_page_views')
ORDER BY table_name;
