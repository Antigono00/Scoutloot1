const fs = require('fs');
const FILE_PATH = '/var/www/scoutloot/app/public/js/app.js';

let content = fs.readFileSync(FILE_PATH, 'utf8');

const oldFunction = `function renderWatches() {
  const container = document.getElementById('watches-list');
  const currencySymbol = getUserCurrencySymbol();
  
  if (state.watches.length === 0) {
    container.innerHTML = \`
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p>No watches yet. Add your first LEGO set to start tracking deals!</p>
      </div>
    \`;
    return;
  }
  
  container.innerHTML = state.watches.map(watch => \`
    <div class="watch-item" data-watch-id="\${watch.id}">
      <div class="watch-image">
        \${watch.set_image_url 
          ? \`<img loading="lazy" src="\${watch.set_image_url}" alt="\${watch.set_number}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="watch-image-fallback" style="display:none">🧱</div>\`
          : '<div class="watch-image-fallback">🧱</div>'
        }
      </div>
      <div class="watch-info">
        <div class="watch-title">\${watch.set_name || watch.set_number}\${watch.set_year ? \` <span class="watch-year">(\${watch.set_year})</span>\` : ''}</div>
        <div class="watch-set-number">\${watch.set_name ? watch.set_number : ''}\${watch.set_pieces ? \` • \${watch.set_pieces} pieces\` : ''}</div>
        <div class="watch-meta">
          \${watch.condition !== 'any' ? watch.condition.charAt(0).toUpperCase() + watch.condition.slice(1) + ' • ' : ''}
          \${watch.total_alerts_sent || 0} alerts sent
        </div>
      </div>
      <div class="watch-price">
        <div class="watch-target">\${currencySymbol}\${parseFloat(watch.target_total_price_eur).toFixed(2)}</div>
        <div class="watch-target-label">Target price</div>
        \${parseFloat(watch.min_total_eur) > 0 ? \`<div class="watch-min-price">Min: \${currencySymbol}\${parseFloat(watch.min_total_eur).toFixed(2)}</div>\` : ''}
      </div>
      <span class="watch-status \${watch.status}">\${watch.status}</span>
      <div class="watch-actions">
        <button onclick="openEditWatch(\${watch.id})" title="Edit watch" class="btn-edit">✏️</button>
        <button onclick="deleteWatch(\${watch.id})" title="Delete watch" class="btn-delete">🗑</button>
      </div>
    </div>
  \`).join('');
}`;

const newFunction = `function renderWatches() {
  const container = document.getElementById('watches-list');
  const currencySymbol = getUserCurrencySymbol();
  
  if (state.watches.length === 0) {
    container.innerHTML = \`
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p>No watches yet. Add your first LEGO set to start tracking deals!</p>
      </div>
    \`;
    return;
  }
  
  container.innerHTML = state.watches.map(watch => {
    const isMinifig = watch.item_type === 'minifig';
    const itemIcon = isMinifig ? '🧍' : '🧱';
    const itemName = isMinifig ? (watch.minifig_name || watch.item_id) : (watch.set_name || watch.set_number || watch.item_id);
    const itemImage = isMinifig ? watch.minifig_image_url : watch.set_image_url;
    return \`
    <div class="watch-item" data-watch-id="\${watch.id}">
      <div class="watch-image">
        \${itemImage 
          ? \`<img loading="lazy" src="\${itemImage}" alt="\${itemName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="watch-image-fallback" style="display:none">\${itemIcon}</div>\`
          : \`<div class="watch-image-fallback">\${itemIcon}</div>\`
        }
      </div>
      <div class="watch-info">
        <div class="watch-title">\${itemName}\${isMinifig ? ' <span style="color:#9333ea;font-size:0.7rem;">MINIFIG</span>' : ''}\${watch.set_year ? \` <span class="watch-year">(\${watch.set_year})</span>\` : ''}</div>
        <div class="watch-set-number">\${isMinifig ? watch.item_id : (watch.set_name ? watch.set_number : '')}\${watch.set_pieces ? \` • \${watch.set_pieces} pieces\` : ''}</div>
        <div class="watch-meta">
          \${watch.condition !== 'any' ? watch.condition.charAt(0).toUpperCase() + watch.condition.slice(1) + ' • ' : ''}
          \${watch.total_alerts_sent || 0} alerts sent
        </div>
      </div>
      <div class="watch-price">
        <div class="watch-target">\${currencySymbol}\${parseFloat(watch.target_total_price_eur).toFixed(2)}</div>
        <div class="watch-target-label">Target price</div>
        \${parseFloat(watch.min_total_eur) > 0 ? \`<div class="watch-min-price">Min: \${currencySymbol}\${parseFloat(watch.min_total_eur).toFixed(2)}</div>\` : ''}
      </div>
      <span class="watch-status \${watch.status}">\${watch.status}</span>
      <div class="watch-actions">
        <button onclick="openEditWatch(\${watch.id})" title="Edit watch" class="btn-edit">✏️</button>
        <button onclick="deleteWatch(\${watch.id})" title="Delete watch" class="btn-delete">🗑</button>
      </div>
    </div>
  \`;
  }).join('');
}`;

if (content.includes(oldFunction)) {
  content = content.replace(oldFunction, newFunction);
  fs.writeFileSync(FILE_PATH, content);
  console.log('✅ Patched renderWatches successfully!');
} else {
  console.log('❌ Could not find exact function match');
}
