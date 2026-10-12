import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { config, validateConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = config.port;
const MONGODB_URI = config.mongodb.uri;
const MONGODB_DB = config.mongodb.database;
const CRON_SECRET = config.cron.secret;
const ADMIN_PASSWORD = config.admin.password;
const MAX_SITES = config.monitoring.maxSitesPerRun;
const HISTORY_LIMIT = config.monitoring.historyLimit;
const REQUEST_TIMEOUT_MS = config.monitoring.requestTimeoutMs;
validateConfig();

app.disable('x-powered-by');
app.use(express.json({ limit: config.security.jsonBodyLimit }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

let mongoClient;
let db;
async function connectMongo() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10
    });
    await mongoClient.connect();
    db = mongoClient.db(MONGODB_DB);
    await db.collection('sites').createIndex({ id: 1 }, { unique: true });
    await db.collection('checks').createIndex({ siteId: 1, checkedAt: -1 });
    await db.collection('checks').createIndex({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * config.monitoring.historyDays });
  }
  return db;
}

function validHttpUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' ||
        h === '0.0.0.0' || /^127\./.test(h) || /^10\./.test(h) ||
        /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
    return u;
  } catch { return null; }
}

function secretMatches(supplied, expected) {
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cronAuthorized(req) {
  if (!CRON_SECRET) return false;
  const auth = req.get('authorization') || '';
  const supplied = req.get('x-cron-secret') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  return secretMatches(supplied, CRON_SECRET);
}

async function pingSite(site) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let statusCode = null;
  let error = null;
  try {
    let response = await fetch(site.url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': config.monitoring.userAgent }
    });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(site.url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': config.monitoring.userAgent, range: 'bytes=0-0' }
      });
      try { await response.body?.cancel(); } catch {}
    }
    statusCode = response.status;
    if (statusCode >= 300 && statusCode < 400) error = `Redirect (${statusCode}); destination not followed`;
  } catch (e) {
    error = e?.name === 'AbortError' ? 'Request timed out' : 'Connection failed';
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Date.now() - started;
  return {
    id: randomUUID(),
    siteId: site.id,
    checkedAt: new Date(),
    status: statusCode !== null && statusCode >= 200 && statusCode < 400 && !error ? 'up' : 'down',
    statusCode,
    latencyMs,
    error
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    const database = await connectMongo();
    await database.command({ ping: 1 });
    res.json({ ok: true, service: 'TEDDY-XMD AutoPing', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, error: 'Database unavailable. Check MONGODB_URI.' });
  }
});

app.get('/api/sites', async (_req, res) => {
  try {
    const database = await connectMongo();
    const sites = await database.collection('sites')
      .find({}, { projection: { _id: 0, id: 1, name: 1, url: 1, createdAt: 1, lastCheck: 1, status: 1, latencyMs: 1, statusCode: 1 } })
      .sort({ createdAt: -1 }).limit(MAX_SITES).toArray();
    res.set('Cache-Control', 'no-store');
    res.json({ sites });
  } catch {
    res.status(503).json({ error: 'MongoDB is not configured or is unavailable. Set MONGODB_URI.' });
  }
});

app.get('/api/history', async (req, res) => {
  const siteId = String(req.query.siteId || '');
  if (!siteId || siteId.length > 100) return res.status(400).json({ error: 'Provide a valid siteId' });
  try {
    const database = await connectMongo();
    const history = await database.collection('checks')
      .find({ siteId }, { projection: { _id: 0 } })
      .sort({ checkedAt: -1 }).limit(HISTORY_LIMIT).toArray();
    res.json({ history });
  } catch {
    res.status(503).json({ error: 'MongoDB is not configured or is unavailable.' });
  }
});



// Password-protected website registration. The password is checked server-side
// on every submission and is never stored in the browser or database.
app.post('/api/admin/sites', async (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin password is not configured. Set ADMIN_PASSWORD in Railway Variables.' });
  if (!secretMatches(req.body?.password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const parsed = validHttpUrl(rawUrl);
  if (!name || name.length > 100) return res.status(400).json({ error: 'Website name is required (maximum 100 characters).' });
  if (!parsed) return res.status(400).json({ error: 'Enter a valid public HTTP or HTTPS website URL.' });
  try {
    const database = await connectMongo();
    const id = randomUUID();
    const site = {
      id,
      name,
      url: parsed.toString(),
      createdAt: new Date(),
      lastCheck: null,
      status: 'unknown',
      latencyMs: null,
      statusCode: null,
      enabled: true
    };
    await database.collection('sites').insertOne(site);
    res.status(201).json({ ok: true, site: { id, name, url: site.url, createdAt: site.createdAt, lastCheck: null, status: 'unknown', latencyMs: null, statusCode: null } });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'This website is already registered.' });
    console.error('Website registration failed:', e?.message || e);
    res.status(503).json({ error: 'Could not save website. Check MongoDB connectivity.' });
  }
});

app.post('/api/cron', async (req, res) => {
  if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const database = await connectMongo();
    const sites = await database.collection('sites').find({ enabled: { $ne: false } })
      .limit(MAX_SITES).toArray();
    const results = [];
    for (const site of sites) {
      // Validate again before outbound requests; only trusted database entries should be monitored.
      const parsed = validHttpUrl(site.url);
      if (!parsed) {
        results.push({ name: site.name, url: site.url, status: 'down', error: 'URL rejected by safety checks' });
        continue;
      }
      const result = await pingSite(site);
      await database.collection('checks').insertOne(result);
      await database.collection('sites').updateOne({ id: site.id }, {
        $set: {
          lastCheck: result.checkedAt,
          status: result.status,
          latencyMs: result.latencyMs,
          statusCode: result.statusCode
        }
      });
      results.push({ name: site.name, url: site.url, ...result });
    }
    res.json({ ok: true, checked: results.length, results, ranAt: new Date().toISOString() });
  } catch (e) {
    console.error('Scheduled check failed:', e?.message || e);
    res.status(503).json({ error: 'Scheduled check failed. Verify MongoDB connectivity.' });
  }
});

// Public dashboard only: no unauthenticated site mutation endpoints are provided.
app.use(express.static(path.join(__dirname, 'dist'), { index: false, maxAge: '1h' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TEDDY-XMD AutoPing listening on port ${PORT}`);
});
