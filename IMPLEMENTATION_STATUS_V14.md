# ScoutLoot Implementation Status V14
## Updated: January 25, 2026

---

## 🎯 Current Status: PRODUCTION + GLOBAL + WEB PUSH

The app is live at **https://scoutloot.com** with:
- **NEW: Web Push Notifications** (dual channel with Telegram)
- **NEW: Notifications Inbox** (view all alerts in browser)
- **NEW: PWA Support** (installable web app)
- **FIXED: Minor EU markets** (SK, CZ, PT, etc. now return correct EU listings)
- USA & Canada marketplace support (EBAY_US, EBAY_CA)
- UK marketplace support (EBAY_GB)
- Complete EU coverage (EBAY_DE, EBAY_FR, EBAY_ES, EBAY_IT)
- Import charges calculation (EU↔UK)
- Multi-currency support (€/£/$)

---

## ✅ V14.1 Bug Fix (January 25, 2026)

### Minor EU Markets Fix

**Problem discovered:** Users in Slovakia (SK) and other minor EU markets were getting US listings instead of EU listings.

**Root cause:** The `itemLocationRegion:EUROPEAN_UNION` filter combined with `deliveryCountry:SK` caused eBay API to return incorrect results (US listings).

**Solution:** Removed the `itemLocationRegion:EUROPEAN_UNION` filter for EU countries without their own eBay marketplace. The `ship_from_countries` post-filter handles EU-only filtering, and `deliveryCountry` still ensures correct shipping calculation.

**Countries affected (now fixed):**
| Country | Code | Mapped To |
|---------|------|-----------|
| Slovakia | SK | EBAY_DE |
| Czechia | CZ | EBAY_DE |
| Portugal | PT | EBAY_ES |
| Luxembourg | LU | EBAY_DE |
| Greece | GR | EBAY_DE |
| Malta | MT | EBAY_IT |
| Cyprus | CY | EBAY_DE |
| Sweden | SE | EBAY_DE |
| Denmark | DK | EBAY_DE |
| Finland | FI | EBAY_DE |
| Estonia | EE | EBAY_DE |
| Latvia | LV | EBAY_DE |
| Lithuania | LT | EBAY_DE |
| Hungary | HU | EBAY_DE |
| Slovenia | SI | EBAY_AT |
| Croatia | HR | EBAY_DE |
| Romania | RO | EBAY_DE |
| Bulgaria | BG | EBAY_DE |

**Countries using EUROPEAN_UNION filter (works correctly):**
DE, FR, ES, IT, NL, BE, AT, IE, PL

**File changed:** `src/providers/ebay/client.ts`

---

## ✅ V14 Features (January 25, 2026)

### 1. Web Push Notifications
- **Dual channel alerts**: Users receive BOTH Telegram AND browser push
- **Multi-device support**: Enable push on multiple browsers/devices
- **Smart error handling**: Auto-removes dead subscriptions (410/404)
- **VAPID authentication**: Secure push subscription
- **Files created:**
  - `src/services/push.ts` - Subscription management, notification sending
  - `src/jobs/pushQueue.ts` - BullMQ queue for push notifications
  - `src/jobs/pushWorker.ts` - Worker processes push jobs
  - `src/routes/push.ts` - Push API endpoints

### 2. Notifications Inbox
- **Browser-based alert history**: View all deals in browser
- **Read/unread tracking**: Know which alerts you've seen
- **Pagination support**: Cursor-based pagination
- **Deep linking**: Push notifications open specific alerts
- **Files updated:**
  - `src/routes/alerts.ts` - Inbox endpoints (/inbox, /read, /unread-count)
  - `src/services/alerts.ts` - Added listing_url, set_name fields

### 3. PWA Support
- **Installable web app**: Add to Home Screen on mobile/desktop
- **Service Worker**: Handles push events, offline support
- **Web App Manifest**: Proper PWA configuration
- **Files created:**
  - `public/sw.js` - Service worker for push notifications
  - `public/manifest.json` - PWA manifest

### 4. Frontend Updates
- **Push settings UI**: Enable/disable in Settings modal
- **Notifications tab**: Dashboard shows Inbox alongside Watches
- **Device count display**: Shows number of connected devices
- **iOS instructions**: Special guidance for Add to Home Screen
- **Files updated:**
  - `public/index.html` - Complete UI overhaul with inbox

### 5. Scanner Integration
- **Dual notification dispatch**: Scanner queues both Telegram and Push
- **Files updated:**
  - `src/services/scanner.ts` - Added enqueuePushAlert alongside Telegram

### Database Migration (V14)
```sql
-- Push subscriptions table
CREATE TABLE push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  device_name VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  failure_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id, is_active);
CREATE INDEX idx_push_subs_endpoint ON push_subscriptions(endpoint);

-- Alert history additions
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS listing_url TEXT;
ALTER TABLE alert_history ADD COLUMN IF NOT EXISTS set_name VARCHAR(255);
```

### Environment Variables Added
```
VAPID_PUBLIC_KEY=BA75G-v534F-...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@scoutloot.com
```

### NPM Packages Added
```bash
npm install web-push --save
npm install --save-dev @types/web-push
```

---

## ✅ V13 Features (January 25, 2026)

### USA & Canada Marketplace Support
- **EBAY_US marketplace** for US users
- **EBAY_CA marketplace** for Canadian users
- Dynamic marketplace selection based on user's ship_to_country
- USD/CAD currency support in alerts

### Region-Aware Ship-From Countries
- **EU/UK users** → ship_from includes all 28 EU+UK countries
- **US/CA users** → ship_from includes only US + CA

---

## ✅ V12 Features (January 25, 2026)

### Currency Symbol in Telegram Alerts
- Correct currency symbol based on marketplace (£/€/$)

### LED Lighting Kit Filter
- 50+ LED-related keywords filtered
- Multi-language: EN, DE, FR, ES, IT, NL

### Rate Limiting & Security
- Global: 200 requests per 15 min per IP
- Auth: 10 attempts per 15 min
- Password reset: 3 attempts per hour

---

## 🗄️ Database Schema (Current)

### Tables
| Table | Purpose |
|-------|---------|
| `users` | User accounts, settings, Telegram, ship_to_country |
| `watches` | User watch configurations |
| `sets` | LEGO set metadata (from Rebrickable) |
| `listings` | Cached eBay listings |
| `alert_history` | Sent alerts with read status |
| `watch_notification_state` | Tracks last notification per watch |
| `subscription_tiers` | Tier limits configuration |
| `push_subscriptions` | Web push subscriptions |

---

## 📁 File Structure (V14)

```
/var/www/scoutloot/app/
├── src/
│   ├── config.ts                 # Environment config + VAPID keys
│   ├── index.ts                  # Express server
│   ├── worker.ts                 # Worker entry (Telegram + Push)
│   │
│   ├── db/
│   │   ├── index.ts              # PostgreSQL connection
│   │   └── redis.ts              # Redis connection
│   │
│   ├── jobs/
│   │   ├── telegramQueue.ts      # Telegram BullMQ queue
│   │   ├── telegramWorker.ts     # Telegram worker
│   │   ├── pushQueue.ts          # Push BullMQ queue
│   │   ├── pushWorker.ts         # Push worker
│   │   └── scheduledJobs.ts      # Cron jobs
│   │
│   ├── providers/
│   │   └── ebay/
│   │       ├── auth.ts           # eBay OAuth
│   │       ├── client.ts         # eBay API (US/CA/UK/EU) - UPDATED V14.1
│   │       ├── normalizer.ts     # Listing normalizer
│   │       ├── types.ts          # TypeScript types
│   │       └── index.ts          # Provider exports
│   │
│   ├── routes/
│   │   ├── index.ts              # Main router
│   │   ├── alerts.ts             # Alerts + Inbox routes
│   │   ├── push.ts               # Push notification routes
│   │   ├── scan.ts               # Scan routes
│   │   ├── sets.ts               # Sets search
│   │   ├── users.ts              # Users routes
│   │   └── watches.ts            # Watches routes
│   │
│   ├── services/
│   │   ├── alerts.ts             # Alert logic + inbox queries
│   │   ├── delay.ts              # Delay calculation
│   │   ├── email.ts              # Resend email service
│   │   ├── listings.ts           # Listings CRUD
│   │   ├── notificationState.ts  # Notification state
│   │   ├── push.ts               # Push notification service
│   │   ├── scanner.ts            # Scan cycle (dual notifications)
│   │   ├── sets.ts               # Sets lookup
│   │   ├── sync-sets.ts          # Rebrickable sync
│   │   ├── users.ts              # Users CRUD
│   │   └── watches.ts            # Watches CRUD
│   │
│   ├── telegram/
│   │   ├── bot.ts                # Grammy bot
│   │   └── escape.ts             # Message formatting
│   │
│   └── utils/
│       ├── affiliate.ts          # eBay affiliate links
│       ├── fingerprint.ts        # Listing fingerprint
│       ├── importCharges.ts      # Import duty calculator
│       ├── listingFilter.ts      # Quality filter
│       ├── money.ts              # Price utilities
│       ├── normalize.ts          # Title normalization
│       └── time.ts               # Time utilities
│
├── public/
│   ├── index.html                # Full SPA with inbox
│   ├── sw.js                     # Service worker
│   ├── manifest.json             # PWA manifest
│   ├── privacy.html              # Privacy policy
│   ├── terms.html                # Terms of service
│   └── faq.html                  # FAQ page
│
└── package.json
```

---

## 🔔 Push Notification Flow

```
1. User enables push in Settings
   └── Browser requests permission
   └── PushManager.subscribe() creates subscription
   └── Frontend POSTs to /api/push/subscribe
   └── Backend saves to push_subscriptions table

2. Scanner finds deal below target
   └── createAlert() inserts to alert_history
   └── enqueueTelegramAlert() → Telegram queue
   └── enqueuePushAlert() → Push queue

3. Push Worker processes job
   └── Loads subscription from DB
   └── web-push.sendNotification()
   └── Success: reset failure count
   └── 410/404: remove dead subscription
   └── Other error: increment failure count

4. User receives notification
   └── Service worker shows notification
   └── Click "Buy" → Opens eBay listing
   └── Click "View" → Opens ScoutLoot inbox
```

---

## 🧪 Test Commands

```bash
# Reset notifications and scan
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "TRUNCATE watch_notification_state, alert_history;"
curl -X POST https://scoutloot.com/api/scan/run | jq

# Check push subscriptions
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "SELECT id, user_id, device_name, is_active FROM push_subscriptions;"

# Send test push notification
curl -X POST https://scoutloot.com/api/push/test/1 | jq

# Check push queue stats
curl https://scoutloot.com/api/push/queue-stats | jq

# Check VAPID key
curl https://scoutloot.com/api/push/vapid-public-key | jq

# Test minor EU market search (SK should return EU listings)
cd /var/www/scoutloot/app && node -e "
const { searchEbay } = require('./dist/providers/ebay/client.js');
searchEbay('75192', 'SK', { limit: 5 }).then(r => {
  console.log('Total:', r.total);
  r.itemSummaries?.slice(0,5).forEach(i => console.log(i.itemLocation?.country, i.price?.value));
});
"

# View logs
pm2 logs scoutloot --lines 50
pm2 logs scoutloot-worker --lines 50
```

---

## 📋 API Endpoints (V14)

### Push Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/push/vapid-public-key` | Get VAPID public key |
| POST | `/api/push/subscribe` | Save push subscription |
| POST | `/api/push/unsubscribe` | Remove subscription |
| GET | `/api/push/subscriptions/:userId` | Get user's subscriptions |
| GET | `/api/push/status/:userId` | Check if push enabled |
| DELETE | `/api/push/subscription/:id` | Delete specific subscription |
| GET | `/api/push/queue-stats` | Queue statistics |
| POST | `/api/push/test/:userId` | Send test notification |

### Alerts Inbox
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/inbox/:userId` | Get paginated alerts |
| GET | `/api/alerts/:alertId` | Get single alert |
| POST | `/api/alerts/:alertId/read` | Mark alert as read |
| POST | `/api/alerts/mark-all-read/:userId` | Mark all as read |
| GET | `/api/alerts/unread-count/:userId` | Get unread count |

---

## 📊 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| V14.1 | Jan 25, 2026 | Fix minor EU markets (SK, CZ, PT, etc.) returning wrong listings |
| V14 | Jan 25, 2026 | Web Push notifications, Notifications Inbox, PWA support |
| V13 | Jan 25, 2026 | USA/Canada support, region-aware ship_from |
| V12 | Jan 25, 2026 | Currency symbols, LED filter, rate limiting |
| V11 | Jan 24, 2026 | UK marketplace, import charges calculation |
| V10 | Jan 23, 2026 | Password reset flow, email service |
| V9 | Jan 22, 2026 | Smart notification system |

---

## 🔧 Server Info

```
Server: ssh root@188.166.160.168
App path: /var/www/scoutloot/app
Database: PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar
PM2: pm2 status / pm2 logs / pm2 restart all
GitHub: https://github.com/Antigono00/Scoutloot1
```

---

## 📜 Next Steps

### Immediate
- [ ] BrickOwl API integration (awaiting API access)
- [ ] iOS-specific push improvements
- [ ] Notification preferences (frequency, quiet hours for push)

### Future Roadmap
- [ ] BrickLink integration (reference prices)
- [ ] Stripe payment integration
- [ ] Amazon integration (US + EU)
- [ ] Price history charts
- [ ] Mobile app (React Native)
