# Phase 5A milestone report — 2026-10-27

**Implementation ready pending environment integration. Phase 5 is not complete.**

5.0: baseline audit complete; existing game preserved. 5A: account UI, provider integration, SQL migration, username rules, verified socket identities and setup documentation implemented and locally tested. 5B: not started (progression/stats/history/settings sync). 5C: not started (public queue). 5D: initial account RLS/grant/token protections tested; broader hardening, privacy/support product surface and real environment validation remain.

## Checks actually executed

| Check | Result |
|---|---|
| Baseline `npm.cmd install --offline --ignore-scripts` | Passed; audit reported 0 vulnerabilities |
| Baseline `npm.cmd run build` | Typecheck + production build passed |
| Baseline `npm.cmd test` | Sandbox denied localhost socket tests; rerun with localhost access passed all 35 |
| Install Supabase SDK and PGlite | Passed; audit reported 0 vulnerabilities; npm printed an existing esbuild install-script approval warning, builds still passed |
| Final `npm.cmd run build` | Typecheck + Vite + gzip passed |
| Final `npm.cmd test` with localhost access | **39/39 passed**, 0 failed, 0 skipped |
| `npm.cmd run test:production` | Passed: HTML/compressed assets/security headers/path and method guards/two guest WebSocket clients |
| Credential-file ignore check | Root `.env` and client `.env.local` ignored |
| Lint | No lint script exists |
| Real Supabase / email / two devices | Not run: no configured provider environment |
| Browser visual/input QA for account screens | Not run: no browser automation available; manual checklist supplied |
| New FPS benchmark | Not run; 240 FPS was reported by the user after enabling acceleration |

The 39 tests include the original movement, practice, hitboxes/headshots, held-fire, modes, full three-round socket duel/rematch/disconnect, settings and performance-counter tests. New tests cover actual PostgreSQL migration permissions and constraints (PGlite with fixture Auth schema), the provider adapter (mock HTTP), and authenticated socket identity/refresh/expiry (injected verifier). These substitutes do not prove hosted Auth delivery, true concurrent PostgreSQL sessions, or browser login/recovery.

## Files added or updated for this milestone

- `supabase/migrations/202610270001_accounts.sql`: profiles, private policy/reserved names, owner-only RLS, atomic claim/rename RPC.
- `apps/client/src/auth/client.ts`, `useAccount.ts`, `AccountPanel.tsx`: provider client, session/profile lifecycle and account interface.
- `apps/client/src/main.tsx`, `style.css`, `net/Network.ts`: Account navigation, signed-in names, guest labels, token handshake/refresh lifecycle.
- `apps/client/src/ui/SettingsPanel.tsx`: hardware/graphics acceleration recommendation.
- `apps/server/src/auth.ts`, `env.ts`, `server.ts`, `game/Room.ts`, `net/http.ts`, `index.ts`, `production.ts`: provider verification, environment loading, bound internal UUIDs, rename protection, expiry/rate limits and provider-aware CSP.
- `packages/shared/src/protocol.ts`: registered-account flag and refresh event; no email/token in snapshots.
- `apps/server/src/accounts-db.test.ts`, `auth.test.ts`: database permissions and authentication boundary checks.
- `.env.example`, `apps/client/.env.example`, `.gitignore`: public provider templates and ignored local environment files.
- Root/client/server package manifests and lockfile: Supabase SDK and development-only PostgreSQL test dependency.
- `README.md`, `docs/phase-5-audit.md`, `docs/phase-5-setup.md`, this report: audit, setup, limitations and real two-account acceptance checklist.

All source was already untracked in this repository before the milestone; no commit, push, hosted deployment or live database mutation was performed. Build output was regenerated locally.

Next prerequisite: owner creates Supabase project, applies migration and enters public configuration locally, then verifies signup/confirmation/username/login/recovery and an authenticated private duel using the setup guide. Only then proceed to 5B's durable match identifiers, transactional server-only rewards and settings persistence. Stable private account UUIDs are the foundation for later Phase 6 ranking; no ranking results are fabricated.
