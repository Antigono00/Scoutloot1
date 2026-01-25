export interface EbaySearchResponse {
  href: string;
  total: number;
  next?: string;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
}

export interface EbayItemSummary {
  itemId: string;
  title: string;
  image?: { imageUrl: string };
  price: { value: string; currency: string };
  itemHref: string;
  seller: {
    username: string;
    feedbackPercentage?: string;
    feedbackScore?: number;
  };
  condition?: string;
  conditionId?: string;
  thumbnailImages?: { imageUrl: string }[];
  shippingOptions?: {
    shippingCostType: string;
    shippingCost?: { value: string; currency: string };
  }[];
  buyingOptions: string[];
  itemWebUrl: string;
  itemLocation?: {
    postalCode?: string;
    country?: string;
    city?: string;
  };
  // Import charges from eBay API (added for UK support)
  importCharges?: {
    value: string;
    currency: string;
  };
  // Additional import-related fields eBay may return
  additionalImages?: { imageUrl: string }[];
  currentBidPrice?: { value: string; currency: string };
  itemGroupHref?: string;
  itemGroupType?: string;
  leafCategoryIds?: string[];
  categories?: { categoryId: string; categoryName: string }[];
  shortDescription?: string;
  itemEndDate?: string;
  itemCreationDate?: string;
  topRatedBuyingExperience?: boolean;
  priorityListing?: boolean;
  listingMarketplaceId?: string;
}

export interface NormalizedListing {
  platform: 'ebay';
  id: string;
  scanned_for_country: string;
  set_number: string;
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
  // Import charges support (added for UK)
  import_charges_eur: number;
  import_charges_estimated: boolean;
  // Total now includes import charges
  total_eur: number;
  seller_id: string;
  seller_username: string;
  seller_rating: number | null;
  seller_feedback: number | null;
  ship_from_country: string | null;
  condition: string | null;
  condition_normalized: 'new' | 'used' | null;
  photo_count: number;
  returns_accepted: boolean;
  listing_type: 'fixed_price' | 'auction';
  fetched_at: Date;
  is_active: boolean;
}

export interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
