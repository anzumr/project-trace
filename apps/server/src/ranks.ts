import { createClient } from '@supabase/supabase-js';
import { levelProgress } from '@trace/shared';

export type RankLookup = (userId: string) => Promise<{ points: number; level: number }>;
/** Reads rank points and XP with the server's secret key; without it ranked is unavailable. */
export function providerRankLookup(): RankLookup | undefined {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) } });
  return async userId => {
    const { data, error } = await client.rpc('ranked_profile', { p_user: userId });
    if (error || !data) throw new Error('Rank service unavailable');
    return { points: Math.max(0, Math.floor(Number(data.points) || 0)), level: levelProgress(Number(data.xp) || 0).level };
  };
}
/**
 * The player's address as Cloudflare (in front of Render) reports it. X-Forwarded-For is client-controlled there, so it is ignored;
 * without the edge header (local play) the network is unknown and never blocks a pairing.
 */
export function clientNetwork(headers: Record<string, string | string[] | undefined>): string | null {
  const value = headers['true-client-ip'] ?? headers['cf-connecting-ip'], ip = (Array.isArray(value) ? value[0] : value)?.trim();
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}
