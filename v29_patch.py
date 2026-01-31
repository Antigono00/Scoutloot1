#!/usr/bin/env python3
"""
ScoutLoot V29 Patch Script
==========================
Fixes: Condition dropdown (USED not showing, default to NEW)
Adds: Bulk condition change, prefillWatch listener, signup flow from detail pages

Usage: Upload this script to server and run:
  python3 v29_patch.py
  
Then build and restart:
  cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker
"""

import os
import re
import shutil
from pathlib import Path

APP_DIR = Path('/var/www/scoutloot/app')

def backup_file(filepath):
    """Create a backup with .bak.v29 suffix"""
    backup_path = filepath.with_suffix(filepath.suffix + '.bak.v29')
    if filepath.exists():
        shutil.copy2(filepath, backup_path)
        return True
    return False

def patch_index_html():
    """Fix condition dropdowns and add bulk condition change"""
    filepath = APP_DIR / 'public' / 'index.html'
    print(f"📄 Patching {filepath}...")
    
    backup_file(filepath)
    content = filepath.read_text(encoding='utf-8')
    
    # PATCH 1: Fix Add Watch Modal condition dropdown
    # Find the broken dropdown with <label> instead of <option>
    old_add_watch = '''<select id="watch-condition">
            <option value="any">{{forms.condition_any}}</option>
            <option value="new">{{forms.condition_new}}</option>
            <label value="used">{{forms.condition_used}}</option>
          </select>'''
    
    new_add_watch = '''<select id="watch-condition">
            <option value="new" selected>{{forms.condition_new}}</option>
            <option value="used">{{forms.condition_used}}</option>
            <option value="any">{{forms.condition_any}}</option>
          </select>'''
    
    if old_add_watch in content:
        content = content.replace(old_add_watch, new_add_watch)
        print("   ✅ Fixed Add Watch condition dropdown")
    else:
        print("   ⚠️ Add Watch dropdown pattern not found (may already be fixed)")
    
    # PATCH 2: Fix Edit Watch Modal condition dropdown
    old_edit_watch = '''<select id="edit-watch-condition">
            <option value="any">{{forms.condition_any}}</option>
            <option value="new">{{forms.condition_new}}</option>
            <label value="used">{{forms.condition_used}}</option>
          </select>'''
    
    new_edit_watch = '''<select id="edit-watch-condition">
            <option value="new">{{forms.condition_new}}</option>
            <option value="used">{{forms.condition_used}}</option>
            <option value="any">{{forms.condition_any}}</option>
          </select>'''
    
    if old_edit_watch in content:
        content = content.replace(old_edit_watch, new_edit_watch)
        print("   ✅ Fixed Edit Watch condition dropdown")
    else:
        print("   ⚠️ Edit Watch dropdown pattern not found (may already be fixed)")
    
    # PATCH 3: Add bulk condition change dropdown to watches header
    old_watches_header = '''<div class="watches-header">
            <h2>{{dashboard.your_watchlist}}</h2>
          </div>'''
    
    new_watches_header = '''<div class="watches-header">
            <h2>{{dashboard.your_watchlist}}</h2>
            <select id="bulk-condition-select" onchange="handleBulkConditionChange(this.value)" style="background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.1);padding:8px 12px;border-radius:8px;font-size:0.85rem;cursor:pointer;">
              <option value="">Change All...</option>
              <option value="new">All → New</option>
              <option value="used">All → Used</option>
              <option value="any">All → Any</option>
            </select>
          </div>'''
    
    if old_watches_header in content:
        content = content.replace(old_watches_header, new_watches_header)
        print("   ✅ Added bulk condition dropdown to watches header")
    else:
        print("   ⚠️ Watches header pattern not found (may already be patched)")
    
    filepath.write_text(content, encoding='utf-8')
    print(f"   💾 Saved {filepath}")

def patch_app_js():
    """Add prefillWatch listener and bulk condition change function"""
    filepath = APP_DIR / 'public' / 'js' / 'app.js'
    print(f"📄 Patching {filepath}...")
    
    backup_file(filepath)
    content = filepath.read_text(encoding='utf-8')
    
    # Check if already patched
    if 'handleBulkConditionChange' in content:
        print("   ⚠️ app.js already contains V29 functions, skipping")
        return
    
    # Add new functions at the end of the file
    new_js = '''

// ===========================================
// PREFILL WATCH FROM DETAIL PAGES (V29)
// ===========================================

window.addEventListener('prefillWatch', function(event) {
  var detail = event.detail;
  var type = detail.type;
  var id = detail.id;
  var name = detail.name;
  var imageUrl = detail.imageUrl;
  
  var input = document.getElementById('watch-set');
  if (input) {
    input.value = id;
  }
  
  if (type === 'minifig') {
    selectedMinifigId = id;
    selectedMinifigImageUrl = imageUrl || null;
    selectedSetNumber = null;
    selectedItemType = 'minifig';
  } else {
    selectedSetNumber = id;
    selectedMinifigId = null;
    selectedMinifigImageUrl = null;
    selectedItemType = 'set';
  }
  
  // Update the modal subtitle if name is provided
  var subtitle = document.querySelector('#modal-add-watch .modal-subtitle');
  if (subtitle && name) {
    subtitle.textContent = name;
  }
});

// ===========================================
// BULK CONDITION CHANGE (V29)
// ===========================================

async function handleBulkConditionChange(condition) {
  if (!condition) return;
  if (!state.user) {
    showToast('Please log in first', 'error');
    return;
  }
  
  if (state.watches.length === 0) {
    showToast('No watches to update', 'info');
    document.getElementById('bulk-condition-select').value = '';
    return;
  }
  
  var conditionLabel = condition === 'any' ? 'Any Condition' : condition.charAt(0).toUpperCase() + condition.slice(1);
  
  if (!confirm('Change condition for ALL ' + state.watches.length + ' watches to "' + conditionLabel + '"?')) {
    document.getElementById('bulk-condition-select').value = '';
    return;
  }
  
  try {
    var response = await apiCall('/watches/bulk-condition/' + state.user.id, {
      method: 'PATCH',
      body: JSON.stringify({ condition: condition }),
    });
    
    state.watches.forEach(function(watch) {
      watch.condition = condition;
    });
    
    renderWatches();
    showToast('All watches updated to ' + conditionLabel + '! 🎯', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to update watches', 'error');
  } finally {
    document.getElementById('bulk-condition-select').value = '';
  }
}
'''
    
    content += new_js
    filepath.write_text(content, encoding='utf-8')
    print("   ✅ Added prefillWatch listener")
    print("   ✅ Added handleBulkConditionChange function")
    print(f"   💾 Saved {filepath}")

def patch_watches_ts():
    """Add bulk condition API endpoint"""
    filepath = APP_DIR / 'src' / 'routes' / 'watches.ts'
    print(f"📄 Patching {filepath}...")
    
    backup_file(filepath)
    content = filepath.read_text(encoding='utf-8')
    
    # Check if already patched
    if 'bulk-condition' in content:
        print("   ⚠️ watches.ts already contains bulk-condition endpoint, skipping")
        return
    
    # Find where to insert - before the GET /user/:userId route
    # We need to add it early so it doesn't conflict with /:id routes
    
    new_endpoint = '''
// ============================================
// BULK UPDATE ALL WATCHES CONDITION (V29)
// PATCH /api/watches/bulk-condition/:userId
// ============================================
router.patch('/bulk-condition/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { condition } = req.body;
    
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }
    
    if (!condition || !['new', 'used', 'any'].includes(condition)) {
      res.status(400).json({ error: 'Invalid condition. Must be: new, used, or any' });
      return;
    }
    
    const result = await query(
      `UPDATE watches 
       SET condition = $1, updated_at = NOW() 
       WHERE user_id = $2 AND status = 'active'`,
      [condition, userId]
    );
    
    res.json({
      success: true,
      updated: result.rowCount,
      condition: condition,
    });
  } catch (error) {
    console.error('Bulk update condition error:', error);
    res.status(500).json({ error: 'Failed to update watches' });
  }
});

'''
    
    # Insert after the router definition but before user routes
    # Look for "GET USER" or "router.get('/user" pattern
    patterns_to_find = [
        "// GET USER'S WATCHES",
        "// GET USER WATCHES", 
        "router.get('/user/:userId'",
        "// ============================================\n// GET USER"
    ]
    
    inserted = False
    for pattern in patterns_to_find:
        if pattern in content:
            content = content.replace(pattern, new_endpoint + pattern)
            inserted = True
            break
    
    if not inserted:
        # Fallback: insert after first router definition
        if "const router = Router();" in content:
            content = content.replace(
                "const router = Router();",
                "const router = Router();" + new_endpoint
            )
            inserted = True
    
    if inserted:
        filepath.write_text(content, encoding='utf-8')
        print("   ✅ Added bulk-condition endpoint")
        print(f"   💾 Saved {filepath}")
    else:
        print("   ❌ Could not find insertion point for bulk-condition endpoint")
        print("      Please add manually - see V29_MANUAL_PATCH.md")

def patch_set_html():
    """Update set.html to show signup modal instead of login"""
    filepath = APP_DIR / 'public' / 'set.html'
    print(f"📄 Patching {filepath}...")
    
    if not filepath.exists():
        print("   ⚠️ set.html not found, skipping")
        return
    
    backup_file(filepath)
    content = filepath.read_text(encoding='utf-8')
    
    # Change openModal('login') to openModal('signup') in createWatchFromPage
    old_pattern = "openModal('login')"
    new_pattern = "openModal('signup')"
    
    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        filepath.write_text(content, encoding='utf-8')
        print("   ✅ Changed login modal to signup modal")
        print(f"   💾 Saved {filepath}")
    else:
        print("   ⚠️ Pattern not found (may already be patched or using different syntax)")

def patch_minifig_html():
    """Update minifig.html to show signup modal instead of login"""
    filepath = APP_DIR / 'public' / 'minifig.html'
    print(f"📄 Patching {filepath}...")
    
    if not filepath.exists():
        print("   ⚠️ minifig.html not found, skipping")
        return
    
    backup_file(filepath)
    content = filepath.read_text(encoding='utf-8')
    
    # Change openModal('login') to openModal('signup') in createWatchFromPage
    old_pattern = "openModal('login')"
    new_pattern = "openModal('signup')"
    
    if old_pattern in content:
        content = content.replace(old_pattern, new_pattern)
        filepath.write_text(content, encoding='utf-8')
        print("   ✅ Changed login modal to signup modal")
        print(f"   💾 Saved {filepath}")
    else:
        print("   ⚠️ Pattern not found (may already be patched or using different syntax)")

def main():
    print("=" * 60)
    print("ScoutLoot V29 Patch - Watch Condition Improvements")
    print("=" * 60)
    print()
    
    if not APP_DIR.exists():
        print(f"❌ Error: App directory not found: {APP_DIR}")
        print("   Make sure you're running this on the server")
        return 1
    
    print("📦 Starting patches...")
    print()
    
    try:
        patch_index_html()
        print()
        
        patch_app_js()
        print()
        
        patch_watches_ts()
        print()
        
        patch_set_html()
        print()
        
        patch_minifig_html()
        print()
        
    except Exception as e:
        print(f"❌ Error during patching: {e}")
        print("   You may need to restore from backups (.bak.v29 files)")
        return 1
    
    print("=" * 60)
    print("✅ All patches applied successfully!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Build the TypeScript:")
    print("   cd /var/www/scoutloot/app && npm run build")
    print()
    print("2. Restart the services:")
    print("   pm2 restart scoutloot scoutloot-worker")
    print()
    print("3. Test the changes:")
    print("   - Add Watch modal: NEW/USED/ANY with NEW selected by default")
    print("   - Edit Watch modal: All 3 options available")
    print("   - Watchlist: 'Change All...' dropdown in header")
    print("   - Set/Minifig pages: Click Watch while logged out → signup modal")
    print()
    print("To rollback if needed:")
    print("   cd /var/www/scoutloot/app")
    print("   cp public/index.html.bak.v29 public/index.html")
    print("   cp public/js/app.js.bak.v29 public/js/app.js")
    print("   cp src/routes/watches.ts.bak.v29 src/routes/watches.ts")
    print("   cp public/set.html.bak.v29 public/set.html")
    print("   cp public/minifig.html.bak.v29 public/minifig.html")
    print("   npm run build && pm2 restart scoutloot scoutloot-worker")
    
    return 0

if __name__ == '__main__':
    exit(main())
