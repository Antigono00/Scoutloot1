/**
 * ScoutLoot - Express Server Entry Point
 * 
 * V22: i18n Implementation
 * - Multi-language URL routing (/de/, /fr/, /es/, etc.)
 * - Accept-Language header detection
 * - Server-side template rendering with translations
 * - hreflang tags for SEO
 * - Language switcher support
 */

import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { pool, closePool } from './db/index.js';
import { redis, closeRedis } from './db/redis.js';
import { getQueueStats } from './jobs/telegramQueue.js';
import routes from './routes/index.js';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  loadTranslations,
  detectLanguage,
  injectTranslations,
  clearTranslationCache,
  type SupportedLanguage,
} from './utils/i18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust Nginx proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Cookie parser for language preference
app.use(cookieParser());

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.resend.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ============================================
// PATHS
// ============================================
const publicPath = path.join(__dirname, '..', 'public');
const translationsPath = path.join(__dirname, '..', 'public', 'locales');

// ============================================
// TEMPLATE CACHE
// ============================================
const templateCache: Map<string, string> = new Map();

function getTemplate(templateName: string): string {
  if (config.isDevelopment || !templateCache.has(templateName)) {
    const templatePath = path.join(publicPath, templateName);
    const content = fs.readFileSync(templatePath, 'utf-8');
    templateCache.set(templateName, content);
  }
  return templateCache.get(templateName)!;
}

// Clear template cache in development
if (config.isDevelopment) {
  fs.watch(publicPath, { recursive: true }, (eventType, filename) => {
    if (filename?.endsWith('.html')) {
      templateCache.clear();
      console.log('[Dev] Template cache cleared');
    }
  });
  
  // Also watch translations
  try {
    fs.watch(translationsPath, { recursive: true }, () => {
      clearTranslationCache();
      console.log('[Dev] Translation cache cleared');
    });
  } catch {
    // translationsPath might not exist yet
  }
}

// ============================================
// SECURITY: Block suspicious paths FIRST
// ============================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    '%c0%af', '%e0%80%af', '..%2f', '..%5c', '.env',
    '/etc/passwd', '/etc/shadow', 'aws/credentials',
    'wp-admin', 'wp-login', 'phpmyadmin', '.git/config',
    'xmlrpc.php', 'administrator', 'admin.php',
    '.asp', '.aspx', 'shell.php', 'eval(', 'base64_decode',
  ];
  
  const pathLower = req.path.toLowerCase();
  const urlLower = req.originalUrl.toLowerCase();
  
  for (const pattern of suspiciousPatterns) {
    if (pathLower.includes(pattern) || urlLower.includes(pattern)) {
      if (Math.random() < 0.1) {
        console.log(`[Security] Blocked suspicious request: ${req.ip} -> ${req.originalUrl.substring(0, 100)}`);
      }
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  
  next();
});

// ============================================
// RATE LIMITING
// ============================================

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === '/health',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many password reset attempts, please try again in an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(globalLimiter);

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());

// ============================================
// i18n HELPER FUNCTIONS
// ============================================

/**
 * Render a page with translations
 */
function renderI18nPage(
  req: Request,
  res: Response,
  templateName: string,
  lang: SupportedLanguage,
  currentPath: string,
  additionalData?: Record<string, unknown>
): void {
  try {
    let html = getTemplate(templateName);
    const translations = loadTranslations(lang, translationsPath);
    
    // Merge additional data into translations if provided
    const mergedTranslations = additionalData 
      ? { ...translations, ...additionalData }
      : translations;
    
    html = injectTranslations(html, mergedTranslations, lang, currentPath);
    
    // Set language cookie for future visits
    res.cookie('language', lang, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: false, // Accessible by JS
      sameSite: 'lax',
    });
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    console.error(`[i18n] Error rendering ${templateName}:`, error);
    res.sendFile(path.join(publicPath, templateName));
  }
}

/**
 * Extract language from URL path
 */
function extractLangFromPath(pathname: string): { lang: SupportedLanguage | null; cleanPath: string } {
  const parts = pathname.split('/').filter(Boolean);
  
  if (parts.length > 0 && isSupportedLanguage(parts[0])) {
    const lang = parts[0] as SupportedLanguage;
    const cleanPath = '/' + parts.slice(1).join('/');
    return { lang, cleanPath: cleanPath || '/' };
  }
  
  return { lang: null, cleanPath: pathname };
}

// ============================================
// DYNAMIC SITEMAP ROUTE (MUST BE BEFORE STATIC)
// ============================================
app.get('/sitemap-sets.xml', async (_req: Request, res: Response) => {
  console.log('[Sitemap] Generating sitemap-sets.xml');
  
  try {
    const result = await pool.query(`
      SELECT DISTINCT set_number, MAX(updated_at) as last_updated
      FROM set_current_deals
      WHERE expires_at > NOW()
      GROUP BY set_number
      ORDER BY set_number
    `);
    
    const today = new Date().toISOString().split('T')[0];
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
    
    for (const row of result.rows) {
      const lastMod = row.last_updated 
        ? new Date(row.last_updated).toISOString().split('T')[0]
        : today;
      
      // Add URLs for each language
      for (const lang of SUPPORTED_LANGUAGES) {
        const langPath = lang === 'en' ? '' : `/${lang}`;
        
        xml += '  <url>\n';
        xml += `    <loc>https://scoutloot.com${langPath}/set/${row.set_number}</loc>\n`;
        xml += `    <lastmod>${lastMod}</lastmod>\n`;
        xml += '    <changefreq>daily</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        
        // Add hreflang alternates
        for (const altLang of SUPPORTED_LANGUAGES) {
          const altPath = altLang === 'en' ? '' : `/${altLang}`;
          xml += `    <xhtml:link rel="alternate" hreflang="${altLang}" href="https://scoutloot.com${altPath}/set/${row.set_number}"/>\n`;
        }
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="https://scoutloot.com/set/${row.set_number}"/>\n`;
        
        xml += '  </url>\n';
      }
    }
    
    xml += '</urlset>';
    
    console.log(`[Sitemap] Generated with ${result.rows.length} sets x ${SUPPORTED_LANGUAGES.length} languages`);
    
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
    
  } catch (error) {
    console.error('[Sitemap] Error:', error);
    res.status(500).set('Content-Type', 'text/plain').send('Error generating sitemap');
  }
});

// ============================================
// LANGUAGE API ENDPOINT
// ============================================
app.get('/api/languages', (_req: Request, res: Response) => {
  res.json({
    supported: SUPPORTED_LANGUAGES,
    default: DEFAULT_LANGUAGE,
  });
});

// Set language preference via API
app.post('/api/language', express.json(), (req: Request, res: Response) => {
  const { language } = req.body;
  
  if (!language || !isSupportedLanguage(language)) {
    res.status(400).json({ error: 'Invalid language' });
    return;
  }
  
  res.cookie('language', language, {
    path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
  });
  
  res.json({ success: true, language });
});

// Serve static files (CSS, JS, images) - BEFORE language routes
app.use('/css', express.static(path.join(publicPath, 'css')));
app.use('/js', express.static(path.join(publicPath, 'js')));
app.use('/locales', express.static(path.join(publicPath, 'locales')));
app.use(express.static(publicPath, {
  index: false, // Don't serve index.html automatically - we handle it with i18n
}));

// ============================================
// AUTH RATE LIMITING (before routes)
// ============================================
app.use('/api/users/login', authLimiter);
app.use('/api/users/forgot-password', passwordResetLimiter);
app.post('/api/users', authLimiter);

// ============================================
// API ROUTES
// ============================================
app.use('/api', routes);

// ============================================
// EBAY MARKETPLACE ACCOUNT DELETION
// ============================================
app.get('/ebay/deletion', (req, res) => {
  const challengeCode = req.query.challenge_code as string;
  
  if (!challengeCode) {
    res.status(400).json({ error: 'Missing challenge_code' });
    return;
  }

  const endpoint = `${config.appBaseUrl}/ebay/deletion`;
  const hash = crypto
    .createHash('sha256')
    .update(challengeCode + config.ebayVerificationToken + endpoint)
    .digest('hex');

  console.log('eBay verification challenge received');
  res.json({ challengeResponse: hash });
});

app.post('/ebay/deletion', (req, res) => {
  console.log('eBay deletion notification received:', req.body);
  res.status(200).json({ status: 'received' });
});

// ============================================
// HEALTH ENDPOINT
// ============================================
app.get('/health', async (_req, res) => {
  try {
    const dbResult = await pool.query("SELECT NOW() as now, current_setting('timezone') as tz");
    
    let redisPing = false;
    try {
      await redis.ping();
      redisPing = true;
    } catch {
      redisPing = false;
    }

    const queueStats = await getQueueStats();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        serverTime: dbResult.rows[0].now,
        timezone: dbResult.rows[0].tz,
      },
      redis: {
        connected: redisPing,
      },
      queue: queueStats,
      environment: config.nodeEnv,
      i18n: {
        supportedLanguages: SUPPORTED_LANGUAGES,
        defaultLanguage: DEFAULT_LANGUAGE,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// SET DETAIL PAGE WITH SERVER-SIDE SEO
// ============================================

interface SetSEOData {
  set_number: string;
  name: string | null;
  year: number | null;
  pieces: number | null;
  theme: string | null;
  image_url: string | null;
  best_price_new: number | null;
  best_price_used: number | null;
  watchers: number;
}

async function getSetSEOData(setNumber: string): Promise<SetSEOData | null> {
  try {
    const setResult = await pool.query(`
      SELECT set_number, name, year, pieces, theme, image_url
      FROM sets WHERE set_number = $1
    `, [setNumber]);
    
    if (setResult.rows.length === 0) {
      return null;
    }
    
    const set = setResult.rows[0];
    
    const pricesResult = await pool.query(`
      SELECT condition, MIN(total_eur) as best_price
      FROM set_current_deals
      WHERE set_number = $1 AND expires_at > NOW()
      GROUP BY condition
    `, [setNumber]);
    
    const prices: Record<string, number> = {};
    for (const row of pricesResult.rows) {
      prices[row.condition] = parseFloat(row.best_price);
    }
    
    const watchersResult = await pool.query(`
      SELECT COUNT(*) as count FROM watches
      WHERE set_number = $1 AND status = 'active'
    `, [setNumber]);
    
    return {
      set_number: set.set_number,
      name: set.name,
      year: set.year,
      pieces: set.pieces,
      theme: set.theme,
      image_url: set.image_url,
      best_price_new: prices['new'] || null,
      best_price_used: prices['used'] || null,
      watchers: parseInt(watchersResult.rows[0]?.count || '0'),
    };
  } catch (error) {
    console.error('[SEO] Error fetching set data:', error);
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateProductJsonLd(data: SetSEOData, lang: SupportedLanguage): string {
  const bestPrice = data.best_price_new || data.best_price_used;
  
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': `LEGO ${data.set_number} ${data.name || 'Set'}`,
    'description': `Track prices for LEGO ${data.set_number} ${data.name || ''}. ${data.pieces ? `${data.pieces} pieces.` : ''} ${data.year ? `Released ${data.year}.` : ''}`,
    'sku': data.set_number,
    'mpn': data.set_number,
    'brand': { '@type': 'Brand', 'name': 'LEGO' },
    'inLanguage': lang,
  };
  
  if (data.image_url) {
    jsonLd['image'] = data.image_url;
  }
  
  if (bestPrice) {
    const offers: Record<string, unknown> = {
      '@type': 'AggregateOffer',
      'lowPrice': bestPrice.toFixed(2),
      'priceCurrency': 'EUR',
      'availability': 'https://schema.org/InStock',
      'offerCount': data.best_price_new && data.best_price_used ? 2 : 1,
    };
    if (data.best_price_new && data.best_price_used) {
      offers['highPrice'] = Math.max(data.best_price_new, data.best_price_used).toFixed(2);
    }
    jsonLd['offers'] = offers;
  }
  
  if (data.theme) {
    jsonLd['category'] = `LEGO ${data.theme}`;
  }
  
  return JSON.stringify(jsonLd, null, 2);
}

function injectSetSEOData(html: string, data: SetSEOData, lang: SupportedLanguage): string {
  const setName = data.name || 'LEGO Set';
  const fullName = `LEGO ${data.set_number} ${setName}`;
  const bestPrice = data.best_price_new || data.best_price_used;
  
  const title = `${fullName} - Price Tracker | ScoutLoot`;
  
  let description = `Track prices for ${fullName}.`;
  if (bestPrice) description += ` Currently from €${bestPrice.toFixed(2)}.`;
  if (data.pieces) description += ` ${data.pieces} pieces.`;
  if (data.year) description += ` Released ${data.year}.`;
  
  const langPath = lang === 'en' ? '' : `/${lang}`;
  const canonicalUrl = `https://scoutloot.com${langPath}/set/${data.set_number}`;
  const imageUrl = data.image_url || 'https://scoutloot.com/og-image.png';
  const jsonLd = generateProductJsonLd(data, lang);
  
  // Replace meta tags
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeHtml(description)}">`);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${canonicalUrl}">`);
  html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${canonicalUrl}">`);
  html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeHtml(fullName)} | ScoutLoot">`);
  html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${imageUrl}">`);
  html = html.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtml(fullName)} | ScoutLoot">`);
  html = html.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${imageUrl}">`);
  
  // Replace JSON-LD
  html = html.replace(/<script\s+id="json-ld"\s+type="application\/ld\+json">\s*<\/script>/i, `<script id="json-ld" type="application/ld+json">\n${jsonLd}\n</script>`);
  
  return html;
}

// ============================================
// i18n PAGE ROUTES
// ============================================

// Handle language-prefixed routes and root
const pageRouteHandler = (pageName: string, templateFile: string) => {
  return async (req: Request, res: Response) => {
    const { lang: pathLang, cleanPath } = extractLangFromPath(req.path);
    const lang = pathLang || detectLanguage(req);
    
    // If English is explicitly in URL, redirect to clean URL
    if ((pathLang as string) === 'en') {
      res.redirect(301, cleanPath);
      return;
    }
    
    renderI18nPage(req, res, templateFile, lang, req.path);
  };
};

// Homepage
app.get('/', pageRouteHandler('homepage', 'index.html'));
for (const lang of SUPPORTED_LANGUAGES) {
  if (lang !== 'en') {
    app.get(`/${lang}`, pageRouteHandler('homepage', 'index.html'));
    app.get(`/${lang}/`, pageRouteHandler('homepage', 'index.html'));
  }
}

// Static pages with i18n
const staticPages = [
  { path: '/privacy', template: 'privacy.html' },
  { path: '/terms', template: 'terms.html' },
  { path: '/faq', template: 'faq.html' },
  { path: '/cookies', template: 'cookies.html' },
];

for (const page of staticPages) {
  // English (default) route
  app.get(page.path, pageRouteHandler(page.path, page.template));
  
  // Language-prefixed routes
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang !== 'en') {
      app.get(`/${lang}${page.path}`, pageRouteHandler(page.path, page.template));
    }
  }
}

// Set detail pages with i18n
const setDetailHandler = async (req: Request, res: Response) => {
  const { setNumber } = req.params;
  const { lang: pathLang, cleanPath } = extractLangFromPath(req.path);
  const lang = pathLang || detectLanguage(req);
  
  // Normalize set number (remove -1 suffix)
  const normalizedSetNumber = setNumber.replace(/-\d+$/, '');
  
  // If English is explicitly in URL, redirect to clean URL
  if ((pathLang as string) === 'en') {
    res.redirect(301, `/set/${normalizedSetNumber}`);
    return;
  }
  
  // Redirect if URL has suffix
  if (setNumber !== normalizedSetNumber) {
    const langPath = pathLang && (pathLang as string) !== 'en' ? `/${pathLang}` : '';
    res.redirect(301, `${langPath}/set/${normalizedSetNumber}`);
    return;
  }
  
  try {
    const seoData = await getSetSEOData(normalizedSetNumber);
    let html = getTemplate('set.html');
    const translations = loadTranslations(lang, translationsPath);
    
    html = injectTranslations(html, translations, lang, req.path);
    
    if (seoData) {
      html = injectSetSEOData(html, seoData, lang);
    }
    
    res.cookie('language', lang, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: false,
      sameSite: 'lax',
    });
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    console.error('[SEO] Error serving set page:', error);
    res.sendFile(path.join(publicPath, 'set.html'));
  }
};

// Set detail routes
app.get('/set/:setNumber', setDetailHandler);
for (const lang of SUPPORTED_LANGUAGES) {
  if (lang !== 'en') {
    app.get(`/${lang}/set/:setNumber`, setDetailHandler);
  }
}

// ============================================
// LANGUAGE REDIRECT MIDDLEWARE
// ============================================
// For users with a language preference visiting the root, optionally redirect
// Note: This is disabled by default to keep English as default without redirect
// Uncomment if you want automatic language redirect based on browser settings

/*
app.get('/', (req: Request, res: Response, next: NextFunction) => {
  const detectedLang = detectLanguage(req);
  if (detectedLang !== 'en') {
    res.redirect(302, `/${detectedLang}/`);
    return;
  }
  next();
});
*/

// ============================================
// CATCH-ALL ROUTE (SPA)
// ============================================
app.get('*', (req, res) => {
  // API routes return 404
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  
  // Check if this is a language-prefixed path that doesn't match a known route
  const { lang: pathLang } = extractLangFromPath(req.path);
  const lang = pathLang || detectLanguage(req);
  
  // Serve the SPA index for all other routes
  renderI18nPage(req, res, 'index.html', lang, req.path);
});

// ============================================
// SHUTDOWN HANDLERS
// ============================================
async function shutdown() {
  console.log('Shutting down...');
  await closeRedis();
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// START SERVER
// ============================================
app.listen(config.port, () => {
  console.log(`🧱 ScoutLoot running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Rate limiting: enabled`);
  console.log(`   Security headers: enabled (Helmet)`);
  console.log(`   i18n: ${SUPPORTED_LANGUAGES.length} languages (${SUPPORTED_LANGUAGES.join(', ')})`);
  console.log(`   Frontend: http://localhost:${config.port}/`);
  console.log(`   German: http://localhost:${config.port}/de/`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
  console.log(`   API base: http://localhost:${config.port}/api`);
});

export default app;
