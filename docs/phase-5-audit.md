# Phase 5.0 audit — 2026-10-27

Baseline inspected before account changes: React 19/Vite 7/Three.js client, Node/Socket.IO server, shared TypeScript physics and protocol. This is the existing game; no second application is scaffolded.

Implemented foundations: first-person WASD/jump/pointer lock, held Mouse 1 tracking, capsule/gray head with 1.8× head damage, 360-degree endless practice progression; four shared character modes; guest private rooms with mode revision approval, countdown, best-of-three rounds, rematch and disconnect handling; authoritative movement/hits/HP; prediction/interpolation; local settings, FPS/fullscreen/graphics diagnostics; static production server with origin/rate/payload restrictions.

Evidence: baseline offline npm install succeeded (0 audit findings), build including typecheck passed; all **35 tests passed** when run with localhost access. The sandboxed socket run failed because localhost access was restricted; this was resolved by rerunning outside that restriction. There is no lint script. Existing production smoke and benchmark artifacts are present; they are not proof of live deployment or human two-device verification.

Missing before 5A: authentication, database, persistent profiles/settings/results/XP, public matchmaking. Existing match statistics are transient. Current on-target firing percentage is NOT the required opportunity-based tracking accuracy. Match identifiers are local counters, not durable result IDs. Disconnects resolve immediately without reconnect grace. No provider environment files were configured.

Integration sequence: 5A Supabase email/password + owner-only profiles/atomic username RPC + verified socket identities; 5B durable match IDs/finalization transactions/XP/settings; 5C compatible public queue; 5D integrated security/reliability and real-device testing. Auth database calls run during account operations/handshakes, not simulation ticks or render frames. Preserve guest private rooms.

User reports Chrome hardware acceleration improved FPS from approximately 80 to 240. This is user-reported, not measured by this audit. Settings now recommends enabling graphics acceleration and relaunching Chrome.
