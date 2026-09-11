// Centralized CORS Handler with strict production allowlist
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

export function isOriginAllowed(origin) {
  if (!origin) return false;
  const envOrigins = [
    process.env.APP_URL,
    process.env.VITE_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL
  ].filter(Boolean);

  const allowed = [...DEFAULT_ALLOWED_ORIGINS, ...envOrigins];
  const normalized = origin.replace(/\/$/, '');
  return allowed.some(a => a.replace(/\/$/, '') === normalized);
}

export function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');

  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret, x-timezone');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // Request handled as preflight
  }
  return false;
}
