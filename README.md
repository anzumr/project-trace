# Project Trace — Public matchmaking & optional AI

First-person 1v1 mouse-tracking duels with a Node + Socket.IO authoritative server. Offline practice remains available. TRACE is a working title.

Accounts, server-confirmed progress, public human matchmaking and optional Extra Hard AI are implemented. See [Add-on 01 setup and rules](docs/addon-01.md) and [verified test results and limits](docs/addon-01-validation.md). The [original account setup guide](docs/phase-5-setup.md) covers initial authentication. Public play additionally needs the match-results migration and server-only key; guest private play still works without them. Settings remain browser-local. No credentials are committed.

## Launch on Windows

Stop the old server with Ctrl+C. In PowerShell:

```powershell
cd C:\Users\anzum\Documents\ChatGPT\Tracer
npm.cmd install
npm.cmd run dev
```

This starts the game server on port 3001 and Vite on port 5173. Open the Local URL printed by Vite. Keep PowerShell open. Ctrl+C stops both. Frontend edits reload automatically; restart the command after server edits. `npm.cmd` avoids PowerShell execution-policy errors.

## Play a duel

1. Player A selects **1v1 Duel → Create room**.
2. Player B opens the same server in a different browser/device and enters the five-character room code.
3. Optionally enter player names before creating/joining. The host selects a shared mode, then both select **Approve mode & ready** to capture the mouse and begin the three-second countdown. If mouse capture is lost, select **Enter duel**.
4. WASD moves, Space jumps, mouse aims. **Hold Mouse 1 to fire.** Damage requires the server's aim ray to hit the opponent without cover in the way.
5. Each round ends at a KO or after 90 seconds (higher HP wins). First to two round wins takes the match. A three-second summary and fresh countdown separate rounds. Both can ready for a full rematch, or leave.

Escape releases the mouse and stops your movement/fire input, but **does not pause the online opponent**. Private-room disconnects forfeit immediately. Public and AI matches pause for a 20-second reconnection window. A stationary player can still be damaged.

The target's hovering health display shows a numeric value and fill from the same HP used by the HUD. The fullscreen toggle is available in menus/pause, with FPS in the top right. The FPS display is a live render estimate, not a benchmark.

## Local / LAN / internet

Two browsers on this PC: both use `http://localhost:5173`. This is a smoke test; only the focused window receives mouse input.

Two PCs on the same LAN: start the server on one PC and use Vite's Network URL on the second. Configure the exact LAN origin before starting (replace the example IP):

```powershell
$env:ALLOWED_ORIGINS='http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.154:5173'
npm.cmd run dev
```

Allow the development server through Windows Firewall on your trusted private network if prompted. Vite proxies `/socket.io` to port 3001, so the browser uses the same origin for page and socket. If Vite chooses another port, add that exact origin or free port 5173. Some browser/input features on another device may require HTTPS; see deployment notes. Do not expose the development server publicly.

For internet testing, use a persistent Node host behind HTTPS/WSS as described in [docs/deployment.md](docs/deployment.md). No public deployment has been created or tested.

## Verify

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests include real Socket.IO clients and require permission to open local sockets. See [docs/testing.md](docs/testing.md) for evidence and manual checks. Production assets are in `apps/client/dist`. A static preview alone is not a multiplayer deployment; the Node server and socket proxy are also required.

## Current boundary

Practice follows a full 360° route around the arena, moving in both X and Z and passing behind the initial player spawn. It stays within walls and outside central cover. Practice is endless: every kill respawns a full-health target after 0.65 seconds. Upgrades alternate faster movement, then smaller size at the same speed. Wave 17 reaches a small spherical target at 3× starting speed; subsequent waves continue at that difficulty. The sphere uses a spherical hitbox. HUD shows wave/kills/speed/width; **Restart progression & position** starts over. Escape pauses practice, including the respawn timer.

Phase 3: four shared difficulty profiles, a saved crosshair editor, two-player rooms, player names, ready/countdown, 90-second rounds, best-of-three scores, round summaries, server-authoritative physics/damage, prediction/reconciliation, remote interpolation, match results, rematch and disconnect forfeit. Opponents use the same red capsule body and gray spherical head as the practice bot, with matching hit regions. No artificial opponent is substituted in a duel.

A tied timeout enters 15-second sudden death: the first confirmed hit wins; simultaneous hits or no hits replay the same round without points. Simultaneous KO also replays. Match results show total damage, confirmed tracking seconds, and on-target firing-time percentage (confirmed tracking time divided by active firing time). Phase 4 adds graphics controls, render caps, diagnostics/report export, basic network resource limits and a same-origin production server. Hardware/browser and internet validation remain pending. No measured high-refresh-rate performance or internet-play claim is made.

## Modes and crosshair editor

In a room, the host chooses Heavy/Tank, Standard/Runner, Agile/Scout or Extreme/Micro. The rotating 3D preview uses the actual target dimensions. Size/speed/jump-impulse multipliers are shown before both players approve. Changing mode clears readiness; mode is locked during a match. Both players always share the same mode. Both multiplayer and practice use 20 HP/s body damage and 1.8× gray-head damage (36 HP/s).

Open **Settings** from the menu or after Escape. Edit dot, cross, hollow circle, cross + dot or minimalist reticles. Color, opacity, size, thickness, gap and outline update the live preview and screen-center overlay immediately. Presets, sensitivity reset, invert Y and reset-all are included. Settings save in this browser when localStorage is available, including migration of existing sensitivity/color saves. The actual aim ray does not move with reticle settings.

## Production and performance

- `npm.cmd run build` then `npm.cmd start`: production client + server at http://localhost:3001.
- `npm.cmd run test:production`: compressed assets, headers, path guards and WebSocket smoke test.
- `npm.cmd run benchmark`: reproducible synthetic server benchmark, saved to `docs/performance-results.json`.
- Settings → Graphics: render caps, render scale and three presets. Enable diagnostics or download a performance report for your playtest.

See [performance evidence](docs/performance.md) and [deployment instructions](docs/deployment.md). No hosting has been published, and no 240 FPS or external-device performance target has been verified.
