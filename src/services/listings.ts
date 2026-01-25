import { query } from '../db/index.js';
import { NormalizedListing } from '../providers/ebay/types.js';
import { ensureSetExists } from './sets.js';

export interface Listing {
  platform: string;
  id: string;
  scanned_for_country: string;
  scanned_for_postal: string | null;
  set_number: string;
  title: string;
  title_normalized: string | null;
  url: string;
  image_url: string | null;
  listing_fingerprint: string | null;
  price_original: number;
  shipping_original: number;
  currency_original: string;
  price_eur: number;
  shipping_eur: number;
  import_charges_eur: number;
  import_charges_estimated: boolean;
  total_eur: number;
  seller_id: string | null;
  seller_username: string | null;
  seller_rating: number | null;
  seller_feedback: number | null;
  ship_from_country: string | null;
  condition: string | null;
  condition_normalized: string | null;
  photo_count: number;
  returns_accepted: boolean;
  listing_type: string;
  fetched_at: Date;
  is_active: boolean;
}

export async function upsertListing(listing: NormalizedListing): Promise<void> {
  await ensureSetExists(listing.set_number);

  await query(
    `INSERT INTO listings (
       platform, id, scanned_for_country, set_number,
       title, title_normalized, url, image_url, listing_fingerprint,
       price_original, shipping_original, currency_original,
       price_eur, shipping_eur, import_charges_eur, import_charges_estimated,
       seller_id, seller_username, seller_rating, seller_feedback,
       ship_from_country, condition, condition_normalized,
       photo_count, returns_accepted, listing_type, fetched_at, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
     ON CONFLICT (platform, id, scanned_for_country) DO UPDATE SET
       title = EXCLUDED.title,
       title_normalized = EXCLUDED.title_normalized,
       url = EXCLUDED.url,
       image_url = EXCLUDED.image_url,
       listing_fingerprint = EXCLUDED.listing_fingerprint,
       price_original = EXCLUDED.price_original,
       shipping_original = EXCLUDED.shipping_original,
       currency_original = EXCLUDED.currency_original,
       price_eur = EXCLUDED.price_eur,
       shipping_eur = EXCLUDED.shipping_eur,
       import_charges_eur = EXCLUDED.import_charges_eur,
       import_charges_estimated = EXCLUDED.import_charges_estimated,
       seller_id = EXCLUDED.seller_id,
       seller_username = EXCLUDED.seller_username,
       seller_rating = EXCLUDED.seller_rating,
       seller_feedback = EXCLUDED.seller_feedback,
       ship_from_country = EXCLUDED.ship_from_country,
       condition = EXCLUDED.condition,
       condition_normalized = EXCLUDED.condition_normalized,
       photo_count = EXCLUDED.photo_count,
       returns_accepted = EXCLUDED.returns_accepted,
       fetched_at = EXCLUDED.fetched_at,
       is_active = EXCLUDED.is_active`,
    [
      listing.platform,
      listing.id,
      listing.scanned_for_country,
      listing.set_number,
      listing.title,
      listing.title_normalized,
      listing.url,
      listing.image_url,
      listing.listing_fingerprint,
      listing.price_original,
      listing.shipping_original,
      listing.currency_original,
      listing.price_eur,
      listing.shipping_eur,
      listing.import_charges_eur,
      listing.import_charges_estimated,
      listing.seller_id,
      listing.seller_username,
      listing.seller_rating,
      listing.seller_feedback,
      listing.ship_from_country,
      listing.condition,
      listing.condition_normalized,
      listing.photo_count,
      listing.returns_accepted,
      listing.listing_type,
      listing.fetched_at,
      listing.is_active,
    ]
  );
}

export async function upsertListings(listings: NormalizedListing[]): Promise<number> {
  let count = 0;
  for (const listing of listings) {
    await upsertListing(listing);
    count++;
  }
  return count;
}

export async function markListingsInactive(
  setNumber: string,
  scannedForCountry: string,
  activeIds: string[],
  platform = 'ebay'
): Promise<number> {
  if (activeIds.length === 0) {
    const result = await query(
      `UPDATE listings SET is_active = FALSE 
       WHERE set_number = $1 
         AND scanned_for_country = $2 
         AND platform = $3
         AND is_active = TRUE`,
      [setNumber, scannedForCountry, platform]
    );
    return result.rowCount ?? 0;
  }

  const result = await query(
    `UPDATE listings SET is_active = FALSE 
     WHERE set_number = $1 
       AND scanned_for_country = $2 
       AND platform = $3
       AND is_active = TRUE
       AND id != ALL($4)`,
    [setNumber, scannedForCountry, platform, activeIds]
  );
  return result.rowCount ?? 0;
}

/**
 * Get active listings for a set in a specific country
 */
export async function getActiveListings(
  setNumber: string,
  scannedForCountry: string,
  platform = 'ebay'
): Promise<Listing[]> {
  const result = await query<Listing>(
    `SELECT * FROM listings 
     WHERE set_number = $1 
       AND scanned_for_country = $2 
       AND platform = $3
       AND is_active = TRUE
     ORDER BY total_eur ASC`,
    [setNumber, scannedForCountry, platform]
  );
  return result.rows;
}

/**
 * Get listing by ID
 */
export async function getListingById(
  platform: string,
  id: string,
  scannedForCountry: string
): Promise<Listing | null> {
  const result = await query<Listing>(
    `SELECT * FROM listings 
     WHERE platform = $1 
       AND id = $2 
       AND scanned_for_country = $3`,
    [platform, id, scannedForCountry]
  );
  return result.rows[0] ?? null;
}
