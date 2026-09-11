import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

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

      if (error) {
        console.error('[/api/push-subscribe] POST error:', error);
        return res.status(500).json({ error: 'Failed to save push subscription' });
      }

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

      if (error) {
        console.error('[/api/push-subscribe] DELETE error:', error);
        return res.status(500).json({ error: 'Failed to remove push subscription' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/push-subscribe] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
