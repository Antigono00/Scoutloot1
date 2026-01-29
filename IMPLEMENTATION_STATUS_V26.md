# ScoutLoot Implementation Status V26
## Updated: January 30, 2026

---

## 🎯 Current Status: PRODUCTION + Minifig ID Mapping

The app is live at **https://scoutloot.com** with:
- **NEW V26: Minifig ID Mapping** - Scanner uses correct IDs per marketplace
- V25: Minifigure Watch Support - Full frontend + backend for minifig tracking
- V24: BrickOwl Marketplace Integration - Second marketplace alongside eBay
- V23: Dashboard & Modals i18n - All user-facing UI fully translated
- V22: Internationalization (i18n) - 7 languages with URL routing & SEO
- V21: Set Pages Phase 4 (SEO & Polish)
- Web Push Notifications + Telegram
- PWA Support
- USA, Canada, UK & Europe marketplace support
- Multi-currency support (€/£/$)

---

## ✅ V26 Features (January 30, 2026)

### Minifig ID Mapping System - COMPLETE (Phase 1 & 2)

Different marketplaces use different ID systems for minifigures:

| ID Type | Example | Used For |
|---------|---------|----------|
| Bricklink | sw0010, st005 | eBay search (in listing titles) |
| BrickOwl BOID | 547141 | BrickOwl API calls |
| Rebrickable | fig-003509 | Images, database primary key |

#### Database Changes (V26)

```sql
-- minifigs table now has:
ALTER TABLE minifigs ADD COLUMN bricklink_id VARCHAR(20);
ALTER TABLE minifigs ADD COLUMN brickowl_boid VARCHAR(20);

-- Indexes for lookups
CREATE INDEX idx_minifigs_bricklink ON minifigs(bricklink_id);
CREATE INDEX idx_minifigs_boid ON minifigs(brickowl_boid);
```

#### New/Updated Functions

| File | Function | Purpose |
|------|----------|---------|
| `src/services/minifigs.ts` | `lookupMinifig()` | Resolves any ID format to all IDs |
| `src/services/minifigs.ts` | `getMinifigScannerIds()` | Returns correct ID for each marketplace |
| `src/services/minifigs.ts` | `detectMinifigIdFormat()` | Detects bricklink/rebrickable/name |
| `src/providers/brickowl/client.ts` | `findBoidForMinifig()` | BOID lookup with minifigs table cache |

#### Scanner Flow (V26)

```
[Scanner] Scanning MINIFIG: st005 -> ES
[Scanner] Resolved IDs: ebay="st005", boid=200304, name="Dustin Henderson"
[Scanner] eBay minifig search: "st005 minifigure lego"
[BrickOwl] Getting availability: BOID 200304, destination ES
```

### Frontend Display - COMPLETE

- `renderWatches()` now checks `item_type` and displays:
  - 🧍 icon for minifigs (vs 🧱 for sets)
  - `minifig_name` instead of `set_name`
  - Purple "MINIFIG" badge
  - `minifig_image_url` when available

---

## 🔄 Phase 3: Pending (Frontend Polish)

**Not yet implemented:**
- Pass image URL from search results to watch creation
- Display actual minifig images (currently shows fallback emoji)

See `SCOUTLOOT_PHASE3_HANDOFF.md` for implementation details.

---

## 📊 Database Schema (V26)

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts + notification preferences |
| `watches` | Price watches (item_type: 'set' or 'minifig') |
| `listings` | eBay listings cache |
| `alerts` | Alert history |
| `alert_history` | Deduplication tracking |
| `watch_notification_state` | Notification state per watch |
| `sets` | LEGO set catalog |
| `minifigs` | Minifig catalog with ID mappings |
| `brickowl_boids` | BOID cache (30-day TTL) |
| `subscription_tiers` | Tier limits |
| `push_subscriptions` | Web push endpoints |

### Minifigs Table Structure

```sql
CREATE TABLE minifigs (
  minifig_id VARCHAR(50) PRIMARY KEY,  -- Rebrickable ID or Bricklink
  bricklink_id VARCHAR(20),            -- sw0010, st005, etc.
  brickowl_boid VARCHAR(20),           -- BrickOwl internal ID
  name TEXT,
  num_parts INTEGER,
  image_url TEXT,
  rebrickable_url TEXT,
  set_numbers TEXT[],
  theme VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📁 File Structure (V26)

```
/var/www/scoutloot/app/
├── src/
│   ├── index.ts                # Express server with i18n
│   ├── worker.ts               # BullMQ worker entry
│   ├── config.ts               # Environment config
│   ├── db/
│   │   ├── index.ts            # PostgreSQL connection
│   │   └── redis.ts            # Redis connection
│   │
│   ├── providers/
│   │   ├── ebay/               # eBay Browse API
│   │   └── brickowl/           # BrickOwl API (V24+V26)
│   │       ├── client.ts       # Updated: BOID lookup uses minifigs table
│   │       ├── normalizer.ts
│   │       ├── shipping.ts
│   │       └── types.ts
│   │
│   ├── routes/
│   │   ├── index.ts            # Main router
│   │   ├── alerts.ts           # Alerts inbox
│   │   ├── minifigs.ts         # Minifig search API
│   │   ├── scan.ts             # Scan trigger
│   │   ├── sets.ts             # Set detail API
│   │   ├── users.ts            # User CRUD
│   │   └── watches.ts          # Watch CRUD (V26: uses lookupMinifig)
│   │
│   ├── services/
│   │   ├── alerts.ts           # Alert generation
│   │   ├── listings.ts         # Listings CRUD
│   │   ├── minifigs.ts         # V26: ID mapping functions
│   │   ├── scanner.ts          # V26: Uses getMinifigScannerIds()
│   │   ├── watches.ts          # Watch CRUD
│   │   └── ...
│   │
│   ├── telegram/
│   │   ├── bot.ts              # Grammy bot
│   │   └── escape.ts           # Message formatting
│   │
│   └── utils/
│       ├── listingFilter.ts    # Set quality filter
│       ├── listingFilterMinifig.ts  # Minifig quality filter
│       └── ...
│
├── public/
│   ├── index.html              # Main SPA
│   ├── js/
│   │   └── app.js              # V26: renderWatches shows minifigs
│   └── ...
│
└── dist/                       # Compiled output
```

---

## 🧪 Testing Minifig Watches

### Create a minifig watch:
1. Go to https://scoutloot.com
2. Log in and click "Add Watch"
3. Search for a minifig by Bricklink code (e.g., "sw0010")
4. Select one with "MINIFIG" label
5. Set target price and add

### Verify scanner:
```bash
# Reset notifications and scan
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "TRUNCATE watch_notification_state, alert_history;"
curl -X POST https://scoutloot.com/api/scan/run | jq

# Check logs for minifig scanning
pm2 logs scoutloot --lines 50 | grep -i "resolved ids\|minifig"

# Check minifig in database
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "SELECT minifig_id, bricklink_id, brickowl_boid, name FROM minifigs WHERE bricklink_id IS NOT NULL LIMIT 10;"
```

---

## 🚀 Deployment Commands

```bash
# Upload file from Mac
scp ~/Downloads/FILENAME root@188.166.160.168:/var/www/scoutloot/app/PATH/

# Build and restart on server
cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker

# Full deploy from GitHub
cd /var/www/scoutloot/app && git pull && npm run build && pm2 restart scoutloot scoutloot-worker
```

---

## 📜 Version History

| Version | Date | Changes |
|---------|------|---------|
| V26 | Jan 30, 2026 | Minifig ID mapping (Bricklink↔BrickOwl↔Rebrickable), scanner uses correct IDs per marketplace, frontend displays minifig watches |
| V25 | Jan 29, 2026 | Minifig watch support (search, create, display) |
| V24 | Jan 29, 2026 | BrickOwl marketplace integration, dual-marketplace scanning |
| V23 | Jan 28, 2026 | Dashboard & modals i18n |
| V22 | Jan 27, 2026 | Full i18n with 7 languages |
| V21 | Jan 26, 2026 | Set pages SEO & polish |
| V20 | Jan 25, 2026 | Set detail pages with Chart.js |

---

## 🔗 Links

- **Live Site**: https://scoutloot.com
- **GitHub**: https://github.com/Antigono00/Scoutloot1
- **Server**: ssh root@188.166.160.168
