import supabase from './supabase';

/**
 * Sign in with Google using Supabase's built-in OAuth flow.
 * This replaces the previous DesignArena proxy-based approach
 * which routed auth through designarena.ai and leaked credentials.
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) {
    console.error('[google-auth] signInWithOAuth failed:', error.message);
  }
  return { data, error };
}

export async function handleGoogleRedirect() {
  // Supabase handles the OAuth redirect automatically via onAuthStateChange
  // in AuthContext. No manual token extraction needed.
}
