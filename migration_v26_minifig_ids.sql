-- ============================================
-- ScoutLoot V26: Minifigure ID Mapping
-- ============================================
-- This migration adds proper ID mapping for minifigures:
-- - bricklink_id: The collector-standard code (sw0010, sh0001)
-- - brickowl_boid: BrickOwl's internal ID for API calls
-- 
-- The minifig_id column remains as Rebrickable format (fig-003509)
-- for backward compatibility
-- ============================================

-- Add new columns for ID mapping
ALTER TABLE minifigs ADD COLUMN IF NOT EXISTS bricklink_id VARCHAR(20);
ALTER TABLE minifigs ADD COLUMN IF NOT EXISTS brickowl_boid VARCHAR(20);

-- Create indexes for fast lookups by any ID type
CREATE INDEX IF NOT EXISTS idx_minifigs_bricklink ON minifigs(bricklink_id);
CREATE INDEX IF NOT EXISTS idx_minifigs_boid ON minifigs(brickowl_boid);

-- For any existing records where minifig_id looks like a Bricklink code
-- (pattern: 2-4 letters followed by numbers, e.g., sw0010, sh0001, hp0001)
-- Copy it to bricklink_id column
UPDATE minifigs 
SET bricklink_id = minifig_id 
WHERE minifig_id ~ '^[a-z]{2,4}[0-9]+[a-z]?$' 
  AND bricklink_id IS NULL;

-- Add comment to document the ID formats
COMMENT ON COLUMN minifigs.minifig_id IS 'Primary key - Rebrickable format (fig-003509) or Bricklink code if Rebrickable unknown';
COMMENT ON COLUMN minifigs.bricklink_id IS 'Bricklink/BrickSet code (sw0010, sh0001) - used for eBay searches';
COMMENT ON COLUMN minifigs.brickowl_boid IS 'BrickOwl internal ID (547141) - used for BrickOwl API calls';

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE 'Migration V26 complete. Columns added: bricklink_id, brickowl_boid';
  RAISE NOTICE 'Existing records with Bricklink-style IDs have been mapped.';
END $$;
