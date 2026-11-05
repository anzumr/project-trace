import { createClient } from '@supabase/supabase-js';

export type Identity = { userId: string; username: string; expiresAt: number };
export type VerifyIdentity = (token: string) => Promise<Identity>;
export type AccountOf = (token: string) => Promise<string>;
export type DeleteAccount = (userId: string) => Promise<void>;
const userClient = (token: string) => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Accounts are not configured on this server.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
  });
};
export const verifyIdentity: VerifyIdentity = async token => {
  const client = userClient(token);
  // The Auth service validates the bearer token; never authorize from a decoded JWT alone.
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at) throw new Error('Sign in with a confirmed email first.');
  const { data: profile, error: profileError } = await client.from('profiles').select('username_display').eq('user_id', data.user.id).single();
  if (profileError || !profile) throw new Error('Claim your username in Account before joining a room.');
  const exp: unknown = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp * 1000 <= Date.now()) throw new Error('Session expired. Sign in again.');
  return { userId: data.user.id, username: profile.username_display, expiresAt: exp * 1000 };
};
/** The account behind a token, with or without a username, so a player who never claimed one can still delete it. */
export const accountOf: AccountOf = async token => {
  const { data, error } = await userClient(token).auth.getUser(token);
  if (error || !data.user) throw new Error('Sign in again.');
  return data.user.id;
};
/** Deletes an Auth user with the server's secret key; without it deletion is unavailable. */
export function providerAccountDeleter(): DeleteAccount | undefined {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
  return async userId => { const { error } = await client.auth.admin.deleteUser(userId); if (error) throw new Error('Account deletion failed'); };
}
