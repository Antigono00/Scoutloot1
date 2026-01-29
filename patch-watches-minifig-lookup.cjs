#!/usr/bin/env node
/**
 * Phase 2.5 Fix: Update fetchAndUpdateMinifigInfo to use lookupMinifig
 * 
 * Problem: fetchAndUpdateMinifigInfo calls Rebrickable directly with Bricklink codes,
 *          but Rebrickable only understands fig-XXXXXX format
 * Solution: Use lookupMinifig() which handles Bricklink → BrickOwl → Rebrickable resolution
 * 
 * Run: node patch-watches-minifig-lookup.cjs
 */

const fs = require('fs');

const FILE_PATH = '/var/www/scoutloot/app/src/routes/watches.ts';

console.log('=== Phase 2.5 Fix: fetchAndUpdateMinifigInfo ===\n');

// Read file
console.log('[1/4] Reading watches.ts...');
let content = fs.readFileSync(FILE_PATH, 'utf8');
const originalContent = content;

// Backup
const backupPath = FILE_PATH + '.bak.' + Date.now();
fs.writeFileSync(backupPath, content);
console.log(`       Backup created: ${backupPath}`);

// Step 1: Add import for lookupMinifig
console.log('[2/4] Adding lookupMinifig import...');

const oldImports = `import {
  createWatch,
  getWatchById,
  getWatchesByUserId,
  updateWatchTargetPrice,
  stopWatch,
  resumeWatch,
  deleteWatch,
  getWatchCountByUserId,
} from '../services/watches.js';`;

const newImports = `import {
  createWatch,
  getWatchById,
  getWatchesByUserId,
  updateWatchTargetPrice,
  stopWatch,
  resumeWatch,
  deleteWatch,
  getWatchCountByUserId,
} from '../services/watches.js';
import { lookupMinifig } from '../services/minifigs.js';`;

if (content.includes("import { lookupMinifig }")) {
  console.log('       Import already exists, skipping.');
} else if (content.includes(oldImports)) {
  content = content.replace(oldImports, newImports);
  console.log('       Done.');
} else {
  // Try adding after the watches import
  const watchesImportRegex = /from '\.\.\/services\/watches\.js';/;
  if (watchesImportRegex.test(content)) {
    content = content.replace(
      watchesImportRegex,
      "from '../services/watches.js';\nimport { lookupMinifig } from '../services/minifigs.js';"
    );
    console.log('       Done (alternative pattern).');
  } else {
    console.log('       WARNING: Could not add import!');
  }
}

// Step 2: Replace fetchAndUpdateMinifigInfo function
console.log('[3/4] Replacing fetchAndUpdateMinifigInfo function...');

const oldFunction = `/**
 * Fetch minifig info from Rebrickable and update database
 */
async function fetchAndUpdateMinifigInfo(figNum: string): Promise<void> {
  const existing = await query(
    \`SELECT name FROM minifigs WHERE minifig_id = $1\`,
    [figNum.toLowerCase()]
  );
  
  if (existing.rows[0]?.name) {
    console.log(\`Minifig \${figNum} already has info, skipping Rebrickable fetch\`);
    return;
  }

  const url = \`https://rebrickable.com/api/v3/lego/minifigs/\${figNum}/\`;

  try {
    console.log(\`Fetching minifig info from Rebrickable: \${figNum}\`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': \`key \${REBRICKABLE_API_KEY}\`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(\`Minifig \${figNum} not found on Rebrickable\`);
        return;
      }
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    }

    const data = await response.json() as RebrickableMinifig;

    await query(
      \`INSERT INTO minifigs (minifig_id, name, num_parts, image_url, rebrickable_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (minifig_id) 
       DO UPDATE SET 
         name = COALESCE(EXCLUDED.name, minifigs.name),
         num_parts = COALESCE(EXCLUDED.num_parts, minifigs.num_parts),
         image_url = COALESCE(EXCLUDED.image_url, minifigs.image_url),
         rebrickable_url = COALESCE(EXCLUDED.rebrickable_url, minifigs.rebrickable_url),
         updated_at = NOW()\`,
      [figNum.toLowerCase(), data.name, data.num_parts, data.set_img_url, data.set_url]
    );

    console.log(\`✅ Updated minifig \${figNum}: \${data.name}\`);
  } catch (error) {
    console.error(\`Error fetching minifig \${figNum} from Rebrickable:\`, error);
  }
}`;

const newFunction = `/**
 * Fetch minifig info and update database
 * 
 * V26: Now uses lookupMinifig() which properly handles:
 * - Bricklink codes (sw0010, cty0890) → searches BrickOwl
 * - Names → searches BrickOwl
 * - Rebrickable IDs (fig-XXXXXX) → queries Rebrickable directly
 */
async function fetchAndUpdateMinifigInfo(figNum: string): Promise<void> {
  const normalized = figNum.toLowerCase();
  
  // Check if we already have complete info
  const existing = await query(
    \`SELECT name, image_url FROM minifigs WHERE minifig_id = $1 OR bricklink_id = $1\`,
    [normalized]
  );
  
  if (existing.rows[0]?.name && existing.rows[0]?.image_url) {
    console.log(\`Minifig \${figNum} already has complete info, skipping lookup\`);
    return;
  }

  try {
    console.log(\`Looking up minifig info: \${figNum}\`);
    
    // Use lookupMinifig which handles all ID formats properly
    const result = await lookupMinifig(figNum);
    
    if (result.success && result.name) {
      console.log(\`✅ Resolved minifig \${figNum}: \${result.name} (bricklink: \${result.bricklink_id || 'none'})\`);
      
      // Update the database with all resolved info
      await query(
        \`UPDATE minifigs SET 
           name = COALESCE($2, name),
           bricklink_id = COALESCE($3, bricklink_id),
           brickowl_boid = COALESCE($4, brickowl_boid),
           image_url = COALESCE($5, image_url),
           num_parts = COALESCE($6, num_parts),
           updated_at = NOW()
         WHERE minifig_id = $1 OR bricklink_id = $1\`,
        [normalized, result.name, result.bricklink_id, result.brickowl_boid, result.image_url, result.num_parts]
      );
    } else {
      console.log(\`Could not resolve minifig \${figNum}\`);
    }
  } catch (error) {
    console.error(\`Error looking up minifig \${figNum}:\`, error);
  }
}`;

if (content.includes('V26: Now uses lookupMinifig()')) {
  console.log('       Already patched, skipping.');
} else if (content.includes(oldFunction)) {
  content = content.replace(oldFunction, newFunction);
  console.log('       Done.');
} else {
  console.log('       WARNING: Could not find exact function match!');
  console.log('       Trying flexible pattern...');
  
  // Try regex for more flexibility
  const funcRegex = /\/\*\*\s*\n\s*\* Fetch minifig info from Rebrickable[\s\S]*?async function fetchAndUpdateMinifigInfo[\s\S]*?console\.error\(`Error fetching minifig \$\{figNum\}[\s\S]*?\}\s*\n\}/;
  
  if (funcRegex.test(content)) {
    content = content.replace(funcRegex, newFunction);
    console.log('       Done with flexible pattern.');
  } else {
    console.log('       ERROR: Could not patch fetchAndUpdateMinifigInfo!');
    console.log('       The function may have already been modified or has different formatting.');
  }
}

// Step 3: Also update the JOIN to match by bricklink_id
console.log('[4/4] Updating SQL JOIN to also match bricklink_id...');

const oldJoin = `LEFT JOIN minifigs m ON w.item_type = 'minifig' AND LOWER(w.item_id) = m.minifig_id`;
const newJoin = `LEFT JOIN minifigs m ON w.item_type = 'minifig' AND (LOWER(w.item_id) = m.minifig_id OR LOWER(w.item_id) = m.bricklink_id)`;

// Count how many we replace
const joinCount = (content.match(new RegExp(oldJoin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

if (content.includes('OR LOWER(w.item_id) = m.bricklink_id')) {
  console.log('       JOINs already updated, skipping.');
} else if (joinCount > 0) {
  content = content.split(oldJoin).join(newJoin);
  console.log(`       Updated ${joinCount} JOIN statements.`);
} else {
  console.log('       WARNING: Could not find JOIN statements to update.');
}

// Write file
if (content !== originalContent) {
  fs.writeFileSync(FILE_PATH, content);
  console.log('\n=== Patch applied successfully! ===\n');
} else {
  console.log('\n=== No changes made ===\n');
}

console.log('Next steps:');
console.log('  1. Build and restart:');
console.log('     cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker');
console.log('');
console.log('  2. Delete existing broken minifig watches and re-add them:');
console.log("     PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c \"DELETE FROM watches WHERE item_type = 'minifig';\"");
console.log("     PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c \"DELETE FROM minifigs WHERE name IS NULL;\"");
console.log('');
console.log('  3. Re-add watches via the UI and they should resolve correctly now.');
