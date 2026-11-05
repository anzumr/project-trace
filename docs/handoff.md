# Handoff: krazer.io (Project Trace)

Work done with Claude Code from 31 Oct to 2 Nov 2026, on top of the Codex baseline (`6155f70`, "Prepare Project Trace for GitHub hosting integration"). Read this first, then `AGENTS.md` for day-to-day conventions.

## Where things stand

### Local continuation, 2 November 2026

The social/rematch release was deployed as `d543518`; GitHub checks and live navigation/health passed. Subsequent local work replaces the arena with the approved closed circular map, center pillar, two spawn walls and left/right stairs to raised platforms. See `docs/circular-arena.md`. This map change requires no SQL migration; deploy the client and server together.

Added human Quick Play rematches (including direct final-results controls), a Friends hub with username requests and private-duel invitations, and global/friends leaderboards with separate Quick Play/private/AI stats. See `docs/social-leaderboards.md` for flows, security and verification. **The user confirmed applying `202611020001_social_leaderboards.sql` in Supabase on 2 November 2026; all five migrations are now reported applied.** Deployment from `codex/initial-release` was authorized by the user on 2 November 2026. Confirm the Render rollout and live health after pushing. The table below describes the preceding handoff baseline.

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

### 10. Sensitivity matching from other games (3 Nov 2026)
- `ui/settings.ts`: `Settings.sensScale` (`SCALES`: krazer, cs2, valorant, overwatch, rivals, cod, fortnite) picks the units the sensitivity is shown and entered in. `sensitivity` stays the single stored value (radians per mouse count), so the engine is unchanged.
- `SCALE_INFO[scale].yaw` is degrees per count at sensitivity 1: CS2 0.022, Valorant 0.07, Overwatch 2 and Call of Duty (MW/Warzone/BO6) 0.0066, Marvel Rivals 0.0175, Fortnite 0.005555 per 1%. `toScale`/`fromScale` convert, keeping cm/360 identical at the same DPI. The sensitivity bounds (`SENS`) now go down to 0.0001 for low-sensitivity players.
- Settings → Controls: "Match sensitivity from" dropdown, then a slider and a number box in that game's units.
- Not verified: whether Chrome scales raw `movementX` by Windows display scaling. Worth a 360° check on a scaled display.

### 11. Career match history (3 Nov 2026)
- Migration `202611030001_match_history.sql` adds `match_history(p_kind, p_before, p_limit)`, a security-definer RPC that returns both participants (stats, combat totals, saved rounds) for matches the caller played, newest first, paged by completion time. RLS still limits direct reads to your own row, and opponents' account IDs are not returned. **Applied to live Supabase on 3 Nov 2026** (checked: anonymous calls get "permission denied"). Without it the screen shows "Match history is not available yet".
- `ui/CareerScreen.tsx` + `career.css`: a "Career" top-bar button (and "Full match history" on the home card). A filter and all-time totals sit on the left. Each row has your avatar and stats on the left, the result and round score in the middle, and the opponent's stats and avatar on the right. Wins are green, losses red, cancelled grey. Click a row for the full stat comparison and the per-round results.
- `ui/career.ts` parses rows defensively (tests in `career.test.ts`); `apps/server/src/history.test.ts` covers the RPC on PGlite.

### 12. Ranked mode (4 Nov 2026)
- Rules: Standard character, first to 3 rounds, 25 s stats break, no rematch, no AI. 8 tiers (Bronze, Silver, Gold, Platinum, Emerald, Diamond, Masters, Grand Masters) × divisions 4→1, 100 RP each; everyone starts at Bronze 4, 0 RP; Grand Masters 1 is uncapped. Ranked unlocks at account level 5.
- Points (`packages/shared/src/ranked.ts`, `rankStep`): Elo-style expected score on total RP (800 scale); even match ±30, clamped 5–55 before streaks; streak multipliers ×1.3 / 1.45 / 1.6 / 1.75 from the 3rd straight result; 3-game promotion shield; repeat opponent within 24 h pays ×0.5 then ×0; if the loser fired under 10% of their play time or dealt under 15 damage, the winner gets 0 (both rows flagged). Discounted or thrown games don't build streaks. Approved preview: https://claude.ai/artifact/Ryxoetoc3zBrViA9bZmoaM
- Migration `202611040001_ranked.sql`: allows kind 'ranked' and 3 rounds won, adds `player_ranks` and `rank_history` (own-row RLS), `trace_private.rank_step` (mirror of `rankStep`; `apps/server/src/ranked.test.ts` checks they agree), `apply_ranked` (called once from `record_match`), `ranked_profile` (service role), `ranked_leaderboard`, and `match_history` with the caller's rank change. **Applied to live Supabase on 4 Nov 2026.**
- Server: `rankedJoin` socket event → `ranks.ts` reads RP and XP with the secret key → `Matchmaking.joinRanked`. Range ±300 RP, +150 every 15 s, anyone after 90 s; never pairs two players from the same IP (`true-client-ip` / `cf-connecting-ip` from Cloudflare; unknown locally, so local testing is not blocked).
- Client: `RankEmblem.tsx` (all 32 emblems as SVG), `Ranked.tsx` (Play screen panel, rank-change card on final results), ranked leaderboard, Career filter and RP per match, rank on the home card.
- `202611030001_match_history.sql` was committed empty in `b6994d3` (the live function was applied from the original text); its content is restored here.

### 13. Search engine basics (4 Nov 2026)
- Before this, `/robots.txt` and `/sitemap.xml` returned 404 (the server only serves extensions in the `types` map in `http.ts`; `.txt` and `.xml` are now on it).
- `apps/client/public/robots.txt` allows everything and points to `sitemap.xml` (home, privacy, terms).
- `index.html` has a longer title and description, a canonical link to `https://krazer.io/`, Open Graph and Twitter tags for link previews (using the wordmark), and `WebSite` JSON-LD naming the site "krazer.io". JSON-LD is a data block, so the `script-src 'self'` CSP doesn't block it (checked in the production build: no console errors).
- Google Search Console isn't set up yet. That's the user's step: verify `krazer.io` and submit the sitemap.

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
  - It has 0.1 CPU. Measured on 4 Nov 2026 with `npm.cmd run test:load -- --url https://krazer.io`: smooth at 10 players (5 matches); 20 players (10 matches) stay at 60 ticks/s but snapshots sometimes arrive 200 ms apart; at 30 players the server skips ticks (0.6 s lost per 15 s) and ping p95 reaches ~250 ms.
  - The same server on a desktop handled the 100-room / 200-player cap at 60 ticks/s using ~48% of one core (~0.25% per player). Starter's 5× CPU should give roughly 100 smooth players (estimate, not measured).
  - A live load test saves one guest result per fake match when the bots leave (names `loadtest-…`); delete those rows afterwards (receipts first, then `match_results`).
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
