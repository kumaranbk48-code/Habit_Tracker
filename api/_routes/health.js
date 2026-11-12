import supabase from './db-client.js';

export default async function handler(req, res) {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.npm_package_version ||
    '1.0.0';

  let db = 'unreachable';
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

  if (supaUrl && !supaUrl.includes('.invalid')) {
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
