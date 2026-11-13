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

const fallbackUrl = 'https://unconfigured.supabase.co';
const fallbackKey = 'unconfigured-service-role-key';

let supabase;
if (!supabaseUrl || !serviceRoleKey) {
  console.warn('[db-client] Warning: Supabase environment variables missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). DB queries will fail gracefully.');
  supabase = createClient(supabaseUrl || fallbackUrl, serviceRoleKey || fallbackKey);
} else {
  supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: {
      fetch: async (url, options) => {
        const res = await fetch(url, options);
        if (!res.ok && res.status >= 500) triggerRestore();
        return res;
      },
    },
  });
}

export default supabase;
