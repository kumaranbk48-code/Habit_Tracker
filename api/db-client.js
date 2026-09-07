import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

// Fix: Ensure process.env is populated before reading env vars in ES Modules
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://placeholder.supabase.co';

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'placeholder-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  console.error('[db-client] Missing env vars:', {
    hasUrl: false,
    hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
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
