/**
 * BrickOwl API Types
 * 
 * TypeScript interfaces for BrickOwl API responses
 */

// ============================================
// CATALOG SEARCH TYPES
// ============================================

export interface BrickOwlSearchResult {
  boid: string;
  type: 'Set' | 'Part' | 'Minifigure' | 'Gear';
  name: string;
  permalink: string;
}

export interface BrickOwlSearchResponse {
  results: BrickOwlSearchResult[];
  total_available: string;
}

// ============================================
// CATALOG LOOKUP TYPES
// ============================================

export interface BrickOwlCatalogId {
  id: string;
  type: 'set_number' | 'item_no' | 'upc' | 'ean' | 'design_id' | 'fig_num';
}

export interface BrickOwlImage {
  small: string;
  medium: string;
  large: string;
}

export interface BrickOwlCatalogItem {
  boid: string;
  type: 'Set' | 'Part' | 'Minifigure' | 'Gear';
  ids: BrickOwlCatalogId[];
  name: string;
  url: string;
  permalink: string;
  cheapest_gbp?: string;
  cheapest_eur?: string;
  cheapest_usd?: string;
  cat_name_path: string;
  images?: BrickOwlImage[];
  year_released?: string;
  dimensions?: string;
  weight?: string;
}

// ============================================
// CATALOG AVAILABILITY TYPES
// ============================================

export interface BrickOwlListing {
  lot_id: string;
  con: 'new' | 'used';
  price: string;
  qty: string;
  bulk_qty: string;
  url: string;
  updated: string;
  created: string;
  type: string;
  set_number?: string;   // Present for sets
  fig_num?: string;      // Present for minifigures
  boid: string;
  store_id: string;
  store_name: string;    // May contain HTML entities
  base_currency: string;
  country: string;
  store_url: string;
  feedback_count: string;
  minimum_order: string;
  minimum_lot_average: string;
  open: boolean;
  square_logo_24?: string | null;
  square_logo_16?: string | null;
}

// Response is object with lot_id as keys
export interface BrickOwlAvailabilityResponse {
  [lot_id: string]: BrickOwlListing;
}

// ============================================
// NORMALIZED LISTING (for ScoutLoot)
// ============================================

export interface BrickOwlNormalizedListing {
  platform: 'brickowl';
  id: string;                           // lot_id
  scanned_for_country: string;
  item_type: 'set' | 'minifig';
  item_id: string;                  // set_number or fig_num
  title: string;
  title_normalized: string;
  url: string;
  image_url: string | null;
  listing_fingerprint: string;
  price_original: number;
  shipping_original: number;
  currency_original: string;
  price_eur: number;
  shipping_eur: number;
  shipping_estimated: boolean;
  import_charges_eur: number;
  import_charges_estimated: boolean;
  total_eur: number;
  seller_id: string;
  seller_username: string;
  seller_rating: number | null;         // BrickOwl doesn't provide percentage rating
  seller_feedback: number | null;
  ship_from_country: string;
  condition: string;
  condition_normalized: 'new' | 'used';
  photo_count: number;
  returns_accepted: boolean;
  listing_type: 'fixed_price';
  fetched_at: Date;
  is_active: boolean;
}

// ============================================
// SHIPPING ESTIMATION TYPES
// ============================================

export interface ShippingEstimate {
  amount: number;
  currency: string;
  isEstimate: boolean;
}

export interface ImportChargeResult {
  amount: number;
  isEstimate: boolean;
}

// ============================================
// BOID CACHE TYPES
// ============================================

export interface BoidCacheEntry {
  item_id: string;
  item_type: 'set' | 'minifig';
  boid: string;
  name: string | null;
  updated_at: Date;
}

// ============================================
// REGIONAL TYPES
// ============================================

export type RegionalBlock = 'eu_uk' | 'north_america';

export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
] as const;

export const EU_UK_COUNTRIES = [...EU_COUNTRIES, 'GB', 'UK'] as const;
export const NORTH_AMERICA_COUNTRIES = ['US', 'CA'] as const;
