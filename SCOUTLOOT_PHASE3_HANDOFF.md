# ScoutLoot V26 Phase 3: Frontend Polish for Minifig Watches

## Context for AI Assistant

You are completing Phase 3 of minifigure watch support for ScoutLoot. **Read this entire document before making any changes.**

### Previous Phases (COMPLETED - DO NOT MODIFY)

**Phase 1** ✅ Database + lookup services
- `src/services/minifigs.ts` - lookupMinifig(), getMinifigScannerIds()
- `src/providers/brickowl/client.ts` - BOID lookup with minifigs table cache
- Database columns: bricklink_id, brickowl_boid in minifigs table

**Phase 2** ✅ Scanner integration  
- `src/services/scanner.ts` - Uses Bricklink codes for eBay, BOIDs for BrickOwl
- `src/routes/watches.ts` - fetchAndUpdateMinifigInfo() uses lookupMinifig()
- `public/js/app.js` - renderWatches() displays minifig name and icon

### What Works Now
- Minifig search returns results with images ✅
- Watch creation saves minifig ✅
- Watch list shows minifig NAME ✅
- Watch list shows 🧍 fallback icon ✅
- Scanner searches eBay with Bricklink codes ✅
- Scanner searches BrickOwl with BOIDs ✅

### What's Missing (Phase 3 Scope)
- Watch list shows fallback emoji instead of actual image
- Root cause: When watch is created, only item_id (Bricklink code) is saved
- The search results HAVE the image URL but it's not passed to backend

---

## Phase 3 Requirements

### Problem Statement

When user searches for minifig "sw0010":
1. Search API returns: `{ fig_num: "fig-003509", name: "C-3PO", set_img_url: "https://cdn.rebrickable.com/..." }`
2. User clicks to select → `selectMinifig('fig-003509', 'C-3PO')` is called
3. Watch is created with `item_id: 'sw0010'` (the search term, not the fig_num!)
4. Backend creates minifig entry with bricklink_id but NO image

**Solution**: Pass the image URL from search results when creating the watch.

---

## Files to Modify

### 1. public/js/app.js

#### A. Update selectMinifig() to capture image URL

**Current code** (around line 520):
```javascript
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
```

**New code**:
```javascript
let selectedMinifigImageUrl = null; // Add this with other state variables at top

function selectMinifig(figNum, figName, imageUrl) {
  const input = document.getElementById('watch-set');
  const results = document.getElementById('set-autocomplete');
  
  input.value = figNum;
  selectedMinifigId = figNum;
  selectedMinifigImageUrl = imageUrl || null; // NEW: capture image
  selectedSetNumber = null;
  selectedItemType = 'minifig';
  results.classList.remove('active');
  
  document.getElementById('watch-target').focus();
  showToast(`Selected: ${figName}`, 'success');
}
```

#### B. Update searchSetsAndMinifigs() to pass image URL to selectMinifig

Find the minifig result template in searchSetsAndMinifigs() and update the onclick:

**Current** (approximate):
```javascript
onclick="selectMinifig('${item.fig_num}', '${escapeHtml(item.name)}')"
```

**New**:
```javascript
onclick="selectMinifig('${item.fig_num}', '${escapeHtml(item.name)}', '${item.set_img_url || ''}')"
```

#### C. Update handleAddWatch() to send image URL

**Current** (around line 460):
```javascript
const watch = await apiCall('/watches', {
  method: 'POST',
  body: JSON.stringify({
    user_id: state.user.id,
    item_type: selectedItemType || 'set',
    item_id: (selectedItemType === 'minifig') ? selectedMinifigId : (selectedSetNumber || document.getElementById('watch-set').value.trim()),
    set_number: setNumber,
    target_total_price_eur: targetPrice,
    min_total_eur: minPrice,
    condition: condition,
  }),
});
```

**New**:
```javascript
const watch = await apiCall('/watches', {
  method: 'POST',
  body: JSON.stringify({
    user_id: state.user.id,
    item_type: selectedItemType || 'set',
    item_id: (selectedItemType === 'minifig') ? selectedMinifigId : (selectedSetNumber || document.getElementById('watch-set').value.trim()),
    set_number: setNumber,
    target_total_price_eur: targetPrice,
    min_total_eur: minPrice,
    condition: condition,
    minifig_image_url: selectedItemType === 'minifig' ? selectedMinifigImageUrl : null, // NEW
  }),
});
```

#### D. Reset selectedMinifigImageUrl after watch creation

Add to the reset section at the end of handleAddWatch():
```javascript
selectedMinifigImageUrl = null;
```

---

### 2. src/routes/watches.ts

#### A. Accept minifig_image_url in POST body

**Find** the destructuring in POST / handler (around line 90):
```typescript
const {
  user_id,
  set_number,
  item_type,
  item_id,
  target_total_price_eur,
  ...
} = req.body;
```

**Add** `minifig_image_url`:
```typescript
const {
  user_id,
  set_number,
  item_type,
  item_id,
  target_total_price_eur,
  min_total_eur,
  condition,
  ship_from_countries,
  min_seller_rating,
  min_seller_feedback,
  exclude_words,
  enable_brickowl_alerts,
  minifig_image_url, // NEW
} = req.body;
```

#### B. Update fetchAndUpdateMinifigInfo to accept and use image URL

**Find** the call to fetchAndUpdateMinifigInfo (around line 120):
```typescript
if (watchItemType === 'minifig') {
  fetchAndUpdateMinifigInfo(actualItemId).catch(err => {
    console.error('Background Rebrickable minifig fetch failed:', err);
  });
}
```

**Change to**:
```typescript
if (watchItemType === 'minifig') {
  fetchAndUpdateMinifigInfo(actualItemId, minifig_image_url).catch(err => {
    console.error('Background minifig info update failed:', err);
  });
}
```

#### C. Update fetchAndUpdateMinifigInfo function signature

**Find** the function (around line 50):
```typescript
async function fetchAndUpdateMinifigInfo(figNum: string): Promise<void> {
```

**Change to**:
```typescript
async function fetchAndUpdateMinifigInfo(figNum: string, providedImageUrl?: string): Promise<void> {
```

**Then** in the function body, after the lookup, add logic to use providedImageUrl:

```typescript
// After: const result = await lookupMinifig(figNum);
// Add:
const imageUrl = providedImageUrl || result.image_url;

// In the UPDATE query, use imageUrl instead of result.image_url
```

---

## Testing Plan

### Test 1: Create New Minifig Watch
1. Delete existing minifig watches: 
   ```sql
   DELETE FROM watches WHERE item_type = 'minifig';
   DELETE FROM minifigs WHERE image_url IS NULL;
   ```
2. Search for "sw0010" in Add Watch modal
3. Verify search result shows image
4. Select and create watch
5. Verify watch list shows the IMAGE (not just emoji)

### Test 2: Verify Scanner Still Works
```bash
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "TRUNCATE watch_notification_state, alert_history;"
curl -X POST https://scoutloot.com/api/scan/run | jq
pm2 logs scoutloot --lines 30 | grep -i minifig
```

### Test 3: API Response Check
```bash
curl -s "https://scoutloot.com/api/watches/user/1" | jq '.watches[] | select(.item_type == "minifig") | {item_id, minifig_name, minifig_image_url}'
```

---

## Server Access

```
SSH: ssh root@188.166.160.168
App: /var/www/scoutloot/app
Database: PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar
Build: cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker
```

---

## Critical Rules

1. **DO NOT modify scanner.ts** - Phase 2 scanning is working
2. **DO NOT modify minifigs.ts** - Core service is done
3. **DO NOT modify brickowl/client.ts** - BOID lookup is working
4. **Test after each file change** - Don't batch multiple changes
5. **Create backups before editing**:
   ```bash
   cp /var/www/scoutloot/app/public/js/app.js /var/www/scoutloot/app/public/js/app.js.bak
   cp /var/www/scoutloot/app/src/routes/watches.ts /var/www/scoutloot/app/src/routes/watches.ts.bak
   ```

---

## Definition of Done

- [ ] selectMinifig() captures image URL
- [ ] handleAddWatch() sends minifig_image_url to backend
- [ ] Backend saves image_url to minifigs table
- [ ] New minifig watches show actual images (not emoji fallback)
- [ ] Scanner still works (no regression)
- [ ] All existing set watches still work

---

## Current File Locations (for reference)

| Project File | Server Path |
|--------------|-------------|
| `FRONTEND_app.js` or `app.js` | `public/js/app.js` |
| `routes-watches.ts` | `src/routes/watches.ts` |
