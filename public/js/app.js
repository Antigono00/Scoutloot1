// ===========================================
// STATE MANAGEMENT
// ===========================================

const API_BASE = '/api';

let state = {
  user: null,
  watches: [],
  alerts: [],
  alertsCursor: null,
  hasMoreAlerts: false,
  unreadCount: 0,
  pushSupported: false,
  pushSubscribed: false,
};

// ===========================================
// LOCAL STORAGE
// ===========================================

function saveToStorage(key, value) {
  localStorage.setItem(`scoutloot_${key}`, JSON.stringify(value));
}

function loadFromStorage(key) {
  const data = localStorage.getItem(`scoutloot_${key}`);
  return data ? JSON.parse(data) : null;
}

function clearStorage() {
  localStorage.removeItem('scoutloot_user');
  localStorage.removeItem('scoutloot_token');
}

// ===========================================
// COOKIE CONSENT (GDPR)
// ===========================================

function checkCookieConsent() {
  const consent = localStorage.getItem('scoutloot_cookie_consent');
  if (!consent) {
    document.getElementById('cookie-banner').classList.add('show');
  }
}

function acceptCookies() {
  localStorage.setItem('scoutloot_cookie_consent', 'accepted');
  document.getElementById('cookie-banner').classList.remove('show');
}

// ===========================================
// REGIONAL HELPERS
// ===========================================

function getUserCurrencySymbol() {
  if (!state.user || !state.user.ship_to_country) return '€';
  const country = state.user.ship_to_country.toUpperCase();
  if (country === 'US') return '$';
  if (country === 'CA') return 'C$';
  if (country === 'GB' || country === 'UK') return '£';
  return '€';
}

function getDefaultTimezone(country) {
  const timezones = {
    'US': 'America/New_York',
    'CA': 'America/Toronto',
    'GB': 'Europe/London',
    'UK': 'Europe/London',
  };
  return timezones[country?.toUpperCase()] || 'Europe/Berlin';
}

// ===========================================
// API FUNCTIONS
// ===========================================

async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API error');
    }
    
    return await response.json();
  } catch (error) {
    console.error('API error:', error);
    throw error;
  }
}

// ===========================================
// AUTH FUNCTIONS
// ===========================================

async function handleSignup(event) {
  event.preventDefault();
  
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const country = document.getElementById('signup-country').value;
  const weeklyDigest = document.getElementById('signup-weekly-digest').checked;
  const reminders = document.getElementById('signup-reminders').checked;
  
  const submitBtn = document.getElementById('signup-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;
    
    const user = await apiCall('/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        ship_to_country: country,
        timezone: getDefaultTimezone(country),
        weekly_digest_enabled: weeklyDigest,
        still_available_reminders: reminders,
      }),
    });
    
    state.user = user;
    saveToStorage('user', user);
    
    closeModal('signup');
    updateUI();
    showDashboard();
    showToast('Account created! Welcome to ScoutLoot 🎉', 'success');
    
    // Show setup modal for Telegram/Push
    setTimeout(() => {
      openModal('complete-setup');
    }, 500);
    
    event.target.reset();
  } catch (error) {
    showToast(error.message || 'Failed to create account', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  const submitBtn = document.getElementById('login-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Logging in...';
    submitBtn.disabled = true;
    
    const user = await apiCall('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    state.user = user;
    saveToStorage('user', user);
    
    closeModal('login');
    updateUI();
    showDashboard();
    await loadWatches();
    await loadAlerts();
    showToast('Welcome back! 👋', 'success');
  } catch (error) {
    showToast('Invalid email or password', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function logout() {
  state.user = null;
  state.watches = [];
  state.alerts = [];
  clearStorage();
  document.body.classList.remove('logged-in');
  updateUI();
  showToast('Logged out successfully', 'success');
}

// ===========================================
// SETUP MODAL (POST-SIGNUP)
// ===========================================

function closeSetupModal() {
  closeModal('complete-setup');
}

async function setupTelegram() {
  connectTelegram();
  document.getElementById('setup-telegram').classList.add('connected');
}

async function setupPush() {
  if (!state.pushSupported) {
    showToast('Push notifications are not supported on this browser', 'error');
    return;
  }
  
  await subscribePush();
  
  if (state.pushSubscribed) {
    document.getElementById('setup-push').classList.add('connected');
  }
}

// ===========================================
// WATCH FUNCTIONS
// ===========================================

async function loadWatches() {
  if (!state.user) return;
  
  try {
    const data = await apiCall(`/watches/user/${state.user.id}`);
    state.watches = data.watches || [];
    renderWatches();
    updateDashboardStats();
  } catch (error) {
    console.error('Failed to load watches:', error);
  }
}

async function handleAddWatch(event) {
  event.preventDefault();
  
  if (!state.user) {
    showToast('Please log in first', 'error');
    return;
  }
  
  const setNumber = selectedSetNumber || document.getElementById('watch-set').value.trim();
  const targetPrice = parseFloat(document.getElementById('watch-target').value);
  const minPrice = parseFloat(document.getElementById('watch-min').value) || 0;
  const condition = document.getElementById('watch-condition').value;
  
  const submitBtn = document.getElementById('add-watch-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Adding...';
    submitBtn.disabled = true;
    
    const watch = await apiCall('/watches', {
      method: 'POST',
      body: JSON.stringify({
        user_id: state.user.id,
        set_number: setNumber,
        target_total_price_eur: targetPrice,
        min_total_eur: minPrice,
        condition: condition,
      }),
    });
    
    state.watches.push(watch);
    closeModal('add-watch');
    renderWatches();
    updateDashboardStats();
    showToast(`Now tracking set ${setNumber}! 🔔`, 'success');
    
    event.target.reset();
    selectedSetNumber = null;
  } catch (error) {
    showToast(error.message || 'Failed to add watch', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

async function deleteWatch(watchId) {
  if (!confirm('Are you sure you want to delete this watch?')) return;
  
  try {
    await apiCall(`/watches/${watchId}`, { method: 'DELETE' });
    state.watches = state.watches.filter(w => w.id !== watchId);
    renderWatches();
    updateDashboardStats();
    showToast('Watch deleted', 'success');
  } catch (error) {
    showToast('Failed to delete watch', 'error');
  }
}

function renderWatches() {
  const container = document.getElementById('watches-list');
  const currencySymbol = getUserCurrencySymbol();
  
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
          ? `<img loading="lazy" src="${watch.set_image_url}" alt="${watch.set_number}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="watch-image-fallback" style="display:none">🧱</div>`
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
        <div class="watch-target">${currencySymbol}${parseFloat(watch.target_total_price_eur).toFixed(2)}</div>
        <div class="watch-target-label">Target price</div>
        ${parseFloat(watch.min_total_eur) > 0 ? `<div class="watch-min-price">Min: ${currencySymbol}${parseFloat(watch.min_total_eur).toFixed(2)}</div>` : ''}
      </div>
      <span class="watch-status ${watch.status}">${watch.status}</span>
      <div class="watch-actions">
        <button onclick="openEditWatch(${watch.id})" title="Edit watch" class="btn-edit">✏️</button>
        <button onclick="deleteWatch(${watch.id})" title="Delete watch" class="btn-delete">🗑</button>
      </div>
    </div>
  `).join('');
}

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
  
  const submitBtn = document.getElementById('edit-watch-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;
    
    const updated = await apiCall(`/watches/${editingWatchId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        target_total_price_eur: targetPrice,
        min_total_eur: minPrice,
        condition: condition,
      }),
    });
    
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
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// ===========================================
// NOTIFICATIONS INBOX FUNCTIONS
// ===========================================

async function loadAlerts(reset = true) {
  if (!state.user) return;
  
  try {
    const cursor = reset ? '' : (state.alertsCursor ? `&cursor=${state.alertsCursor}` : '');
    const data = await apiCall(`/alerts/inbox/${state.user.id}?limit=20${cursor}`);
    
    if (reset) {
      state.alerts = data.alerts || [];
    } else {
      state.alerts = [...state.alerts, ...(data.alerts || [])];
    }
    
    state.alertsCursor = data.nextCursor;
    state.hasMoreAlerts = data.hasMore;
    
    renderInbox();
    await updateUnreadCount();
  } catch (error) {
    console.error('Failed to load alerts:', error);
  }
}

async function loadMoreAlerts() {
  await loadAlerts(false);
}

async function updateUnreadCount() {
  if (!state.user) return;
  
  try {
    const data = await apiCall(`/alerts/unread-count/${state.user.id}`);
    state.unreadCount = data.count || 0;
    
    const badge = document.getElementById('unread-badge');
    if (state.unreadCount > 0) {
      badge.textContent = state.unreadCount > 99 ? '99+' : state.unreadCount;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to get unread count:', error);
  }
}

async function markAlertRead(alertId) {
  try {
    await apiCall(`/alerts/${alertId}/read`, { method: 'POST' });
    
    const alert = state.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.read_at = new Date().toISOString();
    }
    
    renderInbox();
    await updateUnreadCount();
  } catch (error) {
    console.error('Failed to mark alert read:', error);
  }
}

async function markAllRead() {
  if (!state.user) return;
  
  try {
    await apiCall(`/alerts/mark-all-read/${state.user.id}`, { method: 'POST' });
    
    state.alerts.forEach(a => a.read_at = new Date().toISOString());
    
    renderInbox();
    await updateUnreadCount();
    showToast('All notifications marked as read', 'success');
  } catch (error) {
    showToast('Failed to mark all as read', 'error');
  }
}

function renderInbox() {
  const container = document.getElementById('inbox-list');
  const loadMoreBtn = document.getElementById('inbox-load-more');
  const currencySymbol = getUserCurrencySymbol();
  
  if (state.alerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔔</div>
        <p>No notifications yet. Alerts will appear here when deals are found!</p>
      </div>
    `;
    loadMoreBtn.style.display = 'none';
    return;
  }
  
  container.innerHTML = state.alerts.map(alert => {
    const isUnread = !alert.read_at;
    const timeAgo = getTimeAgo(alert.created_at);
    const reason = getNotificationReason(alert.notification_type);
    const savings = (parseFloat(alert.target_price_eur) - parseFloat(alert.total_eur)).toFixed(2);
    
    return `
      <div class="inbox-item ${isUnread ? 'unread' : ''}" onclick="openAlertDetail(${alert.id})">
        <div class="inbox-item-icon">🧱</div>
        <div class="inbox-item-content">
          <div class="inbox-item-header">
            <div class="inbox-item-title">${alert.set_name || alert.set_number}</div>
            <div class="inbox-item-time">${timeAgo}</div>
          </div>
          <div class="inbox-item-reason">${reason}</div>
          <div class="inbox-item-details">
            <div class="inbox-item-detail">💰 <strong>${currencySymbol}${parseFloat(alert.total_eur).toFixed(2)}</strong></div>
            <div class="inbox-item-detail">🎯 Target: ${currencySymbol}${parseFloat(alert.target_price_eur).toFixed(2)}</div>
            <div class="inbox-item-detail">✅ Save ${currencySymbol}${savings}</div>
          </div>
        </div>
        <div class="inbox-item-actions" onclick="event.stopPropagation()">
          <a href="${alert.listing_url || '#'}" class="btn btn-primary" target="_blank" onclick="markAlertRead(${alert.id})">Buy</a>
        </div>
      </div>
    `;
  }).join('');
  
  loadMoreBtn.style.display = state.hasMoreAlerts ? 'block' : 'none';
}

function getNotificationReason(type) {
  const reasons = {
    'first_notification': '🆕 First deal found!',
    'better_deal': '🔥 Better deal found!',
    'previous_sold': '🔄 Previous sold - new best!',
    'price_drop': '📉 Price drop!',
  };
  return reasons[type] || '🧱 Deal alert';
}

function getTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

async function openAlertDetail(alertId) {
  const alert = state.alerts.find(a => a.id === alertId);
  if (!alert) return;
  
  // Mark as read
  if (!alert.read_at) {
    await markAlertRead(alertId);
  }
  
  const currencySymbol = getUserCurrencySymbol();
  const savings = (parseFloat(alert.target_price_eur) - parseFloat(alert.total_eur)).toFixed(2);
  const savingsPercent = Math.round((savings / parseFloat(alert.target_price_eur)) * 100);
  
  document.getElementById('alert-detail-title').textContent = `${alert.set_number} - ${alert.set_name || 'LEGO Set'}`;
  document.getElementById('alert-detail-reason').textContent = getNotificationReason(alert.notification_type);
  
  document.getElementById('alert-detail-content').innerHTML = `
    <div style="background: var(--bg-tertiary); border-radius: 12px; padding: 20px; margin-bottom: 16px;">
      <div style="display: grid; gap: 12px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">💰 Price</span>
          <strong>${currencySymbol}${parseFloat(alert.price_eur).toFixed(2)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">📦 Shipping</span>
          <span>${currencySymbol}${parseFloat(alert.shipping_eur).toFixed(2)}</span>
        </div>
        ${alert.import_charges_eur > 0 ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">🛃 Import${alert.import_charges_estimated ? ' (est.)' : ''}</span>
          <span>${currencySymbol}${parseFloat(alert.import_charges_eur).toFixed(2)}</span>
        </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
          <span style="color: var(--text-muted);">➡️ Total</span>
          <strong style="color: var(--success);">${currencySymbol}${parseFloat(alert.total_eur).toFixed(2)}</strong>
        </div>
      </div>
    </div>
    
    <div style="display: grid; gap: 8px; font-size: 0.95rem;">
      <div>🎯 <span style="color: var(--text-muted);">Your target:</span> ${currencySymbol}${parseFloat(alert.target_price_eur).toFixed(2)}</div>
      <div>✅ <span style="color: var(--text-muted);">You save:</span> <strong style="color: var(--accent);">${currencySymbol}${savings} (${savingsPercent}%)</strong></div>
      <div style="margin-top: 8px;">📋 <span style="color: var(--text-muted);">Alert sent:</span> ${new Date(alert.created_at).toLocaleString()}</div>
    </div>
  `;
  
  document.getElementById('alert-detail-buy-btn').href = alert.listing_url || '#';
  
  openModal('alert-detail');
}

// ===========================================
// DASHBOARD TABS
// ===========================================

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.dashboard-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`.dashboard-tab[onclick="switchTab('${tabName}')"]`).classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');
  
  // Load data if needed
  if (tabName === 'notifications' && state.alerts.length === 0) {
    loadAlerts();
  }
}

// ===========================================
// SET AUTOCOMPLETE
// ===========================================

let autocompleteTimeout = null;
let selectedSetNumber = null;

function initAutocomplete() {
  const input = document.getElementById('watch-set');
  const results = document.getElementById('set-autocomplete');
  
  if (!input || !results) return;
  
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    selectedSetNumber = null;
    
    if (autocompleteTimeout) {
      clearTimeout(autocompleteTimeout);
    }
    
    if (query.length < 2) {
      results.classList.remove('active');
      return;
    }
    
    autocompleteTimeout = setTimeout(() => {
      searchSets(query);
    }, 300);
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
      results.classList.remove('active');
    }
  });
  
  input.addEventListener('focus', () => {
    const query = input.value.trim();
    if (query.length >= 2 && results.innerHTML) {
      results.classList.add('active');
    }
  });
}

function initDeleteConfirmation() {
  // Delete account confirmation input validation
  const deleteInput = document.getElementById('delete-confirm-input');
  const deleteBtn = document.getElementById('delete-account-btn');
  if (deleteInput && deleteBtn) {
    deleteInput.addEventListener('input', (e) => {
      deleteBtn.disabled = e.target.value !== 'DELETE';
    });
  }
}

async function searchSets(query) {
  const results = document.getElementById('set-autocomplete');
  
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
  
  document.getElementById('watch-target').focus();
  
  showToast(`Selected: ${setName}`, 'success');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===========================================
// PUSH NOTIFICATIONS
// ===========================================

let vapidPublicKey = null;

async function initPush() {
  // Check if push is supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    updatePushUI(false, 'Not supported');
    return;
  }
  
  state.pushSupported = true;
  
  // Show iOS instructions if needed
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  if (isIOS && !isStandalone) {
    document.getElementById('ios-instructions').style.display = 'block';
  }
  
  // Register service worker
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service worker registered:', registration);
    
    // Get VAPID key
    const keyResponse = await fetch('/api/push/vapid-public-key');
    const keyData = await keyResponse.json();
    vapidPublicKey = keyData.publicKey;
    
    // Check subscription status
    await checkPushSubscription();
  } catch (error) {
    console.error('Push init error:', error);
    updatePushUI(false, 'Error');
  }
}

async function checkPushSubscription() {
  if (!state.pushSupported || !state.user) return;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      // Check if this subscription is registered on our server
      const statusResponse = await fetch(`/api/push/status/${state.user.id}`);
      const statusData = await statusResponse.json();
      
      state.pushSubscribed = statusData.enabled;
      updatePushUI(state.pushSubscribed, state.pushSubscribed ? 'Enabled' : 'Disabled');
      
      if (statusData.deviceCount > 0) {
        document.getElementById('push-devices-row').style.display = 'flex';
        document.getElementById('push-device-count').textContent = statusData.deviceCount;
      }
    } else {
      state.pushSubscribed = false;
      updatePushUI(false, 'Disabled');
    }
  } catch (error) {
    console.error('Check subscription error:', error);
    updatePushUI(false, 'Error');
  }
}

function updatePushUI(enabled, statusText) {
  const dot = document.getElementById('push-status-dot');
  const text = document.getElementById('push-status-text');
  const btn = document.getElementById('push-toggle-btn');
  
  if (!dot || !text || !btn) return;
  
  dot.className = `push-status-dot ${enabled ? 'active' : 'inactive'}`;
  text.textContent = statusText;
  
  if (enabled) {
    btn.textContent = 'Disable Push Notifications';
    btn.classList.remove('btn-push');
    btn.classList.add('btn-danger');
  } else {
    btn.textContent = 'Enable Push Notifications';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-push');
  }
}

async function togglePushNotifications() {
  if (!state.pushSupported) {
    showToast('Push notifications are not supported on this browser', 'error');
    return;
  }
  
  if (!state.user) {
    showToast('Please log in first', 'error');
    return;
  }
  
  if (state.pushSubscribed) {
    await unsubscribePush();
  } else {
    await subscribePush();
  }
}

async function subscribePush() {
  try {
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      showToast('Notification permission denied', 'error');
      return;
    }
    
    const registration = await navigator.serviceWorker.ready;
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    
    // Send subscription to server
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.id,
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });
    
    if (response.ok) {
      state.pushSubscribed = true;
      updatePushUI(true, 'Enabled');
      showToast('Push notifications enabled! 🔔', 'success');
      await checkPushSubscription();
    } else {
      throw new Error('Failed to save subscription');
    }
  } catch (error) {
    console.error('Subscribe error:', error);
    showToast('Failed to enable push notifications', 'error');
  }
}

async function unsubscribePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      // Remove from server
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: state.user.id,
          endpoint: subscription.endpoint,
        }),
      });
      
      // Unsubscribe locally
      await subscription.unsubscribe();
    }
    
    state.pushSubscribed = false;
    updatePushUI(false, 'Disabled');
    document.getElementById('push-devices-row').style.display = 'none';
    showToast('Push notifications disabled', 'success');
  } catch (error) {
    console.error('Unsubscribe error:', error);
    showToast('Failed to disable push notifications', 'error');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ===========================================
// SETTINGS FUNCTIONS
// ===========================================

async function handleSettings(event) {
  event.preventDefault();
  
  if (!state.user) return;
  
  const country = document.getElementById('settings-country').value;
  const timezone = document.getElementById('settings-timezone').value;
  const weeklyDigest = document.getElementById('settings-weekly-digest').checked;
  const reminders = document.getElementById('settings-still-available').checked;
  
  const submitBtn = document.getElementById('settings-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;
    
    // Use the generic PATCH endpoint which handles country change logic
    const user = await apiCall(`/users/${state.user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ship_to_country: country,
        timezone: timezone,
        weekly_digest_enabled: weeklyDigest,
        still_available_reminders: reminders,
      }),
    });
    
    // Check if country changed
    const countryChanged = state.user.ship_to_country !== country;
    
    state.user = user;
    saveToStorage('user', user);
    
    closeModal('settings');
    renderWatches();
    
    if (countryChanged) {
      showToast('Settings saved! Notifications reset for your new region.', 'success');
    } else {
      showToast('Settings saved!', 'success');
    }
  } catch (error) {
    showToast('Failed to save settings', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function connectTelegram() {
  const botUsername = 'BrickAlpha_bot';
  const startParam = state.user ? `start=${state.user.id}` : '';
  window.open(`https://t.me/${botUsername}?${startParam}`, '_blank');
  showToast('Opening Telegram... Send /start to connect', 'success');
}

// ===========================================
// GDPR FUNCTIONS
// ===========================================

async function handleChangePassword(event) {
  event.preventDefault();
  
  if (!state.user) return;
  
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;
  
  // Validation
  if (newPassword.length < 8) {
    showToast('New password must be at least 8 characters', 'error');
    return;
  }
  
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }
  
  const btn = document.getElementById('change-password-btn');
  const originalText = btn.textContent;
  
  try {
    btn.textContent = 'Updating...';
    btn.disabled = true;
    
    await apiCall(`/users/${state.user.id}/password`, {
      method: 'PUT',
      body: JSON.stringify({
        oldPassword: currentPassword,
        newPassword: newPassword,
      }),
    });
    
    // Clear form
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
    
    closeModal('change-password');
    openModal('settings');
    showToast('Password changed successfully! 🔐', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to change password. Is your current password correct?', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function exportUserData() {
  if (!state.user) return;
  
  showToast('Preparing your data export...', 'info');
  
  try {
    const response = await fetch(`/api/users/${state.user.id}/export`);
    
    if (!response.ok) {
      throw new Error('Export failed');
    }
    
    const data = await response.json();
    
    // Create and download file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scoutloot-data-${state.user.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Data exported successfully! 📥', 'success');
  } catch (error) {
    showToast('Failed to export data', 'error');
  }
}

async function handleDeleteAccount(event) {
  event.preventDefault();
  
  if (!state.user) return;
  
  const confirmInput = document.getElementById('delete-confirm-input').value;
  
  if (confirmInput !== 'DELETE') {
    showToast('Please type DELETE to confirm', 'error');
    return;
  }
  
  const btn = document.getElementById('delete-account-btn');
  const originalText = btn.textContent;
  
  try {
    btn.textContent = 'Deleting...';
    btn.disabled = true;
    
    await apiCall(`/users/${state.user.id}`, {
      method: 'DELETE',
    });
    
    // Clear everything and log out
    closeModal('delete-account');
    logout();
    showToast('Your account has been deleted. Goodbye! 👋', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to delete account', 'error');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ===========================================
// PASSWORD RESET FUNCTIONS
// ===========================================

let currentResetToken = null;

async function handleForgotPassword(event) {
  event.preventDefault();
  
  const email = document.getElementById('forgot-email').value;
  const submitBtn = document.getElementById('forgot-submit-btn');
  const originalText = submitBtn.textContent;
  
  try {
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    
    const response = await fetch('/api/users/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json();
    
    if (response.ok) {
      closeModal('forgot-password');
      showToast('If an account exists, a reset link has been sent.', 'success');
      document.getElementById('forgot-email').value = '';
    } else {
      showToast(data.error || 'Failed to send reset email', 'error');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    showToast('Failed to send reset email', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  
  const password = document.getElementById('reset-password').value;
  const confirmPassword = document.getElementById('reset-password-confirm').value;
  const submitBtn = document.getElementById('reset-submit-btn');
  const originalText = submitBtn.textContent;
  
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }
  
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  
  if (!currentResetToken) {
    showToast('Invalid reset token', 'error');
    return;
  }
  
  try {
    submitBtn.textContent = 'Resetting...';
    submitBtn.disabled = true;
    
    const response = await fetch('/api/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentResetToken, password }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      state.user = data.user;
      saveToStorage('user', data.user);
      
      closeResetModal();
      updateUI();
      showDashboard();
      await loadWatches();
      showToast('Password reset successful! Welcome back.', 'success');
    } else {
      showToast(data.error || 'Failed to reset password', 'error');
    }
  } catch (error) {
    console.error('Reset password error:', error);
    showToast('Failed to reset password', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function closeResetModal() {
  closeModal('reset-password');
  currentResetToken = null;
  const url = new URL(window.location);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url);
  document.getElementById('reset-password').value = '';
  document.getElementById('reset-password-confirm').value = '';
}

async function checkForResetToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset');
  
  if (resetToken) {
    try {
      const response = await fetch('/api/users/verify-reset-token/' + resetToken);
      const data = await response.json();
      
      if (data.valid) {
        currentResetToken = resetToken;
        document.getElementById('reset-email-display').textContent = 
          'Enter a new password for ' + data.email;
        openModal('reset-password');
      } else {
        showToast('This reset link is invalid or has expired.', 'error');
        const url = new URL(window.location);
        url.searchParams.delete('reset');
        window.history.replaceState({}, '', url);
      }
    } catch (error) {
      console.error('Error verifying reset token:', error);
      showToast('Failed to verify reset link.', 'error');
    }
  }
}

// Check for alert deep link
async function checkForAlertDeepLink() {
  const urlParams = new URLSearchParams(window.location.search);
  const alertId = urlParams.get('alert');
  
  if (alertId && state.user) {
    // Switch to notifications tab and load the alert
    switchTab('notifications');
    await loadAlerts();
    
    // Try to open the alert detail
    const alert = state.alerts.find(a => a.id === parseInt(alertId));
    if (alert) {
      openAlertDetail(alert.id);
    }
    
    // Clean URL
    const url = new URL(window.location);
    url.searchParams.delete('alert');
    window.history.replaceState({}, '', url);
  }
}

// ===========================================
// UI FUNCTIONS
// ===========================================

function updateUI() {
  const navAuth = document.getElementById('nav-auth');
  const userMenu = document.getElementById('user-menu');
  
  if (state.user) {
    navAuth.style.display = 'none';
    userMenu.style.display = 'block';
    
    const avatar = document.getElementById('user-avatar');
    const emailSpan = document.getElementById('user-email');
    
    avatar.textContent = state.user.email.charAt(0).toUpperCase();
    emailSpan.textContent = state.user.email;
    
    // Update settings modal with user's current values
    if (state.user.ship_to_country) {
      document.getElementById('settings-country').value = state.user.ship_to_country;
    }
    if (state.user.timezone) {
      document.getElementById('settings-timezone').value = state.user.timezone;
    }
    
    document.getElementById('settings-weekly-digest').checked = state.user.weekly_digest_enabled ?? true;
    document.getElementById('settings-still-available').checked = state.user.still_available_reminders ?? false;
    
    if (state.user.telegram_chat_id) {
      document.getElementById('telegram-connected').style.display = 'inline';
      document.getElementById('telegram-disconnected').style.display = 'none';
    } else {
      document.getElementById('telegram-connected').style.display = 'none';
      document.getElementById('telegram-disconnected').style.display = 'inline';
    }
    
    // Init push after user is loaded
    initPush();
  } else {
    navAuth.style.display = 'flex';
    userMenu.style.display = 'none';
    document.body.classList.remove('logged-in');
  }
}

function updateDashboardStats() {
  document.getElementById('dash-watches').textContent = state.watches.filter(w => w.status === 'active').length;
  document.getElementById('dash-alerts-total').textContent = state.watches.reduce((sum, w) => sum + (w.total_alerts_sent || 0), 0);
  document.getElementById('dash-tier').textContent = state.user?.subscription_tier ? 
    state.user.subscription_tier.charAt(0).toUpperCase() + state.user.subscription_tier.slice(1) : 'Free';
}

function showDashboard() {
  document.body.classList.add('logged-in');
  loadWatches();
  loadAlerts();
}

// ===========================================
// MODAL FUNCTIONS
// ===========================================

function openModal(name) {
  document.getElementById(`modal-${name}`).classList.add('active');
}

function closeModal(name) {
  document.getElementById(`modal-${name}`).classList.remove('active');
  
  // Reset delete confirmation input when closing
  if (name === 'delete-account') {
    const input = document.getElementById('delete-confirm-input');
    if (input) {
      input.value = '';
      document.getElementById('delete-account-btn').disabled = true;
    }
  }
}

function switchModal(from, to) {
  closeModal(from);
  setTimeout(() => openModal(to), 150);
}

function initModalListeners() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });
}

// ===========================================
// TOAST NOTIFICATIONS
// ===========================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = '✔';
  if (type === 'error') icon = '✕';
  if (type === 'info') icon = 'ℹ';
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function scrollTo(selector) {
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth' });
}

// ===========================================
// INITIALIZATION
// ===========================================

async function init() {
  // Check cookie consent
  checkCookieConsent();
  
  // Initialize event listeners
  initModalListeners();
  initAutocomplete();
  initDeleteConfirmation();
  
  const savedUser = loadFromStorage('user');
  if (savedUser) {
    try {
      const user = await apiCall(`/users/${savedUser.id}`);
      state.user = user;
      updateUI();
      showDashboard();
    } catch (error) {
      clearStorage();
    }
  }
  
  await checkForResetToken();
  await checkForAlertDeepLink();
}

document.addEventListener('DOMContentLoaded', init);
