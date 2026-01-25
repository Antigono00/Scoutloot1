/**
 * eBay Partner Network (EPN) Affiliate Link Generator
 * 
 * Transforms eBay URLs into affiliate-tracked URLs for revenue attribution.
 * 
 * Format: {url}?mkevt=1&mkcid=1&mkrid={ROTATION_ID}&campid={CAMPAIGN_ID}&toolid=10001
 */

import { config } from '../config.js';

// EPN Rotation IDs by marketplace
// These are eBay's identifiers for tracking clicks by marketplace
const EPN_ROTATION_IDS: Record<string, string> = {
  // EU marketplaces
  'EBAY_DE': '707-53477-19255-0',
  'EBAY_FR': '709-53476-19255-0',
  'EBAY_ES': '1185-53479-19255-0',
  'EBAY_IT': '724-53478-19255-0',
  'EBAY_NL': '1346-53482-19255-0',
  'EBAY_BE': '1553-53471-19255-0',
  'EBAY_AT': '5765-53472-19255-0',
  'EBAY_IE': '5765-53472-19255-0', // Uses DE rotation
  'EBAY_PL': '707-53477-19255-0',  // Uses DE rotation
  
  // UK marketplace
  'EBAY_GB': '710-53481-19255-0',
  
  // North America marketplaces
  'EBAY_US': '711-53200-19255-0',
  'EBAY_CA': '706-53473-19255-0',
};

// Map country codes to marketplaces for rotation ID lookup
const COUNTRY_TO_MARKETPLACE_FOR_EPN: Record<string, string> = {
  // EU countries
  'DE': 'EBAY_DE',
  'FR': 'EBAY_FR',
  'ES': 'EBAY_ES',
  'IT': 'EBAY_IT',
  'NL': 'EBAY_NL',
  'BE': 'EBAY_BE',
  'AT': 'EBAY_AT',
  'IE': 'EBAY_IE',
  'PL': 'EBAY_PL',
  'PT': 'EBAY_ES',
  'LU': 'EBAY_DE',
  'GR': 'EBAY_DE',
  'MT': 'EBAY_IT',
  'CY': 'EBAY_DE',
  'SE': 'EBAY_DE',
  'DK': 'EBAY_DE',
  'FI': 'EBAY_DE',
  'EE': 'EBAY_DE',
  'LV': 'EBAY_DE',
  'LT': 'EBAY_DE',
  'CZ': 'EBAY_DE',
  'SK': 'EBAY_DE',
  'HU': 'EBAY_DE',
  'SI': 'EBAY_AT',
  'HR': 'EBAY_DE',
  'RO': 'EBAY_DE',
  'BG': 'EBAY_DE',
  
  // UK
  'GB': 'EBAY_GB',
  'UK': 'EBAY_GB',
  
  // North America
  'US': 'EBAY_US',
  'CA': 'EBAY_CA',
};

/**
 * Get the EPN rotation ID for a given marketplace
 */
export function getRotationId(marketplace: string): string {
  return EPN_ROTATION_IDS[marketplace] ?? EPN_ROTATION_IDS['EBAY_DE'];
}

/**
 * Get the marketplace ID from a ship-to country code
 */
export function getMarketplaceForCountry(countryCode: string): string {
  return COUNTRY_TO_MARKETPLACE_FOR_EPN[countryCode.toUpperCase()] ?? 'EBAY_DE';
}

/**
 * Generate an EPN affiliate URL from an eBay listing URL
 * 
 * @param originalUrl - The original eBay listing URL
 * @param marketplace - The eBay marketplace ID (e.g., 'EBAY_DE', 'EBAY_US')
 * @returns The affiliate-tracked URL, or original URL if EPN not configured
 */
export function generateAffiliateUrl(originalUrl: string, marketplace: string): string {
  // If no campaign ID configured, return original URL
  const campaignId = config.epnCampaignId;
  if (!campaignId) {
    return originalUrl;
  }
  
  // Get rotation ID for marketplace
  const rotationId = getRotationId(marketplace);
  
  // Build affiliate parameters
  const affiliateParams = new URLSearchParams({
    mkevt: '1',
    mkcid: '1',
    mkrid: rotationId,
    campid: campaignId,
    toolid: '10001',
  });
  
  // Determine separator (? if no query params, & if already has params)
  const separator = originalUrl.includes('?') ? '&' : '?';
  
  return `${originalUrl}${separator}${affiliateParams.toString()}`;
}

/**
 * Generate an affiliate URL using country code instead of marketplace
 * Convenience wrapper for when you have country but not marketplace
 * 
 * @param originalUrl - The original eBay listing URL
 * @param shipToCountry - The destination country code (e.g., 'DE', 'US')
 * @returns The affiliate-tracked URL
 */
export function generateAffiliateUrlForCountry(originalUrl: string, shipToCountry: string): string {
  const marketplace = getMarketplaceForCountry(shipToCountry);
  return generateAffiliateUrl(originalUrl, marketplace);
}

/**
 * Check if EPN tracking is configured
 */
export function isEpnConfigured(): boolean {
  return !!config.epnCampaignId;
}

export default {
  generateAffiliateUrl,
  generateAffiliateUrlForCountry,
  getRotationId,
  getMarketplaceForCountry,
  isEpnConfigured,
};
