# Add-on 01 verification — 2026-10-28

Core add-on acceptance passed locally and against the owner's configured Supabase project. This report is specific to public matchmaking, optional AI and result persistence; it does not claim completion of unrelated features such as cloud settings sync, ranked play or public deployment.

| Check | Outcome |
|---|---|
| Baseline build + tests before changes | Passed; 39 tests |
| Final `npm.cmd test` | **49 passed, 0 failed, 0 skipped** |
| Final `npm.cmd run build` | TypeScript, Vite production build and gzip passed |
| Final `npm.cmd run test:production` | Production HTTP/assets/CSP/path/method guards + two guest WebSocket clients passed |
| `npm.cmd run test:browser` | Two isolated Chrome contexts using fixture Auth + real embedded PostgreSQL passed |
| `npm.cmd run check:persistence` | All five live Supabase tables reachable with local server configuration |
| `npm.cmd run test:browser -- --live` | Two Chrome contexts using real Supabase Auth, JWT verification, SQL finalization and profile reads passed |
| Browser runtime errors during acceptance run | None |
| Production JS credential/test-hook scan | Configured server secret and `__traceEngine` absent |
| QA account cleanup | Delete calls succeeded; readback confirmed all four test participant account links are null |
| `npm.cmd run benchmark:addon` | Synthetic performance report recorded in `docs/addon-01-performance.json` |

The restricted sandbox initially denied temporary-file operations in the outbox test. The normal localhost/filesystem-enabled run passed. No unresolved automated test failures remain. No lint script exists.

## What the actual browsers verified

The live run used two temporary provider accounts with unique QA usernames and generated passwords, not injected identities. Both signed in with Supabase password authentication; the game server verified their tokens through the real provider. Two separate Chrome browser contexts rendered the actual React/Three application.

The first browser queued and cancelled. Both then queued into one compatible human room. A transport interruption paused the room; reloading the second browser restored the same player IDs. Browser Engine input loops moved one player into a clear lane and aimed/fired the other through ordinary Socket.IO inputs. No server HP, positions or match winners were edited. The authoritative duel completed and persisted exactly one result with 100/40 XP.

The first account queued again. A controlled server clock advanced to the five-minute boundary; the UI offered a bot without creating a match. Continuing human search kept the queue intact. Explicit bot acceptance removed the queue entry and entered a clearly labeled AI room. A genuine server-simulated AI duel completed and persisted separately. The player profile displayed 110 XP: 100 from the human win and 10 from the AI loss. Its public win rate was unaffected by the AI loss.

The test clock override and engine access are test-process dependency injection only. They are not production socket commands or environment shortcuts. The accelerated clock proves eligibility logic and UI, not a five-minute stopwatch soak test. Scripted browser inputs are not two human playtesters or physical machines.

## Database/security evidence

Tests execute the real migrations in PostgreSQL via PGlite, with a fixture only for Supabase Auth's schema/identity context. They verify owner-only reads, prohibited player writes/finalization, invalid results, public/AI separation, zero rewards for cancellation/forfeit, duplicate finalization idempotency and rejection of conflicting payloads. The live browser run independently verified the same RPC successfully writes genuine match results and that authenticated profile queries return them.

PGlite serializes its connection; tests do not establish multi-connection PostgreSQL race scheduling. SQL advisory locks, primary/unique constraints and transactional updates supply concurrency protection. Socket queue operations run synchronously on one authoritative process, with tests for duplicate entry, cancellation, mode mismatch, human-vs-bot acceptance races, disconnected exclusions, exact eligibility and simultaneous reconnect-grace expiry.

AI tests confirm cover/FOV restrictions, no steering from hidden target motion, reaction delay, turn limits, valid inputs, movement/jumps and full authoritative matches in all four modes. Original private room, movement, held-fire, headshot, mode, rematch and practice tests continue passing.

## Live QA cleanup

The two temporary QA Auth accounts and their profile/progress/stat rows were removed. Existing player accounts were not used or modified. These two QA matches remain in the administrator-visible audit history:

- `770560e2-2f91-41ca-9b4f-7f38095beb8a` — human test match.
- `780781cb-a098-4d54-a158-b4d24fa7595a` — AI test match.

Participant account links are null after profile deletion. Username snapshots are clearly marked `QA_...`. These orphaned QA records cannot appear in another player's owner-only profile history. Private idempotency receipts retain the test payloads as audit records.

Screenshots: `test-results/addon-profile-live.png` (live profile) and `test-results/addon-profile.png` (fixture profile). Test outputs are ignored by Git. Neither screenshot contains credentials.

## Remaining limits and operator playtest

- No confirmation/recovery email delivery was tested; temporary accounts were admin-confirmed. Existing 5A email setup is unchanged.
- No WAN, two-physical-device, adversarial latency or 240 FPS measurement was performed. Current render/input performance targets require hardware playtesting; synthetic CPU results are not browser FPS.
- One running server owns its queue and live matches. Restart loses those states; persisted outbox entries retry. Multi-server coordination, cross-region routing, ranked ratings and repeated-disconnect abuse controls remain future work.
- Crosshair/input/graphics settings remain in the existing local storage. This add-on does not implement cloud settings sync.
- AI difficulty needs human feedback; no human skill rating is claimed.

For the owner's playtest: restart the dev server, sign into two accounts on the same server, choose the same mode and use Quick Play. Verify held Mouse 1, Space, first-person movement and results. With one player searching, wait five actual minutes, then try both Continue searching and the explicit AI challenge. Confirm Account shows separate human/AI history and XP. Private room codes and offline practice remain available.
