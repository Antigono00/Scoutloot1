#!/usr/bin/env python3
"""
Patch script for index.html - Minifig Support V24
Usage: python3 patch-index-html.py
Run from: /var/www/scoutloot/app/public/
"""

import os
import shutil
from datetime import datetime

FILE = "index.html"

def main():
    if not os.path.exists(FILE):
        print(f"Error: {FILE} not found. Run from /var/www/scoutloot/app/public/")
        return 1
    
    # Create backup
    backup = f"{FILE}.bak.{datetime.now().strftime('%Y%m%d%H%M%S')}"
    shutil.copy(FILE, backup)
    print(f"Backup created: {backup}")
    
    with open(FILE, 'r') as f:
        content = f.read()
    
    # ===========================================
    # PATCH 1: Add toggle buttons to Add Watch modal
    # ===========================================
    old_form_start = '''<form class="add-watch-form" onsubmit="handleAddWatch(event)">
        <div class="form-group autocomplete-container">
          <label for="watch-set">Set Number or Name</label>'''
    
    new_form_start = '''<form class="add-watch-form" onsubmit="handleAddWatch(event)">
        <!-- V24: Item Type Toggle -->
        <div class="watch-type-toggle">
          <button type="button" class="toggle-btn active" data-type="set" onclick="switchWatchType('set')">
            🧱 Set
          </button>
          <button type="button" class="toggle-btn" data-type="minifig" onclick="switchWatchType('minifig')">
            🧍 Minifigure
          </button>
        </div>
        
        <div class="form-group autocomplete-container">
          <label for="watch-set">Set Number or Name</label>'''
    
    if old_form_start in content:
        content = content.replace(old_form_start, new_form_start)
        print("✓ Patch 1: Added item type toggle to Add Watch modal")
    else:
        print("⚠ Patch 1: Could not find form start pattern (may already be patched)")
    
    # ===========================================
    # PATCH 2: Add CSS for toggle and badge
    # Find </style> and insert before it
    # ===========================================
    css_additions = '''
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.watch-type-toggle .toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}

.watch-type-toggle .toggle-btn.active {
  background: var(--accent);
  color: white;
}

.watch-type-toggle .toggle-btn:first-child {
  border-radius: 7px 0 0 7px;
}

.watch-type-toggle .toggle-btn:last-child {
  border-radius: 0 7px 7px 0;
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

'''
    
    # Find the last </style> tag and insert before it
    if '</style>' in content:
        # Insert before the last </style>
        last_style_pos = content.rfind('</style>')
        content = content[:last_style_pos] + css_additions + content[last_style_pos:]
        print("✓ Patch 2: Added CSS for toggle and minifig badge")
    else:
        print("⚠ Patch 2: Could not find </style> tag")
    
    # Write the patched file
    with open(FILE, 'w') as f:
        f.write(content)
    
    print(f"\n✅ All patches applied successfully!")
    print(f"\nBackup saved to: {backup}")
    print(f"To revert: cp {backup} {FILE}")
    
    return 0

if __name__ == '__main__':
    exit(main())
