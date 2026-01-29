-- ============================================
-- ScoutLoot Database Migration V24
-- BrickOwl Integration + Minifigure Support
-- ============================================
-- Run with: PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -f migration_v24.sql

-- ============================================
-- 1. MINIFIGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS minifigs (
  minifig_id VARCHAR(50) PRIMARY KEY,
  name TEXT,
  num_parts INTEGER,
  image_url TEXT,
  rebrickable_url TEXT,
  set_numbers TEXT[],              -- Sets this minifig appears in
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for name search
CREATE INDEX IF NOT EXISTS idx_minifigs_name ON minifigs USING gin(to_tsvector('english', COALESCE(name, '')));

-- Index for set lookup
CREATE INDEX IF NOT EXISTS idx_minifigs_set_numbers ON minifigs USING gin(set_numbers);

COMMENT ON TABLE minifigs IS 'LEGO minifigure catalog from Rebrickable';
COMMENT ON COLUMN minifigs.minifig_id IS 'Minifig ID (e.g., sw0001 for Star Wars)';
COMMENT ON COLUMN minifigs.set_numbers IS 'Array of set numbers this minifig appears in';

-- ============================================
-- 2. BRICKOWL BOIDS CACHE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS brickowl_boids (
  item_type VARCHAR(10) NOT NULL,  -- 'set' or 'minifig'
  item_id VARCHAR(50) NOT NULL,    -- set_number or minifig_id
  boid VARCHAR(20) NOT NULL,       -- BrickOwl item ID
  name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_brickowl_boids_boid ON brickowl_boids(boid);
CREATE INDEX IF NOT EXISTS idx_brickowl_boids_updated ON brickowl_boids(updated_at);

COMMENT ON TABLE brickowl_boids IS 'Cache of BrickOwl BOID mappings to avoid repeated API calls';
COMMENT ON COLUMN brickowl_boids.boid IS 'BrickOwl unique item identifier';

-- ============================================
-- 3. ADD item_type AND item_id TO WATCHES
-- ============================================

-- Add new columns
ALTER TABLE watches 
ADD COLUMN IF NOT EXISTS item_type VARCHAR(10) DEFAULT 'set';

ALTER TABLE watches 
ADD COLUMN IF NOT EXISTS item_id VARCHAR(50);

-- Migrate existing data: copy set_number to item_id
UPDATE watches 
SET item_id = set_number 
WHERE item_id IS NULL AND set_number IS NOT NULL;

-- Add BrickOwl toggle
ALTER TABLE watches 
ADD COLUMN IF NOT EXISTS enable_brickowl_alerts BOOLEAN DEFAULT true;

-- Add constraint after migration
ALTER TABLE watches 
ALTER COLUMN item_type SET NOT NULL;

-- Add check constraint for item_type
ALTER TABLE watches 
DROP CONSTRAINT IF EXISTS watches_item_type_check;

ALTER TABLE watches 
ADD CONSTRAINT watches_item_type_check CHECK (item_type IN ('set', 'minifig'));

-- Create index for item lookups
CREATE INDEX IF NOT EXISTS idx_watches_item ON watches(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_watches_item_id ON watches(item_id);

COMMENT ON COLUMN watches.item_type IS 'Type of item being watched: set or minifig';
COMMENT ON COLUMN watches.item_id IS 'Item identifier: set_number for sets, minifig_id for minifigs';
COMMENT ON COLUMN watches.enable_brickowl_alerts IS 'Whether to include BrickOwl listings for this watch';

-- ============================================
-- 4. ADD platform TO LISTINGS (if not exists)
-- ============================================

ALTER TABLE listings
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'ebay';

ALTER TABLE listings
DROP CONSTRAINT IF EXISTS listings_platform_check;

ALTER TABLE listings
ADD CONSTRAINT listings_platform_check CHECK (platform IN ('ebay', 'brickowl'));

CREATE INDEX IF NOT EXISTS idx_listings_platform ON listings(platform);

-- ============================================
-- 5. ADD platform TO ALERT_HISTORY (if not exists)
-- ============================================

ALTER TABLE alert_history
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'ebay';

-- ============================================
-- 6. CREATE UNIQUE INDEX FOR WATCHES
-- (prevent duplicate watches for same user + item)
-- ============================================

DROP INDEX IF EXISTS idx_watches_user_item_unique;

CREATE UNIQUE INDEX idx_watches_user_item_unique 
ON watches(user_id, item_type, item_id) 
WHERE status = 'active';

-- ============================================
-- 7. UPDATE NOTIFICATION STATE TABLE
-- (ensure it works with new structure)
-- ============================================

-- No changes needed - watch_id is the key

-- ============================================
-- 8. CREATE MINIFIG CURRENT DEALS TABLE
-- (similar to set_current_deals)
-- ============================================

CREATE TABLE IF NOT EXISTS minifig_current_deals (
  id SERIAL PRIMARY KEY,
  minifig_id VARCHAR(50) NOT NULL,
  condition VARCHAR(10) NOT NULL,
  source VARCHAR(20) NOT NULL,           -- 'ebay' or 'brickowl'
  marketplace VARCHAR(20),
  listing_id VARCHAR(100),
  total_eur DECIMAL(10,2) NOT NULL,
  price_eur DECIMAL(10,2) NOT NULL,
  shipping_eur DECIMAL(10,2) DEFAULT 0,
  import_charges_eur DECIMAL(10,2) DEFAULT 0,
  seller_country VARCHAR(5),
  seller_username TEXT,
  seller_rating DECIMAL(5,2),
  listing_url TEXT NOT NULL,
  image_url TEXT,
  title TEXT,
  ship_to_country VARCHAR(5) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT minifig_current_deals_condition_check CHECK (condition IN ('new', 'used')),
  CONSTRAINT minifig_current_deals_source_check CHECK (source IN ('ebay', 'brickowl'))
);

-- Composite index for lookups
CREATE INDEX IF NOT EXISTS idx_minifig_current_deals_lookup 
ON minifig_current_deals(minifig_id, ship_to_country, condition);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_minifig_current_deals_updated 
ON minifig_current_deals(updated_at);

-- Unique constraint: one best deal per minifig + country + condition + source
CREATE UNIQUE INDEX IF NOT EXISTS idx_minifig_current_deals_unique
ON minifig_current_deals(minifig_id, ship_to_country, condition, source);

COMMENT ON TABLE minifig_current_deals IS 'Best current deals for minifig pages, updated by scanner';

-- ============================================
-- 9. CREATE MINIFIG PRICE HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS minifig_price_history (
  id SERIAL PRIMARY KEY,
  minifig_id VARCHAR(50) NOT NULL,
  condition VARCHAR(10) NOT NULL,
  min_price_eur DECIMAL(10,2),
  avg_price_eur DECIMAL(10,2),
  max_price_eur DECIMAL(10,2),
  listing_count INTEGER DEFAULT 0,
  ship_to_country VARCHAR(5) NOT NULL,
  recorded_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT minifig_price_history_condition_check CHECK (condition IN ('new', 'used'))
);

-- Composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_minifig_price_history_unique
ON minifig_price_history(minifig_id, ship_to_country, condition, recorded_date);

-- Index for queries
CREATE INDEX IF NOT EXISTS idx_minifig_price_history_lookup
ON minifig_price_history(minifig_id, ship_to_country, recorded_date DESC);

COMMENT ON TABLE minifig_price_history IS 'Daily price snapshots for minifig price charts';

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================

GRANT ALL PRIVILEGES ON TABLE minifigs TO lego_radar;
GRANT ALL PRIVILEGES ON TABLE brickowl_boids TO lego_radar;
GRANT ALL PRIVILEGES ON TABLE minifig_current_deals TO lego_radar;
GRANT ALL PRIVILEGES ON TABLE minifig_price_history TO lego_radar;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lego_radar;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check table structure
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('minifigs', 'brickowl_boids', 'watches', 'minifig_current_deals')
ORDER BY table_name, ordinal_position;

-- Check indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE tablename IN ('minifigs', 'brickowl_boids', 'watches', 'minifig_current_deals')
ORDER BY tablename, indexname;

-- Count watches by type
SELECT item_type, COUNT(*) 
FROM watches 
GROUP BY item_type;

-- ============================================
-- DONE!
-- ============================================

SELECT '✅ Migration V24 completed successfully!' as status;
