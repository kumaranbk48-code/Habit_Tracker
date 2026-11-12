import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Fix: Ensure process.env is populated before reading env vars in ES Modules
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  const msg = '[db-client] Missing required Supabase env vars: NEXT_PUBLIC_SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY';
  console.error(msg, {
    hasUrl: !!supabaseUrl,
    hasKey: !!serviceRoleKey,
  });
  throw new Error(msg);
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
