/**
 * BrickOwl Provider
 * 
 * Second marketplace integration for ScoutLoot.
 * Provides access to BrickOwl's catalog of LEGO sets and minifigures.
 */

// ============================================
// TYPES
// ============================================
export * from './types.js';

// ============================================
// CLIENT
// ============================================
export {
  searchBrickOwl,
  lookupBrickOwl,
  getAvailability,
  findBoidForSet,
  findBoidForMinifig,
  scanBrickOwlForSet,
  scanBrickOwlForMinifig,
  decodeHtmlEntities,
  isBrickOwlConfigured,
} from './client.js';

// ============================================
// SHIPPING
// ============================================
export {
  estimateSetShipping,
  estimateMinifigShipping,
  calculateImportCharges,
  filterByRegionalBlock,
  isEuCountry,
  isEuUkCountry,
  isNorthAmericaCountry,
  getRegionalBlock,
  convertToEur,
  CURRENCY_TO_EUR,
} from './shipping.js';

// ============================================
// NORMALIZER
// ============================================
export {
  normalizeBrickOwlSetListing,
  normalizeBrickOwlMinifigListing,
  normalizeBrickOwlSetListings,
  normalizeBrickOwlMinifigListings,
  filterByCondition,
  filterBySellerFeedback,
  filterByMinPrice,
  filterByTargetPrice,
  filterSuspiciouslyCheap,
  filterLikelyIncomplete,
  applyBrickOwlFilters,
  getCurrencySymbol,
  hasEstimatedCharges,
} from './normalizer.js';
export type { BrickOwlFilterOptions } from './normalizer.js';
