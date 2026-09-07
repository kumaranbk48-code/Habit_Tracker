import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

// Fix: Vercel serverless functions use process.env directly.
// The original code used NEXT_PUBLIC_ prefix vars which are fine here,
// but we also support the VITE_ prefix fallback in case env vars are renamed.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // Log clearly so Vercel function logs tell you exactly what's wrong
  console.error('[db-client] Missing env vars:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!serviceRoleKey,
  });
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  global: {
    fetch: async (url, options) => {
      const res = await fetch(url, options);
      if (!res.ok && res.status >= 500) triggerRestore();
      return res;
    },
  },
});

export default supabase;
