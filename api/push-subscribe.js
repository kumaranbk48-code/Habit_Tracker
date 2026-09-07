import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid token' });

  try {
    if (req.method === 'POST') {
      const { subscription } = req.body ?? {};
      if (!subscription?.endpoint) {
        return res.status(400).json({ error: 'subscription.endpoint is required' });
      }

      // Upsert by endpoint so re-subscribing doesn't create duplicates
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: user.id, endpoint: subscription.endpoint, subscription },
          { onConflict: 'endpoint' }
        );
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { endpoint } = req.body ?? {};
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/push-subscribe] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
