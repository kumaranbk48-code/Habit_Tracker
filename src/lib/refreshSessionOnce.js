import supabase from './supabase';

let refreshPromise = null;

/**
 * Deduplicated session refresher.
 * Multiple concurrent callers will share the same in-flight refresh request.
 * @returns {Promise<{ session: import('@supabase/supabase-js').Session | null, error: any }>}
 */
export async function refreshSessionOnce() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      return { session: data?.session ?? null, error };
    } catch (err) {
      return { session: null, error: err };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export default refreshSessionOnce;

