#!/usr/bin/env node
/**
 * Phase 2 Patch: Minifig Scanner ID Mapping
 * 
 * This script patches scanner.ts to use getMinifigScannerIds()
 * for correct eBay searches (Bricklink codes instead of Rebrickable IDs)
 * 
 * Run: node patch-scanner-minifig-ids.js
 */

const fs = require('fs');
const path = require('path');

const FILE_PATH = '/var/www/scoutloot/app/src/services/scanner.ts';

console.log('=== Phase 2: Minifig Scanner ID Mapping Patch ===\n');

// Read file
console.log('[1/5] Reading scanner.ts...');
let content = fs.readFileSync(FILE_PATH, 'utf8');
const originalContent = content;

// Backup
const backupPath = FILE_PATH + '.bak.' + Date.now();
fs.writeFileSync(backupPath, content);
console.log(`       Backup created: ${backupPath}`);

// Patch 1: Add getMinifigScannerIds to import
console.log('[2/5] Patching import statement...');
const oldImport = "import { getMinifig } from './minifigs.js';";
const newImport = "import { getMinifig, getMinifigScannerIds } from './minifigs.js';";

if (content.includes(newImport)) {
  console.log('       Already patched, skipping.');
} else if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
  console.log('       Done.');
} else {
  console.log('       WARNING: Could not find import to patch!');
}

// Patch 2: Update processScanGroupMinifig to resolve IDs
console.log('[3/5] Patching processScanGroupMinifig...');

const oldProcessMinifig = `console.log(\`[\${requestId}] Scanning MINIFIG: \${figNum} -> \${shipToCountry}\`);

  // Get minifig info
  const minifigInfo = await getMinifig(figNum);
  const figName = minifigInfo?.name ?? null;

  // ============================================
  // EBAY SCAN (with minifig-specific filter)
  // ============================================
  const ebayListings = await scanEbayForMinifig(figNum, figName, shipToCountry, requestId, result);`;

const newProcessMinifig = `console.log(\`[\${requestId}] Scanning MINIFIG: \${figNum} -> \${shipToCountry}\`);

  // Resolve IDs for each marketplace
  const scannerIds = await getMinifigScannerIds(figNum);
  const figName = scannerIds.display_name;
  const ebaySearchTerm = scannerIds.ebay_search;
  
  console.log(\`[\${requestId}] Resolved IDs: ebay="\${ebaySearchTerm}", boid=\${scannerIds.brickowl_boid ?? 'none'}, name="\${figName ?? 'unknown'}"\`);

  // ============================================
  // EBAY SCAN (with minifig-specific filter)
  // ============================================
  const ebayListings = await scanEbayForMinifig(figNum, ebaySearchTerm, figName, shipToCountry, requestId, result);`;

if (content.includes('const ebaySearchTerm = scannerIds.ebay_search;')) {
  console.log('       Already patched, skipping.');
} else if (content.includes(oldProcessMinifig)) {
  content = content.replace(oldProcessMinifig, newProcessMinifig);
  console.log('       Done.');
} else {
  console.log('       WARNING: Could not find processScanGroupMinifig block to patch!');
  console.log('       Trying alternative pattern...');
  
  // Try a more flexible match
  const altOld = /console\.log\(`\[\$\{requestId\}\] Scanning MINIFIG: \$\{figNum\} -> \$\{shipToCountry\}`\);\s*\/\/ Get minifig info\s*const minifigInfo = await getMinifig\(figNum\);\s*const figName = minifigInfo\?\.name \?\? null;/;
  
  if (altOld.test(content)) {
    content = content.replace(altOld, `console.log(\`[\${requestId}] Scanning MINIFIG: \${figNum} -> \${shipToCountry}\`);

  // Resolve IDs for each marketplace
  const scannerIds = await getMinifigScannerIds(figNum);
  const figName = scannerIds.display_name;
  const ebaySearchTerm = scannerIds.ebay_search;
  
  console.log(\`[\${requestId}] Resolved IDs: ebay="\${ebaySearchTerm}", boid=\${scannerIds.brickowl_boid ?? 'none'}, name="\${figName ?? 'unknown'}"\`);`);
    console.log('       Done with alternative pattern.');
  } else {
    console.log('       ERROR: Could not patch processScanGroupMinifig!');
  }
}

// Patch 3: Update scanEbayForMinifig call
console.log('[4/5] Patching scanEbayForMinifig call...');

const oldCall = 'scanEbayForMinifig(figNum, figName, shipToCountry, requestId, result)';
const newCall = 'scanEbayForMinifig(figNum, ebaySearchTerm, figName, shipToCountry, requestId, result)';

if (content.includes(newCall)) {
  console.log('       Already patched, skipping.');
} else if (content.includes(oldCall)) {
  content = content.replace(oldCall, newCall);
  console.log('       Done.');
} else {
  console.log('       WARNING: Could not find scanEbayForMinifig call to patch!');
}

// Patch 4: Update scanEbayForMinifig function signature and search query
console.log('[5/5] Patching scanEbayForMinifig function...');

const oldFunction = `async function scanEbayForMinifig(
  figNum: string,
  figName: string | null,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<NormalizedListing[]> {
  try {
    // Search for minifig on eBay
    // Use fig_num + "minifigure" to get relevant results
    const searchQuery = figName ? \`\${figName} minifigure lego\` : figNum;`;

const newFunction = `async function scanEbayForMinifig(
  figNum: string,
  ebaySearchTerm: string,
  figName: string | null,
  shipToCountry: string,
  requestId: string,
  result: ScanResult
): Promise<NormalizedListing[]> {
  try {
    // Search for minifig on eBay using Bricklink code (e.g., "sw0010 minifigure lego")
    // Bricklink codes appear in eBay listing titles, Rebrickable IDs don't
    const searchQuery = \`\${ebaySearchTerm} minifigure lego\`;
    console.log(\`[\${requestId}] eBay minifig search: "\${searchQuery}"\`);`;

if (content.includes('ebaySearchTerm: string,')) {
  console.log('       Already patched, skipping.');
} else if (content.includes(oldFunction)) {
  content = content.replace(oldFunction, newFunction);
  console.log('       Done.');
} else {
  console.log('       WARNING: Could not find scanEbayForMinifig function to patch!');
  console.log('       Trying component patches...');
  
  // Try patching signature separately
  const oldSig = `async function scanEbayForMinifig(
  figNum: string,
  figName: string | null,`;
  const newSig = `async function scanEbayForMinifig(
  figNum: string,
  ebaySearchTerm: string,
  figName: string | null,`;
  
  if (content.includes(oldSig)) {
    content = content.replace(oldSig, newSig);
    console.log('       Signature patched.');
  }
  
  // Try patching search query separately
  const oldQuery = "const searchQuery = figName ? `${figName} minifigure lego` : figNum;";
  const newQuery = "const searchQuery = `${ebaySearchTerm} minifigure lego`;\n    console.log(`[${requestId}] eBay minifig search: \"${searchQuery}\"`);";
  
  if (content.includes(oldQuery)) {
    content = content.replace(oldQuery, newQuery);
    console.log('       Search query patched.');
  }
}

// Write file
if (content !== originalContent) {
  fs.writeFileSync(FILE_PATH, content);
  console.log('\n=== Patch applied successfully! ===\n');
} else {
  console.log('\n=== No changes made (already patched or patterns not found) ===\n');
}

console.log('Next steps:');
console.log('  cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker');
console.log('');
console.log('Test with:');
console.log('  curl -X POST https://scoutloot.com/api/scan/run | jq');
console.log('  pm2 logs scoutloot --lines 50 | grep -i "resolved ids"');
