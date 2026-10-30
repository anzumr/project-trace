import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile } from './client';

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const generation = useRef(0);
  const reload = async (next: Session | null) => {
    const version = ++generation.current;
    setSession(next); setProfile(null); setError(''); setLoading(!!next);
    if (!next || !supabase) { setLoading(false); return; }
    const { data, error: failure } = await supabase.from('profiles').select('user_id,username_display,created_at,username_changed_at').eq('user_id', next.user.id).maybeSingle();
    if (version !== generation.current) return;
    setProfile(data); setLoading(false);
    if (failure) setError('Your profile could not load. Check the connection and database setup, then retry.');
  };
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      // Keep database calls outside Supabase's authentication callback lock.
      setTimeout(() => { if (active) void reload(next); }, 0);
    });
    return () => { active = false; generation.current++; data.subscription.unsubscribe(); };
  }, []);
  return { session, profile, loading, error, recovery, setRecovery, reload: () => reload(session) };
}
