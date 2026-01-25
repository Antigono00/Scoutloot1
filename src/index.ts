import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
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

// ============================================
// SECURITY: Block suspicious paths FIRST
// These are common attack patterns - reject immediately
// ============================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    '%c0%af',        // URL encoding attack
    '%e0%80%af',     // Overlong UTF-8
    '..%2f',         // Path traversal
    '..%5c',         // Windows path traversal
    '.env',          // Trying to access env files
    '/etc/passwd',   // Linux password file
    '/etc/shadow',   // Linux shadow file
    'aws/credentials', // AWS creds
    'wp-admin',      // WordPress attacks
    'wp-login',      // WordPress attacks
    'phpmyadmin',    // phpMyAdmin attacks
    '.git/config',   // Git config
    'xmlrpc.php',    // WordPress XML-RPC
    'administrator', // Joomla attacks
    'admin.php',     // Generic admin
    '.asp',          // ASP attacks
    '.aspx',         // ASPX attacks
    'shell.php',     // Shell upload attempts
    'eval(',         // Code injection
    'base64_decode', // PHP injection
  ];
  
  const pathLower = req.path.toLowerCase();
  const urlLower = req.originalUrl.toLowerCase();
  
  for (const pattern of suspiciousPatterns) {
    if (pathLower.includes(pattern) || urlLower.includes(pattern)) {
      // Log the attack attempt (but don't flood logs)
      if (Math.random() < 0.1) { // Log 10% of attacks
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

// Global rate limiter - 200 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req: Request) => req.path === '/health',
});

// Strict limiter for auth endpoints - 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Very strict limiter for password reset - 3 attempts per hour
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Too many password reset attempts, please try again in an hour' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global limiter
app.use(globalLimiter);

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());

// Serve static files from public directory
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ============================================
// AUTH RATE LIMITING (before routes)
// ============================================
app.use('/api/users/login', authLimiter);
app.use('/api/users/forgot-password', passwordResetLimiter);
app.post('/api/users', authLimiter); // Signup

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
  res.redirect('/privacy#cookies');
});

// ============================================
// CATCH-ALL ROUTE (SPA)
// ============================================
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
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
  console.log(`   Frontend: http://localhost:${config.port}/`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
  console.log(`   API base: http://localhost:${config.port}/api`);
});

export default app;
