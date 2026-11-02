import { createClient } from '@supabase/supabase-js';

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const authRedirectFailed = new URLSearchParams(location.search).has('error') || new URLSearchParams(location.hash.slice(1)).has('error');
// Missing configuration keeps offline practice and guest private rooms available.
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;
/** Asks the Auth service whether Google sign-in is enabled, so the button only appears once it works. */
export async function googleEnabled() {
  if (!url || !key) return false;
  try { const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } }); return response.ok && (await response.json())?.external?.google === true; } catch { return false; }
}
/** Player-facing text for Supabase Auth failures. Unknown codes are shown so setup problems stay diagnosable. */
export function authErrorMessage(error: { code?: string; status?: number; message: string }, action: 'sign-up' | 'sign-in' | 'resend') {
  switch (error.code) {
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Too many emails or attempts in a short time. Wait a few minutes, then try again.';
    case 'email_address_not_authorized': return 'This site can’t send email to that address yet, so the sign-up can’t be confirmed. Try again later, or use Google if it’s available.';
    case 'weak_password': return 'Choose a stronger password: at least 12 characters.';
    case 'email_address_invalid': case 'validation_failed': return 'Enter a valid email address.';
    case 'signup_disabled': case 'email_provider_disabled': return 'Email sign-up is turned off right now.';
    case 'user_already_exists': case 'email_exists': return 'An account with this email already exists. Sign in instead.';
    case 'email_not_confirmed': return 'Confirm your email first. Check your inbox and spam folder, or resend the confirmation email.';
    case 'invalid_credentials': return 'Email or password is incorrect.';
  }
  if (error.status === 429) return 'Too many emails or attempts in a short time. Wait a few minutes, then try again.';
  if (/sending .*email/i.test(error.message)) return 'The confirmation email could not be sent, so the sign-up did not finish. Try again later.';
  const base = action === 'sign-up' ? 'Registration could not complete' : action === 'sign-in' ? 'Sign-in failed' : 'The email could not be sent';
  return `${base}. Check your connection and try again.${error.code ? ` (${error.code})` : ''}`;
}
export type Profile = { user_id: string; username_display: string; created_at: string; username_changed_at: string };
export const usernameValid = (name: string) => /^[A-Za-z0-9_]{3,16}$/.test(name.trim());
/** Turns a provider display name (for example a Google name) into a claimable username suggestion. */
export const suggestUsername = (name: unknown) => { const s = String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+/, '').slice(0, 16).replace(/_+$/, ''); return s.length >= 3 ? s : ''; };
