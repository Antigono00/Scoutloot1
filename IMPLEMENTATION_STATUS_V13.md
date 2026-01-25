# ScoutLoot Implementation Status V13
## Updated: January 25, 2026

---

## 🎯 Current Status: PRODUCTION + GLOBAL (EU/UK + USA/CANADA)

The app is live at **https://scoutloot.com** with:
- **NEW: USA & Canada marketplace support** (EBAY_US, EBAY_CA)
- **NEW: Region-aware ship_from filtering** (NA users see NA listings only)
- Complete UK marketplace support (EBAY_GB)
- Import charges calculation (EU↔UK)
- Correct currency symbols (£/€/$)
- LED lighting kit filtering
- Rate limiting & security protection

---

## ✅ V13 Features (January 25, 2026)

### 1. USA & Canada Marketplace Support
- **EBAY_US marketplace** for US users
- **EBAY_CA marketplace** for Canadian users
- Dynamic marketplace selection based on user's ship_to_country
- USD/CAD currency support in alerts
- **Files changed:** `client.ts`, `escape.ts`, `index.html`

### 2. Region-Aware Ship-From Countries
- **Automatic region detection** when creating watches
- **EU/UK users** → ship_from includes all 28 EU+UK countries
- **US/CA users** → ship_from includes only US + CA
- **Helper functions:** `isNorthAmericaCountry()`, `isEUUKCountry()`, `getDefaultShipFromCountries()`
- **Files changed:** `watches.ts`

### 3. Multi-Region eBay Client
- **Three region blocks:** EU, UK, North America
- **Marketplace mapping:**
  - US → EBAY_US
  - CA → EBAY_CA  
  - GB/UK → EBAY_GB
  - EU countries → Closest EU marketplace
- **Item location filtering:**
  - NA users: No region filter (allows US+CA)
  - UK users: No region filter (allows UK+EU)
  - EU users: `itemLocationRegion:EUROPEAN_UNION`
- **Files changed:** `client.ts`

### 4. Frontend Region Support
- **North America region** in country dropdowns (🇺🇸 USA, 🇨🇦 Canada)
- **North America timezones** (New York, Chicago, Denver, Los Angeles, Toronto, Vancouver)
- **Dashboard "Region" column** shows EU/UK or NA
- **Files changed:** `index.html`

### 5. Currency Symbols Extended
- **$** for USD (US marketplace)
- **C$** for CAD (Canada marketplace)
- **£** for GBP (UK marketplace)
- **€** for EUR (EU marketplaces)
- **Files changed:** `escape.ts`

### SQL Migrations Applied (V13)
```sql
-- Fix US/CA watches to use NA ship_from_countries
UPDATE watches w
SET ship_from_countries = ARRAY['US', 'CA']
FROM users u
WHERE w.user_id = u.id
AND u.ship_to_country IN ('US', 'CA');
```

---

## ✅ V12 Fixes (January 25, 2026)

### 1. Currency Symbol in Telegram Alerts
- Correct currency symbol based on marketplace
- £ for EBAY_GB, € for EU marketplaces
- **Files changed:** `escape.ts`, `scanner.ts`

### 2. LED Lighting Kit Filter
- 50+ LED-related keywords filtered
- Multi-language: EN, DE, FR, ES, IT, NL
- Brands: Vonado, BriksMax, Lightailing, etc.
- **Files changed:** `listingFilter.ts`

### 3. Ship From Countries - All EU + UK
- Default includes all 28 countries (27 EU + UK)
- **Files changed:** `watches.ts`

### 4. Rate Limiting & Security
- Global: 200 requests per 15 min per IP
- Auth: 10 attempts per 15 min
- Password reset: 3 attempts per hour
- Suspicious path blocker
- **Files changed:** `index.ts`
- **Package added:** `express-rate-limit`

---

## ✅ Completed Features

### Core Infrastructure
- [x] Node.js/Express backend with TypeScript
- [x] PostgreSQL database with full schema
- [x] Redis + BullMQ for job queuing
- [x] PM2 process management (scoutloot + scoutloot-worker)
- [x] Nginx reverse proxy with SSL (Let's Encrypt)
- [x] Domain: scoutloot.com
- [x] GitHub repository: https://github.com/Antigono00/Scoutloot1

### Authentication System
- [x] Bcrypt password hashing (SALT_ROUNDS = 12)
- [x] Login endpoint (`POST /api/users/login`)
- [x] Password verification on login
- [x] Legacy password migration
- [x] Password Reset Flow (V10)

### Email Service (Resend Integration)
- [x] Resend API integration
- [x] noreply@scoutloot.com
- [x] Branded HTML email templates

### Multi-Region Support (V13)
- [x] **EBAY_US marketplace** for USA
- [x] **EBAY_CA marketplace** for Canada
- [x] **EBAY_GB marketplace** for UK
- [x] **Region-aware ship_from** filtering
- [x] **Multi-currency** support ($, C$, £, €)
- [x] **Frontend** USA/Canada dropdowns and timezones

### UK Marketplace Support (V11)
- [x] EBAY_GB marketplace
- [x] UK/GB country code aliases
- [x] London (GMT) timezone

### Import Charges Calculation (V11)
- [x] Database columns: `import_charges_eur`, `import_charges_estimated`
- [x] Import calculator (`src/utils/importCharges.ts`)
- [x] VAT rates for all EU countries + UK

### Smart Quality Filter
- [x] LEGO title requirement
- [x] Set number validation
- [x] Character figure detection
- [x] Minifigure code detection
- [x] Part listing detection
- [x] Negative keyword filtering
- [x] SEO-stuffing detection
- [x] Condition filtering
- [x] LED kit filtering (V12)

### Smart Notification System
- [x] Per-watch notification state tracking
- [x] Only notify when something changes
- [x] Contextual Telegram headers
- [x] Link preview with listing thumbnail

### Scheduled Jobs
- [x] Weekly Digest Job - Sunday 09:00 UTC
- [x] Still-Available Reminders Job - Daily 10:00 UTC
- [x] Manual trigger endpoints

### Night Pause (API Savings)
- [x] Scanner pauses 00:00-07:00 UTC
- [x] Saves ~29% of daily API calls

---

## 🗄️ Database Schema (Current)

### Tables
| Table | Purpose |
|-------|---------|
| `users` | User accounts, settings, Telegram, password_hash, ship_to_country |
| `watches` | User watch configurations with region-aware ship_from_countries |
| `sets` | LEGO set metadata (from Rebrickable) |
| `listings` | Cached eBay listings with import charges |
| `alert_history` | Sent alerts with import charges |
| `watch_notification_state` | Tracks last notification per watch |
| `subscription_tiers` | Tier limits configuration |

### Region Support
| User Region | ship_to_country | ship_from_countries | Marketplace |
|-------------|-----------------|---------------------|-------------|
| EU | DE, FR, ES, IT, etc. | 28 EU+UK countries | EBAY_DE, EBAY_FR, etc. |
| UK | GB | 28 EU+UK countries | EBAY_GB |
| USA | US | US, CA | EBAY_US |
| Canada | CA | US, CA | EBAY_CA |

---

## 📁 File Structure

```
/var/www/scoutloot/app/
├── src/
│   ├── config.ts
│   ├── index.ts                # Rate limiting, trust proxy
│   ├── worker.ts
│   ├── db/
│   │   ├── index.ts
│   │   └── redis.ts
│   ├── jobs/
│   │   ├── telegramQueue.ts
│   │   ├── telegramWorker.ts
│   │   └── scheduledJobs.ts
│   ├── providers/
│   │   └── ebay/
│   │       ├── auth.ts
│   │       ├── client.ts       # V13: US/CA/UK/EU marketplaces
│   │       ├── normalizer.ts   # Import charges
│   │       ├── types.ts
│   │       └── index.ts
│   ├── routes/
│   │   ├── alerts.ts
│   │   ├── index.ts
│   │   ├── jobs.ts
│   │   ├── scan.ts
│   │   ├── sets.ts
│   │   ├── test.ts
│   │   ├── users.ts
│   │   └── watches.ts
│   ├── services/
│   │   ├── alerts.ts
│   │   ├── delay.ts
│   │   ├── email.ts
│   │   ├── index.ts
│   │   ├── listings.ts
│   │   ├── notificationState.ts
│   │   ├── scanner.ts          # Currency support
│   │   ├── sets.ts
│   │   ├── sync-sets.ts
│   │   ├── users.ts
│   │   └── watches.ts          # V13: Region-aware defaults
│   ├── telegram/
│   │   ├── bot.ts
│   │   └── escape.ts           # V13: USD/CAD symbols
│   └── utils/
│       ├── fingerprint.ts
│       ├── importCharges.ts
│       ├── listingFilter.ts    # LED kit filter
│       ├── money.ts
│       ├── normalize.ts
│       └── time.ts
├── public/
│   ├── index.html              # V13: USA/Canada dropdowns
│   ├── privacy.html
│   ├── terms.html
│   └── faq.html
└── package.json
```

---

## 🧪 Test Commands

```bash
# Reset notifications and scan
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "TRUNCATE watch_notification_state, alert_history;"
curl -X POST https://scoutloot.com/api/scan/run | jq

# Check user regions
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "
SELECT id, email, ship_to_country FROM users ORDER BY id DESC LIMIT 10;"

# Check watch ship_from by region
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "
SELECT w.id, w.set_number, u.ship_to_country, w.ship_from_countries 
FROM watches w JOIN users u ON w.user_id = u.id LIMIT 10;"

# Check alerts with currency
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "
SELECT set_number, total_eur, notification_type, created_at 
FROM alert_history ORDER BY id DESC LIMIT 10;"

# View scan logs
pm2 logs scoutloot --lines 100 | grep -E "marketplace|EBAY_"
```

---

## 📋 Pending Features

### Immediate
- [ ] BrickOwl API integration (awaiting API access)
- [ ] Web Push notifications (PWA)

### After eBay Quota Approval
- [ ] Increase scan frequency
- [ ] Real-time price monitoring

### Future Roadmap
- [ ] BrickLink integration (reference prices)
- [ ] Stripe payment integration
- [ ] Amazon integration (US + EU)
- [ ] Watch sharing / public links
- [ ] Mobile app (React Native)
- [ ] Price history charts
- [ ] Multi-language UI

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

## 🔄 V13 Deployment Commands

```bash
# Files deployed in V13
scp ~/Downloads/client.ts root@188.166.160.168:/var/www/scoutloot/app/src/providers/ebay/
scp ~/Downloads/watches.ts root@188.166.160.168:/var/www/scoutloot/app/src/services/
scp ~/Downloads/escape.ts root@188.166.160.168:/var/www/scoutloot/app/src/telegram/
scp ~/Downloads/index.html root@188.166.160.168:/var/www/scoutloot/app/public/

# Build and restart
cd /var/www/scoutloot/app && npm run build && pm2 restart scoutloot scoutloot-worker

# Fix existing US/CA watches (run once)
PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar -c "
UPDATE watches w SET ship_from_countries = ARRAY['US', 'CA']
FROM users u WHERE w.user_id = u.id AND u.ship_to_country IN ('US', 'CA');"

# Test
pm2 logs scoutloot --lines 50
```

---

## 📊 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| V13 | Jan 25, 2026 | USA/Canada support, region-aware ship_from, multi-marketplace |
| V12 | Jan 25, 2026 | Currency symbols, LED filter, rate limiting, 28 EU+UK countries |
| V11 | Jan 24, 2026 | UK marketplace, import charges calculation |
| V10 | Jan 23, 2026 | Password reset flow, email service |
| V9 | Jan 22, 2026 | Smart notification system, quality filter improvements |
