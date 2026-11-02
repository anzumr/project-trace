# Handoff: krazer.io (Project Trace)

Work done with Claude Code from 31 Oct to 2 Nov 2026, on top of the Codex baseline (`6155f70`, "Prepare Project Trace for GitHub hosting integration"). Read this first, then `AGENTS.md` for day-to-day conventions.

## Where things stand

| | |
|---|---|
| Repository | `anzumr/project-trace` (private), branch `codex/initial-release` |
| Latest commit | `cbbed49` Add rebindable keys and make Shift the default crouch |
| Local folder | `C:\Users\anzum\Documents\ChatGPT\Tracer` |
| Live site | https://krazer.io (Render web service `project-trace.onrender.com`, free plan) |
| DNS | Namecheap (`registrar-servers.com`): `@` A → `216.24.57.1`, `www` CNAME → `project-trace.onrender.com`, plus Resend mail records (below) |
| Database / auth | Supabase project `ujxfbwxmaxptqfbmhcmr` ("Project Trace") |
| Email | Resend, domain `krazer.io` verified, used by Supabase as custom SMTP |
| Google sign-in | Google Cloud project `krazer`, OAuth app published ("In production") |

All tests pass (`npm.cmd test`: 64), plus `npm.cmd run build`, `npm.cmd run test:production` and `npm.cmd run test:browser` (see the flakiness note under Open items).

## Changes, in order

### 1. Combat update committed (`8a4de23`)
Codex's uncommitted combat work was reviewed (typecheck and tests green) and committed as-is: combat HUD, attack-time accuracy, 2× headshots, four OGG sounds, per-round and match stats, and migration `202610310001_combat_stats.sql`. Details are in `docs/combat-update.md`. The user applied that migration in Supabase. GitHub also had a `CNAME` commit (`d2fec8c`, `krazer.io`) that was rebased under it.

### 2. Lag-compensated hit detection (`05eaaf1`)
Shots weren't registering on strafing opponents. Clients draw the opponent about 100 ms in the past (interpolation) plus network delay, but the server tested shots against the opponent's *current* position. Simulation showed only 10–40% of perfect-aim ticks registered.
- Client: `Network.remote()` records `viewTick` (the server tick of the opponent position drawn); `Engine.input()` sends it as `view`.
- Protocol: `PlayerInput.view?: number`, validated in `validateInput`.
- Server `Room`: keeps `history` of positions per tick (`MAX_REWIND_TICKS` = 0.3 s), cleared each round; `rewind()` interpolates the target at the shooter's `view` tick, clamped to the window. Inputs without `view` (AI, stale) use the current position.
- Test: `room.test.ts` "shots rewind a strafing target…".

### 3. Smaller hit marker (`e3437b0`)
`CombatHud.tsx` marker is a 24 px outlined X (`MARKER` path) with an open centre; body hits default white (`settings.hitColor` default `#ffffff`), headshots amber with a small diamond.

### 4. krazer.io redesign (`0be6d39`)
The single tabbed menu panel became dedicated screens, designed first on a canvas and approved by the user. Player models (`BotModel.ts`) were kept; arena and health-billboard colours moved to a dark grey and red palette.
- `main.tsx`: screen routing (`home | play | settings | account`), with room, queue and practice-pause states taking priority.
- New: `ui/TopBar.tsx`, `ui/HomeScreen.tsx` (main menu, `Controls`, `PauseMenu`), `ui/PlayScreen.tsx` (Quick Play character picker with the real 3D `ModePreview`, private room create/join, practice), `ui/RoomScreen.tsx` (match found, lobby, finished, in progress), `ui/icons.tsx`, `auth/useProgress.ts` (one shared progress fetch, refreshed when a result is saved).
- Rewritten: `QuickPlay.tsx` (now `QueueScreen`), `SettingsPanel.tsx` (sections), `CombatHud.tsx` (HUD, `RoundResults` with a round/match toggle, `PracticeResults`), `ModePicker.tsx`, `ProgressPanel.tsx`, `AccountPanel.tsx` (restyle), `style.css`, `combat.css`.
- Fonts are bundled with `@fontsource-variable/saira` and `@fontsource/barlow`, because the production CSP is `font-src 'self'`.
- Brand assets are in `apps/client/public/brand/`. The server now serves `.webp` (types map in `apps/server/src/net/http.ts`).
- `scripts/browser-matchmaking.ts` was updated to the new button labels.

### 5. Google sign-in and tab icon (`b064a15`)
- `AccountPanel`: "Sign in / Sign up with Google" through `supabase.auth.signInWithOAuth` (PKCE, `redirectTo: origin + '/'`). The button only renders when `googleEnabled()` (reads `/auth/v1/settings`) reports the provider is on.
- New Google users claim a username, prefilled by `suggestUsername()` from their Google name.
- Tab icon and top-bar mark: `public/brand/favicon-64.png` and `favicon-162.png`, a square crop of the logo with transparent corners.
- Setup steps were added to `docs/phase-5-setup.md`.

### 6. Sign-up error messages, Privacy and Terms (`7de30d1`)
- `authErrorMessage()` in `auth/client.ts` maps Supabase Auth error codes to clear messages. There's a "Resend confirmation email" link after sign-up or an unconfirmed sign-in.
- `public/privacy.html` and `public/terms.html` exist because Google needs a privacy policy URL to publish the OAuth app. They're linked from the main menu and the sign-up form. **These are drafts written from what the game collects. They have not had legal review.** Contact email: anzum2225@gmail.com.

### 7. Permanent usernames, random practice bot, no OFFLINE chip (`e00219f`)
- Migration `202611010001_permanent_usernames.sql`: `claim_username` only creates a profile or re-confirms the same name; renames raise `UN001`. **Applied to live Supabase** and verified. The Account screen shows a claimed name read-only.
- Practice bot (`packages/shared/src/practice.ts`): the fixed lobed route was replaced by seeded random roaming (`PracticeRandom`, `PracticeMotion`).
  - Movement: waypoints plus sideways jukes across the player's line of sight. It stays inside `PRACTICE.bounds`, outside the cover clearance and away from the player, and respawns at least `spawnDistance` from the player.
  - `practiceAgility(wave)` (0→1 by the micro-orb wave) raises turn sharpness, juke rate and leg speed.
  - Evasion: when `motion.tracking` (a smoothed hit ratio) is high, the bot sometimes dashes away from the crosshair side, with a cooldown.
  - `new Practice({ seed, still })`: `still` freezes movement for tests. `practicePosition`/`phase` no longer exist.
- `TopBar`: the status chip only shows in a room or queue.

### 8. Crouching (`60886e8`)
- Shared `move()`: `Body.crouch` (0–1) eases at `CONFIG.crouchRate`. Height and eye line scale by `stance()` (down to `CONFIG.crouchHeight` = 0.6); speed scales to `CONFIG.crouchSpeed` = 0.5; standing waits for headroom. Helpers: `stance()`, `eyeHeight()`.
- Protocol: `Input.crouch?: boolean`, validated.
- Server: crouch-aware shooter eye line and target hitbox. The rewind history stores crouch too. The AI's sight uses crouched heights.
- Client: the camera uses `eyeHeight`, and the opponent model and health bar render at crouched height.
- Ctrl+W (close tab) can't be blocked normally:
  - The game's fullscreen button calls `navigator.keyboard.lock()` on the bound keys (Chromium only).
  - `Engine.beforeUnload` asks "Leave site?" during practice or a live match.

### 9. Keybinds, Shift crouch default (`cbbed49`)
- `ui/settings.ts`: `Settings.keys` (`ACTIONS`: forward, back, left, right, jump, crouch) default WASD, Space, **Shift**.
  - Helpers: `normalizeKey` (merges left/right modifiers), `reservedKey` (Escape, Meta, ContextMenu, PrintScreen, F-keys), `keyLabel`, `rebind` (swaps on clash), `lockCodes`.
  - Saves are validated; duplicates fall back to defaults.
- Settings → "Controls & keybinds": click a key, press the new one, Escape cancels. Unrecognised codes and reserved keys are refused. A warning shows if Ctrl is bound.
- The engine, the fullscreen keyboard lock and the `Controls` hints all read `settings.keys`.

## External setup done (outside the repo)

- **Supabase**
  - Migrations applied: accounts, match_results, combat_stats, permanent_usernames.
  - URL configuration: Site URL `https://krazer.io`; redirects `https://krazer.io/` and `http://localhost:5173/`.
  - Google provider enabled. Client ID `384358219730-0g1slv67if3donj32le0mb9gebrpt8pf.apps.googleusercontent.com`; the secret is only in Supabase.
  - Custom SMTP: `smtp.resend.com:465`, user `resend`, password is a Resend API key named `supabase-smtp`; sender `no-reply@krazer.io` / "krazer.io". Email rate limit raised to 30/hour automatically.
  - There's a leftover "Untitled query" snippet in the SQL editor that is safe to delete.
- **Google Cloud** project `krazer`
  - Consent screen: External; app name krazer.io; home, privacy and terms URLs on krazer.io; authorized domains `krazer.io` and `ujxfbwxmaxptqfbmhcmr.supabase.co`.
  - Web client "krazer web": JS origins `https://krazer.io` and `http://localhost:5173`; redirect `https://ujxfbwxmaxptqfbmhcmr.supabase.co/auth/v1/callback`.
  - Published.
- **Resend:** domain krazer.io (us-east-1) verified.
- **Namecheap DNS records added:** TXT `resend._domainkey` (DKIM), CNAME `rsend` → `rsend.forge.rmta.net`, CNAME `send` → `send.forge.rmta.net`, TXT `_dmarc` = `v=DMARC1; p=none;`. The existing Render records and the email-forwarding SPF were untouched.
- **Render:** deploys from this branch. Whether Auto-Deploy is on is the user's setting, so confirm a deploy after each push.

## Open items and known limits

- **Not hand-tested in pointer-locked play:** crouching, rebound keys and the new practice bot difficulty and dodging. Automated tests cover the logic; feel and tuning (crouch 60%, half speed, dodge rate) need a human.
- **End-to-end Google sign-in and email sign-up** on krazer.io weren't completed by Claude (that would create real accounts). The Google flow was verified up to Google's account chooser.
- **`npm.cmd run test:browser` is occasionally flaky:** 2 failures in about 8 runs, at different steps unrelated to recent changes (a timeout once, and "expected 2 kill audio events, got 1" once). The practice bot is seeded inside that script for repeatability. Worth investigating.
- **Google's consent screen shows the Supabase domain.** Showing krazer.io needs Supabase's paid custom domain.
- **Render free plan limits:**
  - It sleeps after about 15 minutes (the "waking up" page).
  - It has 0.1 CPU, which limits concurrent matches (a rough guess of 5–15).
  - The local result outbox is lost on restart.
  - Starter (about $7/month) fixes sleep and gives 5× the CPU. An Oracle free VM was discussed as an alternative.
- **Usernames are permanent.** Any rename now requires a database owner editing `public.profiles` by hand.
- `docs/performance*.json` and the older phase docs weren't refreshed for these features. The client main chunk still triggers Vite's >500 kB warning.
- `.claude/launch.json` is an untracked local preview config used by Claude Code. Ignore or delete it.

## Verify after pulling

```powershell
cd C:\Users\anzum\Documents\ChatGPT\Tracer
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:production
npm.cmd run dev
```
