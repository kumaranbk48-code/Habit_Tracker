import { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import { clearUserCache } from '../lib/offlineDb';
import SignOutConfirmDialog from '../components/SignOutConfirmDialog';
import refreshSessionOnce from '../lib/refreshSessionOnce';

const getApiBaseUrl = () => {
  const url = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
  if (url) {
    return url.replace(/\/$/, '');
  }
  return '';
};

function isDefinitiveAuthFailure(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return false;
  const status = error.status || error.code;
  if (status === 400 || status === 401 || status === 'invalid_grant') return true;
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('invalid') || msg.includes('expired') || msg.includes('revoked') || msg.includes('not found')) {
    return true;
  }
  return false;
}

// Global fetch interceptor to handle expired/invalid tokens from the backend.
// On 401, attempts session refresh first instead of immediately wiping active state.
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  let url = typeof resource === 'string' ? resource : resource?.url || '';

  const apiBase = getApiBaseUrl();
  if (apiBase && typeof resource === 'string') {
    if (resource.startsWith('/api/')) {
      resource = `${apiBase}${resource}`;
    }
    args[0] = resource;
    url = resource;
  }

  if (typeof url === 'string' && url.includes('/api/')) {
    config = config ? { ...config } : {};
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    if (config.headers instanceof Headers) {
      if (!config.headers.has('x-timezone')) config.headers.set('x-timezone', tz);
    } else if (Array.isArray(config.headers)) {
      if (!config.headers.some(([k]) => k.toLowerCase() === 'x-timezone')) {
        config.headers.push(['x-timezone', tz]);
      }
    } else {
      config.headers = {
        'x-timezone': tz,
        ...(config.headers || {}),
      };
    }
    args[1] = config;
  }

  const response = await originalFetch(...args);
  if (response.status === 401) {
    try {
      const headers = config?.headers;
      let hasAuth = false;
      if (headers) {
        if (typeof headers.get === 'function') {
          hasAuth = !!headers.get('Authorization');
        } else if (typeof headers === 'object') {
          hasAuth = !!(headers.Authorization || headers.authorization);
        }
      }
      if (hasAuth && url.includes('/api/')) {
        console.warn('[Auth] Backend returned 401 for', url, '— attempting shared token refresh...');
        refreshSessionOnce().then(({ session: newSession, error }) => {
          if (!newSession && isDefinitiveAuthFailure(error)) {
            console.warn('[Auth] Definitive token refresh failure after 401 — signing out...');
            supabase.auth.signOut().catch(() => {});
          } else if (error) {
            console.warn('[Auth] Transient refresh error — retaining session offline:', error.message);
          }
        }).catch(() => {});
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }
  return response;
};

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  signOut: () => {},
  requestSignOut: () => {},
  signOutDirect: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogState, setDialogState] = useState({ isOpen: false, triggerElement: null });

  const purgeUserStorage = (currentUserId, { preserveQueue = true } = {}) => {
    try {
      if (currentUserId) {
        clearUserCache(currentUserId, { preserveQueue }).catch(() => {});
      }
      const userKeysToClear = [
        'habittracker_dismissed_alerts',
        'has_seen_learning_onboarding',
        'ht-selected-season'
      ];
      for (const k of userKeysToClear) {
        localStorage.removeItem(k);
      }
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (
          key.includes('sb-') ||
          key.includes('supabase') ||
          key.includes('auth') ||
          key.startsWith('habit_tracker_goals_meta')
        )) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  };

  // Direct sign out (used for session expiration, account deletion, or confirmed signout)
  const signOutDirect = async () => {
    const currentId = user?.id;
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[Auth] Error signing out:', e);
    } finally {
      setSession(null);
      setUser(null);
      purgeUserStorage(currentId, { preserveQueue: false });
    }
  };

  // User-initiated sign out (opens accessible confirmation dialog)
  const requestSignOut = (triggerElement = null) => {
    setDialogState({
      isOpen: true,
      triggerElement: triggerElement || (typeof document !== 'undefined' ? document.activeElement : null),
    });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user);
        setLoading(false);

        supabase.auth.getUser(session.access_token).then(({ data: userData, error }) => {
          if (error && error.status === 401 && error.message?.toLowerCase().includes('invalid')) {
            console.warn('[Auth] Session definitively invalid. Clearing session...');
            supabase.auth.signOut().catch(() => {});
            setSession(null);
            setUser(null);
            purgeUserStorage(session.user?.id, { preserveQueue: true });
          } else if (userData?.user) {
            setUser(userData.user);
          }
        }).catch(() => {
          // Keep active cached session on transient network error
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        // Session expired/lost: preserve pending offline queue items
        purgeUserStorage(user?.id, { preserveQueue: true });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signOut: requestSignOut,
        requestSignOut,
        signOutDirect,
      }}
    >
      {children}
      <SignOutConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={() => setDialogState({ isOpen: false, triggerElement: null })}
        onConfirm={signOutDirect}
        userId={user?.id}
        accessToken={session?.access_token}
        triggerElement={dialogState.triggerElement}
      />
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
