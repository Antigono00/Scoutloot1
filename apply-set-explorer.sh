#!/bin/bash
# ============================================
# ScoutLoot Set Explorer Patch
# Run on server: bash apply-set-explorer.sh
# ============================================

set -e  # Exit on error

APP_DIR="/var/www/scoutloot/app"
PUBLIC_DIR="$APP_DIR/public"

echo "🔧 Applying Set Explorer patch..."

# ============================================
# 1. APPEND CSS TO styles.css
# ============================================
echo "📝 Adding CSS styles..."

cat >> "$PUBLIC_DIR/css/styles.css" << 'CSSEOF'

/* ============================================
   SET EXPLORER SEARCH BAR (V20)
   ============================================ */

/* Hero Search */
.hero-search {
  max-width: 500px;
  margin: 32px auto 0;
  animation: fadeInUp 0.6s ease-out 0.4s both;
}

.hero-search-label {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 12px;
  display: block;
  text-align: center;
}

.hero-search-container {
  position: relative;
}

.hero-search-input {
  width: 100%;
  padding: 16px 24px;
  padding-left: 52px;
  background: var(--bg-card);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 100px;
  color: var(--text-primary);
  font-size: 1rem;
  font-family: inherit;
  transition: all 0.3s;
}

.hero-search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(255, 213, 0, 0.1), var(--glow-yellow);
}

.hero-search-input::placeholder {
  color: var(--text-muted);
}

.hero-search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.2rem;
  pointer-events: none;
}

.hero-search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  max-height: 400px;
  overflow-y: auto;
  z-index: 100;
  display: none;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

.hero-search-results.active {
  display: block;
}

.explorer-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: all 0.2s;
  text-decoration: none;
  color: inherit;
}

.explorer-item:last-child {
  border-bottom: none;
}

.explorer-item:hover {
  background: rgba(255, 213, 0, 0.05);
}

.explorer-item-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  background: white;
  margin-right: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.explorer-item-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.explorer-item-image .placeholder {
  font-size: 1.5rem;
}

.explorer-item-info {
  flex: 1;
  min-width: 0;
}

.explorer-item-name {
  font-weight: 600;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.explorer-item-meta {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.explorer-item-arrow {
  color: var(--accent);
  font-size: 1.2rem;
  margin-left: 12px;
  opacity: 0;
  transform: translateX(-8px);
  transition: all 0.2s;
}

.explorer-item:hover .explorer-item-arrow {
  opacity: 1;
  transform: translateX(0);
}

.explorer-loading,
.explorer-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
}

.explorer-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

/* Dashboard Search */
.dashboard-search {
  margin-bottom: 32px;
}

.dashboard-search-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.dashboard-search-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.dashboard-search-container {
  position: relative;
}

.dashboard-search-input {
  width: 100%;
  padding: 14px 20px;
  padding-left: 48px;
  background: var(--bg-card);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 12px;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-family: inherit;
  transition: all 0.2s;
}

.dashboard-search-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(255, 213, 0, 0.1);
}

.dashboard-search-input::placeholder {
  color: var(--text-muted);
}

.dashboard-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.1rem;
  pointer-events: none;
  color: var(--text-muted);
}

.dashboard-search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-tertiary);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  max-height: 350px;
  overflow-y: auto;
  z-index: 100;
  display: none;
}

.dashboard-search-results.active {
  display: block;
}
CSSEOF

echo "✅ CSS added"

# ============================================
# 2. APPEND JS TO app.js
# ============================================
echo "📝 Adding JavaScript..."

cat >> "$PUBLIC_DIR/js/app.js" << 'JSEOF'

// ===========================================
// SET EXPLORER (V20) - Navigate to set pages
// ===========================================

let explorerDebounceTimer = null;

function initSetExplorer() {
  // Hero search
  const heroInput = document.getElementById('hero-search-input');
  const heroResults = document.getElementById('hero-search-results');
  
  if (heroInput) {
    heroInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      clearTimeout(explorerDebounceTimer);
      
      if (query.length < 2) {
        heroResults.classList.remove('active');
        return;
      }
      
      explorerDebounceTimer = setTimeout(() => {
        searchSetsForExplorer(query, heroResults);
      }, 300);
    });
    
    document.addEventListener('click', (e) => {
      if (!heroInput.contains(e.target) && !heroResults.contains(e.target)) {
        heroResults.classList.remove('active');
      }
    });
    
    heroInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstResult = heroResults.querySelector('.explorer-item');
        if (firstResult) {
          window.location.href = firstResult.href;
        }
      }
    });
  }
  
  // Dashboard search
  const dashInput = document.getElementById('dashboard-search-input');
  const dashResults = document.getElementById('dashboard-search-results');
  
  if (dashInput) {
    dashInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      
      clearTimeout(explorerDebounceTimer);
      
      if (query.length < 2) {
        dashResults.classList.remove('active');
        return;
      }
      
      explorerDebounceTimer = setTimeout(() => {
        searchSetsForExplorer(query, dashResults);
      }, 300);
    });
    
    document.addEventListener('click', (e) => {
      if (!dashInput.contains(e.target) && !dashResults.contains(e.target)) {
        dashResults.classList.remove('active');
      }
    });
    
    dashInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstResult = dashResults.querySelector('.explorer-item');
        if (firstResult) {
          window.location.href = firstResult.href;
        }
      }
    });
  }
}

async function searchSetsForExplorer(query, resultsContainer) {
  resultsContainer.innerHTML = '<div class="explorer-loading"><span>🔍</span> Searching...</div>';
  resultsContainer.classList.add('active');
  
  try {
    const response = await fetch('/api/sets/search?q=' + encodeURIComponent(query));
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      resultsContainer.innerHTML = '<div class="explorer-empty">No sets found for "' + escapeHtml(query) + '"</div>';
      return;
    }
    
    resultsContainer.innerHTML = data.results.map(function(set) {
      return '<a href="/set/' + set.set_num + '" class="explorer-item">' +
        '<div class="explorer-item-image">' +
        (set.set_img_url 
          ? '<img src="' + set.set_img_url + '" alt="' + escapeHtml(set.name) + '" onerror="this.parentElement.innerHTML=\'<span class=placeholder>🧱</span>\'">'
          : '<span class="placeholder">🧱</span>') +
        '</div>' +
        '<div class="explorer-item-info">' +
        '<div class="explorer-item-name">' + escapeHtml(set.name) + '</div>' +
        '<div class="explorer-item-meta">#' + set.set_num + ' • ' + set.year + ' • ' + (set.num_parts || '?') + ' pieces</div>' +
        '</div>' +
        '<span class="explorer-item-arrow">→</span>' +
        '</a>';
    }).join('');
    
  } catch (error) {
    console.error('Explorer search error:', error);
    resultsContainer.innerHTML = '<div class="explorer-empty">Search failed. Please try again.</div>';
  }
}

// Auto-init on page load
(function() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetExplorer);
  } else {
    initSetExplorer();
  }
})();
JSEOF

echo "✅ JavaScript added"

# ============================================
# 3. INSERT HTML INTO index.html
# ============================================
echo "📝 Updating index.html..."

# Create backup
cp "$PUBLIC_DIR/index.html" "$PUBLIC_DIR/index.html.bak"

# Part 1: Add hero search after hero-cta closing div
# Find the line with "Learn More" button and add after its parent div closes
sed -i '/<button class="btn btn-secondary btn-large" onclick="scrollTo/,/<\/div>/{
  /<\/div>/a\
\
        <!-- Set Explorer Search -->\
        <div class="hero-search">\
          <span class="hero-search-label">or explore a set</span>\
          <div class="hero-search-container">\
            <span class="hero-search-icon">🔍</span>\
            <input type="text" id="hero-search-input" class="hero-search-input" placeholder="Search any LEGO set... e.g. Millennium Falcon, 75192" autocomplete="off">\
            <div id="hero-search-results" class="hero-search-results"></div>\
          </div>\
        </div>
}' "$PUBLIC_DIR/index.html"

# Part 2: Add dashboard search after dashboard-container opens
# Find dashboard-container and add after it
sed -i '/<div class="dashboard-container">/a\
\
      <!-- Set Explorer for Dashboard -->\
      <div class="dashboard-search">\
        <div class="dashboard-search-header"><h3>🔍 Explore Sets</h3></div>\
        <div class="dashboard-search-container">\
          <span class="dashboard-search-icon">🔍</span>\
          <input type="text" id="dashboard-search-input" class="dashboard-search-input" placeholder="Search for any LEGO set to view prices and deals..." autocomplete="off">\
          <div id="dashboard-search-results" class="dashboard-search-results"></div>\
        </div>\
      </div>
' "$PUBLIC_DIR/index.html"

echo "✅ HTML updated (backup: index.html.bak)"

# ============================================
# DONE
# ============================================
echo ""
echo "🎉 Set Explorer patch applied successfully!"
echo ""
echo "Features added:"
echo "  • Hero section: Search bar below CTA buttons"
echo "  • Dashboard: Search bar at top"
echo "  • Click result → Opens /set/{number} page"
echo ""
echo "No rebuild needed - just refresh browser!"
echo ""
echo "Test it:"
echo "  1. Go to https://scoutloot.com"
echo "  2. Type 'Millennium' in the search bar"
echo "  3. Click a result to see the set page"
