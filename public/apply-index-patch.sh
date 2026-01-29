#!/bin/bash
# ===========================================
# Patch Script for index.html - Minifig Toggle UI
# ===========================================
# Usage: bash apply-index-patch.sh
# Run from: /var/www/scoutloot/app/public/

set -e

FILE="index.html"
BACKUP="${FILE}.bak.$(date +%Y%m%d%H%M%S)"

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found."
  exit 1
fi

echo "Creating backup: $BACKUP"
cp "$FILE" "$BACKUP"

# ===========================================
# STEP 1: Add toggle buttons after form start
# ===========================================
# Find the line with the add-watch form and autocomplete-container
# Insert the toggle div before the autocomplete-container

sed -i '/<form class="add-watch-form" onsubmit="handleAddWatch(event)">/,/<div class="form-group autocomplete-container">/s/<div class="form-group autocomplete-container">/\
        <!-- V24: Item Type Toggle -->\
        <div class="watch-type-toggle">\
          <button type="button" class="toggle-btn active" data-type="set" onclick="switchWatchType('\''set'\'')">🧱 Set<\/button>\
          <button type="button" class="toggle-btn" data-type="minifig" onclick="switchWatchType('\''minifig'\'')">🧍 Minifigure<\/button>\
        <\/div>\
        \
        <div class="form-group autocomplete-container">/' "$FILE"

echo "✓ Added toggle buttons to modal"

# ===========================================
# STEP 2: Add CSS styles before </style>
# ===========================================
# Find the last </style> and insert CSS before it

CSS_BLOCK='
/* V24: Minifig Support Styles */
.watch-type-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.watch-type-toggle .toggle-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.2s ease;
}
.watch-type-toggle .toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
.watch-type-toggle .toggle-btn.active {
  background: var(--accent);
  color: white;
}
.watch-type-badge {
  display: inline-block;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
  vertical-align: middle;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.watch-type-badge.minifig {
  background: linear-gradient(135deg, #9333ea, #7c3aed);
  color: white;
}
'

# Use awk to insert CSS before the last </style>
awk -v css="$CSS_BLOCK" '
/<\/style>/ && !done {
  print css
  done=1
}
{print}
' "$FILE" > "${FILE}.tmp" && mv "${FILE}.tmp" "$FILE"

echo "✓ Added CSS styles"

echo ""
echo "=========================================="
echo "✅ index.html patched successfully!"
echo "=========================================="
echo ""
echo "Backup saved to: $BACKUP"
echo "To revert: cp $BACKUP $FILE"
