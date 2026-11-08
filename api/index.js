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

export default async function handler(req, res) {
  try {
    // 1. Parse route from request URL
    const urlObj = new URL(req.url, 'http://localhost');
    const pathSegments = urlObj.pathname.replace(/^\/api\/?/, '').split('/');
    const routeName = (pathSegments[0] || '').toLowerCase().trim();

    // 2. Normalize query params
    if (!req.query) {
      req.query = {};
      for (const [k, v] of urlObj.searchParams.entries()) {
        req.query[k] = v;
      }
    }

    // 3. Normalize JSON body if incoming stream isn't parsed yet
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) {
      if (req.body === undefined) {
        req.body = await new Promise((resolve) => {
          let raw = '';
          req.on('data', (chunk) => { raw += chunk; });
          req.on('end', () => {
            try {
              resolve(raw ? JSON.parse(raw) : {});
            } catch {
              resolve({});
            }
          });
          req.on('error', () => resolve({}));
        });
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
