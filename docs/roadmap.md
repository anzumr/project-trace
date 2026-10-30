# Phase checklist

- [x] Phase 0: offline arena, movement, pointer lock, tracking, build and physics tests.
- [x] User requested Mouse 1 firing, floating HP, fullscreen and FPS.
- [x] Fix floating HP rendering with a single textured billboard and numeric value.
- [x] Phase 1 implementation: server authority, private rooms, ready, prediction/reconciliation, interpolation, KO and disconnect.
- [x] Phase 1 automated gate: real socket clients exercise movement, occlusion, damage, KO, replay, room limits and disconnect.
- [ ] Phase 1 user gate: two real browsers/players, LAN, health billboard and latency feel.
- [x] Phase 2: countdown, timed rounds, best-of-three, timed ties, names, metrics and rematches.
- [x] Practice: endless progression and full 360-degree arena movement.
- [ ] Phase 2 user playtest: browser countdown/round transitions and 360-degree practice feel.
- [x] Phase 3: four shared mode profiles, host selection with versioned approval, rotating preview and saved crosshair editor.
- [ ] Phase 3 user playtest: all four modes in two browsers, preview rendering and crosshair persistence/centering.
- [x] Phase 4 engineering: frame caps, graphics presets, diagnostics/export, benchmark, resource limits and production serving/scripts.
- [ ] Phase 4 external QA: browser visual/input checks, GPU/display benchmarks, two-human LAN/internet testing and actual HTTPS deployment.

Stop after Phase 4 engineering for the user's playtest and critique. Automated socket clients do not prove browser input/rendering or internet play.
