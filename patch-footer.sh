#!/bin/bash
# Patch script to add Data Sources column to ScoutLoot footer
# Upload to server and run: bash patch-footer.sh

set -e

FILE="/var/www/scoutloot/app/public/index.html"
BACKUP="/var/www/scoutloot/app/public/index.html.backup-$(date +%Y%m%d-%H%M%S)"

echo "Creating backup at $BACKUP"
cp "$FILE" "$BACKUP"

echo "Applying patches..."

python3 << 'EOF'
import re

file_path = "/var/www/scoutloot/app/public/index.html"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# Patch 1: Change footer grid from 4 to 5 columns
old_grid = "grid-template-columns: 2fr 1fr 1fr 1fr;"
new_grid = "grid-template-columns: 2fr 1fr 1fr 1fr 1fr;"
if old_grid in content:
    content = content.replace(old_grid, new_grid)
    print("✓ Patch 1: Footer grid updated to 5 columns")
    changes += 1
else:
    print("⚠ Patch 1: Already patched or pattern not found")

# Patch 2: Add source-status CSS after .footer-column a:hover
css_block = '''
    /* Source status badges */
    .source-status {
      display: inline-flex;
      align-items: center;
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 100px;
      margin-left: 6px;
      font-weight: 500;
    }
    
    .source-status.active {
      background: rgba(16, 185, 129, 0.15);
      color: #10B981;
    }
    
    .source-status.coming {
      background: rgba(255, 213, 0, 0.15);
      color: #FFD500;
    }
    
    .source-status.reference {
      background: rgba(160, 160, 176, 0.15);
      color: #A0A0B0;
    }
'''

if '.source-status {' not in content:
    # Insert after .footer-column a:hover { ... }
    pattern = r'(\.footer-column a:hover \{\s*color: var\(--text-primary\);\s*\})'
    if re.search(pattern, content):
        content = re.sub(pattern, r'\1' + css_block, content)
        print("✓ Patch 2: Source status CSS added")
        changes += 1
    else:
        print("⚠ Patch 2: Insertion point not found")
else:
    print("⚠ Patch 2: CSS already exists")

# Patch 3: Add Data Sources column after Product column
data_sources_column = '''
        <div class="footer-column">
          <h4>Data Sources</h4>
          <ul>
            <li>eBay EU <span class="source-status active">Active</span></li>
            <li>BrickOwl <span class="source-status coming">Soon</span></li>
            <li>BrickLink <span class="source-status reference">Prices</span></li>
          </ul>
        </div>
        '''

if 'Data Sources' not in content:
    # Find end of Product column and insert before Legal column
    pattern = r'(<li><a href="#pricing">Pricing</a></li>\s*</ul>\s*</div>\s*)(\s*<div class="footer-column">\s*<h4>Legal</h4>)'
    if re.search(pattern, content):
        content = re.sub(pattern, r'\1' + data_sources_column + r'\2', content)
        print("✓ Patch 3: Data Sources column added")
        changes += 1
    else:
        print("⚠ Patch 3: Footer pattern not found")
else:
    print("⚠ Patch 3: Data Sources already exists")

# Save
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\n{changes} patches applied.")
EOF

echo ""
echo "Backup saved at: $BACKUP"
echo "To rollback: cp $BACKUP $FILE"
