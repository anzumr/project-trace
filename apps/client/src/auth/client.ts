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
export type Profile = { user_id: string; username_display: string; created_at: string; username_changed_at: string };
export const usernameValid = (name: string) => /^[A-Za-z0-9_]{3,16}$/.test(name.trim());
/** Turns a provider display name (for example a Google name) into a claimable username suggestion. */
export const suggestUsername = (name: unknown) => { const s = String(name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+/, '').slice(0, 16).replace(/_+$/, ''); return s.length >= 3 ? s : ''; };
