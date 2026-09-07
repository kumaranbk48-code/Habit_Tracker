import { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../lib/supabase';

// Global fetch interceptor to handle expired/invalid tokens from the backend.
// If the backend returns a 401 response indicating the token has expired or is unauthorized,
// we sign the user out client-side to trigger onAuthStateChange and redirect them to the login page.
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const headers = args[1]?.headers;
      let hasAuth = false;
      if (headers) {
        if (typeof headers.get === 'function') {
          hasAuth = !!headers.get('Authorization');
        } else if (typeof headers === 'object') {
          hasAuth = !!(headers.Authorization || headers.authorization);
        }
      }
      if (hasAuth && url.includes('/api/')) {
        console.warn('[Auth] Backend returned 401 for', url, '— clearing stale session token...');
        // Clear local storage items related to auth
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('sb-') || key.includes('supabase') || key.includes('auth'))) {
            localStorage.removeItem(key);
          }
        }
        supabase.auth.signOut().catch(() => {});
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }
  return response;
};

const AuthContext = createContext({ user: null, session: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Set session immediately so UI remains responsive and resilient to network blips
        setSession(session);
        setUser(session.user);
        setLoading(false);

        // Optional background verification without aggressively wiping on network errors
        supabase.auth.getUser(session.access_token).then(({ data: userData, error }) => {
          if (error && error.status === 401 && error.message?.toLowerCase().includes('invalid')) {
            console.warn('[Auth] Session definitively invalid. Clearing session...');
            supabase.auth.signOut().catch(() => {});
            setSession(null);
            setUser(null);
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
        // Clear any auth items
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('sb-') || key.includes('supabase') || key.includes('auth'))) {
            localStorage.removeItem(key);
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
