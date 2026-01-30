/**
 * Minifig Current Deals Service
 * 
 * Manages the minifig_current_deals table which stores the best current deals
 * for minifigures. Similar to set_current_deals but for minifigs.
 * 
 * V27: New service for minifig detail pages.
 * Handles both BrickLink IDs (sw0001) and Rebrickable IDs (fig-003509).
 */

import { query } from '../db/index.js';
import { NormalizedListing } from '../providers/ebay/types.js';
import { getMarketplaceForCountry } from '../providers/ebay/client.js';

// ============================================
// ID RESOLUTION HELPER
// ============================================

/**
 * Resolve a minifig ID to the canonical minifig_id used in the database.
 * Handles both BrickLink format (sw0001) and Rebrickable format (fig-003509).
 * Returns the input if no mapping is found.
 */
async function resolveMinifigId(inputId: string): Promise<string> {
  const normalizedInput = inputId.toLowerCase();
  
  // Check if this ID exists in minifigs table (either as minifig_id or bricklink_id)
  const result = await query<{ minifig_id: string }>(`
    SELECT minifig_id 
    FROM minifigs 
    WHERE minifig_id = $1 OR bricklink_id = $1
    LIMIT 1
  `, [normalizedInput]);
  
  if (result.rows.length > 0) {
    return result.rows[0].minifig_id;
  }
  
  // No mapping found, return the input as-is
  return normalizedInput;
}

// ============================================
// TYPES
// ============================================

export interface MinifigDeal {
  id?: number;
  minifig_id: string;
  listing_id: string;
  source: string;           // 'ebay' or 'brickowl'
  marketplace?: string;     // 'ebay.de', 'ebay.com', 'brickowl'
  condition: string;        // 'new' or 'used'
  title: string;
  price_eur: number;
  shipping_eur: number;
  import_charges_eur: number;
  total_eur: number;
  currency: string;
  seller_username?: string;
  seller_country?: string;
  seller_rating?: number;
  listing_url: string;
  image_url?: string;
  ship_to_country?: string;
  expires_at: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface MinifigDealsResult {
  new: MinifigDeal[];
  used: MinifigDeal[];
}

// ============================================
// SCANNER INTEGRATION - UPDATE CURRENT DEALS
// ============================================

/**
 * Update current best deals for a minifig after a scan.
 * Called by scanner.ts processMinifigWatchMatches().
 * 
 * This is the minifig equivalent of updateSetCurrentDeals().
 * 
 * @param minifigId - The minifig ID (can be BrickLink or Rebrickable format)
 * @param listings - Normalized listings from scanner
 * @param shipToCountry - Target country code
 */
export async function updateMinifigCurrentDeals(
  minifigId: string,
  listings: NormalizedListing[],
  shipToCountry: string
): Promise<void> {
  if (listings.length === 0) return;

  // Resolve to canonical minifig_id for consistent storage
  const canonicalId = await resolveMinifigId(minifigId);
  const marketplace = getMarketplaceForCountry(shipToCountry);
  
  // Separate by condition
  const newListings = listings.filter(l => 
    l.condition_normalized === 'new' || l.condition?.toLowerCase().includes('new')
  );
  const usedListings = listings.filter(l => 
    l.condition_normalized === 'used' || 
    (l.condition?.toLowerCase().includes('used') || l.condition?.toLowerCase().includes('pre-owned'))
  );

  // Sort by total price and get best deal for each condition
  const bestNew = newListings.sort((a, b) => a.total_eur - b.total_eur)[0];
  const bestUsed = usedListings.sort((a, b) => a.total_eur - b.total_eur)[0];

  // Upsert best new deal
  if (bestNew) {
    await upsertMinifigCurrentDeal(canonicalId, bestNew, shipToCountry, marketplace, 'new');
  }

  // Upsert best used deal
  if (bestUsed) {
    await upsertMinifigCurrentDeal(canonicalId, bestUsed, shipToCountry, marketplace, 'used');
  }

  console.log(`[MinifigCurrentDeals] Updated deals for ${canonicalId}/${shipToCountry}: new=${bestNew ? '€' + bestNew.total_eur : 'none'}, used=${bestUsed ? '€' + bestUsed.total_eur : 'none'}`);
}

/**
 * Internal helper to upsert a single current deal from scanner
 */
async function upsertMinifigCurrentDeal(
  minifigId: string,
  listing: NormalizedListing,
  shipToCountry: string,
  marketplace: string,
  condition: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
  
  await query(`
    INSERT INTO minifig_current_deals (
      minifig_id, listing_id, source, marketplace, condition, title,
      price_eur, shipping_eur, import_charges_eur, total_eur, currency,
      seller_username, seller_country, seller_rating, listing_url, image_url,
      ship_to_country, expires_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
    )
    ON CONFLICT (minifig_id, ship_to_country, condition, source) 
    DO UPDATE SET
      listing_id = EXCLUDED.listing_id,
      marketplace = EXCLUDED.marketplace,
      title = EXCLUDED.title,
      price_eur = EXCLUDED.price_eur,
      shipping_eur = EXCLUDED.shipping_eur,
      import_charges_eur = EXCLUDED.import_charges_eur,
      total_eur = EXCLUDED.total_eur,
      currency = EXCLUDED.currency,
      seller_username = EXCLUDED.seller_username,
      seller_country = EXCLUDED.seller_country,
      seller_rating = EXCLUDED.seller_rating,
      listing_url = EXCLUDED.listing_url,
      image_url = EXCLUDED.image_url,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `, [
    minifigId,
    listing.id,
    listing.platform || 'ebay',
    marketplace,
    condition,
    listing.title,
    listing.price_eur,
    listing.shipping_eur || 0,
    listing.import_charges_eur || 0,
    listing.total_eur,
    listing.currency_original || 'EUR',
    listing.seller_username,
    listing.ship_from_country,
    listing.seller_rating,
    listing.url,
    listing.image_url,
    shipToCountry,
    expiresAt,
  ]);
}

// ============================================
// UPSERT FUNCTIONS (for direct use)
// ============================================

/**
 * Upsert a minifig deal into minifig_current_deals
 * Updates if same listing exists, inserts if new
 */
export async function upsertMinifigDeal(deal: MinifigDeal): Promise<void> {
  // Resolve to canonical ID
  const canonicalId = await resolveMinifigId(deal.minifig_id);
  
  await query(`
    INSERT INTO minifig_current_deals (
      minifig_id, listing_id, source, marketplace, condition, title,
      price_eur, shipping_eur, import_charges_eur, total_eur, currency,
      seller_username, seller_country, seller_rating, listing_url, image_url,
      ship_to_country, expires_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
    )
    ON CONFLICT (minifig_id, ship_to_country, condition, source) 
    DO UPDATE SET
      listing_id = EXCLUDED.listing_id,
      marketplace = EXCLUDED.marketplace,
      title = EXCLUDED.title,
      price_eur = EXCLUDED.price_eur,
      shipping_eur = EXCLUDED.shipping_eur,
      import_charges_eur = EXCLUDED.import_charges_eur,
      total_eur = EXCLUDED.total_eur,
      currency = EXCLUDED.currency,
      seller_username = EXCLUDED.seller_username,
      seller_country = EXCLUDED.seller_country,
      seller_rating = EXCLUDED.seller_rating,
      listing_url = EXCLUDED.listing_url,
      image_url = EXCLUDED.image_url,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `, [
    canonicalId,
    deal.listing_id,
    deal.source,
    deal.marketplace,
    deal.condition,
    deal.title,
    deal.price_eur,
    deal.shipping_eur,
    deal.import_charges_eur,
    deal.total_eur,
    deal.currency,
    deal.seller_username,
    deal.seller_country,
    deal.seller_rating,
    deal.listing_url,
    deal.image_url,
    deal.ship_to_country,
    deal.expires_at,
  ]);
}

/**
 * Bulk upsert minifig deals
 */
export async function upsertMinifigDeals(deals: MinifigDeal[]): Promise<number> {
  let count = 0;
  for (const deal of deals) {
    try {
      await upsertMinifigDeal(deal);
      count++;
    } catch (error) {
      console.error(`[MinifigDeals] Error upserting deal ${deal.listing_id}:`, error);
    }
  }
  return count;
}

// ============================================
// QUERY FUNCTIONS
// ============================================

/**
 * Get current deals for a minifig, separated by condition
 * Handles both BrickLink and Rebrickable ID formats.
 */
export async function getMinifigDeals(
  minifigId: string,
  limit: number = 10
): Promise<MinifigDealsResult> {
  // Resolve to canonical ID
  const resolvedId = await resolveMinifigId(minifigId);
  
  const result = await query<MinifigDeal>(`
    SELECT 
      id, minifig_id, listing_id, source, marketplace, condition, title,
      price_eur, shipping_eur, import_charges_eur, total_eur, currency,
      seller_username, seller_country, seller_rating, listing_url, image_url,
      ship_to_country, expires_at, updated_at
    FROM minifig_current_deals
    WHERE minifig_id = $1
      AND expires_at > NOW()
    ORDER BY total_eur ASC
    LIMIT $2
  `, [resolvedId, limit * 2]);  // Get extra to split by condition

  const newDeals: MinifigDeal[] = [];
  const usedDeals: MinifigDeal[] = [];

  for (const deal of result.rows) {
    if (deal.condition === 'new' && newDeals.length < limit) {
      newDeals.push(deal);
    } else if (deal.condition === 'used' && usedDeals.length < limit) {
      usedDeals.push(deal);
    }
  }

  return { new: newDeals, used: usedDeals };
}

/**
 * Get best deal for a minifig (lowest total price)
 * Handles both BrickLink and Rebrickable ID formats.
 */
export async function getBestMinifigDeal(
  minifigId: string,
  condition?: string
): Promise<MinifigDeal | null> {
  // Resolve to canonical ID
  const resolvedId = await resolveMinifigId(minifigId);
  
  let whereClause = 'WHERE minifig_id = $1 AND expires_at > NOW()';
  const params: (string | number)[] = [resolvedId];
  
  if (condition && condition !== 'any') {
    whereClause += ' AND condition = $2';
    params.push(condition);
  }
  
  const result = await query<MinifigDeal>(`
    SELECT 
      id, minifig_id, listing_id, source, marketplace, condition, title,
      price_eur, shipping_eur, import_charges_eur, total_eur, currency,
      seller_username, seller_country, seller_rating, listing_url, image_url,
      ship_to_country, expires_at, updated_at
    FROM minifig_current_deals
    ${whereClause}
    ORDER BY total_eur ASC
    LIMIT 1
  `, params);

  return result.rows[0] || null;
}

/**
 * Get count of active watchers for a minifig
 * Used for detail page display
 */
export async function getMinifigWatcherCount(minifigId: string): Promise<number> {
  // Resolve ID to check both formats
  const resolvedId = await resolveMinifigId(minifigId);
  const normalizedInput = minifigId.toLowerCase();
  
  const result = await query<{ count: string }>(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM watches
    WHERE item_type = 'minifig'
      AND (item_id = $1 OR item_id = $2)
      AND status = 'active'
  `, [resolvedId, normalizedInput]);

  return parseInt(result.rows[0]?.count || '0', 10);
}

/**
 * Track page view for a minifig
 * Updates page_views counter and last_viewed_at timestamp
 */
export async function trackMinifigPageView(minifigId: string): Promise<void> {
  // Resolve to canonical ID
  const resolvedId = await resolveMinifigId(minifigId);
  
  await query(`
    UPDATE minifigs 
    SET page_views = COALESCE(page_views, 0) + 1,
        last_viewed_at = NOW()
    WHERE minifig_id = $1
  `, [resolvedId]);
}

/**
 * Clean up expired deals
 * Should be called periodically (e.g., daily)
 */
export async function cleanupExpiredMinifigDeals(): Promise<number> {
  const result = await query(`
    DELETE FROM minifig_current_deals
    WHERE expires_at < NOW()
    RETURNING id
  `);
  
  const count = result.rowCount || 0;
  if (count > 0) {
    console.log(`[MinifigDeals] Cleaned up ${count} expired deals`);
  }
  
  return count;
}

/**
 * Get deals count by source (for stats)
 */
export async function getMinifigDealsStats(): Promise<{
  total: number;
  bySource: { ebay: number; brickowl: number };
  byCondition: { new: number; used: number };
}> {
  const result = await query<{
    total: string;
    ebay_count: string;
    brickowl_count: string;
    new_count: string;
    used_count: string;
  }>(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN source = 'ebay' THEN 1 END) as ebay_count,
      COUNT(CASE WHEN source = 'brickowl' THEN 1 END) as brickowl_count,
      COUNT(CASE WHEN condition = 'new' THEN 1 END) as new_count,
      COUNT(CASE WHEN condition = 'used' THEN 1 END) as used_count
    FROM minifig_current_deals
    WHERE expires_at > NOW()
  `);

  const row = result.rows[0];
  return {
    total: parseInt(row?.total || '0'),
    bySource: {
      ebay: parseInt(row?.ebay_count || '0'),
      brickowl: parseInt(row?.brickowl_count || '0'),
    },
    byCondition: {
      new: parseInt(row?.new_count || '0'),
      used: parseInt(row?.used_count || '0'),
    },
  };
}
