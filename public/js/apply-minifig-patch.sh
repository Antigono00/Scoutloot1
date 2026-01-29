#!/bin/bash
# ===========================================
# Safe Patch Script for app.js - Minifig Support V24
# ===========================================
# Usage: bash apply-minifig-patch.sh
# Run from: /var/www/scoutloot/app/public/js/
# Requires: minifig-functions.js in same directory

set -e

FILE="app.js"
FUNCS="minifig-functions.js"
BACKUP="${FILE}.bak.$(date +%Y%m%d%H%M%S)"
TEMP="${FILE}.tmp"

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
# STEP 1: Find key line numbers
# ===========================================
LINE_SELECTED=$(grep -n "^let selectedSetNumber = null;" "$FILE" | head -1 | cut -d: -f1)
LINE_ESCAPE=$(grep -n "^function escapeHtml(text)" "$FILE" | head -1 | cut -d: -f1)

if [ -z "$LINE_SELECTED" ] || [ -z "$LINE_ESCAPE" ]; then
  echo "Error: Could not find marker lines. Is app.js already patched?"
  exit 1
fi

echo "Found selectedSetNumber at line: $LINE_SELECTED"
echo "Found escapeHtml at line: $LINE_ESCAPE"

# ===========================================
# STEP 2: Add minifig variables after selectedSetNumber
# ===========================================
{
  head -n "$LINE_SELECTED" "$FILE"
  echo "let selectedItemType = 'set';  // 'set' or 'minifig'"
  echo "let selectedMinifigId = null;"
  tail -n +"$((LINE_SELECTED + 1))" "$FILE"
} > "$TEMP"
mv "$TEMP" "$FILE"

echo "✓ Added minifig variables"

# Recalculate line number (it shifted by 2)
LINE_ESCAPE=$((LINE_ESCAPE + 2))

# ===========================================
# STEP 3: Insert minifig functions before escapeHtml
# ===========================================
{
  head -n "$((LINE_ESCAPE - 1))" "$FILE"
  cat "$FUNCS"
  tail -n +"$LINE_ESCAPE" "$FILE"
} > "$TEMP"
mv "$TEMP" "$FILE"

echo "✓ Inserted minifig functions"

# ===========================================
# STEP 4: Update initAutocomplete setTimeout
# ===========================================
# Replace: searchSets(query);
# With: conditional call
sed -i 's/autocompleteTimeout = setTimeout(() => {/autocompleteTimeout = setTimeout(() => {\n      \/\/ V24: Route to minifig or set search\n      if (selectedItemType === '\''minifig'\'') {\n        searchMinifigs(query);\n        return;\n      }/' "$FILE"

echo "✓ Updated initAutocomplete"

# ===========================================
# STEP 5: Update selectSet to clear minifig
# ===========================================
sed -i '/selectedSetNumber = setNum;/a\  selectedMinifigId = null; \/\/ V24: Clear minifig when selecting set' "$FILE"

echo "✓ Updated selectSet"

# ===========================================
# STEP 6: Update handleAddWatch
# This needs to send item_type and item_id
# ===========================================
# Find and update the JSON body in handleAddWatch
sed -i 's/user_id: state.user.id,$/user_id: state.user.id,\n        item_type: selectedItemType || '\''set'\'',\n        item_id: selectedItemType === '\''minifig'\'' ? (selectedMinifigId || document.getElementById('\''watch-set'\'').value.trim()) : (selectedSetNumber || document.getElementById('\''watch-set'\'').value.trim()),/' "$FILE"

echo "✓ Updated handleAddWatch request body"

# ===========================================
# STEP 7: Update success message
# ===========================================
sed -i "s/showToast(\`Now tracking set \${setNumber}!/showToast(\`Now tracking \${selectedItemType === 'minifig' ? 'minifig' : 'set'} \${selectedItemType === 'minifig' ? (selectedMinifigId || setNumber) : setNumber}!/" "$FILE"

echo "✓ Updated success message"

# ===========================================
# STEP 8: Reset selectedItemType after adding watch
# ===========================================
sed -i '/selectedSetNumber = null;$/a\    selectedMinifigId = null;\n    selectedItemType = '\''set'\'';' "$FILE"

echo "✓ Added form reset"

echo ""
echo "=========================================="
echo "✅ All patches applied successfully!"
echo "=========================================="
echo ""
echo "Backup saved to: $BACKUP"
echo "To revert: cp $BACKUP $FILE"
echo ""
echo "Now patch index.html for the toggle UI."
