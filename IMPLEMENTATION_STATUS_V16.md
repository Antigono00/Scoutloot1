# ScoutLoot Implementation Status V16
## Updated: January 26, 2026

---

## 🎯 Current Status: PRODUCTION + GLOBAL + WEB PUSH + FULL GDPR + SEO COMPLETE

The app is live at **https://scoutloot.com** with:
- **NEW V16: SEO, Branding & CSP Polish** (Logo, Favicon, Sitemap, robots.txt, Cookie Policy)
- V15: Security Headers (Helmet.js), Welcome Email, Unsubscribe Instructions
- V14.5: Frontend Code Split (Separate HTML/CSS/JS files)
- V14.4: GDPR Frontend (Cookie Banner, Delete Account UI, Change Password UI, Export Data UI)
- V14.3: GDPR Backend (Delete Account, Change Password, Export Data APIs)
- V14.2: Weekly Digest Fixed, Country Change Resets, Registration Preferences
- Web Push Notifications (dual channel with Telegram)
- Notifications Inbox (view all alerts in browser)
- PWA Support (installable web app)
- USA & Canada marketplace support (EBAY_US, EBAY_CA)
- UK marketplace support (EBAY_GB)
- Complete EU coverage (EBAY_DE, EBAY_FR, EBAY_ES, EBAY_IT)
- Import charges calculation (EU↔UK)
- Multi-currency support (€/£/$)

---

## ✅ V16 Features (January 26, 2026)

### SEO, Branding & CSP Polish

Complete SEO infrastructure and branding update:

#### 1. Logo Update
Replaced 🧱 emoji with custom bell icon image across all pages:

**Files changed:**
- `public/logo-icon.png` - NEW: Bell icon image
- `public/index.html` - Logo uses `<img>` tag instead of `<div>` with emoji
- `public/css/styles.css` - Updated `.logo-icon` for img element
- `public/privacy.html`, `terms.html`, `faq.html`, `cookies.html` - Same logo update

**Before:**
```html
<div class="logo-icon">🧱</div>
```

**After:**
```html
<img src="/logo-icon.png" alt="ScoutLoot" class="logo-icon">
```

#### 2. Favicon & PWA Icons
Added proper browser and app icons:

- `public/favicon.ico` - Browser tab icon (32x32)
- `public/icon-192.png` - PWA icon (192x192)
- `public/icon-512.png` - PWA icon (512x512)
- `public/og-image.png` - Social sharing image (1200x630)

All HTML files updated with:
```html
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
```

#### 3. SEO Files
- `public/robots.txt` - Allows all crawlers, references sitemap, blocks /api/
- `public/sitemap.xml` - Lists 5 pages: /, /faq, /privacy, /terms, /cookies

**robots.txt:**
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /sw.js
Disallow: /manifest.json
Sitemap: https://scoutloot.com/sitemap.xml
```

#### 4. Cookie Policy Page
- `public/cookies.html` - NEW: Comprehensive GDPR-compliant cookie policy
- Matches site dark theme styling
- Explains essential cookies, analytics, preferences
- Links to privacy policy and terms

#### 5. CSP Fix for Inline Event Handlers
Fixed Content Security Policy blocking `onclick` handlers:

**Added to Helmet.js config in `src/index.ts`:**
```javascript
scriptSrcAttr: ["'unsafe-inline'"],  // Needed for inline onclick handlers
```

**Before:** `script-src-attr 'none'` (blocked onclick)
**After:** `script-src-attr 'unsafe-inline'` (allows onclick)

#### 6. Route Fix
Updated `/cookies` route to serve `cookies.html` instead of redirecting to `/privacy#cookies`.

### Files Changed
| File | Change |
|------|--------|
| `public/logo-icon.png` | NEW: Bell icon image |
| `public/favicon.ico` | NEW: Browser icon |
| `public/og-image.png` | NEW: Social preview |
| `public/icon-192.png` | NEW: PWA icon |
| `public/icon-512.png` | NEW: PWA icon |
| `public/robots.txt` | NEW: SEO file |
| `public/sitemap.xml` | NEW: SEO file |
| `public/cookies.html` | NEW: Cookie policy page |
| `public/index.html` | Logo img, favicon links |
| `public/css/styles.css` | .logo-icon for img |
| `public/privacy.html` | Logo img, favicon links |
| `public/terms.html` | Logo img, favicon links |
| `public/faq.html` | Logo img, favicon links |
| `src/index.ts` | scriptSrcAttr CSP, /cookies route |

---

## ✅ V15 Features (January 26, 2026)

### Security & Email Polish

#### 1. Helmet.js Security Headers
- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- X-DNS-Prefetch-Control: off

#### 2. Welcome Email on Signup
- `sendWelcomeEmail()` called after user creation
- Fire-and-forget pattern

#### 3. Weekly Digest Unsubscribe Instructions
Clear step-by-step instructions in email footer.

---

## ✅ V14.5 Features (January 26, 2026)

### Frontend Code Split

```
public/
├── index.html      (HTML structure only)
├── css/
│   └── styles.css  (All CSS styles)
└── js/
    └── app.js      (All JavaScript)
```

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

## 📋 API Endpoints (V16)

### Users (GDPR Compliant)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users` | Create user (signup) + welcome email |
| POST | `/api/users/login` | Login |
| GET | `/api/users/:id` | Get user by ID |
| PATCH | `/api/users/:id` | Update user settings |
| DELETE | `/api/users/:id` | Delete account (GDPR) |
| PUT | `/api/users/:id/password` | Change password (GDPR) |
| GET | `/api/users/:id/export` | Export data (GDPR) |

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

## 📁 File Structure

```
/var/www/scoutloot/app/
├── src/
│   ├── config.ts
│   ├── index.ts                # Helmet CSP, static routes
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
│   │       ├── client.ts
│   │       ├── normalizer.ts
│   │       ├── types.ts
│   │       └── index.ts
│   ├── routes/
│   │   ├── alerts.ts
│   │   ├── index.ts
│   │   ├── jobs.ts
│   │   ├── push.ts
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
│   │   ├── scanner.ts
│   │   ├── sets.ts
│   │   ├── sync-sets.ts
│   │   ├── users.ts
│   │   └── watches.ts
│   ├── telegram/
│   │   ├── bot.ts
│   │   └── escape.ts
│   └── utils/
│       ├── fingerprint.ts
│       ├── importCharges.ts
│       ├── listingFilter.ts
│       ├── money.ts
│       ├── normalize.ts
│       └── time.ts
├── public/
│   ├── index.html
│   ├── privacy.html
│   ├── terms.html
│   ├── faq.html
│   ├── cookies.html            # NEW V16
│   ├── robots.txt              # NEW V16
│   ├── sitemap.xml             # NEW V16
│   ├── favicon.ico             # NEW V16
│   ├── logo-icon.png           # NEW V16
│   ├── og-image.png            # NEW V16
│   ├── icon-192.png            # NEW V16
│   ├── icon-512.png            # NEW V16
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
├── package.json
├── tsconfig.json
└── dist/                       # Compiled output
```

---

## 📊 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| **V16** | **Jan 26, 2026** | **Logo update, Favicon, SEO files, Cookie policy, CSP fix** |
| V15 | Jan 26, 2026 | Helmet.js security headers, Welcome email, Unsubscribe instructions |
| V14.5 | Jan 26, 2026 | Frontend Code Split: Separate HTML/CSS/JS files |
| V14.4 | Jan 26, 2026 | GDPR Frontend: Cookie Banner, Delete Account UI |
| V14.3 | Jan 26, 2026 | GDPR Backend: Delete Account, Change Password, Export Data APIs |
| V14.2 | Jan 26, 2026 | Weekly digest fix, country change reset, registration prefs |
| V14.1 | Jan 25, 2026 | Fix minor EU markets returning wrong listings |
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
- [x] ~~Create og-image.png for social sharing~~ ✅ Done V16
- [ ] Submit sitemap to Google Search Console
- [ ] BrickOwl API integration (awaiting API access)
- [ ] iOS-specific push improvements

### Future Roadmap
- [ ] BrickLink integration (reference prices)
- [ ] Stripe payment integration
- [ ] Amazon integration (US + EU)
- [ ] Price history charts
- [ ] Mobile app (React Native)

---

## ✅ Security Checklist (V16)

| Item | Status | Implementation |
|------|--------|----------------|
| HTTPS | ✅ | Let's Encrypt SSL |
| Security Headers | ✅ | Helmet.js with CSP |
| Rate Limiting | ✅ | express-rate-limit |
| Password Hashing | ✅ | bcrypt (12 rounds) |
| SQL Injection | ✅ | Parameterized queries |
| XSS Protection | ✅ | CSP headers |
| Clickjacking | ✅ | X-Frame-Options |
| Suspicious Path Blocking | ✅ | Custom middleware |

## ✅ SEO Checklist (V16)

| Item | Status | URL |
|------|--------|-----|
| Favicon | ✅ | /favicon.ico |
| OG Image | ✅ | /og-image.png |
| robots.txt | ✅ | /robots.txt |
| sitemap.xml | ✅ | /sitemap.xml |
| PWA Icons | ✅ | /icon-192.png, /icon-512.png |

## ✅ GDPR Compliance Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Cookie Consent | ✅ | Banner on first visit |
| Cookie Policy | ✅ | /cookies page |
| Right to be Forgotten | ✅ | DELETE /api/users/:id |
| Data Portability | ✅ | GET /api/users/:id/export |
| Password Security | ✅ | Change password while logged in |
| Privacy Policy | ✅ | /privacy |
| Terms of Service | ✅ | /terms |
