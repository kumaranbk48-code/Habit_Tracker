import supabase from './db-client.js';

/**
 * Validate a Supabase access token through Supabase Auth.
 *
 * Decoding a JWT is not authentication: its claims are untrusted until
 * Supabase successfully validates the token signature, issuer, audience, and
 * token lifetime. Do not add a local payload fallback here.
 */
export async function verifyUserToken(token) {
  if (!token || typeof token !== 'string') {
    return { user: null, error: 'No token provided' };
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return {
        user: null,
        error: error?.message || 'Invalid or expired token',
      };
    }

    return { user: data.user, error: null };
  } catch (err) {
    // Do not expose tokens, claims, or secret configuration in logs.
    return {
      user: null,
      error: err?.message || 'Authentication error',
    };
  }
}
