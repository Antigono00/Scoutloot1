#!/bin/bash
# Frontend patch script for ScoutLoot
# Run this on the server: bash patch-frontend.sh

FILE="/var/www/scoutloot/app/public/index.html"
BACKUP="/var/www/scoutloot/app/public/index.html.bak"

# Create backup
cp "$FILE" "$BACKUP"
echo "Backup created: $BACKUP"

# 1. Create the new renderWatches function
cat > /tmp/new_renderWatches.js << 'JSEOF'
    function renderWatches() {
      const container = document.getElementById('watches-list');
      
      if (state.watches.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <p>No watches yet. Add your first LEGO set to start tracking deals!</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = state.watches.map(watch => `
        <div class="watch-item" data-watch-id="${watch.id}">
          <div class="watch-image">
            ${watch.set_image_url 
              ? `<img src="${watch.set_image_url}" alt="${watch.set_number}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="watch-image-fallback" style="display:none">🧱</div>`
              : '<div class="watch-image-fallback">🧱</div>'
            }
          </div>
          <div class="watch-info">
            <div class="watch-title">${watch.set_name || watch.set_number}${watch.set_year ? ` <span class="watch-year">(${watch.set_year})</span>` : ''}</div>
            <div class="watch-set-number">${watch.set_name ? watch.set_number : ''}${watch.set_pieces ? ` • ${watch.set_pieces} pieces` : ''}</div>
            <div class="watch-meta">
              ${watch.condition !== 'any' ? watch.condition.charAt(0).toUpperCase() + watch.condition.slice(1) + ' • ' : ''}
              ${watch.total_alerts_sent || 0} alerts sent
            </div>
          </div>
          <div class="watch-price">
            <div class="watch-target">€${parseFloat(watch.target_total_price_eur).toFixed(2)}</div>
            <div class="watch-target-label">Target price</div>
            ${parseFloat(watch.min_total_eur) > 0 ? `<div class="watch-min-price">Min: €${parseFloat(watch.min_total_eur).toFixed(2)}</div>` : ''}
          </div>
          <span class="watch-status ${watch.status}">${watch.status}</span>
          <div class="watch-actions">
            <button onclick="openEditWatch(${watch.id})" title="Edit watch" class="btn-edit">✏️</button>
            <button onclick="deleteWatch(${watch.id})" title="Delete watch" class="btn-delete">🗑️</button>
          </div>
        </div>
      `).join('');
    }
JSEOF

# 2. Create the edit watch functions
cat > /tmp/edit_watch_functions.js << 'JSEOF'

    // ===========================================
    // EDIT WATCH FUNCTIONS
    // ===========================================
    
    let editingWatchId = null;
    
    function openEditWatch(watchId) {
      const watch = state.watches.find(w => w.id === watchId);
      if (!watch) return;
      
      editingWatchId = watchId;
      
      document.getElementById('edit-watch-set').value = watch.set_number;
      document.getElementById('edit-watch-name').textContent = watch.set_name || watch.set_number;
      document.getElementById('edit-watch-target').value = parseFloat(watch.target_total_price_eur);
      document.getElementById('edit-watch-min').value = parseFloat(watch.min_total_eur) || 0;
      document.getElementById('edit-watch-condition').value = watch.condition;
      
      openModal('edit-watch');
    }
    
    async function handleEditWatch(event) {
      event.preventDefault();
      
      if (!editingWatchId) return;
      
      const targetPrice = parseFloat(document.getElementById('edit-watch-target').value);
      const minPrice = parseFloat(document.getElementById('edit-watch-min').value) || 0;
      const condition = document.getElementById('edit-watch-condition').value;
      
      try {
        const updated = await apiCall(`/watches/${editingWatchId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            target_total_price_eur: targetPrice,
            min_total_eur: minPrice,
            condition: condition,
          }),
        });
        
        // Update local state
        const index = state.watches.findIndex(w => w.id === editingWatchId);
        if (index !== -1) {
          state.watches[index] = { ...state.watches[index], ...updated };
        }
        
        closeModal('edit-watch');
        renderWatches();
        showToast('Watch updated! 🎯', 'success');
        editingWatchId = null;
      } catch (error) {
        showToast(error.message || 'Failed to update watch', 'error');
      }
    }
JSEOF

echo "JavaScript functions prepared"

# 3. Create the edit watch modal HTML
cat > /tmp/edit_watch_modal.html << 'HTMLEOF'
  <!-- Edit Watch Modal -->
  <div class="modal-overlay" id="modal-edit-watch">
    <div class="modal" style="position: relative;">
      <button class="modal-close" onclick="closeModal('edit-watch')">×</button>
      <h2>Edit Watch</h2>
      <p class="modal-subtitle" id="edit-watch-name">Edit your watch settings</p>
      
      <form class="add-watch-form" onsubmit="handleEditWatch(event)">
        <div class="form-group">
          <label>Set Number</label>
          <input type="text" id="edit-watch-set" disabled style="opacity: 0.6; cursor: not-allowed;">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="edit-watch-target">Target Price (€)</label>
            <input type="number" id="edit-watch-target" placeholder="500" min="1" step="0.01" required>
          </div>
          <div class="form-group">
            <label for="edit-watch-min">Min Price (€)</label>
            <input type="number" id="edit-watch-min" placeholder="50" min="0" step="0.01" value="0">
          </div>
        </div>
        <div class="form-group">
          <label for="edit-watch-condition">Condition</label>
          <select id="edit-watch-condition">
            <option value="any">Any</option>
            <option value="new">New Only</option>
            <option value="used">Used Only</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Save Changes</button>
      </form>
    </div>
  </div>
HTMLEOF

echo "Edit modal HTML prepared"

# 4. Create additional CSS for watch images and edit button
cat > /tmp/additional_styles.css << 'CSSEOF'

    /* Watch image styles */
    .watch-image {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-tertiary);
      flex-shrink: 0;
      margin-right: 16px;
    }
    
    .watch-image img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: white;
    }
    
    .watch-image-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      background: var(--bg-tertiary);
    }
    
    .watch-set-number {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 2px;
    }
    
    .watch-year {
      font-weight: 400;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    
    .watch-min-price {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
    
    .watch-actions {
      display: flex;
      gap: 8px;
      margin-left: 16px;
    }
    
    .watch-actions button {
      width: 36px;
      height: 36px;
      background: var(--bg-tertiary);
      border: none;
      border-radius: 8px;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
      font-size: 1rem;
    }
    
    .watch-actions .btn-edit:hover {
      background: var(--accent);
      color: var(--bg-primary);
    }
    
    .watch-actions .btn-delete:hover {
      background: var(--error);
      color: white;
    }
CSSEOF

echo "Additional CSS prepared"

# Now apply the patches using Python for reliable text manipulation
python3 << 'PYEOF'
import re

with open('/var/www/scoutloot/app/public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Read the new content files
with open('/tmp/new_renderWatches.js', 'r') as f:
    new_render = f.read()

with open('/tmp/edit_watch_functions.js', 'r') as f:
    edit_functions = f.read()

with open('/tmp/edit_watch_modal.html', 'r') as f:
    edit_modal = f.read()

with open('/tmp/additional_styles.css', 'r') as f:
    additional_css = f.read()

# 1. Replace renderWatches function
pattern = r"function renderWatches\(\) \{.*?container\.innerHTML = state\.watches\.map\(watch => `.*?`\)\.join\(''\);\s*\}"
content = re.sub(pattern, new_render.strip(), content, flags=re.DOTALL)
print("Replaced renderWatches function")

# 2. Add edit watch functions before SETTINGS FUNCTIONS comment
settings_marker = "// ===========================================\n    // SETTINGS FUNCTIONS"
content = content.replace(settings_marker, edit_functions + "\n    " + settings_marker)
print("Added edit watch functions")

# 3. Add edit modal before Settings Modal
settings_modal_marker = "<!-- Settings Modal -->"
content = content.replace(settings_modal_marker, edit_modal + "\n  \n  " + settings_modal_marker)
print("Added edit watch modal")

# 4. Add additional CSS - insert before "/* User menu */"
user_menu_marker = "/* User menu */"
if user_menu_marker in content:
    content = content.replace(user_menu_marker, additional_css + "\n    " + user_menu_marker)
    print("Added additional CSS")
else:
    # Fallback: add before closing style tag
    content = content.replace("</style>", additional_css + "\n  </style>")
    print("Added additional CSS (fallback method)")

# Write the result
with open('/var/www/scoutloot/app/public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("")
print("All patches applied successfully!")
PYEOF

# Clean up temp files
rm -f /tmp/new_renderWatches.js /tmp/edit_watch_functions.js /tmp/edit_watch_modal.html /tmp/additional_styles.css

echo ""
echo "Frontend patched successfully!"
echo "Backup saved at: $BACKUP"
echo ""
echo "Next steps:"
echo "1. Run: cd /var/www/scoutloot/app && npx tsc && pm2 restart all"
echo "2. Run the sync-sets.ts script to populate set names"
