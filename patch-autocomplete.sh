#!/bin/bash
# Frontend patch script for Set Autocomplete
# Run this on the server: bash patch-autocomplete.sh

FILE="/var/www/scoutloot/app/public/index.html"
BACKUP="/var/www/scoutloot/app/public/index.html.autocomplete.bak"

# Create backup
cp "$FILE" "$BACKUP"
echo "Backup created: $BACKUP"

# Apply patches using Python
python3 << 'PYEOF'
import re

with open('/var/www/scoutloot/app/public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add autocomplete CSS before "/* User menu */"
autocomplete_css = '''
    /* Set Autocomplete */
    .autocomplete-container {
      position: relative;
    }
    
    .autocomplete-results {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: var(--bg-tertiary);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      margin-top: 4px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 100;
      display: none;
    }
    
    .autocomplete-results.active {
      display: block;
    }
    
    .autocomplete-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      transition: background 0.2s;
    }
    
    .autocomplete-item:last-child {
      border-bottom: none;
    }
    
    .autocomplete-item:hover {
      background: rgba(255,255,255,0.05);
    }
    
    .autocomplete-item-image {
      width: 48px;
      height: 48px;
      border-radius: 6px;
      overflow: hidden;
      background: white;
      margin-right: 12px;
      flex-shrink: 0;
    }
    
    .autocomplete-item-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .autocomplete-item-info {
      flex: 1;
      min-width: 0;
    }
    
    .autocomplete-item-name {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .autocomplete-item-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    
    .autocomplete-loading {
      padding: 16px;
      text-align: center;
      color: var(--text-muted);
    }
    
    .autocomplete-empty {
      padding: 16px;
      text-align: center;
      color: var(--text-muted);
    }

'''

user_menu_marker = "/* User menu */"
if user_menu_marker in content:
    content = content.replace(user_menu_marker, autocomplete_css + "\n    " + user_menu_marker)
    print("Added autocomplete CSS")

# 2. Replace the Add Watch form with autocomplete version
old_form = '''<form class="add-watch-form" onsubmit="handleAddWatch(event)">
        <div class="form-group">
          <label for="watch-set">Set Number</label>
          <input type="text" id="watch-set" placeholder="e.g., 75192" required pattern="[0-9\\-]+" title="Enter a valid set number">
        </div>'''

new_form = '''<form class="add-watch-form" onsubmit="handleAddWatch(event)">
        <div class="form-group autocomplete-container">
          <label for="watch-set">Set Number or Name</label>
          <input type="text" id="watch-set" placeholder="e.g., 75192 or Millennium Falcon" required autocomplete="off">
          <div class="autocomplete-results" id="set-autocomplete"></div>
        </div>'''

content = content.replace(old_form, new_form)
print("Updated Add Watch form with autocomplete container")

# 3. Add the autocomplete JavaScript functions before "// SETTINGS FUNCTIONS"
autocomplete_js = '''
    // ===========================================
    // SET AUTOCOMPLETE
    // ===========================================
    
    let autocompleteTimeout = null;
    let selectedSetNumber = null;
    
    // Initialize autocomplete on page load
    document.addEventListener('DOMContentLoaded', () => {
      const input = document.getElementById('watch-set');
      const results = document.getElementById('set-autocomplete');
      
      if (!input || !results) return;
      
      // Search as user types
      input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        selectedSetNumber = null;
        
        // Clear previous timeout
        if (autocompleteTimeout) {
          clearTimeout(autocompleteTimeout);
        }
        
        // Hide results if query too short
        if (query.length < 2) {
          results.classList.remove('active');
          return;
        }
        
        // Debounce search (wait 300ms after typing stops)
        autocompleteTimeout = setTimeout(() => {
          searchSets(query);
        }, 300);
      });
      
      // Hide results when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
          results.classList.remove('active');
        }
      });
      
      // Show results when focusing on input with existing query
      input.addEventListener('focus', () => {
        const query = input.value.trim();
        if (query.length >= 2 && results.innerHTML) {
          results.classList.add('active');
        }
      });
    });
    
    async function searchSets(query) {
      const results = document.getElementById('set-autocomplete');
      
      // Show loading state
      results.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
      results.classList.add('active');
      
      try {
        const response = await fetch(`/api/sets/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          results.innerHTML = '<div class="autocomplete-empty">No sets found</div>';
          return;
        }
        
        results.innerHTML = data.results.map(set => `
          <div class="autocomplete-item" onclick="selectSet('${set.set_num}', '${escapeHtml(set.name)}')">
            <div class="autocomplete-item-image">
              ${set.set_img_url 
                ? `<img src="${set.set_img_url}" alt="${escapeHtml(set.name)}" onerror="this.parentElement.innerHTML='🧱'">`
                : '🧱'
              }
            </div>
            <div class="autocomplete-item-info">
              <div class="autocomplete-item-name">${escapeHtml(set.name)}</div>
              <div class="autocomplete-item-meta">${set.set_num} • ${set.year} • ${set.num_parts || '?'} pieces</div>
            </div>
          </div>
        `).join('');
        
      } catch (error) {
        console.error('Search error:', error);
        results.innerHTML = '<div class="autocomplete-empty">Search failed</div>';
      }
    }
    
    function selectSet(setNum, setName) {
      const input = document.getElementById('watch-set');
      const results = document.getElementById('set-autocomplete');
      
      input.value = setNum;
      selectedSetNumber = setNum;
      results.classList.remove('active');
      
      // Focus on target price field
      document.getElementById('watch-target').focus();
      
      showToast(`Selected: ${setName}`, 'success');
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

'''

settings_marker = "// ===========================================\n    // SETTINGS FUNCTIONS"
if settings_marker in content:
    content = content.replace(settings_marker, autocomplete_js + "\n    " + settings_marker)
    print("Added autocomplete JavaScript functions")
else:
    # Fallback - try without newlines
    settings_marker2 = "// SETTINGS FUNCTIONS"
    if settings_marker2 in content:
        content = content.replace(settings_marker2, autocomplete_js + "\n    " + settings_marker2)
        print("Added autocomplete JavaScript functions (fallback)")

# 4. Update handleAddWatch to use selectedSetNumber if available
old_handleAddWatch = '''const setNumber = document.getElementById('watch-set').value;'''
new_handleAddWatch = '''const setNumber = selectedSetNumber || document.getElementById('watch-set').value.trim();'''

content = content.replace(old_handleAddWatch, new_handleAddWatch)
print("Updated handleAddWatch to use selectedSetNumber")

# Write the result
with open('/var/www/scoutloot/app/public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("")
print("All autocomplete patches applied successfully!")
PYEOF

echo ""
echo "Autocomplete patch applied!"
echo "Backup saved at: $BACKUP"
