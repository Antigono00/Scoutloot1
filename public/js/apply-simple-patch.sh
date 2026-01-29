#!/bin/bash
# ===========================================
# Simple Patch for app.js - Combined Set + Minifig Search
# ===========================================
# Usage: bash apply-simple-patch.sh
# Run from: /var/www/scoutloot/app/public/js/
# Requires: minifig-functions-simple.js in same directory

set -e

FILE="app.js"
FUNCS="minifig-functions-simple.js"
BACKUP="${FILE}.bak.$(date +%Y%m%d%H%M%S)"

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found."
  exit 1
fi

if [ ! -f "$FUNCS" ]; then
  echo "Error: $FUNCS not found. Please upload it first."
  exit 1
fi

echo "Creating backup: $BACKUP"
cp "$FILE" "$BACKUP"

# ===========================================
# STEP 1: Insert functions before escapeHtml
# ===========================================
LINE_ESCAPE=$(grep -n "^function escapeHtml(text)" "$FILE" | head -1 | cut -d: -f1)

if [ -z "$LINE_ESCAPE" ]; then
  echo "Error: Could not find escapeHtml function."
  exit 1
fi

echo "Found escapeHtml at line: $LINE_ESCAPE"

{
  head -n "$((LINE_ESCAPE - 1))" "$FILE"
  cat "$FUNCS"
  tail -n +"$LINE_ESCAPE" "$FILE"
} > "${FILE}.tmp"
mv "${FILE}.tmp" "$FILE"

echo "✓ Inserted minifig functions"

# ===========================================
# STEP 2: Update initAutocomplete to use combined search
# Replace: searchSets(query);
# With: searchSetsAndMinifigs(query);
# ===========================================
sed -i 's/searchSets(query);/searchSetsAndMinifigs(query);/' "$FILE"

echo "✓ Updated initAutocomplete to use combined search"

# ===========================================
# STEP 3: Update selectSet to track item type
# ===========================================
sed -i 's/selectedSetNumber = setNum;/selectedSetNumber = setNum;\n  selectedMinifigId = null;\n  selectedItemType = '\''set'\'';/' "$FILE"

echo "✓ Updated selectSet"

# ===========================================
# STEP 4: Update handleAddWatch to send item_type/item_id
# Find the JSON body and add item_type and item_id
# ===========================================
sed -i 's/user_id: state.user.id,$/user_id: state.user.id,\n        item_type: selectedItemType || '\''set'\'',\n        item_id: (selectedItemType === '\''minifig'\'') ? selectedMinifigId : (selectedSetNumber || document.getElementById('\''watch-set'\'').value.trim()),/' "$FILE"

echo "✓ Updated handleAddWatch request body"

# ===========================================
# STEP 5: Update the success message
# ===========================================
sed -i "s/Now tracking set \${setNumber}!/Now tracking \${selectedItemType === 'minifig' ? 'minifig' : 'set'} \${(selectedItemType === 'minifig') ? selectedMinifigId : setNumber}!/" "$FILE"

echo "✓ Updated success message"

# ===========================================
# STEP 6: Reset minifig state after adding watch
# Find the line "selectedSetNumber = null;" in handleAddWatch and add after it
# ===========================================
# Find it in the handleAddWatch context (after event.target.reset())
sed -i '/event.target.reset();/{n;s/selectedSetNumber = null;/selectedSetNumber = null;\n    selectedMinifigId = null;\n    selectedItemType = '\''set'\'';/}' "$FILE"

echo "✓ Added form reset for minifig state"

echo ""
echo "=========================================="
echo "✅ All patches applied successfully!"
echo "=========================================="
echo ""
echo "Backup saved to: $BACKUP"
echo "To revert: cp $BACKUP $FILE"
echo ""
echo "No changes needed to index.html!"
echo "The search will now show both sets and minifigs."
