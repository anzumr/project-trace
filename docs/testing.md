# Verification — October 27, 2026

Reference-model update: `node --import tsx --test packages/shared/src/*.test.ts` passed all 12 tests, including capsule/head hits, misses through the visible gap and rounded corners at multiple scales, plus endless progression and route checks. Model appearance still needs browser visual verification against the user's reference.

Environment: Windows, Node v24.19.0, npm 11.17.0. No supported browser-control tool was available, so browser rendering/input has not been automated.

## Phase 1 results

- `npm.cmd install --fetch-retries=0 --fetch-timeout=20000`: passed with network permission; 0 reported vulnerabilities. Sandbox DNS initially failed.
- `npm.cmd run build`: passed including TypeScript checking. Vite reports a 776 kB minified JS chunk (213 kB gzip); optimization remains open.
- `npm.cmd test`: 11/11 passed. Local sockets required execution outside the restricted sandbox.
- `npm.cmd run dev`: combined launcher started backend on 3001 and Vite on 5173.
- `node scripts/smoke-proxy.mjs http://localhost:5173`: HTTP page and two independent WebSocket clients through the Vite proxy passed, including browser Origin header.

The real-socket integration test creates two sessions, rejects a third and an invalid code, readies both, verifies independent movement and jumping, confirms cover and empty-space misses, verifies no damage without Mouse 1, fires and releases, reaches a real server KO, checks matching winner/HP on both clients, replays with reset HP, and disconnects one client to resolve a forfeit. It does not submit HP or hit flags or change server state to produce that result.

Deterministic tests additionally exercise malformed/stale/replayed input, packet-spam speed bounds, HP/position injection rejection, focus loss clearing queued fire, target height, simultaneous KO, replay reset, ray math, fixed-step DPS across render cadences, map collision and jump constraints.

To see server-confirmed HP logs during the socket test or manual play, set `$env:LOG_HP='1'` before the command.

## Required user playtest

1. Stop the previous server, run `npm.cmd run dev`, then refresh both browsers. Verify the **1v1 Duel** tab exists.
2. In **Practice**, aim without Mouse 1: no damage. Hold Mouse 1: target's floating numeric HP, green fill and top HUD agree. Release: all stop changing. Reset returns all to 100. Check the billboard from different angles and while moving.
3. Fullscreen enters/exits, FPS stays top-right, reticle remains centered after resize. Mouse lock, WASD and jump still feel correct.
4. Create a room in browser A; join its code in browser B. Both ready and enter. A single PC can only focus one game at a time; use two PCs for a simultaneous-human test.
5. Move, jump, aim and fire independently. Check both HP bars and the opponent billboard; compare the two clients' state. Cover prevents damage.
6. Release Mouse 1, press Escape while firing, and switch tabs. Outgoing fire stops. Online opponents can still damage a paused player.
7. Complete a KO, check the agreed winner, ready again without reloading, and verify spawn/HP resets.
8. Close one browser or interrupt its network. Remaining player gets an explicit disconnect/forfeit. Rejoin through a new room, with no duplicate player.
9. Repeat on two LAN devices using the exact origin setup in README. Record latency, visible corrections and any mismatch between visible aim and server hits.

## Limits

Endless-practice addition: four tests cover alternating upgrades, capped small-orb endpoint, 20 consecutive kills/respawns, pause during respawn, full HP reset, spherical hit rejection outside the silhouette, Mouse 1 and cover occlusion. Manually verify the shrinking mesh and floating HP placement, the wave-17 sphere transition, and resuming/restarting progression. Multiplayer remains Standard size/speed regardless of practice progress.

Health billboard fix and browser interactions need visual/manual confirmation. Automated clients prove local server/transport behavior, not two-human browser play, LAN/internet accessibility, fairness under latency, or FPS targets. Remote rendering has a 100 ms interpolation delay and no lag compensation; aim feel under network delay is explicitly unfinished tuning. No reconnect grace period; disconnect ends the duel. These were Phase 1 limits; the Phase 2 results below add countdown, round timers and best-of-three. Stop after Phase 2 for user feedback.

## Phase 2 and 360-degree practice results

- `node --import tsx --test packages/shared/src/*.test.ts apps/server/src/room.test.ts`: 20 tests passed.
- `node --import tsx --test apps/server/src/network.test.ts`: passed a real three-round 2–1 match, names, countdown, scores, full rematch reset and disconnect in approximately 44 seconds. Two independent Socket.IO clients; no state injection in this integration test.
- `npm.cmd run build`: passed with typechecking. Existing bundle-size warning remains (~782 kB minified JS).
- New deterministic coverage: exact countdown boundary, no pre-GO movement/damage, 90-second timeout winner, 15-second sudden death, simultaneous hits, no-hit replay, unchanged round number on draws, 2–1 scoring, stable match result, rematch metrics reset and disconnect in transitional phases.
- Practice route samples cover all quadrants and both axes, including behind the initial spawn, and remain outside walls/cover. Progression through 20 kills still passes.

Current manual checklist supersedes the earlier single-duel instructions: restart both server/client, name two players, ready/capture the mouse, confirm countdown freeze and GO, finish a best-of-three match, verify summary/HP resets and final 2–0 or 2–1 score, then rematch without reloading. Let a round time out with tied HP to exercise sudden death. In Practice, turn around to follow the bot as it moves in depth and behind you; verify speed/size upgrades and health-bar placement.

No two-human browser/LAN test or performance benchmark has been run here. Phase 2 UI and the new route still require the user's visual playtest. Countdown/timer use authoritative simulation ticks; prolonged server stalls can extend wall-clock round length. No lag compensation or reconnect grace period is added in this phase.

Headshot update: 14 shared tests pass, including one-second head/body damage totals across scales, normal final-orb damage, nearest-region selection, cover blocking headshots, releasing fire and nonnegative lethal damage. Practice headshot indicator and visuals still need manual browser confirmation.

## Phase 3 results and playtest

`npm.cmd test`: 30/30 passed, including the real-socket mode-approval test and the full three-round match/rematch regression. New tests verify all four hitbox dimensions, speeds, jump impulses and bounds; unchanged 20 HP/s server damage in every mode; host-only selection; readiness invalidation; stale revision rejection; locked match mode; old settings migration; invalid settings handling; and serialization of all reticle styles/presets.

`npm.cmd run build`: typecheck and production build pass. The existing bundle warning remains (~791 kB minified JS, ~218 kB gzip). No FPS target is claimed.

Manual checks pending: restart the server and refresh both clients; choose each profile and compare preview, opponent size, speed and jump; verify guest approval resets on host changes and both clients agree on the mode. In Settings, try all styles, outline/size/gap/color/opacity, presets and resets. Reload to verify actual browser persistence; check reticle center on resize, fullscreen and device scaling. Confirm the 3D preview renders and the scrollable settings/lobby work at smaller window sizes. No browser visual automation, two-human LAN test or high-refresh-rate benchmark was performed.

Shared-player-model update: multiplayer now uses the same capsule and separate gray head as practice, including scaled collider regions and 1.8× headshot damage. New server tests check 36 HP/s head damage and misses through the visible neck gap in all four modes. The existing per-mode damage test now aims at the body to confirm 20 HP/s. Lobby preview, practice and duel rendering share one model factory. Manual browser confirmation of the new duel silhouette remains pending.

## Phase 4 engineering verification

- `npm.cmd test`: 35/35 passed, including render-cap cadence, unchanged simulation tick counts, bounded frame statistics, origin rejection, packet-flood disconnection, mode approval and the full match/rematch suite.
- `npm.cmd run typecheck`: passed, including the new benchmark and production smoke scripts.
- `npm.cmd run build`: passed; chunks are split and gzip artifacts generated. No single-chunk-size warning remains.
- `npm.cmd run test:production`: passed production page/assets, gzip/cache/CSP, traversal/method guards and two real WebSocket clients.
- `npm.cmd run benchmark`: completed; machine/scope/results recorded in performance-results.json and summarized in performance.md.

Remaining QA is explicit: no browser-controlled visuals, GPU timings, monitor-refresh results, two-human LAN game, remote HTTPS proxy or public deployment was tested here. Settings/report downloads, context-loss handling and stale-network warning require manual browser checks. Phase 4 engineering is ready for that playtest; the hardware/deployment acceptance gates are still pending.

Final production verification: `npm.cmd audit --omit=dev --audit-level=high --fetch-retries=0 --fetch-timeout=15000` reported 0 vulnerabilities after registry access was allowed. The final compressed build passed `npm.cmd run test:production`. The actual `npm.cmd start` entry point was launched on temporary port 3101; page serving and two WebSocket clients passed, then the test process was stopped. No user development server was stopped.
