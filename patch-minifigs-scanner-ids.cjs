#!/usr/bin/env node
/**
 * Phase 2 Fix: Update getMinifigScannerIds to trigger lookup when bricklink_id is missing
 * 
 * Problem: Minifig exists in DB with name but no bricklink_id - function doesn't try to resolve it
 * Solution: If bricklink_id is missing, use the name to search BrickOwl and get correct IDs
 * 
 * Run: node patch-minifigs-scanner-ids.cjs
 */

const fs = require('fs');

const FILE_PATH = '/var/www/scoutloot/app/src/services/minifigs.ts';

console.log('=== Phase 2 Fix: getMinifigScannerIds Lookup ==='  + '\n');

// Read file
console.log('[1/3] Reading minifigs.ts...');
let content = fs.readFileSync(FILE_PATH, 'utf8');
const originalContent = content;

// Backup
const backupPath = FILE_PATH + '.bak.' + Date.now();
fs.writeFileSync(backupPath, content);
console.log(`       Backup created: ${backupPath}`);

// Find and replace getMinifigScannerIds function
console.log('[2/3] Patching getMinifigScannerIds...');

const oldFunction = `/**
 * Get IDs needed for scanner
 * Returns the correct ID to use for each marketplace
 */
export async function getMinifigScannerIds(figNum: string): Promise<{
  ebay_search: string;      // What to search on eBay (Bricklink code or name)
  brickowl_boid: string | null;  // BOID for BrickOwl API
  display_name: string | null;   // Human-readable name
  image_url: string | null;      // Display image
}> {
  const minifig = await getMinifig(figNum);
  
  if (!minifig) {
    // Try to look it up
    const lookup = await lookupMinifig(figNum);
    return {
      ebay_search: lookup.bricklink_id || lookup.name || figNum,
      brickowl_boid: lookup.brickowl_boid,
      display_name: lookup.name,
      image_url: lookup.image_url,
    };
  }
  
  // Prefer Bricklink code for eBay search (it's in listing titles)
  const ebaySearch = minifig.bricklink_id || minifig.name || minifig.minifig_id;
  
  return {
    ebay_search: ebaySearch,
    brickowl_boid: minifig.brickowl_boid,
    display_name: minifig.name,
    image_url: minifig.image_url,
  };
}`;

const newFunction = `/**
 * Get IDs needed for scanner
 * Returns the correct ID to use for each marketplace
 * 
 * V26 Fix: Also triggers lookup when bricklink_id is missing (not just when minifig doesn't exist)
 */
export async function getMinifigScannerIds(figNum: string): Promise<{
  ebay_search: string;      // What to search on eBay (Bricklink code or name)
  brickowl_boid: string | null;  // BOID for BrickOwl API
  display_name: string | null;   // Human-readable name
  image_url: string | null;      // Display image
}> {
  const minifig = await getMinifig(figNum);
  
  // If minifig doesn't exist at all, do a full lookup
  if (!minifig) {
    console.log(\`[Scanner IDs] No cached data for \${figNum}, doing full lookup\`);
    const lookup = await lookupMinifig(figNum);
    return {
      ebay_search: lookup.bricklink_id || lookup.name || figNum,
      brickowl_boid: lookup.brickowl_boid,
      display_name: lookup.name,
      image_url: lookup.image_url,
    };
  }
  
  // If minifig exists but is missing bricklink_id, try to resolve it using the name
  if (!minifig.bricklink_id && minifig.name) {
    console.log(\`[Scanner IDs] \${figNum} missing bricklink_id, searching by name: "\${minifig.name}"\`);
    const lookup = await lookupMinifig(minifig.name);
    
    // If lookup found a bricklink_id, update the database record
    if (lookup.bricklink_id) {
      console.log(\`[Scanner IDs] Found bricklink_id: \${lookup.bricklink_id}, BOID: \${lookup.brickowl_boid}\`);
      await updateMinifig(figNum, {
        bricklink_id: lookup.bricklink_id,
        brickowl_boid: lookup.brickowl_boid,
      });
      return {
        ebay_search: lookup.bricklink_id,
        brickowl_boid: lookup.brickowl_boid,
        display_name: lookup.name || minifig.name,
        image_url: lookup.image_url || minifig.image_url,
      };
    }
    
    // Lookup didn't find bricklink_id, fall back to name
    console.log(\`[Scanner IDs] Could not resolve bricklink_id for "\${minifig.name}", using name for eBay search\`);
  }
  
  // Use cached data - prefer Bricklink code for eBay search (it's in listing titles)
  const ebaySearch = minifig.bricklink_id || minifig.name || minifig.minifig_id;
  
  return {
    ebay_search: ebaySearch,
    brickowl_boid: minifig.brickowl_boid,
    display_name: minifig.name,
    image_url: minifig.image_url,
  };
}`;

if (content.includes('V26 Fix: Also triggers lookup')) {
  console.log('       Already patched, skipping.');
} else if (content.includes(oldFunction)) {
  content = content.replace(oldFunction, newFunction);
  console.log('       Done.');
} else {
  console.log('       WARNING: Could not find exact function match!');
  console.log('       Trying flexible pattern...');
  
  // Try a regex approach for more flexibility
  const functionRegex = /\/\*\*\s*\n\s*\* Get IDs needed for scanner[\s\S]*?export async function getMinifigScannerIds[\s\S]*?image_url: minifig\.image_url,\s*\n\s*\};?\s*\n\}/;
  
  if (functionRegex.test(content)) {
    content = content.replace(functionRegex, newFunction);
    console.log('       Done with flexible pattern.');
  } else {
    console.log('       ERROR: Could not patch getMinifigScannerIds!');
    console.log('       You may need to manually update the function.');
    process.exit(1);
  }
}

// Write file
console.log('[3/3] Writing changes...');
if (content !== originalContent) {
  fs.writeFileSync(FILE_PATH, content);
  console.log('\n=== Patch applied successfully! ===\n');
} else {
  console.log('\n=== No changes made ===\n');
}

console.log('Next steps:');
console.log('  1. Clear bad cached data:');
console.log("     PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c \"UPDATE minifigs SET bricklink_id = NULL, brickowl_boid = NULL WHERE minifig_id LIKE 'fig-%' AND (bricklink_id = '' OR bricklink_id IS NULL);\"");
console.log('');
console.log('  2. Build and restart:');
console.log('     cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker');
console.log('');
console.log('  3. Test:');
console.log('     curl -X POST https://scoutloot.com/api/scan/run | jq');
console.log('     pm2 logs scoutloot --lines 50 | grep -i "scanner ids"');
