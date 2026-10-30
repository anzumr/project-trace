# Architecture

Vite + React menus and HUD wrap a separate Three.js engine. Camera response and local movement prediction do not wait for the server. React receives sampled HUD updates, not animation-frame updates. Shared TypeScript defines movement, collision, ray math, rules and the typed Socket.IO protocol.

## Match authority

`apps/server/src/game/Room.ts` owns room state, accepted input queues, body positions, HP, hit confirmation and winners. A monotonic-clock accumulator runs fixed 60 Hz simulation, caps catch-up at 100 ms, and broadcasts at 20 Hz. Each player contributes at most one queued input per tick; packet count cannot accelerate movement or damage. Direction inputs are bounded/normalized, yaw/pitch finite and bounded, sequence numbers monotonic, input rate capped at 100/s and queue at 12. No client position, HP, hits or damage claims are used.

Damage integrates 20 HP/s only while Mouse 1 is held, input is active and the accepted eye ray intersects the other player's height-adjusted box before solid cover. Both hit tests use the same state before simultaneous damage. Focus/unlock sends inactive input and clears the queue; 250 ms input silence disables movement commands/fire. Releasing fire clears queued fire flags. Gravity and stopping inertia continue server-side.

Transport owns connection membership. Rooms have five-character random codes and exactly two seats. Both ready starts a three-second countdown, then a 90-second round. First to two round wins resolves the match. Round summaries last three seconds before automatic HP/spawn reset and countdown. Higher HP wins timeout; exact ties enter 15-second sudden death. The first hit wins sudden death; simultaneous hits, no hits or simultaneous KO replay the same round without points. Ready again resets scores and cumulative metrics for a new match. Disconnect/leave immediately resolves a forfeit, with no reconnect claim or duplicate retained seat. A disconnected session must create/join another room.

## Client

`Network.ts` centralizes socket listeners, create/join acknowledgments, RTT sampling and snapshot buffering. `Engine.ts` predicts fixed-step movement, resets to authoritative bodies and replays unacknowledged inputs. Camera orientation stays local. Remote bodies interpolate snapshots with a 100 ms buffer. No lag compensation is implemented; visual and server hit timing under latency remain a playtest concern. Input loss/stalls can produce corrections; smoothing is a future tuning item.

Practice uses local HP and the moving dummy only when no room is joined. Online HP/hit feedback always comes from the server. `TargetHealth.ts` draws background, fill and numeric HP into a single canvas texture. This removes the overlapping opaque-plane sorting problem that could obscure the previous health fill. The sprite follows the opponent, faces the camera, respects depth, and only redraws on displayed HP changes.

## Scope and defaults

Standard mode, provisional TRACE branding, simple box target, flat arena plus central occluder. Mouse 1 requirement supersedes the original automatic-damage handoff at the user's request. Phase 2 uses integer tick countdowns from shared config. A roundSerial changes on every spawn reset, including drawn replays; clients flush predictions and remote interpolation across that boundary. Inputs are cleared at round end and GO. The camera remains locally responsive during countdowns while movement and damage are frozen. Player names are length-limited plain text. Tracking percentage measures confirmed hit ticks divided by active firing ticks, accumulated across a match, not an invented shot-accuracy metric. User will test this milestone before Phase 3.

## Phase 3

`packages/shared/src/modes.ts` holds immutable gameplay profiles. `move` accepts a mode ID with Standard defaults; multiplayer rays use capsule/head regions scaled by the mode; server simulation, client prediction, eye height and visible mesh sizing consume the same profile. The shared client `BotModel.ts` builds the same red capsule and gray head in practice, multiplayer and lobby previews. The server reuses the exact practice-model intersection math with uniform mode scaling and sends confirmed headshot flags in snapshots. Presentation materials do not change gameplay dimensions.

Snapshots include `mode`, `hostId` and `modeRevision`. Only the current host can select a valid mode in lobby/results. A real change increments revision and clears both ready states. Socket Ready must carry the displayed revision; stale approvals cannot start a match. The client releases mouse capture on mode changes to expose the new lobby choice. Mode selection and all other socket transport remain centralized in Network.ts.

Settings parse/migrate/validate stored data, clamp numeric inputs and reject invalid colors/styles. Crosshair.tsx draws one SVG centered at CSS 50%/50%, with the same geometry used for live preview, no input interception and no dependence on camera state. Settings do not alter aim. The editor and preview mount only in menus/pause; the rotating 3D mode preview reuses a single context across selections and disposes its resources on unmount.
