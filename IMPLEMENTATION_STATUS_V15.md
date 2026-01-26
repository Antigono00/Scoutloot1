# ScoutLoot Implementation Status V15
## Updated: January 26, 2026

---

## 🎯 Current Status: PRODUCTION + GLOBAL + WEB PUSH + FULL GDPR + SECURITY POLISH

The app is live at **https://scoutloot.com** with:
- **NEW V15: Security & Email Polish** (Helmet.js, Welcome Email, Unsubscribe Instructions)
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

## ✅ V15 Features (January 26, 2026)

### Security & Email Polish

Three small but important improvements:

#### 1. Helmet.js Security Headers
Added comprehensive security headers via Helmet.js middleware:

**Headers now active:**
- `Content-Security-Policy` - Restricts resource loading
- `Strict-Transport-Security` - Forces HTTPS
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: SAMEORIGIN` - Clickjacking protection
- `X-DNS-Prefetch-Control: off` - Privacy protection
- `X-Download-Options: noopen` - IE download protection
- `X-Permitted-Cross-Domain-Policies: none` - Flash/PDF restrictions
- `X-XSS-Protection: 0` - Disabled (CSP handles this)

**CSP Configuration:**
```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    scriptSrc: ["'self'", "'unsafe-inline'"],  // Needed for onclick handlers
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.resend.com"],
  },
}
```

#### 2. Welcome Email on Signup
- `sendWelcomeEmail()` now called after user creation
- Fire-and-forget pattern (doesn't block signup if email fails)
- Uses existing branded HTML template from `src/services/email.ts`

#### 3. Weekly Digest Unsubscribe Instructions
Updated footer with clear step-by-step unsubscribe instructions:
```
📧 To unsubscribe from weekly digests:
1. Go to scoutloot.com
2. Click Settings (⚙️)
3. Uncheck "Weekly Digest"
```

### Files Changed
- `src/index.ts` - Added helmet import and middleware
- `src/routes/users.ts` - Added sendWelcomeEmail call on signup
- `src/jobs/scheduledJobs.ts` - Updated formatWeeklyDigest footer

### Dependencies Added
- `helmet` - Security headers middleware

---

## ✅ V14.5 Features (January 26, 2026)

### Frontend Code Split

Split monolithic `index.html` (~4000 lines) into three separate files:

```
public/
├── index.html      (1,027 lines) - HTML structure only
├── css/
│   └── styles.css  (1,545 lines) - All CSS styles
└── js/
    └── app.js      (1,446 lines) - All JavaScript
```

---

## ✅ V14.4 Features (January 26, 2026)

### GDPR Compliance - Frontend UI

- Cookie Consent Banner
- Delete Account Modal (type "DELETE" to confirm)
- Change Password Modal
- Export My Data Button
- Landing Page Stats Fixed (removed fake numbers)
- Loading Spinners on All Forms
- Open Graph Meta Tags
- About Creator Section

---

## ✅ V14.3 Features (January 26, 2026)

### GDPR Compliance - Backend API

- `DELETE /api/users/:id` - Delete account (soft delete + anonymize)
- `PUT /api/users/:id/password` - Change password while logged in
- `GET /api/users/:id/export` - Export all user data as JSON

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

## 📋 API Endpoints (V15)

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

## 📊 Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| **V15** | **Jan 26, 2026** | **Helmet.js security headers, Welcome email on signup, Unsubscribe instructions in digest** |
| V14.5 | Jan 26, 2026 | Frontend Code Split: Separate HTML/CSS/JS files |
| V14.4 | Jan 26, 2026 | GDPR Frontend: Cookie Banner, Delete Account UI, Change Password UI, Export Data UI |
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

## ✅ Security Checklist (V15)

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

## ✅ GDPR Compliance Checklist

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Cookie Consent | ✅ | Banner on first visit |
| Right to be Forgotten | ✅ | DELETE /api/users/:id |
| Data Portability | ✅ | GET /api/users/:id/export |
| Password Security | ✅ | Change password while logged in |
| Privacy Policy | ✅ | /privacy.html |
| Terms of Service | ✅ | /terms.html |
