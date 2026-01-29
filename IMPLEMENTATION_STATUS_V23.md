# ScoutLoot Implementation Status V23
## Updated: January 29, 2026

---

## 🎯 Current Status: PRODUCTION + FULL i18n (Landing + Dashboard)

The app is live at **https://scoutloot.com** with:
- **NEW V23: Dashboard & Modals i18n** - All user-facing UI fully translated
- V22: Internationalization (i18n) - 7 languages with URL routing & SEO
- V21: Set Pages Phase 4 (SEO & Polish - Server-side meta, JSON-LD, sitemaps)
- V20: Set Pages Phase 3 (Frontend set detail pages with Chart.js)
- V20: Set Explorer (Search bar on landing page and dashboard)
- V19: Set Pages Phase 1 & 2 (Database + API endpoints)
- V18: Critical Bug Fix (ship_from_countries update on country change)
- V17: SEO Optimization & Performance
- V16: Branding & Assets
- V15: Security Headers, Welcome Email
- V14.5: Frontend Code Split
- V14.4: GDPR Frontend
- V14.3: GDPR Backend
- Web Push Notifications
- Notifications Inbox
- PWA Support
- USA, Canada, UK & Europe marketplace support
- Multi-currency support (€/£/$)

---

## ✅ V23 Features (January 29, 2026)

### Dashboard & Modals i18n - COMPLETE

Extended i18n to cover all authenticated user areas: dashboard, settings, all modals, and forms.

#### What's Now Translated

| Area | Elements |
|------|----------|
| **Dashboard** | Title, stats labels, tabs, section headers, buttons, empty states |
| **User Menu** | Dashboard, Settings, Log Out |
| **Login Modal** | Title, subtitle, form labels, forgot password link |
| **Signup Modal** | Title, subtitle, all form labels, country groups, notification preferences |
| **Settings Modal** | All sections, Security, Danger Zone, buttons |
| **Change Password** | Title, subtitle, all labels |
| **Delete Account** | Title, warning list, confirmation, buttons |
| **Forgot Password** | Title, subtitle, labels |
| **Reset Password** | Title, subtitle, labels |
| **Complete Setup** | Telegram/Push options with descriptions |
| **Add/Edit Watch** | Form labels, condition options, buttons |
| **Alert Detail** | Title, reason, buy button |
| **Cookie Banner** | Message and accept button |
| **Toast Messages** | All success/error messages (via JavaScript) |

#### Language Detection Improvements

Added query parameter support (`?lang=xx`) for reliable language switching:

**Detection Priority (V23):**
1. **URL path** - `/de/`, `/fr/`, etc.
2. **Query param** - `?lang=es` (NEW - ensures cookie update)
3. **Cookie** - Saved preference
4. **Accept-Language** - Browser setting
5. **Default** - English

Language switcher now uses `?lang=xx` to guarantee cookie updates when switching.

#### Cookie Persistence Fix

Fixed language cookie not persisting across paths by adding `path: '/'`:

```typescript
res.cookie('language', lang, {
  path: '/',           // NEW - ensures cookie works on all paths
  maxAge: 365 * 24 * 60 * 60 * 1000,
  httpOnly: false,
  sameSite: 'lax',
});
```

Without `path: '/'`, cookies set on `/es/` weren't sent when visiting `/`.

#### Client-Side Translations

JavaScript now has access to translations via `window.__SCOUTLOOT_T__`:

```javascript
// Available in browser
window.__SCOUTLOOT_T__ = {
  toasts: { account_created, welcome_back, settings_saved, ... },
  dashboard: { empty_watches, empty_notifications },
  modals: {
    signup: { creating },
    login: { logging_in },
    settings: { saving },
    // ... loading states for all modals
  }
};
```

#### Files Changed V23

| File | Change |
|------|--------|
| `src/utils/i18n.ts` | Added query param detection, client-side translations injection |
| `src/index.ts` | Fixed cookie path (added `path: '/'` for cross-path persistence) |
| `public/index.html` | ~100 new `{{placeholder}}` replacements for modals/dashboard |
| `public/locales/*.json` | Added `dashboard`, `modals`, `forms`, `toasts` sections |

#### Translation Structure (V23 Additions)

```json
{
  "dashboard": {
    "title": "Dashboard",
    "add_watch": "+ Add Watch",
    "your_watchlist": "Your Watchlist",
    "notifications_inbox": "Notifications Inbox",
    "stats": { "active_watches", "alerts_today", "total_alerts", "subscription" },
    "tabs": { "watches", "notifications" },
    "user_menu": { "dashboard", "settings", "logout" }
  },
  "modals": {
    "signup": { "title", "subtitle", "btn_submit", "already_have_account", "creating" },
    "login": { "title", "subtitle", "btn_submit", "forgot_password", "no_account", "logging_in" },
    "settings": { "title", "subtitle", "btn_save", "security", "danger_zone", ... },
    "change_password": { ... },
    "delete_account": { ... },
    "forgot_password": { ... },
    "reset_password": { ... },
    "complete_setup": { ... },
    "add_watch": { ... },
    "edit_watch": { ... },
    "alert_detail": { ... }
  },
  "forms": {
    "email", "password", "current_password", "new_password",
    "ship_to_country", "timezone", "set_number", "target_price", "min_price",
    "condition", "condition_any", "condition_new", "condition_used",
    "countries": { "north_america", "western_europe", ... },
    "weekly_digest": { "title", "desc" },
    "reminders": { "title", "desc" }
  },
  "toasts": {
    "account_created", "welcome_back", "settings_saved", "watch_added", ...
    "error": { "generic", "login_failed", "password_mismatch", ... }
  },
  "cookie_banner": { "message", "accept" }
}
```

---

## ✅ V22 Features (January 28, 2026)

### Internationalization (i18n) - Landing Page

Full multi-language support with 7 languages, SEO-optimized URL routing, and automatic language detection.

#### Supported Languages

| Code | Language | URL Example | Flag |
|------|----------|-------------|------|
| `en` | English | `/` (default, no prefix) | 🇬🇧 |
| `de` | German | `/de/` | 🇩🇪 |
| `fr` | French | `/fr/` | 🇫🇷 |
| `es` | Spanish | `/es/` | 🇪🇸 |
| `it` | Italian | `/it/` | 🇮🇹 |
| `nl` | Dutch | `/nl/` | 🇳🇱 |
| `pl` | Polish | `/pl/` | 🇵🇱 |

#### Features Implemented

| Feature | Status | Details |
|---------|--------|---------|
| URL-based language routing | ✅ | `/de/`, `/fr/`, `/es/`, etc. |
| Language detection | ✅ | URL → Query → Cookie → Accept-Language → Default |
| Cookie persistence | ✅ | 1-year language preference cookie |
| hreflang SEO tags | ✅ | All pages have complete hreflang set |
| Language switcher UI | ✅ | Dropdown in navbar with flags |
| Server-side rendering | ✅ | All text rendered server-side for SEO |
| Template system | ✅ | `{{translation.key}}` placeholder syntax |
| Set pages i18n | ✅ | `/de/set/75192`, `/fr/set/75192`, etc. |
| Static pages i18n | ✅ | `/de/privacy`, `/fr/faq`, etc. |
| Dashboard i18n | ✅ | V23 - All modals and forms |
| API endpoints | ✅ | `GET /api/languages`, `POST /api/language` |

---

## 📊 Complete Feature Status

### Core Features

| Feature | Status | Version |
|---------|--------|---------|
| eBay scanning (7 markets) | ✅ | V1 |
| Telegram alerts | ✅ | V1 |
| Web push notifications | ✅ | V14 |
| Notifications inbox | ✅ | V14 |
| Set detail pages | ✅ | V20 |
| Price history charts | ✅ | V20 |
| Set explorer search | ✅ | V20 |
| Server-side SEO | ✅ | V21 |
| Multi-language (i18n) - Landing | ✅ | V22 |
| Multi-language (i18n) - Dashboard | ✅ | V23 |

### Regional Support

| Region | Markets | Currency | Status |
|--------|---------|----------|--------|
| USA | EBAY_US | USD ($) | ✅ |
| Canada | EBAY_CA | CAD (C$) | ✅ |
| UK | EBAY_GB | GBP (£) | ✅ |
| Germany | EBAY_DE | EUR (€) | ✅ |
| France | EBAY_FR | EUR (€) | ✅ |
| Spain | EBAY_ES | EUR (€) | ✅ |
| Italy | EBAY_IT | EUR (€) | ✅ |

### SEO Features

| Feature | Status |
|---------|--------|
| Server-side meta tags | ✅ |
| JSON-LD Product schema | ✅ |
| JSON-LD WebSite schema | ✅ |
| JSON-LD Organization schema | ✅ |
| Dynamic sitemap | ✅ |
| hreflang tags (7 languages) | ✅ |
| Canonical URLs | ✅ |

---

## 🔧 Server Info

```
Server: ssh root@188.166.160.168
App path: /var/www/scoutloot/app
Database: PGPASSWORD='BrickAlpha2026!Prod' psql -h localhost -U lego_radar -d lego_radar
PM2 processes: scoutloot, scoutloot-worker
```

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts, settings, Telegram, ship_to_country |
| `watches` | User watch configurations (incl. min_price, condition) |
| `listings` | eBay listings (partitioned by market) |
| `alert_history` | Sent alerts log |
| `watch_notification_state` | Per-watch notification tracking |
| `password_reset_tokens` | Password reset tokens |
| `push_subscriptions` | Web push subscriptions |
| `sets` | LEGO set catalog from Rebrickable |
| `set_current_deals` | Materialized view for set pages |

---

## 📁 File Structure

```
/var/www/scoutloot/app/
├── src/
│   ├── index.ts                # Express server with i18n routing
│   ├── worker.ts               # BullMQ worker entry
│   ├── config.ts               # Environment config
│   ├── db/
│   │   ├── index.ts            # PostgreSQL connection
│   │   └── redis.ts            # Redis connection
│   ├── providers/ebay/
│   │   ├── auth.ts             # OAuth handler
│   │   ├── client.ts           # API client
│   │   ├── normalizer.ts       # Listing normalizer
│   │   └── types.ts            # TypeScript types
│   ├── routes/
│   │   ├── index.ts            # Main router
│   │   ├── alerts.ts           # Alerts endpoints
│   │   ├── jobs.ts             # Jobs endpoints
│   │   ├── scan.ts             # Scan endpoints
│   │   ├── users.ts            # Users endpoints
│   │   └── watches.ts          # Watches endpoints
│   ├── services/
│   │   ├── alerts.ts           # Alert logic
│   │   ├── listings.ts         # Listings CRUD
│   │   ├── scanner.ts          # Scan cycle
│   │   ├── sets.ts             # Sets lookup
│   │   ├── users.ts            # Users CRUD
│   │   └── watches.ts          # Watches CRUD
│   ├── telegram/
│   │   ├── bot.ts              # Grammy bot
│   │   └── escape.ts           # Message formatting
│   ├── jobs/
│   │   ├── telegramQueue.ts    # BullMQ queue
│   │   ├── telegramWorker.ts   # Queue worker
│   │   └── scheduledJobs.ts    # Cron jobs
│   └── utils/
│       ├── i18n.ts             # V22/V23: i18n utilities
│       ├── listingFilter.ts    # Quality filter
│       ├── normalize.ts        # Title normalization
│       ├── fingerprint.ts      # Listing fingerprint
│       ├── money.ts            # Price utilities
│       └── time.ts             # Time utilities
├── public/
│   ├── index.html              # Main SPA with {{placeholders}}
│   ├── faq.html                # FAQ page
│   ├── privacy.html            # Privacy policy
│   ├── terms.html              # Terms of service
│   ├── locales/                # V22/V23: Translation files
│   │   ├── en.json             # English (canonical)
│   │   ├── de.json             # German
│   │   ├── fr.json             # French
│   │   ├── es.json             # Spanish
│   │   ├── it.json             # Italian
│   │   ├── nl.json             # Dutch
│   │   └── pl.json             # Polish
│   ├── css/
│   │   └── styles.css          # CSS with language switcher
│   └── js/
│       └── app.js              # JavaScript
├── package.json
├── tsconfig.json
└── dist/                       # Compiled output
```

---

## 📜 Version History

| Version | Date | Changes |
|---------|------|---------|
| **V23** | **Jan 29, 2026** | **Dashboard & Modals i18n, query param language detection** |
| V22 | Jan 28, 2026 | i18n: 7 languages, URL routing, language switcher |
| V21 | Jan 27, 2026 | Set Pages Phase 4: SEO & Polish COMPLETE |
| V20 | Jan 27, 2026 | Set Pages Phase 3: Frontend + Set Explorer search |
| V19 | Jan 27, 2026 | Set Pages Phase 1 & 2: Database + API |
| V18 | Jan 27, 2026 | Critical fix: ship_from_countries update |
| V17 | Jan 26, 2026 | SEO optimization, JSON-LD schema |
| V16 | Jan 26, 2026 | Logo, Favicon, SEO files |
| V15 | Jan 26, 2026 | Helmet.js security headers |
| V14.5 | Jan 26, 2026 | Frontend Code Split |
| V14.4 | Jan 26, 2026 | GDPR Frontend |
| V14.3 | Jan 26, 2026 | GDPR Backend |
| V14.2 | Jan 26, 2026 | Weekly digest fix |
| V14.1 | Jan 25, 2026 | Fix EU markets |
| V14 | Jan 25, 2026 | Web Push, Notifications Inbox, PWA |
| V13 | Jan 25, 2026 | USA/Canada support |
| V12 | Jan 25, 2026 | Currency symbols, LED filter |
| V11 | Jan 24, 2026 | UK marketplace, import charges |
| V10 | Jan 23, 2026 | Password reset flow |
| V9 | Jan 22, 2026 | Smart notification system |

---

## 🚀 Next Steps

### i18n Complete ✅
Full multi-language support is now live - landing page AND dashboard!

### Future Roadmap
- [ ] BrickOwl API integration (awaiting approval)
- [ ] Popular sets bootstrap (always-scan top sets)
- [ ] Stripe payment integration
- [ ] Amazon integration
- [ ] Email alerts for free tier
- [ ] Mobile app (React Native)
- [ ] Additional languages (Portuguese, Swedish, etc.)

---

## 🌍 i18n Test URLs

| Language | Homepage | Set Page | Privacy |
|----------|----------|----------|---------|
| English | https://scoutloot.com/ | https://scoutloot.com/set/75192 | https://scoutloot.com/privacy |
| German | https://scoutloot.com/de/ | https://scoutloot.com/de/set/75192 | https://scoutloot.com/de/privacy |
| French | https://scoutloot.com/fr/ | https://scoutloot.com/fr/set/75192 | https://scoutloot.com/fr/privacy |
| Spanish | https://scoutloot.com/es/ | https://scoutloot.com/es/set/75192 | https://scoutloot.com/es/privacy |
| Italian | https://scoutloot.com/it/ | https://scoutloot.com/it/set/75192 | https://scoutloot.com/it/privacy |
| Dutch | https://scoutloot.com/nl/ | https://scoutloot.com/nl/set/75192 | https://scoutloot.com/nl/privacy |
| Polish | https://scoutloot.com/pl/ | https://scoutloot.com/pl/set/75192 | https://scoutloot.com/pl/privacy |

---

## ✅ SEO Checklist (All Complete)

- [x] Server-side meta tags on all pages
- [x] JSON-LD Product schema on set pages
- [x] JSON-LD WebSite with SearchAction
- [x] JSON-LD WebApplication + Organization on homepage
- [x] Dynamic sitemap `/sitemap-sets.xml`
- [x] Sitemap index structure
- [x] robots.txt with sitemap reference
- [x] hreflang tags for all 7 languages
- [x] Canonical URLs (English without /en/ prefix)
- [x] Submitted to Google Search Console
