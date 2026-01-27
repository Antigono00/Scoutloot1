/**
 * ScoutLoot - Express Server Entry Point
 * 
 * V21: Set Pages Phase 4 - SEO & Polish
 * - Server-side meta tag injection for /set/:setNumber
 * - Server-side JSON-LD Product schema for crawlers
 * - Dynamic sitemap for sets
 */

import express, { Request, Response, NextFunction } from 'express';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust Nginx proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

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

const publicPath = path.join(__dirname, '..', 'public');

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
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    for (const row of result.rows) {
      const lastMod = row.last_updated 
        ? new Date(row.last_updated).toISOString().split('T')[0]
        : today;
      
      xml += '  <url>\n';
      xml += `    <loc>https://scoutloot.com/set/${row.set_number}</loc>\n`;
      xml += `    <lastmod>${lastMod}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    }
    
    xml += '</urlset>';
    
    console.log(`[Sitemap] Generated with ${result.rows.length} sets`);
    
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
    
  } catch (error) {
    console.error('[Sitemap] Error:', error);
    res.status(500).set('Content-Type', 'text/plain').send('Error generating sitemap');
  }
});

// Serve static files (AFTER dynamic sitemap route)
app.use(express.static(publicPath));

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
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// STATIC PAGE ROUTES
// ============================================
app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(publicPath, 'privacy.html'));
});

app.get('/terms', (_req, res) => {
  res.sendFile(path.join(publicPath, 'terms.html'));
});

app.get('/faq', (_req, res) => {
  res.sendFile(path.join(publicPath, 'faq.html'));
});

app.get('/cookies', (_req, res) => {
  res.sendFile(path.join(publicPath, 'cookies.html'));
});

// ============================================
// SET DETAIL PAGE WITH SERVER-SIDE SEO (V21)
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

/**
 * Fetch set data for SEO injection
 */
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

function generateProductJsonLd(data: SetSEOData): string {
  const bestPrice = data.best_price_new || data.best_price_used;
  
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': `LEGO ${data.set_number} ${data.name || 'Set'}`,
    'description': `Track prices for LEGO ${data.set_number} ${data.name || ''}. ${data.pieces ? `${data.pieces} pieces.` : ''} ${data.year ? `Released ${data.year}.` : ''} Get alerts when prices drop on eBay.`,
    'sku': data.set_number,
    'mpn': data.set_number,
    'brand': { '@type': 'Brand', 'name': 'LEGO' },
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

function injectSEOData(html: string, data: SetSEOData): string {
  const setName = data.name || 'LEGO Set';
  const fullName = `LEGO ${data.set_number} ${setName}`;
  const bestPrice = data.best_price_new || data.best_price_used;
  
  const title = `${fullName} - Price Tracker | ScoutLoot`;
  
  let description = `Track prices for ${fullName}.`;
  if (bestPrice) description += ` Currently from €${bestPrice.toFixed(2)}.`;
  if (data.pieces) description += ` ${data.pieces} pieces.`;
  if (data.year) description += ` Released ${data.year}.`;
  description += ' Get alerts when prices drop on eBay.';
  
  const canonicalUrl = `https://scoutloot.com/set/${data.set_number}`;
  const imageUrl = data.image_url || 'https://scoutloot.com/og-image.png';
  const jsonLd = generateProductJsonLd(data);
  
  // Replace meta tags using regex
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeHtml(description)}">`);
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${canonicalUrl}">`);
  html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${canonicalUrl}">`);
  html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeHtml(fullName)} - Price Tracker | ScoutLoot">`);
  html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${imageUrl}">`);
  html = html.replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtml(fullName)} - Price Tracker | ScoutLoot">`);
  html = html.replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtml(description)}">`);
  html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${imageUrl}">`);
  
  // Replace empty JSON-LD script
  html = html.replace(/<script\s+id="json-ld"\s+type="application\/ld\+json">\s*<\/script>/i, `<script id="json-ld" type="application/ld+json">\n${jsonLd}\n</script>`);
  
  return html;
}

// Template cache
let setPageTemplate: string | null = null;

function getSetPageTemplate(): string {
  if (!setPageTemplate) {
    setPageTemplate = fs.readFileSync(path.join(publicPath, 'set.html'), 'utf-8');
  }
  return setPageTemplate;
}

// Clear cache in development
if (config.nodeEnv === 'development') {
  fs.watch(path.join(publicPath, 'set.html'), () => {
    setPageTemplate = null;
    console.log('[Dev] set.html template cache cleared');
  });
}

// Set detail page route with server-side SEO
app.get('/set/:setNumber', async (req: Request, res: Response) => {
  const { setNumber } = req.params;
  const normalizedSetNumber = setNumber.replace(/-\d+$/, '');
  
  // Redirect if URL has suffix
  if (setNumber !== normalizedSetNumber) {
    res.redirect(301, `/set/${normalizedSetNumber}`);
    return;
  }
  
  try {
    const seoData = await getSetSEOData(normalizedSetNumber);
    let html = getSetPageTemplate();
    
    if (seoData) {
      html = injectSEOData(html, seoData);
    }
    
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (error) {
    console.error('[SEO] Error serving set page:', error);
    res.sendFile(path.join(publicPath, 'set.html'));
  }
});

// ============================================
// CATCH-ALL ROUTE (SPA)
// ============================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(publicPath, 'index.html'));
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
  console.log(`   Frontend: http://localhost:${config.port}/`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
  console.log(`   API base: http://localhost:${config.port}/api`);
  console.log(`   Set pages: http://localhost:${config.port}/set/:setNumber`);
  console.log(`   Sets sitemap: http://localhost:${config.port}/sitemap-sets.xml`);
});

export default app;
