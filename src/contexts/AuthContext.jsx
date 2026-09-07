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
      const clone = response.clone();
      const body = await clone.json().catch(() => null);
      if (body && body.error && (
        body.error.includes('expired token') ||
        body.error.includes('Unauthorized') ||
        body.error.includes('Invalid token')
      )) {
        console.warn('[Auth] Session token is invalid or expired. Signing out...');
        supabase.auth.signOut().catch(() => {});
      }
    } catch (e) {
      // Ignore parsing errors for non-JSON or malformed responses
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
        // Force refresh to ensure token isn't expired before making API calls
        supabase.auth.refreshSession().then(({ data: { session: refreshed } }) => {
          setSession(refreshed);
          setUser(refreshed?.user ?? null);
          setLoading(false);
        }).catch(() => {
          // Refresh failed — clear local session, ProtectedRoute will redirect to /login
          setSession(null);
          setUser(null);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
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
