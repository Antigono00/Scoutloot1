-- ============================================
-- V30 Migration: Regional Price History & Native Currency
-- Run: PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -f v30_regional_prices.sql
-- ============================================

BEGIN;

-- ============================================
-- 1. ADD COLUMNS TO set_price_history
-- ============================================

-- Add currency column
ALTER TABLE set_price_history 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';

-- Add native price columns (in original currency, not EUR)
ALTER TABLE set_price_history 
ADD COLUMN IF NOT EXISTS min_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS avg_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS max_price NUMERIC(10,2);

-- Migrate existing EUR data to native columns
UPDATE set_price_history 
SET 
  currency = 'EUR',
  min_price = min_price_eur,
  avg_price = avg_price_eur,
  max_price = max_price_eur
WHERE min_price IS NULL;

-- Add index for region queries
CREATE INDEX IF NOT EXISTS idx_price_history_region 
  ON set_price_history(set_number, region, recorded_date DESC);

-- ============================================
-- 2. ADD COLUMNS TO minifig_price_history
-- ============================================

-- Add currency column
ALTER TABLE minifig_price_history 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR';

-- Add native price columns
ALTER TABLE minifig_price_history 
ADD COLUMN IF NOT EXISTS min_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS avg_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS max_price NUMERIC(10,2);

-- Migrate existing EUR data to native columns
UPDATE minifig_price_history 
SET 
  currency = 'EUR',
  min_price = min_price_eur,
  avg_price = avg_price_eur,
  max_price = max_price_eur
WHERE min_price IS NULL;

-- Add index for region queries
CREATE INDEX IF NOT EXISTS idx_minifig_history_region 
  ON minifig_price_history(minifig_id, ship_to_country, recorded_date DESC);

-- ============================================
-- 3. ADD shipping_original TO set_current_deals (if missing)
-- ============================================

ALTER TABLE set_current_deals 
ADD COLUMN IF NOT EXISTS shipping_original NUMERIC(10,2);

-- ============================================
-- VERIFY MIGRATION
-- ============================================

COMMIT;

-- Report on the migration
SELECT 'V30 Migration completed successfully' as status;

SELECT 
  'set_price_history' as table_name,
  COUNT(*) as total_rows,
  COUNT(currency) as with_currency,
  COUNT(min_price) as with_native_price
FROM set_price_history;

SELECT 
  'minifig_price_history' as table_name,
  COUNT(*) as total_rows,
  COUNT(currency) as with_currency,
  COUNT(min_price) as with_native_price
FROM minifig_price_history;

SELECT 
  column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'set_price_history' 
  AND column_name IN ('currency', 'min_price', 'avg_price', 'max_price')
ORDER BY column_name;

SELECT 
  column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'minifig_price_history' 
  AND column_name IN ('currency', 'min_price', 'avg_price', 'max_price')
ORDER BY column_name;
