import { createClient } from '@supabase/supabase-js';

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const authRedirectFailed = new URLSearchParams(location.search).has('error') || new URLSearchParams(location.hash.slice(1)).has('error');
// Missing configuration keeps offline practice and guest private rooms available.
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;
export type Profile = { user_id: string; username_display: string; created_at: string; username_changed_at: string };
export const usernameValid = (name: string) => /^[A-Za-z0-9_]{3,16}$/.test(name.trim());
