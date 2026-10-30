# Add-on 01 — public matchmaking and optional Extra Hard AI

The original checkout contained 5A authentication and private rooms. Following the owner's milestone clarification, this increment adds the missing result persistence and public matchmaking without replacing authentication, rendering, physics, practice, modes or private rooms.

## Milestones and behavior

- **5A preserved:** Supabase accounts, confirmed-email usernames, profiles, session refresh and server-side identity verification.
- **5B implemented:** server-confirmed match history, separate public/private/AI statistics, XP and derived levels. Account now displays saved progress, tracking opportunity accuracy, average damage and recent history. Input/crosshair/graphics settings remain local and unchanged; cross-device settings synchronization is outside this add-on.
- **5C implemented:** Quick Play, mode-compatible human pairing on the current server, server-owned queue timer, cancellation, duplicate-account prevention, ready confirmation, reconnect grace and reload recovery.
- **5D implemented:** optional Extra Hard AI offer after 300 seconds of connected unmatched searching. Continue searching never substitutes a bot. Accepting the offer consumes the queue entry and reserves the AI room in one synchronous server transition.
- **5E:** automated database, AI, socket and two-Chrome-context integration tests; live configuration probe; performance report. See the validation section for the distinction between fixture and live-provider runs.

Public play requires a verified registered account and configured server result storage. Guest private rooms and offline practice still work without it. Human players must select the same character mode. There is one pool per running game server, not cross-server region routing or skill matchmaking.

## Setup on Windows

The accounts migration must already be installed. Run the new migration **once** in your Supabase SQL Editor:

`supabase/migrations/202610280001_match_results.sql`

It creates `match_results`, `match_participants`, `player_progress`, `player_stats`, private finalization receipts and `record_match(jsonb)`. Authenticated clients can read only their own records; only the server's service role can call finalization. Do not rerun the older accounts migration.

In Supabase Settings → API Keys, obtain a **secret key** (`sb_secret_...`; a legacy service-role key is also supported). Add it only to root `.env`:

```dotenv
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
```

Keep existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The client continues using its public key. Never add the secret key to `VITE_*`, browser code, chat or version control. [Supabase's key separation](https://supabase.com/docs/guides/getting-started/api-keys) applies.

```powershell
cd C:\Users\anzum\Documents\ChatGPT\Tracer
npm.cmd install
npm.cmd run check:persistence
npm.cmd run dev
```

Stop an existing dev process with Ctrl+C before restarting. Open `http://localhost:5173`, sign in, then use **Quick Play / Find Match**. After a match, leave its room to search again. Private rooms still support rematches. Public/AI results screens deliberately do not offer unlimited direct rematches with the same opponent.

`check:persistence` makes read-only table checks and never prints keys. Reachable tables do not by themselves prove successful finalization or browser authentication.

## Queue, disconnect and cancellation rules

The server owns queue entries by verified UUID. Pairing, cancellation and AI acceptance contain no asynchronous gap between checking and consuming reservations. A human pairing that has already succeeded wins over a late bot-accept request; the latter returns an error. Room codes cannot be used to invade public/AI rooms.

The displayed timer is sampled from the server once per second. It counts connected searching time, not the browser's clock. On disconnect the queue timer freezes and that entry is excluded from pairing. The same account can restore its entry within **20 seconds**; otherwise it expires. Reload recovery uses a per-tab sessionStorage marker and server UUID verification. Storage-disabled browsers cannot recover a queue simply by reloading.

Public/AI matches pause simulation while a human is disconnected. Reconnection within 20 seconds restores the same seat and resets stale input/sequence state. A competing connected session cannot seize the seat. Grace expiry resolves a live match as a forfeit with **zero XP**. When both human grace periods expire together, the match is cancelled. Leaving before live play grants no wins or rewards. Private rooms retain their existing immediate-disconnect behavior.

A matched lobby has 60 seconds to confirm readiness. Completed public/AI rooms expire after five minutes. Graceful server shutdown cancels unfinished matches without rewards. Queues and live matches are in memory: a process crash/restart does not resume them. Do not run multiple independently routed instances expecting a shared queue; a coordinator and shared live-state design are future work.

## Extra Hard AI fairness

AI uses ordinary `Room.accept` inputs and the same fixed-step movement, acceleration, arena/cover collision, jumping, mode scale, HP, trace geometry and 20 HP/s body / 36 HP/s head damage. It never writes damage or HP.

Its perception samples exposed head/torso points within an 85-degree forward cone and 60-unit range, with ray-tested cover occlusion. Decisions use observations at least 150 ms old. New acquisition waits 150–220 ms; prediction is bounded to 200 ms of previously observed motion. Aim turns at at most 240 degrees/second horizontally, includes small motor error, and cannot snap perfectly. When hidden, it uses short-lived last-seen memory then a fixed map patrol, not hidden opponent coordinates. Strafes change every 450–1100 ms; jumps are spaced, and map-based steering moves away from walls and around cover.

Difficulty is a tunable heuristic, not an Elo-rated claim. Unit tests verify ordinary input legality, reaction limits, hidden-target independence and complete matches in all four modes. Human balance feedback remains valuable.

## Statistics and rewards

| Result | Public human | AI challenge | Private |
|---|---:|---:|---:|
| Completed win | 100 XP | 25 XP | 0 XP |
| Completed loss | 40 XP | 10 XP | 0 XP |
| Forfeit / cancellation | 0 XP | 0 XP | 0 XP |

Wins/losses from live forfeits are counted in their own category; cancelled matches are excluded from aggregates. An AI win/loss never enters human PvP or ranked ratings. No ranked tables or rating writes are added. Levels are derived from trusted total XP: level L begins at `100 × (L−1)²` XP.

Damage uses actual clamped authoritative HP loss, stored as thousandths of an HP. Tracking is confirmed hit time in milliseconds. Opportunity is live, unpaused time when the opponent has a visible head/torso sample within the forward cone/range, or an actual confirmed trace hit. Accuracy is the ratio of summed tracking/opportunity time; new players display “—”. These samples approximate visibility rather than performing pixel-perfect screen coverage. Play time excludes lobbies, countdowns, between-round summaries and reconnect pauses. History is private to participants; emails and auth tokens never enter game result payloads or snapshots.

`record_match` transactionally stores history, participants, stats and XP. Match UUIDs and private receipts make exact retries idempotent; a different payload using the same ID is rejected. SQL role grants prevent browser finalization, and clients have no socket event for submitting results or XP.

Completed results enter a disk outbox at `.trace-data/outbox` and retry asynchronously every five seconds. Disk writes use a temporary file, flush and rename. On restart, persisted entries retry through the same idempotent RPC. Keep this directory on persistent server storage and restrict operator access: it contains account UUIDs and username snapshots, never keys/passwords. Do not delete it to resolve a transient database error. A failed disk write disables new public play; results still in memory cannot survive an abrupt process loss. An abrupt crash can lose in-progress matches or a result not yet written to the outbox. Database/network operations do not block simulation ticks.

## Automated verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:production
npm.cmd run test:browser
npm.cmd run benchmark:addon
```

Browser tests require installed Google Chrome and free local port 4187; the game backend uses an ephemeral port. They launch isolated headless contexts and do not use the user's browser profile. Default mode uses fixture authentication and an actual embedded PostgreSQL database. Test-only input scripting is injected by the test Vite server; production builds contain no test engine access. The five-minute clock is advanced in the test process, never through a production socket or environment shortcut.

For explicitly intended **live Supabase integration testing**:

```powershell
npm.cmd run test:browser -- --live
```

Live mode creates two temporary `QA_...` accounts with generated passwords, signs in through real Supabase Auth, claims usernames, uses the real server verifier/finalization RPC and reads saved results through the actual browser. It sends no email. It deletes only those temporary accounts/progress afterward; QA match rows/receipts remain as audit history, with IDs printed in the test output. Existing accounts are not used. Do not run this command against an environment where QA audit records are unwanted.

Both modes exercise cancellation, compatible matching, transport disconnect/reload recovery, a browser-driven human duel, persisted XP, the 300-second offer, continued human search, bot acceptance, a genuine AI duel, separate statistics and the profile screen. They do not represent two physical devices, WAN latency, email delivery, or a user-GPU FPS benchmark.

## Performance and operational limits

`docs/addon-01-performance.json` records a synthetic batch benchmark on an i7-9700K / Node 24.19.0. For 100 rooms, measured mean/p99 were approximately **0.83/1.92 ms (human)** and **1.03/2.83 ms (AI)**, versus a 16.67 ms simulation budget. It includes room simulation and 20 Hz snapshot serialization, replenishes HP to sustain load, and excludes network, persistence, rendering and real scheduling. It is not a production capacity or FPS guarantee.

Public play retains the existing 100-room/256-connection limits and bounded input/control rates. Queue capacity is 256, and new public entries are rejected when the persistence backlog reaches 1000. Existing games still finalize. Grace-period pausing can be abused to interrupt a match; repeated-disconnect moderation and distributed coordination are not included. No cloud deployment was performed.

## Changed integration surfaces

- `apps/server/src/Matchmaking.ts`: queue and reconnect state machine.
- `apps/server/src/game/ExtraHardAI.ts`: visibility-limited AI controller.
- `apps/server/src/game/Room.ts`, `Results.ts`: shared AI execution, match IDs, measured counters and finalization hooks.
- `apps/server/src/ResultOutbox.ts`, `server.ts`: trusted persistence/retry and socket integration.
- `packages/shared/src/protocol.ts`, `index.ts`: queue/seat/result metadata and level curve.
- Client `QuickPlay.tsx`, `ProgressPanel.tsx`, `Network.ts`, `Engine.ts`, `main.tsx`, account/mode/status UI and CSS.
- Migration, environment example, package scripts, database/queue/AI/level tests and browser/performance scripts.

The initial source mismatch and preservation boundaries remain documented in `docs/addon-01-audit.md`. This feature extends the existing Node/Socket.IO + React/Three architecture; it does not rebuild 5A.
