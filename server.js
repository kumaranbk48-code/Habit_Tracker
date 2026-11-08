import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import habitsHandler from './api/_routes/habits.js';
import goalsHandler from './api/_routes/goals.js';
import trackingHandler from './api/_routes/tracking.js';
import dashboardHandler from './api/_routes/dashboard.js';
import reportsHandler from './api/_routes/reports.js';
import remindersHandler from './api/_routes/reminders.js';
import milestonesHandler from './api/_routes/milestones.js';
import achievementsHandler from './api/_routes/achievements.js';
import heatmapHandler from './api/_routes/heatmap.js';
import digestHandler from './api/_routes/digest.js';
import pushSubscribeHandler from './api/_routes/push-subscribe.js';
import pushSendHandler from './api/_routes/push-send.js';
import learningHandler from './api/_routes/learning.js';
import accountHandler from './api/_routes/account.js';
import seasonsHandler from './api/_routes/seasons.js';
import aiHandler from './api/_routes/ai.js';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || process.env.API_PORT || 3001;

// ── Security Headers Middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ── Strict Body Size Limit (Prevent Memory Exhaustion DoS) ───────────────────
app.use(express.json({ limit: '100kb' }));

// ── Route-Level In-Memory Rate Limiter ────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path === '/api/health') {
    return next();
  }
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) || req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return next();
  }

  record.count++;
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests — please slow down' });
  }

  next();
});

// Clean up stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function wrap(handler) {
  return (req, res) => handler(req, res);
}

app.all('/api/health',         (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));
app.all('/api/habits',         wrap(habitsHandler));
app.all('/api/goals',          wrap(goalsHandler));
app.all('/api/tracking',       wrap(trackingHandler));
app.all('/api/dashboard',      wrap(dashboardHandler));
app.all('/api/reports',        wrap(reportsHandler));
app.all('/api/reminders',      wrap(remindersHandler));
app.all('/api/milestones',     wrap(milestonesHandler));
app.all('/api/achievements',   wrap(achievementsHandler));
app.all('/api/heatmap',        wrap(heatmapHandler));
app.all('/api/digest',         wrap(digestHandler));
app.all('/api/push-subscribe', wrap(pushSubscribeHandler));
app.all('/api/push-send',      wrap(pushSendHandler));
app.all('/api/learning',       wrap(learningHandler));
app.all('/api/learning/*',     wrap(learningHandler));
app.all('/api/account',        wrap(accountHandler));
app.all('/api/seasons',        wrap(seasonsHandler));
app.all('/api/seasons/*',      wrap(seasonsHandler));
app.all('/api/ai',             wrap(aiHandler));

// ── API 404 Catch-All (Ensure JSON 404, never fallback to index.html for API) ──
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// JSON body limit error handler
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large — maximum body size is 100kb' });
  }
  next(err);
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
    console.error(`   To free port ${PORT} in PowerShell, run:`);
    console.error(`   Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
