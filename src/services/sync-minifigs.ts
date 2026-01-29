/**
 * Minifigure Sync Service
 * 
 * Syncs minifigure data from Rebrickable API.
 * Similar to sync-sets.ts but for minifigures.
 */

import { upsertMinifig, getMinifigsNeedingUpdate, countMinifigs } from './minifigs.js';

// ============================================
// REBRICKABLE API TYPES
// ============================================

interface RebrickableMinifig {
  set_num: string;      // This is actually fig_num for minifigs
  name: string;
  num_parts: number;
  set_img_url: string | null;
  set_url: string;
}

interface RebrickableMinifigSets {
  count: number;
  results: Array<{
    set_num: string;
    name: string;
    quantity: number;
  }>;
}

interface RebrickableMinifigsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RebrickableMinifig[];
}

// ============================================
// CONFIG
// ============================================

const REBRICKABLE_API_KEY = process.env.REBRICKABLE_API_KEY || '05480b178b7ab764c21069f710e1380f';
const REBRICKABLE_BASE_URL = 'https://rebrickable.com/api/v3/lego';
const RATE_LIMIT_MS = 1100; // 1.1 seconds between requests (Rebrickable allows 1/sec)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch a single minifig from Rebrickable
 */
export async function fetchMinifigFromRebrickable(figNum: string): Promise<RebrickableMinifig | null> {
  const url = `${REBRICKABLE_BASE_URL}/minifigs/${figNum}/`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[Rebrickable] Minifig ${figNum} not found`);
        return null;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json() as RebrickableMinifig;
  } catch (error) {
    console.error(`[Rebrickable] Error fetching minifig ${figNum}:`, error);
    return null;
  }
}

/**
 * Fetch sets that a minifig appears in
 */
export async function fetchMinifigSets(figNum: string): Promise<string[]> {
  const url = `${REBRICKABLE_BASE_URL}/minifigs/${figNum}/sets/`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json() as RebrickableMinifigSets;
    return data.results.map(r => r.set_num.replace(/-\d+$/, '')); // Remove -1 suffix
  } catch (error) {
    console.error(`[Rebrickable] Error fetching sets for minifig ${figNum}:`, error);
    return [];
  }
}

/**
 * Search minifigs on Rebrickable
 */
export async function searchMinifigsOnRebrickable(
  searchQuery: string,
  limit: number = 20
): Promise<RebrickableMinifig[]> {
  const url = `${REBRICKABLE_BASE_URL}/minifigs/?search=${encodeURIComponent(searchQuery)}&page_size=${limit}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${REBRICKABLE_API_KEY}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as RebrickableMinifigsResponse;
    return data.results;
  } catch (error) {
    console.error(`[Rebrickable] Error searching minifigs:`, error);
    return [];
  }
}

// ============================================
// SYNC FUNCTIONS
// ============================================

/**
 * Sync a single minifig from Rebrickable to database
 */
export async function syncMinifig(figNum: string): Promise<boolean> {
  console.log(`[Sync] Fetching minifig ${figNum} from Rebrickable...`);
  
  const data = await fetchMinifigFromRebrickable(figNum);
  
  if (!data) {
    console.log(`[Sync] Minifig ${figNum} not found on Rebrickable`);
    return false;
  }
  
  // Fetch sets this minifig appears in
  await sleep(RATE_LIMIT_MS);
  const setNums = await fetchMinifigSets(figNum);
  
  // Determine theme from fig_num prefix
  const themePrefix = figNum.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
  const themeMap: Record<string, string> = {
    'sw': 'Star Wars',
    'sh': 'Super Heroes',
    'hp': 'Harry Potter',
    'cty': 'City',
    'njo': 'Ninjago',
    'col': 'Collectible Minifigures',
  };
  const theme = themeMap[themePrefix ?? ''] ?? null;
  
  // Update database
  await upsertMinifig(figNum, {
    name: data.name,
    num_parts: data.num_parts,
    image_url: data.set_img_url,
    rebrickable_url: data.set_url,
    set_numbers: setNums.length > 0 ? setNums : null,
    theme: theme,
  });
  
  console.log(`[Sync] ✅ ${figNum}: ${data.name}`);
  return true;
}

/**
 * Sync all minifigs that need info updates
 */
export async function syncMinifigsNeedingUpdate(maxCount: number = 50): Promise<{
  synced: number;
  failed: number;
}> {
  console.log(`[Sync] Starting minifig sync (max ${maxCount})...`);
  
  const figNums = await getMinifigsNeedingUpdate(maxCount);
  console.log(`[Sync] Found ${figNums.length} minifigs needing update`);
  
  let synced = 0;
  let failed = 0;
  
  for (const figNum of figNums) {
    try {
      const success = await syncMinifig(figNum);
      if (success) {
        synced++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`[Sync] Error syncing ${figNum}:`, error);
      failed++;
    }
    
    // Rate limit
    await sleep(RATE_LIMIT_MS);
  }
  
  console.log(`[Sync] Minifig sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

/**
 * Sync minifigs from a search query (for bootstrapping popular minifigs)
 */
export async function syncMinifigsFromSearch(
  searchQuery: string,
  limit: number = 50
): Promise<number> {
  console.log(`[Sync] Searching Rebrickable for "${searchQuery}"...`);
  
  const results = await searchMinifigsOnRebrickable(searchQuery, limit);
  console.log(`[Sync] Found ${results.length} minifigs`);
  
  let synced = 0;
  
  for (const minifig of results) {
    try {
      // fig_num is in set_num field for minifigs API
      const figNum = minifig.set_num;
      
      // Fetch additional data (sets this minifig appears in)
      await sleep(RATE_LIMIT_MS);
      const setNums = await fetchMinifigSets(figNum);
      
      // Determine theme
      const themePrefix = figNum.match(/^([a-z]+)/i)?.[1]?.toLowerCase();
      const themeMap: Record<string, string> = {
        'sw': 'Star Wars',
        'sh': 'Super Heroes', 
        'hp': 'Harry Potter',
        'cty': 'City',
        'njo': 'Ninjago',
        'col': 'Collectible Minifigures',
      };
      const theme = themeMap[themePrefix ?? ''] ?? null;
      
      await upsertMinifig(figNum, {
        name: minifig.name,
        num_parts: minifig.num_parts,
        image_url: minifig.set_img_url,
        rebrickable_url: minifig.set_url,
        set_numbers: setNums.length > 0 ? setNums : null,
        theme: theme,
      });
      
      synced++;
      console.log(`[Sync] ✅ ${figNum}: ${minifig.name}`);
      
      await sleep(RATE_LIMIT_MS);
    } catch (error) {
      console.error(`[Sync] Error syncing minifig:`, error);
    }
  }
  
  return synced;
}

// ============================================
// BOOTSTRAP FUNCTIONS
// ============================================

/**
 * Bootstrap popular Star Wars minifigs
 */
export async function bootstrapStarWarsMinifigs(): Promise<number> {
  console.log('[Bootstrap] Syncing Star Wars minifigs...');
  return syncMinifigsFromSearch('star wars', 100);
}

/**
 * Bootstrap popular Super Heroes minifigs
 */
export async function bootstrapSuperHeroesMinifigs(): Promise<number> {
  console.log('[Bootstrap] Syncing Super Heroes minifigs...');
  const marvel = await syncMinifigsFromSearch('marvel', 50);
  await sleep(2000);
  const dc = await syncMinifigsFromSearch('batman', 50);
  return marvel + dc;
}

/**
 * Bootstrap popular Harry Potter minifigs
 */
export async function bootstrapHarryPotterMinifigs(): Promise<number> {
  console.log('[Bootstrap] Syncing Harry Potter minifigs...');
  return syncMinifigsFromSearch('harry potter', 50);
}

// ============================================
// STATUS/REPORTING
// ============================================

/**
 * Get sync status
 */
export async function getMinifigSyncStatus(): Promise<{
  total: number;
  withInfo: number;
  needsUpdate: number;
  percentComplete: number;
}> {
  const counts = await countMinifigs();
  const percentComplete = counts.total > 0 
    ? Math.round((counts.withInfo / counts.total) * 100) 
    : 0;
  
  return {
    ...counts,
    percentComplete,
  };
}
