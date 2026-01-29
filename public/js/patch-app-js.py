#!/usr/bin/env python3
"""
Patch script for app.js - Minifig Support V24
Usage: python3 patch-app-js.py
Run from: /var/www/scoutloot/app/public/js/
"""

import os
import re
import shutil
from datetime import datetime

FILE = "app.js"

def main():
    if not os.path.exists(FILE):
        print(f"Error: {FILE} not found. Run from /var/www/scoutloot/app/public/js/")
        return 1
    
    # Create backup
    backup = f"{FILE}.bak.{datetime.now().strftime('%Y%m%d%H%M%S')}"
    shutil.copy(FILE, backup)
    print(f"Backup created: {backup}")
    
    with open(FILE, 'r') as f:
        content = f.read()
    
    # ===========================================
    # PATCH 1: Add new variables after selectedSetNumber
    # ===========================================
    content = content.replace(
        'let selectedSetNumber = null;',
        '''let selectedSetNumber = null;
let selectedItemType = 'set';  // 'set' or 'minifig'
let selectedMinifigId = null;'''
    )
    print("✓ Patch 1: Added minifig variables")
    
    # ===========================================
    # PATCH 2: Update initAutocomplete setTimeout
    # ===========================================
    old_autocomplete = '''autocompleteTimeout = setTimeout(() => {
      searchSets(query);
    }, 300);'''
    
    new_autocomplete = '''autocompleteTimeout = setTimeout(() => {
      if (selectedItemType === 'minifig') {
        searchMinifigs(query);
      } else {
        searchSets(query);
      }
    }, 300);'''
    
    content = content.replace(old_autocomplete, new_autocomplete)
    print("✓ Patch 2: Updated initAutocomplete for minifig search")
    
    # ===========================================
    # PATCH 3: Update selectSet to clear minifig
    # ===========================================
    content = content.replace(
        '''input.value = setNum;
  selectedSetNumber = setNum;
  results.classList.remove('active');''',
        '''input.value = setNum;
  selectedSetNumber = setNum;
  selectedMinifigId = null;
  results.classList.remove('active');'''
    )
    print("✓ Patch 3: Updated selectSet to clear minifig selection")
    
    # ===========================================
    # PATCH 4: Add new minifig functions before handleAddWatch
    # ===========================================
    new_functions = '''
// ===========================================
// MINIFIG SUPPORT FUNCTIONS (V24)
// ===========================================

function switchWatchType(type) {
  selectedItemType = type;
  selectedSetNumber = null;
  selectedMinifigId = null;
  
  document.querySelectorAll('.watch-type-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  
  const input = document.getElementById('watch-set');
  const results = document.getElementById('set-autocomplete');
  
  if (type === 'set') {
    input.placeholder = 'e.g., 75192 or Millennium Falcon';
  } else {
    input.placeholder = 'e.g., sw0001 or Darth Vader';
  }
  
  input.value = '';
  results.classList.remove('active');
  results.innerHTML = '';
}

async function searchMinifigs(query) {
  const results = document.getElementById('set-autocomplete');
  
  results.innerHTML = '<div class="autocomplete-loading">Searching minifigs...</div>';
  results.classList.add('active');
  
  try {
    const response = await fetch(`/api/minifigs/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      results.innerHTML = '<div class="autocomplete-empty">No minifigures found</div>';
      return;
    }
    
    results.innerHTML = data.results.map(fig => `
      <div class="autocomplete-item" onclick="selectMinifig('${fig.fig_num}', '${escapeHtml(fig.name)}')">
        <div class="autocomplete-item-image">
          ${fig.set_img_url 
            ? `<img src="${fig.set_img_url}" alt="${escapeHtml(fig.name)}" onerror="this.parentElement.innerHTML='🧍'">`
            : '🧍'
          }
        </div>
        <div class="autocomplete-item-info">
          <div class="autocomplete-item-name">${escapeHtml(fig.name)}</div>
          <div class="autocomplete-item-meta">${fig.fig_num} • ${fig.num_parts || '?'} parts</div>
        </div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Minifig search error:', error);
    results.innerHTML = '<div class="autocomplete-empty">Search failed</div>';
  }
}

function selectMinifig(figNum, figName) {
  const input = document.getElementById('watch-set');
  const results = document.getElementById('set-autocomplete');
  
  input.value = figNum;
  selectedMinifigId = figNum;
  selectedSetNumber = null;
  results.classList.remove('active');
  
  document.getElementById('watch-target').focus();
  
  showToast(`Selected: ${figName}`, 'success');
}

'''
    
    content = content.replace(
        'async function handleAddWatch(event) {',
        new_functions + 'async function handleAddWatch(event) {'
    )
    print("✓ Patch 4: Added minifig support functions")
    
    # ===========================================
    # PATCH 5: Replace handleAddWatch function
    # ===========================================
    # Find and replace the entire handleAddWatch function
    pattern = r'async function handleAddWatch\(event\) \{[^}]*?event\.preventDefault\(\);.*?finally \{[^}]*?submitBtn\.disabled = false;[^}]*?\}[^}]*?\}'
    
    new_handleAddWatch = '''async function handleAddWatch(event) {
  event.preventDefault();
  
  if (!state.user) {
    showToast('Please log in first', 'error');
    return;
  }
  
  // Determine item type and ID (V24: minifig support)
  let itemType = selectedItemType || 'set';
  let itemId;
  
  if (itemType === 'minifig') {
    itemId = selectedMinifigId || document.getElementById('watch-set').value.trim();
  } else {
    itemId = selectedSetNumber || document.getElementById('watch-set').value.trim();
  }
  
  if (!itemId) {
    showToast('Please select a set or minifigure', 'error');
    return;
  }
  
  const targetPrice = parseFloat(document.getElementById('watch-target').value);
  const minPrice = parseFloat(document.getElementById('watch-min').value) || 0;
  const condition = document.getElementById('watch-condition').value;
  
  const submitBtn = document.getElementById('add-watch-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Adding...';
    submitBtn.disabled = true;
    
    const body = {
      user_id: state.user.id,
      item_type: itemType,
      item_id: itemId,
      target_total_price_eur: targetPrice,
      min_total_eur: minPrice,
      condition: condition,
    };
    
    if (itemType === 'set') {
      body.set_number = itemId;
    }
    
    const watch = await apiCall('/watches', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    
    state.watches.push(watch);
    closeModal('add-watch');
    renderWatches();
    updateDashboardStats();
    
    const typeLabel = itemType === 'minifig' ? 'minifig' : 'set';
    showToast(`Now tracking ${typeLabel} ${itemId}! 🔔`, 'success');
    
    event.target.reset();
    selectedSetNumber = null;
    selectedMinifigId = null;
    selectedItemType = 'set';
    
    const setToggle = document.querySelector('.watch-type-toggle .toggle-btn[data-type="set"]');
    if (setToggle) {
      switchWatchType('set');
    }
    
  } catch (error) {
    showToast(error.message || 'Failed to add watch', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}'''
    
    content = re.sub(pattern, new_handleAddWatch, content, flags=re.DOTALL)
    print("✓ Patch 5: Replaced handleAddWatch function")
    
    # ===========================================
    # PATCH 6: Update renderWatches empty state
    # ===========================================
    content = content.replace(
        "No watches yet. Add your first LEGO set to start tracking deals!",
        "No watches yet. Add your first LEGO set or minifig to start tracking deals!"
    )
    print("✓ Patch 6: Updated empty state message")
    
    # ===========================================
    # PATCH 7: Update renderWatches to handle minifigs
    # ===========================================
    # Find the watch-item template and update it
    old_watch_template = '''container.innerHTML = state.watches.map(watch => `
    <div class="watch-item" data-watch-id="${watch.id}">
      <div class="watch-image">
        ${watch.set_image_url 
          ? `<img loading="lazy" src="${watch.set_image_url}" alt="${watch.set_number}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="watch-image-fallback" style="display:none">🧱</div>`
          : '<div class="watch-image-fallback">🧱</div>'
        }
      </div>
      <div class="watch-info">
        <div class="watch-title">${watch.set_name || watch.set_number}${watch.set_year ? ` <span class="watch-year">(${watch.set_year})</span>` : ''}</div>
        <div class="watch-set-number">${watch.set_name ? watch.set_number : ''}${watch.set_pieces ? ` • ${watch.set_pieces} pieces` : ''}</div>'''
    
    new_watch_template = '''container.innerHTML = state.watches.map(watch => {
    const isMinifig = watch.item_type === 'minifig';
    const fallbackIcon = isMinifig ? '🧍' : '🧱';
    const displayName = watch.set_name || watch.minifig_name || watch.item_id || watch.set_number;
    const displayNumber = watch.set_name || watch.minifig_name ? (watch.item_id || watch.set_number) : '';
    const imageUrl = watch.set_image_url || watch.minifig_image_url;
    const typeBadge = isMinifig ? '<span class="watch-type-badge minifig">Minifig</span>' : '';
    
    return `
    <div class="watch-item" data-watch-id="${watch.id}">
      <div class="watch-image">
        ${imageUrl 
          ? `<img loading="lazy" src="${imageUrl}" alt="${displayNumber}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="watch-image-fallback" style="display:none">${fallbackIcon}</div>`
          : `<div class="watch-image-fallback">${fallbackIcon}</div>`
        }
      </div>
      <div class="watch-info">
        <div class="watch-title">${displayName}${watch.set_year ? ` <span class="watch-year">(${watch.set_year})</span>` : ''} ${typeBadge}</div>
        <div class="watch-set-number">${displayNumber}${watch.set_pieces ? ` • ${watch.set_pieces} pieces` : ''}</div>'''
    
    content = content.replace(old_watch_template, new_watch_template)
    
    # Also need to close the arrow function properly
    # Find the end of watch-item template and add closing
    old_closing = '''      </div>
    </div>
  \`).join('');
}'''
    
    new_closing = '''      </div>
    </div>
  \`;
  }).join('');
}'''
    
    content = content.replace(old_closing, new_closing)
    print("✓ Patch 7: Updated renderWatches for minifig display")
    
    # Write the patched file
    with open(FILE, 'w') as f:
        f.write(content)
    
    print(f"\n✅ All patches applied successfully!")
    print(f"\nBackup saved to: {backup}")
    print(f"To revert: cp {backup} {FILE}")
    
    return 0

if __name__ == '__main__':
    exit(main())
