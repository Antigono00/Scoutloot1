
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
  input.placeholder = type === 'set' ? 'e.g., 75192 or Millennium Falcon' : 'e.g., sw0001 or Darth Vader';
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
          ${fig.set_img_url ? `<img src="${fig.set_img_url}" alt="${escapeHtml(fig.name)}" onerror="this.parentElement.innerHTML='🧍'">` : '🧍'}
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

