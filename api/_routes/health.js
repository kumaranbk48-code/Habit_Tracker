import supabase from './db-client.js';

export default async function handler(req, res) {
  if (typeof res.setHeader === 'function') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }

  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.npm_package_version ||
    '1.0.0';

  // Explicit uncached lite health branch: fast probe that skips DB work completely
  const isLite = req.query?.lite === '1' || req.query?.lite === 'true' || req.method === 'HEAD';
  if (isLite) {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
      db: 'skipped_lite',
    });
  }

  let db = 'unreachable';
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

  const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (supaUrl && hasKey && !supaUrl.includes('.invalid') && !supaUrl.includes('unconfigured')) {
    try {
      const ping = supabase.from('habits').select('id').limit(1);
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB ping timeout')), 1500)
      );
      const { error } = await Promise.race([ping, timeout]);
      db = error ? 'degraded' : 'ok';
    } catch {
      db = 'unreachable';
    }
  } else if (!hasKey) {
    db = 'missing_service_key';
  } else {
    db = 'skipped';
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version,
    db,
  });
}
