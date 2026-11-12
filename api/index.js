import habitsHandler from './_routes/habits.js';
import goalsHandler from './_routes/goals.js';
import trackingHandler from './_routes/tracking.js';
import dashboardHandler from './_routes/dashboard.js';
import reportsHandler from './_routes/reports.js';
import remindersHandler from './_routes/reminders.js';
import milestonesHandler from './_routes/milestones.js';
import achievementsHandler from './_routes/achievements.js';
import heatmapHandler from './_routes/heatmap.js';
import digestHandler from './_routes/digest.js';
import pushSubscribeHandler from './_routes/push-subscribe.js';
import pushSendHandler from './_routes/push-send.js';
import learningHandler from './_routes/learning.js';
import accountHandler from './_routes/account.js';
import seasonsHandler from './_routes/seasons.js';
import aiHandler from './_routes/ai.js';
import healthHandler from './_routes/health.js';

const ROUTE_MAP = {
  habits: habitsHandler,
  goals: goalsHandler,
  tracking: trackingHandler,
  dashboard: dashboardHandler,
  reports: reportsHandler,
  reminders: remindersHandler,
  milestones: milestonesHandler,
  achievements: achievementsHandler,
  heatmap: heatmapHandler,
  digest: digestHandler,
  'push-subscribe': pushSubscribeHandler,
  'push-send': pushSendHandler,
  learning: learningHandler,
  account: accountHandler,
  seasons: seasonsHandler,
  ai: aiHandler,
  health: healthHandler,
};

// ── In-Memory Rate Limiter for Serverless Invocations ────────────────────────
// Note: In serverless (Vercel), in-memory maps apply per-container instance.
// For strict cross-container distributed rate limiting at scale, connect Upstash Redis or Vercel KV.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;
const SENSITIVE_LIMIT_PER_WINDOW = 30; // e.g., account deletion, data export

function checkRateLimit(ip, isSensitive) {
  const now = Date.now();
  const limit = isSensitive ? SENSITIVE_LIMIT_PER_WINDOW : MAX_REQUESTS_PER_WINDOW;
  const key = `${ip}:${isSensitive ? 'sensitive' : 'standard'}`;
  const record = rateLimitMap.get(key);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, startTime: now });
    return true;
  }

  record.count++;
  if (record.count > limit) {
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  try {
    // 1. Parse route from request URL
    const urlObj = new URL(req.url, 'http://localhost');
    const pathSegments = urlObj.pathname.replace(/^\/api\/?/, '').split('/');
    const routeName = (pathSegments[0] || '').toLowerCase().trim();

    // Rate limit check (health route is excluded)
    if (routeName && routeName !== 'health') {
      const headers = req.headers || {};
      const vercelForwarded = typeof headers['x-vercel-forwarded-for'] === 'string'
        ? headers['x-vercel-forwarded-for'].split(',').map((s) => s.trim()).filter(Boolean).pop()
        : null;
      const realIp = typeof headers['x-real-ip'] === 'string' ? headers['x-real-ip'].trim() : null;
      const trustHops = Number(process.env.TRUST_PROXY_HOPS || 0);
      let trustedForwardedIp = null;
      if (trustHops > 0 && typeof headers['x-forwarded-for'] === 'string') {
        const parts = headers['x-forwarded-for'].split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length > 0) {
          trustedForwardedIp = parts[Math.max(0, parts.length - trustHops)];
        }
      }
      const ip = vercelForwarded ||
                 realIp ||
                 trustedForwardedIp ||
                 req.socket?.remoteAddress ||
                 'unknown';

      const isSensitive = routeName === 'account';
      if (!checkRateLimit(ip, isSensitive)) {
        return res.status(429).json({ error: 'Too many requests — please slow down' });
      }

      if (rateLimitMap.size > 2000) {
        const now = Date.now();
        for (const [k, v] of rateLimitMap.entries()) {
          if (now - v.startTime > RATE_LIMIT_WINDOW_MS) {
            rateLimitMap.delete(k);
          }
        }
      }
    }

    // 2. Normalize query params
    if (!req.query) {
      req.query = {};
      for (const [k, v] of urlObj.searchParams.entries()) {
        req.query[k] = v;
      }
    }

    // 3. Normalize JSON body if incoming stream isn't parsed yet (100kb cap + strict JSON errors)
    const MAX_BODY_BYTES = 100 * 1024;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
      if (req.body === undefined) {
        if (typeof req.on !== 'function') {
          req.body = {};
        } else {
          const contentLength = Number(req.headers?.['content-length'] || 0);
          if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
            return res.status(413).json({ error: 'Payload too large — maximum body size is 100kb' });
          }

          const bodyResult = await new Promise((resolve) => {
            let settled = false;
            const chunks = [];
            let totalBytes = 0;

            const settle = (result) => {
              if (!settled) {
                settled = true;
                resolve(result);
              }
            };

            req.on('data', (chunk) => {
              if (settled) return;
              const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
              totalBytes += buf.length;
              if (totalBytes > MAX_BODY_BYTES) {
                chunks.length = 0;
                req.resume?.();
                return settle({ status: 413, error: 'Payload too large — maximum body size is 100kb' });
              }
              chunks.push(buf);
            });

            req.on('end', () => {
              if (settled) return;
              const raw = Buffer.concat(chunks).toString('utf8').trim();
              if (!raw) {
                return settle({ body: {} });
              }
              try {
                return settle({ body: JSON.parse(raw) });
              } catch {
                return settle({ status: 400, error: 'Invalid JSON request body' });
              }
            });

            req.on('error', () => {
              settle({ status: 400, error: 'Invalid request body stream' });
            });
          });

          if (bodyResult.status) {
            return res.status(bodyResult.status).json({ error: bodyResult.error });
          }
          req.body = bodyResult.body;
        }
      }
    }

    // 4. Find matching route handler
    const routeHandler = ROUTE_MAP[routeName];
    if (routeHandler) {
      return await routeHandler(req, res);
    }

    // 5. Fallback for root /api or unknown
    if (!routeName) {
      return res.status(200).json({ status: 'ok', service: 'HabiZ API Gateway' });
    }

    return res.status(404).json({ error: `API route /api/${routeName} not found` });
  } catch (err) {
    console.error('[api/index] Gateway unhandled error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

