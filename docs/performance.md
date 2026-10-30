# Performance evidence and profiling

## Reproducible server benchmark

Run `npm.cmd run benchmark`. Results are saved to `docs/performance-results.json`, including timestamp, CPU, OS, Node version and scope. The measured run on Windows 11 / Node 24.19.0 / Intel Core i7-9700K recorded:

| Simulated rooms | Mean batch tick | p95 | p99 |
| --- | ---: | ---: | ---: |
| 1 | 0.014 ms | 0.032 ms | 0.041 ms |
| 10 | 0.077 ms | 0.179 ms | 0.277 ms |
| 100 | 0.631 ms | 1.518 ms | 1.624 ms |

Each batch includes validated inputs, simulation/hit testing and snapshot JSON serialization every third tick. 120 warm-up ticks precede 600 measured ticks. HP is replenished in this synthetic benchmark to keep both characters firing. Network transport, scheduling delays, browser rendering and human input are excluded. This is not a player-capacity guarantee or browser FPS measurement.

## Browser profiling

Settings now includes Auto/60/120/144/240 render caps, 50–150% render scale, Competitive/Balanced/Quality presets and opt-in diagnostics. Caps apply only to drawing; fixed-step simulation/input processing continues at browser callback cadence. Actual drawing remains limited by display refresh and browser scheduling.

Competitive caps base pixel density at 1× and hides decorative grid/wall strips. Balanced caps it at 1.5×; Quality at 2×. Render scale multiplies the selected density. The scene already has no dynamic shadows or postprocessing. These settings do not change hitboxes, aim or damage.

Diagnostics use a bounded 1200-render rolling sample and update percentiles once per second. They report actual render intervals (mean/p95/p99), JS work per render, draw calls, ping, snapshot age, and estimated skipped fixed ticks on client/server. JS timing excludes asynchronous GPU work and React/browser work outside the engine. It is not input latency. The server tick metric covers simulation, not transport serialization.

To collect useful evidence:

1. Use the production build. Record browser version, GPU, monitor refresh and viewport.
2. Select a graphics preset/cap and enable diagnostics. Enter practice or a two-player match for at least 30 seconds, turning and firing normally.
3. Escape → Settings → Download performance report. Capture each hardware/display configuration independently.
4. Repeat for supported 60/120/144/240 Hz modes and compare p95/p99 frame time, not only FPS. Browser devtools may change results; note whether open.
5. Check for correction jitter under LAN/network delay, high-DPI alignment, tab switching, repeated room joins and memory growth over repeated matches.

No GPU/display/browser performance measurement or 240 FPS claim is available from this coding session. Browser visual QA, high-refresh testing and real-device network QA remain pending. Baseline production JS is split into app/React/network/Three.js chunks and precompressed; the prior single-chunk size warning is removed, without claiming that splitting alone reduces total download size.
