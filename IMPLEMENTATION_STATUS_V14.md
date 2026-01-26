# ScoutLoot Implementation Status V14.4
## Updated: January 26, 2026

---

## 🎯 Current Status: PRODUCTION + GLOBAL + WEB PUSH + FULL GDPR COMPLIANCE

The app is live at **https://scoutloot.com** with:
- **NEW V14.4: GDPR Frontend** (Cookie Banner, Delete Account UI, Change Password UI, Export Data UI)
- V14.3: GDPR Backend (Delete Account, Change Password, Export Data APIs)
- V14.2: Weekly Digest Fixed, Country Change Resets, Registration Preferences
- V14.2: Post-Signup Setup Modal, Jobs API
- Web Push Notifications (dual channel with Telegram)
- Notifications Inbox (view all alerts in browser)
- PWA Support (installable web app)
- USA & Canada marketplace support (EBAY_US, EBAY_CA)
- UK marketplace support (EBAY_GB)
- Complete EU coverage (EBAY_DE, EBAY_FR, EBAY_ES, EBAY_IT)
- Import charges calculation (EU↔UK)
- Multi-currency support (€/£/$)

---

## ✅ V14.4 Features (January 26, 2026)

### GDPR Compliance - Frontend UI

Complete frontend implementation for GDPR compliance:

#### 1. Cookie Consent Banner
- Fixed bottom position banner
- Shows on first visit (checks localStorage)
- Links to Privacy Policy and Terms of Service
- "Accept" button saves consent to localStorage
- Mobile responsive (stacks vertically on small screens)

#### 2. Delete Account Modal
- Accessible via Settings → Danger Zone → Delete Account
- Warning header with ⚠️ icon
- Lists all data that will be deleted:
  - Profile and email address
  - All watches and settings
  - All push notification subscriptions
  - Alert history
- Requires typing "DELETE" to enable button (real-time validation)
- Calls `DELETE /api/users/:id` endpoint
- Logs out user on successful deletion
- Toast notification: "Your account has been deleted. Goodbye! 👋"

#### 3. Change Password Modal
- Accessible via Settings → Security → Change Password
- Form fields: Current Password, New Password, Confirm New Password
- Client-side validation:
  - New password ≥ 8 characters
  - New passwords must match
- Calls `PUT /api/users/:id/password` endpoint
- Returns to Settings modal after success
- Toast notification: "Password changed successfully! 🔐"

#### 4. Export My Data Button
- Located in Settings → Danger Zone
- Downloads complete user data as JSON file
- Filename: `scoutloot-data-{userId}-{timestamp}.json`
- Calls `GET /api/users/:id/export` endpoint
- Toast notifications for progress and completion

### UX Improvements

#### 5. Landing Page Stats Fixed
- Removed fake "10,000+ Active Hunters" numbers
- Replaced with trust indicators:
  - 🌍 USA, Canada, UK & EU
  - ⚡ Instant Alerts
  - 🔒 GDPR Compliant
  - 🧱 Built by Collectors

#### 6. Loading Spinners on All Forms
Added loading states to all form submissions:
- Login: "Logging in..."
- Signup: "Creating account..."
- Add Watch: "Adding..."
- Edit Watch: "Saving..."
- Settings: "Saving..."
- Forgot Password: "Sending..."
- Reset Password: "Resetting..."
- Change Password: "Updating..."
- Delete Account: "Deleting..."

#### 7. Open Graph Meta Tags
Added for social media sharing:
```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://scoutloot.com/">
<meta property="og:title" content="ScoutLoot — Never Miss a LEGO Deal Again">
<meta property="og:description" content="Set your target price, get instant alerts when LEGO deals drop.">
<meta property="og:image" content="https://scoutloot.com/og-image.png">
```
Plus Twitter Card tags for Twitter/X sharing.

#### 8. About Creator Section
- Added above footer on landing page
- Content: "🧱 Built with love by a fellow LEGO collector in Europe."
- Support email link: support@scoutloot.com

### Settings Modal Updates
- **Security Section**: Change Password button
- **Danger Zone Section**: 
  - Export My Data button (📥)
  - Delete Account button (🗑️)
  - Red border styling for visual warning

### Files Changed
- `public/index.html` - Complete frontend update (~4000 lines)

### New CSS Classes
```css
.cookie-banner          /* Fixed bottom cookie consent */
.danger-zone           /* Red-bordered danger section */
.danger-header         /* Warning icon header */
.delete-warning-list   /* Red-tinted warning list */
.btn-outline-danger    /* Outlined red button */
.btn-sm               /* Smaller button variant */
.about-creator        /* About section styling */
```

### New JavaScript Functions
```javascript
checkCookieConsent()    // Shows banner if not accepted
acceptCookies()         // Saves consent to localStorage
handleChangePassword()  // Password change form handler
exportUserData()        // Downloads user data JSON
handleDeleteAccount()   // Account deletion with confirmation
```

---

## ✅ V14.3 Features (January 26, 2026)

### GDPR Compliance - Backend API

Three new endpoints for GDPR compliance and user account management:

#### 1. Delete Account (Right to be Forgotten)
**Endpoint:** `DELETE /api/users/:id`

**What it does:**
- Soft delete (sets `deleted_at` timestamp)
- Anonymizes PII: email → `deleted_X@deleted.local`, password → `DELETED`
- Clears: telegram_chat_id, telegram_username, postal_code, reset_token
- Deletes all watches (cascades to watch_notification_state)
- Deletes all push_subscriptions
- Keeps alert_history for analytics (anonymized)

#### 2. Change Password (While Logged In)
**Endpoint:** `PUT /api/users/:id/password`

**What it does:**
- Verifies old password first (supports bcrypt + legacy base64)
- Validates new password ≥ 8 characters
- Validates new ≠ old password
- Hashes new password with bcrypt (SALT_ROUNDS = 12)
- Clears any existing reset tokens

#### 3. Export My Data (Data Portability)
**Endpoint:** `GET /api/users/:id/export`

**What it returns:**
- `exportedAt`: ISO timestamp
- `user`: Profile data (email, country, timezone, tier, preferences)
- `watches`: All watches with set names
- `alertHistory`: Last 1000 alerts
- `pushSubscriptions`: All registered devices

### Files Changed
- `src/services/users.ts` - Added `deleteUser()`, `changePassword()`, `exportUserData()`
- `src/routes/users.ts` - Added DELETE, PUT /password, GET /export endpoints

---

## ✅ V14.2 Features (January 26, 2026)

### 1. Weekly Digest Fix
Fixed column name error: `w.target_price` → `w.target_total_price_eur`

### 2. Country Change Resets Notifications
When user changes `ship_to_country`, clears notification state for fresh alerts.

### 3. Registration Preferences
Added weekly digest and 3-day reminder checkboxes to signup.

### 4. Post-Signup Setup Modal
Shows Telegram/Push setup options after account creation.

### 5. Jobs API
Manual trigger endpoints for weekly digest and reminders.

---

## ✅ V14.1 Bug Fix (January 25, 2026)

Fixed minor EU markets (SK, CZ, PT, etc.) returning wrong listings by removing `itemLocationRegion:EUROPEAN_UNION` filter for countries without their own eBay marketplace.

---

## ✅ V14 Features (January 25, 2026)

- Web Push Notifications (dual channel with Telegram)
- Notifications Inbox (browser-based alert history)
- PWA Support (installable web app)
- Scanner integration for dual notification dispatch

---

## 🗄️ Database Schema

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

## 📋 API Endpoints (V14.4)

### Users (GDPR Compliant)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users` | Create user (signup) |
| POST | `/api/users/login` | Login |
| GET | `/api/users/:id` | Get user by ID |
| PATCH | `/api/users/:id` | Update user settings |
| **DELETE** | **`/api/users/:id`** | **Delete account (GDPR)** |
| **PUT** | **`/api/users/:id/password`** | **Change password (GDPR)** |
| **GET** | **`/api/users/:id/export`** | **Export data (GDPR)** |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs/weekly-digest` | Manually trigger weekly digest |
| POST | `/api/jobs/still-available-reminders` | Manually trigger reminders |
| GET | `/api/jobs/status` | Check scheduler status |

### Push Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/push/vapid-public-key` | Get VAPID public key |
| POST | `/api/push/subscribe` | Save push subscription |
| POST | `/api/push/unsubscribe` | Remove subscription |
| GET | `/api/push/status/:userId` | Check if push enabled |

### Alerts Inbox
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts/inbox/:userId` | Get paginated alerts |
| POST | `/api/alerts/:alertId/read` | Mark alert as read |
| POST | `/api/alerts/mark-all-read/:userId` | Mark all as read |
| GET | `/api/alerts/unread-count/:userId` | Get unread count |

---

## 📊 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| **V14.4** | **Jan 26, 2026** | **GDPR Frontend: Cookie Banner, Delete Account UI, Change Password UI, Export Data UI, Loading Spinners, Fixed Stats, OG Tags, About Section** |
| V14.3 | Jan 26, 2026 | GDPR Backend: Delete Account, Change Password, Export Data APIs |
| V14.2 | Jan 26, 2026 | Weekly digest fix, country change reset, registration prefs, setup modal, jobs API |
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
- [ ] Create og-image.png (1200x630px) for social sharing
- [ ] BrickOwl API integration (awaiting API access)
- [ ] iOS-specific push improvements

### Future Roadmap
- [ ] BrickLink integration (reference prices)
- [ ] Stripe payment integration
- [ ] Amazon integration (US + EU)
- [ ] Price history charts
- [ ] Mobile app (React Native)

---

## ✅ GDPR Compliance Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Cookie Consent | ✅ | Banner on first visit, localStorage |
| Right to be Forgotten | ✅ | DELETE /api/users/:id + UI |
| Data Portability | ✅ | GET /api/users/:id/export + UI |
| Password Security | ✅ | Change password while logged in |
| Privacy Policy | ✅ | /privacy.html |
| Terms of Service | ✅ | /terms.html |
