# Phase 5A — connect your accounts

Status: authentication implementation ready pending environment integration. No Supabase project has been created or deployed by this change. Email delivery, browser recovery and two-device authentication have NOT been end-to-end verified. Phase 5B progression/settings/history and 5C public matchmaking are not implemented yet.

## 1. Create and configure Supabase

1. Create a Supabase project in your own account. Keep its database password private.
2. In the project's SQL Editor, run `supabase/migrations/202610270001_accounts.sql` **once**, as the owner. It creates `public.profiles`, owner-only SELECT RLS, a private policy/reserved-name schema, and the atomic `claim_username` RPC. This migration intentionally fails on a second application; use migration history if managing it through the Supabase CLI.
3. Enable the Email authentication provider and **Confirm email**. Set minimum password length to **12** in the provider's password security settings. The UI's check is only convenience; the Auth service must enforce this independently. Configure appropriate signup/reset rate limits and SMTP before inviting players. Default email delivery restrictions may require authorized recipient addresses while testing; use your own SMTP provider for normal users. Review CAPTCHA and abuse controls before a public launch.
4. Under Authentication → URL Configuration, set Site URL to `http://localhost:5173` for development. Add exact redirect URLs `http://localhost:5173/` and, if used, `http://localhost:3001/`. Add the exact LAN testing origin or HTTPS deployment origin when applicable. Avoid wildcard production redirects. Keep game `ALLOWED_ORIGINS` consistent with the actual browser origin.
5. Optional — **Sign in with Google.** In Google Cloud Console, configure the OAuth consent screen, then create an OAuth client ID of type *Web application*. Add your Supabase callback, `https://<project-ref>.supabase.co/auth/v1/callback`, as an authorized redirect URI (Supabase shows the exact value on its Google provider page). In Supabase, open Authentication → Sign In / Providers → Google, enable it and paste the client ID and client secret. The client secret belongs only in Supabase: never in `.env` files, the client build or chat. The game returns players to `<origin>/`, so the redirect URLs from step 4 also cover Google. Google accounts arrive with a verified email; on first sign-in the player claims a username exactly as email players do (the Account screen suggests one from their Google name).
6. Copy the project URL and **publishable key** (or legacy **anon** key) from the project's API configuration into the two local files below. These are public application configuration. **Do not use a secret or service-role key in either file for 5A. Do not paste credentials into chat.** Server Auth verification and owner-profile reads use each player's bearer token and RLS, so 5A does not require an elevated key.

## 2. Configure Windows PowerShell

Use Node 24 LTS and run from the repository root:

```powershell
cd C:\Users\anzum\Documents\ChatGPT\Tracer
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path apps\client\.env.local)) { Copy-Item apps\client\.env.example apps\client\.env.local }
notepad .env
notepad apps\client\.env.local
```

Replace placeholders in root `.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
LOG_HP=0
```

Replace placeholders in `apps/client/.env.local` with the **same project's** values:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

The server entry points load root `.env`. Vite loads `apps/client/.env.local`. Existing process environment variables take precedence. `.env*` files are ignored except examples. No actual credentials are committed. Never add a `VITE_` variable containing a server secret.

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Open `http://localhost:5173`, then Account. Restart the dev process after changing environment files. Use `npm.cmd` to avoid PowerShell's disabled-script restriction.

For a local production check, set `ALLOWED_ORIGINS` in root `.env` to `http://localhost:3001,http://127.0.0.1:3001`, then:

```powershell
npm.cmd run build
npm.cmd start
```

Open `http://localhost:3001`. Vite's public config is embedded at build time: rebuild after changing it. The production CSP permits the configured HTTPS Supabase origin in addition to same-origin game traffic. Deployed games require HTTPS/WSS and exact origin/redirect settings. No deployment is performed by these instructions.

With both provider config variables absent, practice and private guest rooms still work; Account explains setup is pending. Invalid or mismatched configuration produces an error, never a pretend signed-in account.

## 3. Account behavior and security boundaries

- Register with email, password and desired username. Confirm the email; then sign in and explicitly claim the username. Signup metadata is only an untrusted suggestion, never a game identity. Another player may claim the name before confirmation; choose another without recreating your account.
- A PostgreSQL unique constraint enforces normalized username uniqueness. The RPC checks confirmed email, 3–16 ASCII letters/digits/underscore, reserved names and cooldown. Same-name resubmission is idempotent; changing capitalization counts as a rename. Leading/trailing spaces are trimmed by the RPC.
- Usernames display in navigation, lobby, score HUD and results. Guests have a visible Guest label in the lobby; an identical guest display name cannot acquire an authenticated UUID. Public game snapshots omit UUID, email and bearer tokens. UUID identity is stored privately on server participants.
- Passwords go directly to Supabase's supported Auth API; the game server never stores them. The SDK restores sessions and refreshes tokens. PKCE recovery links must be opened in the **same browser/origin that requested recovery**. Complete account changes before joining a room. Signing into an existing account on another computer is supported by the provider; it requires real environment testing.
- Each authenticated socket handshake calls Supabase `getUser(token)` and reads that user's profile under RLS. Invalid/unconfigured/expired credentials fail closed. Refresh verifies the same UUID; identity switching or expiry disconnects and follows existing forfeit rules. Starting another room revalidates the profile, including a rename. A single account cannot occupy both slots in one room.
- Handshake auth checks have bounded concurrency and per-network-address limits; socket controls use existing rate limits. Behind a proxy, addresses may be shared, so tune limits/proxy deployment deliberately. Provider email/signup/reset rate limits are configured in Supabase, not invented in the client.
- Sign out affects this browser. Supabase access tokens already issued may remain valid until their expiry: this implementation does not promise instantaneous global revocation on other devices. Session expiry disconnects game sockets. No background profile polling or database queries occur in simulation ticks.
- Guest matches have no persistent rewards. No client or server reward/statistics tables or award endpoints exist in 5A. Persistence and idempotent server-only awards remain 5B.

Owner-only policy changes in SQL Editor (never expose these via a player endpoint):

```sql
update trace_private.account_policy set username_cooldown = interval '30 days' where singleton;
insert into trace_private.reserved_usernames(name) values ('your_reserved_name');
```

The seed list reserves administrative/official names. Extend it with your prohibited-name policy before public launch; this is not a complete moderation service. The private schema must not be exposed through the Data API.

## 4. Verification and two-account checklist

Automated checks run real embedded PostgreSQL against the migration with a fixture for Supabase's `auth.users`/`auth.uid()`. They verify RLS/grants, unverified denial, case-insensitive uniqueness, invalid/reserved names, cooldown, idempotent resubmission and delete cascade. PGlite serializes submitted statements: its competing promises verify the unique constraint, **not multi-connection transaction scheduling**. Socket tests use an injected verifier to test protocol identity, guest compatibility, duplicate-account rejection, refresh and expiry; they do not establish live provider integration.

Use two real email accounts A and B, separate browser profiles, and then a second computer:

1. Register A; confirm email in its original browser; claim `TracePlayer`. Reload and verify session restoration, username and member date. Sign out, test a wrong password, and sign back in.
2. Register/confirm B. Attempt `traceplayer`; confirm rejection and then claim a different name. Also race both accounts for a new shared name in separate browsers with eligible cooldowns: exactly one must succeed.
3. Reset A's password. Open the recovery link in the requesting browser; set a 12+ character password; verify old password fails and new password succeeds. Test an expired link and recovery for an unknown email: no account existence should be disclosed.
4. Attempt immediate rename; confirm cooldown. For a test account only, the owner may backdate `username_changed_at` by 31 days in SQL Editor, then verify successful rename and unchanged UUID.
5. Sign A in on a second computer: username/member date must match. **Settings, XP, stats and history are intentionally not synchronized yet.** They are 5B acceptance tests, not 5A claims.
6. Create a private room as A; join as B. Verify both names, all four modes, ready/countdown, WASD/jump/mouse lock, held Mouse 1, head damage, round/results/rematch. Verify a guest can still join a private room. Repeat in production build.
7. Use a short token lifetime on a test project to observe refresh. Block provider connectivity, let the token expire, and ensure the game disconnects. Try forged credentials and a second connection for the same account in one room; reject them. Account changes in another tab should close that browser's existing room safely.
8. With each user's bearer token and public project key, query `profiles`: only their row should be visible. Direct insert/update/delete and private-schema reads must fail. Do not use the SQL Editor's privileged owner role for this test. Confirm migration policies in Supabase's database advisor.
9. Check settings' acceleration note, fullscreen/FPS, local crosshair persistence, and offline practice. Performance remains hardware/browser dependent; no new FPS measurement is claimed.

## 5. Privacy, support and remaining milestones

Before public launch the operator must publish a privacy statement and a real account-support contact in the product. Current development data is email/authentication metadata in Supabase Auth plus UUID, username and timestamps in profiles; guest matches/settings stay transient/local. Do not publish this as a finished privacy policy.

For development account deletion: contact the project owner through your established support channel. The owner verifies the request and deletes the user in Supabase Authentication → Users. The profile cascades via its FK. No persistent match history exists yet. Storage retention, backups, future history anonymization and a user-facing deletion route are Phase 5D launch work; never ask for the user's password.

5B must add durable match UUIDs, transactional/idempotent server-only finalization, real visible-opportunity counters, settings import/sync and private history. 5C then adds a compatible mode/region queue using ordinary authoritative rooms. 5D completes abuse/recovery/privacy/deployment checks and real two-device testing. Phase 6 hooks are stable account UUIDs and future versioned match results; no ranked/MMR system is added here.

Provider references: [Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [server user verification](https://supabase.com/docs/reference/javascript/auth-getuser), [password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
