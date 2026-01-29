
// ===========================================
// COMBINED SET + MINIFIG SEARCH (V24)
// ===========================================

// Track what type of item was selected
let selectedItemType = 'set';
let selectedMinifigId = null;

// Combined search - queries both sets and minifigs
async function searchSetsAndMinifigs(query) {
  const results = document.getElementById('set-autocomplete');
  
  results.innerHTML = '<div class="autocomplete-loading">Searching...</div>';
  results.classList.add('active');
  
  try {
    // Query both APIs in parallel
    const [setsResponse, minifigsResponse] = await Promise.all([
      fetch(`/api/sets/search?q=${encodeURIComponent(query)}`),
      fetch(`/api/minifigs/search?q=${encodeURIComponent(query)}`)
    ]);
    
    const setsData = await setsResponse.json();
    const minifigsData = await minifigsResponse.json();
    
    const sets = (setsData.results || []).map(set => ({ ...set, _type: 'set' }));
    const minifigs = (minifigsData.results || []).map(fig => ({ ...fig, _type: 'minifig' }));
    
    // Combine results - sets first, then minifigs
    const combined = [...sets.slice(0, 5), ...minifigs.slice(0, 5)];
    
    if (combined.length === 0) {
      results.innerHTML = '<div class="autocomplete-empty">No sets or minifigures found</div>';
      return;
    }
    
    results.innerHTML = combined.map(item => {
      if (item._type === 'minifig') {
        return `
          <div class="autocomplete-item" onclick="selectMinifig('${item.fig_num}', '${escapeHtml(item.name)}')">
            <div class="autocomplete-item-image">
              ${item.set_img_url 
                ? `<img src="${item.set_img_url}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.innerHTML='🧍'">`
                : '🧍'
              }
            </div>
            <div class="autocomplete-item-info">
              <div class="autocomplete-item-name">${escapeHtml(item.name)} <span style="color: #9333ea; font-size: 0.75rem;">MINIFIG</span></div>
              <div class="autocomplete-item-meta">${item.fig_num} • ${item.num_parts || '?'} parts</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="autocomplete-item" onclick="selectSet('${item.set_num}', '${escapeHtml(item.name)}')">
            <div class="autocomplete-item-image">
              ${item.set_img_url 
                ? `<img src="${item.set_img_url}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.innerHTML='🧱'">`
                : '🧱'
              }
            </div>
            <div class="autocomplete-item-info">
              <div class="autocomplete-item-name">${escapeHtml(item.name)}</div>
              <div class="autocomplete-item-meta">${item.set_num} • ${item.year || '?'} • ${item.num_parts || '?'} pieces</div>
            </div>
          </div>
        `;
      }
    }).join('');
    
  } catch (error) {
    console.error('Search error:', error);
    results.innerHTML = '<div class="autocomplete-empty">Search failed</div>';
  }
}

function selectMinifig(figNum, figName) {
  const input = document.getElementById('watch-set');
  const results = document.getElementById('set-autocomplete');
  
  input.value = figNum;
  selectedMinifigId = figNum;
  selectedSetNumber = null;
  selectedItemType = 'minifig';
  results.classList.remove('active');
  
  document.getElementById('watch-target').focus();
  showToast(`Selected: ${figName}`, 'success');
}

