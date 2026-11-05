import { ProgressPanel } from './ProgressPanel';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase, usernameValid, authRedirectFailed, suggestUsername, googleEnabled, authErrorMessage } from './client';
import { deleteAccount } from './deleteAccount';
import type { useAccount } from './useAccount';
import type { Progress } from './useProgress';

/** Google's standard multi-colour "G" mark for the sign-in button. */
const GoogleMark = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;

export function AccountPanel({ account, inRoom, progress }: { account: ReturnType<typeof useAccount>; inRoom: boolean; progress: Progress }) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const { session, profile, recovery } = account;
  const [googleOn, setGoogleOn] = useState(false), [resendFor, setResendFor] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null), confirmWord = profile?.username_display ?? 'DELETE';
  useEffect(() => { let alive = true; void googleEnabled().then(on => { if (alive) setGoogleOn(on); }); return () => { alive = false; }; }, []);
  const meta = session?.user.user_metadata, googleUser = session?.user.app_metadata.provider === 'google';
  const suggested = String(meta?.desired_username || suggestUsername(meta?.full_name ?? meta?.name));
  const withGoogle = async () => {
    if (!supabase || busy || inRoom) return;
    setBusy(true); setError(''); setMessage('');
    // Success leaves the page for Google; only a failure to start returns here.
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } });
    if (error) { setError('Google sign-in could not start. Try again, or use email.'); setBusy(false); }
  };
  const resend = async () => {
    if (!supabase || busy) return;
    setBusy(true); setError(''); setMessage('');
    const { error } = await supabase.auth.resend({ type: 'signup', email: resendFor, options: { emailRedirectTo: location.origin + '/' } });
    if (error) setError(authErrorMessage(error, 'resend')); else setMessage(`Confirmation email sent to ${resendFor}. Check spam if it doesn’t arrive.`);
    setBusy(false);
  };
  const remove = async (e: FormEvent) => {
    e.preventDefault(); if (!supabase || busy || inRoom || confirm?.trim().toLowerCase() !== confirmWord.toLowerCase()) return;
    setBusy(true); setError(''); setMessage('');
    // getSession refreshes an expired access token, so the server sees a live one.
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const result = token ? await deleteAccount(token) : { ok: false, error: 'Your session expired. Sign in again, then retry.' };
    if (result.ok) { await supabase.auth.signOut({ scope: 'local' }); setConfirm(null); setMessage('Your account and its data were deleted.'); }
    else setError(result.error || 'Your account could not be deleted. Try again shortly.');
    setBusy(false);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!supabase || busy || inRoom) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error('Password update failed. Use a fresh recovery link and a password of at least 12 characters.');
        account.setRecovery(false); setPassword(''); setMessage('Password updated.');
      } else if (session && !profile) {
        const desired = username ?? suggested;
        if (!usernameValid(desired)) throw new Error('Use 3–16 ASCII letters, numbers or underscores.');
        const { error } = await supabase.rpc('claim_username', { p_username: desired.trim() });
        if (error) throw new Error(error.code === '23505' ? 'That username has been claimed. Choose another.' : error.code === '22023' ? 'That name is invalid or reserved. Choose another.' : error.code === 'UN001' ? 'Usernames are permanent and cannot be changed.' : 'Could not save your username. Confirm your email and check your connection.');
        await account.reload(); setMessage('Username saved.');
      } else if (mode === 'register') {
        if (!usernameValid(username ?? '')) throw new Error('Use 3–16 ASCII letters, numbers or underscores.');
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { desired_username: username!.trim() }, emailRedirectTo: location.origin + '/' } });
        if (error) throw new Error(authErrorMessage(error, 'sign-up'));
        setPassword(''); setResendFor(email.trim()); setMessage('Check your email and open the confirmation link, then sign in and claim your username. Names are reserved only when claimed.');
      } else if (mode === 'reset') {
        // Always use the same response, including provider errors, to avoid account enumeration.
        await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/' });
        setMessage('If an eligible account exists, a recovery email will arrive. Open it in this browser. If none arrives, check spam or retry later.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { if (error.code === 'email_not_confirmed') setResendFor(email.trim()); throw new Error(authErrorMessage(error, 'sign-in')); }
        setPassword('');
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!supabase) return <div className="account-layout"><div className="card account"><h2>Your player account</h2><p>Account setup is not configured on this installation yet.</p><p className="note">Practice and guest private rooms are available. See docs/phase-5-setup.md to connect Supabase.</p></div></div>;
  return <div className="account-layout"><div className="card account" aria-busy={busy || account.loading}>
    {authRedirectFailed && <p role="alert" className="error">That sign-in did not complete, or the account link is invalid or expired. Try Google again, request a new recovery email, or sign in after confirming your email. Open email links in the browser that requested them.</p>}
    <div className="account-id"><span className="avatar">{(profile?.username_display || '?')[0]}</span><div><strong>{profile?.username_display || 'Your player account'}</strong><small>{profile ? `Member since ${new Date(profile.created_at).toLocaleDateString()}` : 'One identity across your computers'}</small></div></div>
    {inRoom && <p className="note">Leave your room before changing your account.</p>}
    {account.loading ? <p role="status">Loading account…</p> : <>
    {account.error && <><p role="alert" className="error">{account.error}</p><button className="link-button" onClick={() => void account.reload()}>Retry profile</button></>}
    {profile && !recovery ? <><h2>Your username</h2><p className="note">Usernames are permanent: <strong>{profile.username_display}</strong> is yours for good.</p></> : <form onSubmit={e => void submit(e)}>
      <fieldset disabled={busy || inRoom}>
      {recovery ? <><h2>Choose a new password</h2><label>New password<input className="text-input" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)}/></label></> : session ? <>
        <h2>Claim your username</h2>
        <p className="note">{googleUser ? 'Signed in with Google. Choose the name other players will see.' : 'Confirm your email first. If your desired name is taken, choose a different one here.'} <strong>Usernames are permanent and can’t be changed later.</strong></p>
        <label>Username<input className="text-input" autoComplete="username" maxLength={16} required value={username ?? suggested} onChange={e => setUsername(e.target.value)} pattern="[A-Za-z0-9_]{3,16}"/></label>
        <p className="note">3–16 letters, numbers or underscores. Case-insensitive uniqueness; reserved names are unavailable.</p>
      </> : <>
        <div className="account-tabs">{(['login', 'register', 'reset'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setMessage(''); setError(''); setResendFor(''); }}>{value === 'login' ? 'Sign in' : value === 'register' ? 'Register' : 'Reset password'}</button>)}</div>
        {googleOn && mode !== 'reset' && <><button type="button" className="btn-google" onClick={() => void withGoogle()}><GoogleMark/>{mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'}</button><div className="divider">OR WITH EMAIL</div></>}
        <label>Email<input className="text-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
        {mode !== 'reset' && <label>Password<input className="text-input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : 1} required value={password} onChange={e => setPassword(e.target.value)}/></label>}
        {mode === 'register' && <><label>Desired username<input className="text-input" autoComplete="username" required maxLength={16} pattern="[A-Za-z0-9_]{3,16}" value={username ?? ''} onChange={e => setUsername(e.target.value)}/></label><p className="note">Use at least 12 characters for your password. Email confirmation comes before your final username claim. Usernames are permanent.</p></>}
      </>}
      <button className="btn-primary" disabled={!!account.error}><strong>{busy ? 'PLEASE WAIT…' : recovery ? 'UPDATE PASSWORD' : session ? 'SAVE USERNAME' : mode === 'register' ? 'CREATE ACCOUNT' : mode === 'reset' ? 'SEND RECOVERY EMAIL' : 'SIGN IN'}</strong></button>
      </fieldset>
    </form>}
    {session && <button className="link-button" style={{ marginTop: 12 }} disabled={busy || inRoom} onClick={() => { setBusy(true); void supabase!.auth.signOut({ scope: 'local' }).then(({ error }) => { setBusy(false); if (error) setError('Sign-out failed. Check your connection and retry.'); }); }}>Sign out of this browser</button>}
    {profile && <p className="note">Input and graphics settings remain saved on this browser.</p>}
    {session && !recovery && (confirm === null ? <button className="link-button danger-link" disabled={busy || inRoom} onClick={() => { setConfirm(''); setMessage(''); setError(''); }}>Delete account</button>
      : <form className="delete-account" onSubmit={e => void remove(e)}><fieldset disabled={busy || inRoom}>
        <h2>Delete your account</h2>
        <p className="note">This permanently deletes your account, username, XP, rank, stats and friends. It can’t be undone. Your username becomes free for anyone to claim, and opponents’ match history will show you as “Deleted player”.</p>
        <label>Type <strong>{confirmWord}</strong> to confirm<input className="text-input" autoComplete="off" spellCheck={false} value={confirm} onChange={e => setConfirm(e.target.value)}/></label>
        <div className="delete-actions"><button className="btn-danger" disabled={confirm.trim().toLowerCase() !== confirmWord.toLowerCase()}>{busy ? 'DELETING…' : 'DELETE ACCOUNT'}</button><button type="button" className="link-button" onClick={() => setConfirm(null)}>Cancel</button></div>
      </fieldset></form>)}
    {!session && <p className="note">You can also play private rooms as a guest. Guest matches do not earn persistent progress.</p>}
    {!session && <p className="note">By creating an account you agree to the <a href="/terms.html">Terms of Service</a> and <a href="/privacy.html">Privacy Policy</a>.</p>}
    </>}
    {message && <p role="status" className="account-message">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
    {resendFor && !session && <button className="link-button" disabled={busy} onClick={() => void resend()}>Resend confirmation email</button>}
  </div>{profile && <ProgressPanel progress={progress}/>}</div>;
}
