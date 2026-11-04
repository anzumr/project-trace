# AGENTS.md

krazer.io (repo name Project Trace): a first-person 1v1 mouse-tracking duel game. React + Vite + Three.js client, authoritative Node + Socket.IO server, Supabase for accounts and saved results. Live at https://krazer.io (Render). **Read `docs/handoff.md` for the full history of recent changes, external services and open items.**

## Layout

- `packages/shared/src`: code both sides run. Physics `move()`, crouch helpers `stance`/`eyeHeight` and `CONFIG` in `index.ts`; character `modes.ts`; network `protocol.ts` (`validateInput`); `practice.ts` (practice bot, hitboxes); `combat.ts` (stats); `ranked.ts` (tiers, rank points, queue ranges; mirrored in SQL by `trace_private.rank_step`).
- `apps/server/src`: `game/Room.ts` (authoritative tick, hit tests, lag-compensation `rewind`), `game/ExtraHardAI.ts`, `server.ts`, `net/http.ts` (static serving, CSP, file-type allow list), results/outbox, Supabase auth.
- `apps/client/src`:
  - `main.tsx`: screen routing.
  - `game/Engine.ts`: render loop, input, prediction.
  - `net/Network.ts`.
  - `ui/`: `TopBar`, `HomeScreen`, `PlayScreen`, `RoomScreen`, `QuickPlay` (queue), `SettingsPanel`, `CombatHud`, `CareerScreen` (match history), `settings.ts` including keybinds and game sensitivity matching.
  - `auth/`: `AccountPanel`, `ProgressPanel`, `useProgress`, `client.ts`.
- `supabase/migrations`: SQL, applied **by hand, once, in order** in the Supabase SQL editor. All seven are applied to the live project.
- `scripts/`: `dev.mjs`, the production smoke test and the two-browser acceptance test (`browser-matchmaking.ts`).

## Commands (Windows: use `npm.cmd` in PowerShell)

- `npm.cmd run dev`: server on 3001 + Vite on 5173. Restart after server or shared changes.
- `npm.cmd run typecheck`, `npm.cmd test`: run both before every commit.
- `npm.cmd run build`, then `npm.cmd run test:production`: production build and smoke test.
- `npm.cmd run test:browser`: two-Chrome end-to-end run. Slow, occasionally flaky; see the handoff.

## Conventions

- Match the existing compact style: short names, terse JSX, few comments. A comment explains *why*, not what.
- The server is authoritative. Movement, hits, damage and results are decided in `Room`, using shared code. Any new input field must be added to `PlayerInput`, validated in `validateInput`, copied explicitly in `Room.accept`, and covered in `room.test.ts`/`physics.test.ts`.
- When a body's shape changes (crouch, mode scale), keep the shooter eye line (`eyeHeight`), the target hitbox (`stance`), the rewind history and the client rendering consistent.
- Settings live in browser localStorage through `ui/settings.ts`. Extend `Settings`, `defaults` and `parseSettings` together, and add a test in `settings.test.ts`.
- UI text and button labels are matched by `scripts/browser-matchmaking.ts`. Update that script when you rename buttons or headings.
- New static file types must be added to the `types` map in `apps/server/src/net/http.ts`, or production returns 404.
- The production CSP allows only same-origin scripts, styles and fonts, plus the Supabase origin. Bundle assets; don't load from CDNs.
- Never commit secrets (`.env`, `apps/client/.env.local` are git-ignored). Supabase service keys, the Google client secret and the Resend API key stay in their dashboards.
- Usernames are permanent (migration `202611010001`). Don't reintroduce renames without the user asking.
- Default crouch is Shift. Ctrl is allowed as a binding but conflicts with the browser's Ctrl+W.

## Git and deploy

- Work on `codex/initial-release` (Render deploys from it). Commit with a clear subject and a body explaining why. Push only when the user asks.
- After a push, Render must redeploy (Auto-Deploy, or Manual Deploy → Deploy latest commit). A deploy restarts the server and drops live matches.
- A new migration needs a note to the user to apply it in Supabase **before** deploying server code that depends on it.
