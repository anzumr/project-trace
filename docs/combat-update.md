# Combat HUD, accuracy, headshots, audio and round statistics

## Audit and scope

The checkout already had a React/Vite/Three first-person client, fixed 60 Hz movement and damage, server-authoritative private/public/AI rooms, 20 Hz snapshots, Supabase accounts and result persistence, and local settings. It had capsule/body and spherical/head hit regions, a hovering target health billboard, endless practice progression, and cumulative firing/tracking counters. Head damage was 1.8x. Saved profile tracking used visible opportunity time, not held attack time. There was no combat audio pipeline or complete per-round comparison.

This update extends those systems. It preserves movement, jumps, pointer lock, hold-to-fire, all character modes, private rooms, queue cancellation/reconnect, optional AI, best-of-three transitions, and XP rules. Practice continues alternating speed and size upgrades into the micro-orb. The existing world-space health billboard remains.

## Gameplay and measurements

- Accuracy is `successful damaging attack seconds / accepted attack seconds * 100`; no attack displays an em dash. Head contact counts once, regardless of damage multiplier.
- Measurement happens once per fixed simulation tick. Misses count as attack time. Inactive/menu input, countdowns, disconnected-match pauses, and round-end time do not. Offline respawn delays do not count as attack opportunities. Active practice session duration does include respawn delays.
- Multiplayer uses accepted server input and confirmed ray/cover damage. The local crosshair never awards confirmed damage. Network latency is reflected in when the authoritative server accepts an input/release.
- Body damage stays at `CONFIG.dps`; head damage uses `CONFIG.dps * 2`. At the current configuration this is 20 and 40 HP/s. Head geometry and mode scaling are unchanged. A ray intersecting both regions selects the head once; cover must still permit that hit. The final practice orb has no head region.
- Round and cumulative match measurements include attack time, tracking time, damage, received damage, head damage/time, longest continuous streak, and active duration. Misses, released input, pauses and round changes break streaks. Round counters reset on actual next-round spawn.
- The opponent bar is top-center; player health is bottom-center, with numerical HP, threshold colors and a trailing damage fill. Timer, score, accuracy and current-round damage occupy separate regions. Menu branding is hidden during play; Escape still releases input without pausing online simulation.
- Confirmed hit markers remain lit during contact. Amber plus a diamond distinguishes head damage from the configurable body color. Mouse release clears feedback immediately; metrics remain throttled to approximately 100 ms. Stale online confirmation is cleared when snapshot age reaches 200 ms.
- A two-player round table appears after each round. The existing three-second inter-round transition remains. Final results offer last-round and match-total views. Offline waves show compact summaries; Escape → Practice → End practice & view session shows session totals, average elimination time, best/worst completed-wave accuracy and longest streak.

## Supplied audio

The files were copied unchanged from the supplied folder to `apps/client/public/audio/` and verified byte-for-byte.

| Filename | Event |
| --- | --- |
| `hitsound.ogg` | Confirmed body damage |
| `headshot.ogg` | Confirmed head damage |
| `killconfirmed.ogg` | Confirmed elimination counter increment |
| `spawn.ogg` | Round/player spawn or new practice target |

AudioContext initialization/resume follows an Enter/Ready user gesture. Four buffers are fetched and decoded once per engine, not during each hit. A shared hit/headshot cooldown defaults to eight triggers/second (settings range 1–12). Kill takes priority over headshot, then body hit. There is at most one combat voice and one spawn voice. A spawn immediately following a kill is delayed at most 180 ms to separate feedback. Muting controls the shared gain; all sound toggles and volumes use existing local settings persistence.

Current installed Chrome decoded all four supplied files. Their decoded durations were 0.500 s (body), 0.142 s (head), 0.174 s (kill) and 1.050 s (spawn). No conversion or replacement was needed for the tested browser. Physical speaker/headphone playback and browsers other than installed Chrome still require a listening check.

## Database rollout

Apply `supabase/migrations/202610310001_combat_stats.sql` once in Supabase SQL Editor, after the two existing migrations, **before deploying the updated server**. Do not rerun or edit the already-applied earlier migrations.

The additive migration creates:

- `match_combat`: account-associated authoritative totals and per-round records, linked to the existing match participant.
- `player_combat_stats`: attack-denominator aggregates, separated by public PvP, AI and private matches.
- `record_match_combat(jsonb)`: a server-only wrapper around existing result/XP recording. Both the original result and the added statistics commit in one transaction. Existing receipt locking/conflict detection and primary keys prevent duplicate stats and XP.

The new server uses the new RPC for enriched payloads, so a missing migration causes retry instead of falsely reporting that combat statistics were saved. Old outbox entries still use the existing RPC. Browser accounts have owner-only reads and no table writes or finalization permission. Existing history and XP are untouched. Old visible-opportunity measurements are retained and are not silently reinterpreted as attack accuracy; the profile labels the new measure as applying to new matches.

The migration has been tested against an isolated PostgreSQL-compatible PGlite database. It has **not** been applied to live Supabase as part of this update. No production credentials were changed or copied into client assets. Settings remain local to each browser, matching the existing infrastructure; offline practice does not write official PvP statistics.

Render Free still lacks durable disk storage: pending results can be lost on restart before successful Supabase recording. This is an existing hosting limitation. Apply the migration before rollout, and use persistent storage for dependable retry delivery.

## Verification and performance

Final local verification: **54 automated tests passed, 0 failed**. TypeScript/production build passed. The production smoke test passed HTML, compressed assets, all four OGG responses, CSP/path/method guards and two guest WebSocket clients. The complete two-Chrome acceptance run passed, including persisted round records, immediate marker clearing, next-wave spawning, mute persistence across reload, and HUD geometry checks at 1920×1080, 2560×1440 and 3440×1440. A fixture bug that overwrote local settings on every test reload was corrected before the successful final run.

The final headless browser sample contained 1,200 frames: mean 16.711 ms, p95/p99 16.8/16.9 ms, and mean measured JS work 0.598 ms. The test was capped at 60 FPS. Physical audio output, high-refresh hardware and real-network latency are not measured by this run. Vite reports a nonfatal main-chunk size warning (about 504 KB minified / 148 KB gzip); the build completes.

See `combat-performance.json` for measured simulation/snapshot costs and `combat-browser-performance.json` for browser frame intervals and audio decoding metadata. These are measurements of the local test environment, not capacity or 240 FPS guarantees.

The synthetic i7-9700K/Node 24 test measured 100 human rooms at about 1.15 ms mean / 2.82 ms p95 per tick, and 100 AI rooms at about 1.53 ms mean / 3.75 ms p95, including serialization at 20 Hz. The earlier add-on baseline was about 0.83/1.82 ms and 1.03/2.33 ms respectively; extra counters and serialized statistics add measurable overhead. Network, database, GPU rendering and real scheduling are excluded from this synthetic test.

Browser checks use two actual isolated Chrome contexts, real React/Three, real Socket.IO and the actual SQL migrations. Authentication is fixture-based. Human and AI matches complete through ordinary accepted inputs and authoritative damage, with no server HP/outcome edits. The practice camera is driven by test-only mouse-equivalent angles; normal hit detection applies. The five-minute offer uses a controlled queue clock, not a real five-minute soak.

Automated checks cover:

- Accuracy at simulated 60/120/144/240 render FPS, misses, release, head tracking, pauses, respawns and round/match resets.
- 2x head damage in every mode; body/orb damage, head/body priority and cover rejection.
- Audio rate limits, priority, counter deduplication and settings serialization.
- Actual OGG decoding in Chrome and production MIME/asset serving.
- Two-client human matching, queue cancellation, reconnect, round comparison and persisted round records; AI opt-in and separate saved stats/XP.
- Practice head damage, next-wave progression and session summaries.
- Existing accounts, private rooms, authoritative input/damage and all prior regression tests.

Screenshots are in the ignored `test-results/` folder. They were visually inspected for the round table, practice HUD and practice session summary. Automated Chrome runs are not a substitute for a human playtest or an audible listening check.

Known limits: no live Supabase/Render deployment was tested for this update; no physical two-computer or WAN test; no 240 Hz hardware benchmark; no Firefox/Safari audio claim. Match totals retain all measured time, while per-round detail retention is bounded to the most recent 128 round attempts in exceptionally long draw/replay matches. A restart still loses in-progress rooms. Historical matches have no invented attack-time denominator.

## Files

New implementation: `packages/shared/src/combat.ts`; `apps/client/src/game/CombatAudio.ts`; `apps/client/src/ui/audio-events.ts`, `CombatHud.tsx`, `combat.css`; four files under `apps/client/public/audio/`; the additive SQL migration.

Updated implementation: shared `practice.ts`, `protocol.ts`, and shared package exports; server `Room.ts`, `Results.ts`, `ResultOutbox.ts`, `net/http.ts`; client `Engine.ts`, `main.tsx`, `settings.ts`, `SettingsPanel.tsx`, and `auth/ProgressPanel.tsx`.

Tests/tooling: new shared/server `combat.test.ts` and client `audio-events.test.ts`; updated `practice.test.ts`, `room.test.ts`, `results.test.ts`, `browser-matchmaking.ts`, `production-smoke.ts`, and benchmark output-path support. Documentation: README, gameplay guide, this report and two performance reports.

## Local test instructions

Stop the previous local server with Ctrl+C, then in PowerShell:

```powershell
cd C:\Users\anzum\Documents\ChatGPT\Tracer
npm.cmd run dev
```

Open the local URL. Enter Practice, hold Mouse 1, alternate misses/body/head contact, release to check the marker, and eliminate a target. Escape opens the menu; End practice & view session opens totals. In Settings, try mute, individual sounds, volumes, marker colors/opacity and optional damage numbers, then reload to check persistence. For online testing use two browser profiles, ready a private duel and compare both round tables; check match totals after the final round. Apply the new SQL migration if testing account persistence against real Supabase.

Repeat automated checks with `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:production`, and `npm.cmd run test:browser`. The browser script is isolated by default; do not add `--live` until the migration is installed and creation of temporary QA accounts/audit records is intended.
