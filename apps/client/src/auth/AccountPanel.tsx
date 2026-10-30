import { ProgressPanel } from './ProgressPanel';
import { useState, type FormEvent } from 'react';
import { supabase, usernameValid, authRedirectFailed } from './client';
import type { useAccount } from './useAccount';

export function AccountPanel({ account, inRoom }: { account: ReturnType<typeof useAccount>; inRoom: boolean }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const { session, profile, recovery } = account;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!supabase || busy || inRoom) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error('Password update failed. Use a fresh recovery link and a password of at least 12 characters.');
        account.setRecovery(false); setPassword(''); setMessage('Password updated.');
      } else if (session) {
        const desired = username ?? profile?.username_display ?? String(session.user.user_metadata.desired_username || '');
        if (!usernameValid(desired)) throw new Error('Use 3–16 ASCII letters, numbers or underscores.');
        const { error } = await supabase.rpc('claim_username', { p_username: desired.trim() });
        if (error) throw new Error(error.code === '23505' ? 'That username has been claimed. Choose another.' : error.code === '22023' ? 'That name is invalid or reserved. Choose another.' : error.code === 'P0001' ? 'Username changes are on cooldown (30 days by default).' : 'Could not save your username. Confirm your email and check your connection.');
        await account.reload(); setMessage('Username saved.');
      } else if (mode === 'register') {
        if (!usernameValid(username ?? '')) throw new Error('Use 3–16 ASCII letters, numbers or underscores.');
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { desired_username: username!.trim() }, emailRedirectTo: location.origin + '/' } });
        if (error) throw new Error('Registration could not complete. Check the password requirements, connection, or try again later.');
        setPassword(''); setMessage('Check your email for confirmation if required. Then sign in and claim your username. Names are reserved only when claimed.');
      } else if (mode === 'reset') {
        // Always use the same response, including provider errors, to avoid account enumeration.
        await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/' });
        setMessage('If an eligible account exists, a recovery email will arrive. Open it in this browser. If none arrives, check spam or retry later.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error('Sign-in failed. Check your credentials, confirm your email, or try again later.');
        setPassword('');
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!supabase) return <div className="account"><h2>Your player account</h2><p>Account setup is not configured on this installation yet.</p><p className="note">Practice and guest private rooms are available. See docs/phase-5-setup.md to connect Supabase.</p></div>;
  return <div className="account" aria-busy={busy || account.loading}>
    {authRedirectFailed && <p role="alert" className="error">This account link is invalid or expired. Request a new recovery email, or sign in after confirming your email. Open recovery links in the browser that requested them.</p>}
    <div className="brief"><span className="number">ID</span><div><strong>{profile?.username_display || 'Your player account'}</strong><small>{profile ? `Member since ${new Date(profile.created_at).toLocaleDateString()}` : 'One identity across your computers'}</small></div></div>
    {inRoom && <p className="note">Leave your room before changing your account.</p>}
    {account.loading ? <p role="status">Loading account…</p> : <>
    {account.error && <><p role="alert" className="error">{account.error}</p><button className="reset" onClick={() => void account.reload()}>Retry profile</button></>}
    {profile && <ProgressPanel userId={profile.user_id}/>}
    <form onSubmit={e => void submit(e)}>
      <fieldset disabled={busy || inRoom}>
      {recovery ? <><h2>Choose a new password</h2><label>New password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)}/></label></> : session ? <>
        <h2>{profile ? 'Account settings' : 'Claim your username'}</h2>
        <p className="note">{profile ? 'Your account identity stays the same when your name changes. Renames have a 30-day cooldown by default.' : 'Confirm your email first. If your desired name is taken, choose a different one here.'}</p>
        <label>Username<input autoComplete="username" maxLength={16} required value={username ?? profile?.username_display ?? String(session.user.user_metadata.desired_username || '')} onChange={e => setUsername(e.target.value)} pattern="[A-Za-z0-9_]{3,16}"/></label>
        <p className="note">3–16 letters, numbers or underscores. Case-insensitive uniqueness; reserved names are unavailable.</p>
      </> : <>
        <div className="account-tabs">{(['login', 'register', 'reset'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setMessage(''); setError(''); }}>{value === 'login' ? 'Sign in' : value === 'register' ? 'Register' : 'Reset password'}</button>)}</div>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
        {mode !== 'reset' && <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : 1} required value={password} onChange={e => setPassword(e.target.value)}/></label>}
        {mode === 'register' && <><label>Desired username<input autoComplete="username" required maxLength={16} pattern="[A-Za-z0-9_]{3,16}" value={username ?? ''} onChange={e => setUsername(e.target.value)}/></label><p className="note">Use at least 12 characters for your password. Email confirmation comes before your final username claim.</p></>}
      </>}
      <button className="primary" disabled={!!account.error}>{busy ? 'Please wait…' : recovery ? 'Update password' : session ? 'Save username' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send recovery email' : 'Sign in'}</button>
      </fieldset>
    </form>
    {session && <button className="reset" disabled={busy || inRoom} onClick={() => { setBusy(true); void supabase!.auth.signOut({ scope: 'local' }).then(({ error }) => { setBusy(false); if (error) setError('Sign-out failed. Check your connection and retry.'); }); }}>Sign out of this browser</button>}
    {profile && <p className="note">Input and graphics settings remain saved on this browser.</p>}
    {!session && <p className="note">You can also play private rooms as a guest. Guest matches do not earn persistent progress.</p>}
    </>}
    {message && <p role="status" className="account-message">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </div>;
}
