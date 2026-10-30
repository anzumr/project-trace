# Add-on 01: source audit — 2026-10-28

Requested scope: incremental public human matchmaking, explicit Extra Hard AI offer after 300 unmatched seconds, and separately persisted AI results. Preserve completed account/progression infrastructure and existing first-person mechanics.

## Checkout inspected

`C:\Users\anzum\Documents\ChatGPT\Tracer`

This checkout currently contains Phase 5A account integration, not the completed Phase 5 persistence/matchmaking described in the request. No alternative Git branches were listed. The inspected parent directory contains only this Tracer project. This finding concerns local source, not a claim about what may exist in another workspace or the live Supabase database.

| Area | Evidence in current source |
|---|---|
| Authentication | Supabase SDK email/password flow, profiles, username RPC, verified socket identities in `apps/server/src/auth.ts` |
| Database migrations | Only `supabase/migrations/202610270001_accounts.sql`; profiles and private username policy |
| Private multiplayer | `apps/server/src/server.ts` creates/joins in-memory rooms; `game/Room.ts` owns physics, damage and best-of-three results |
| Persistent results/XP | No result persistence service, PvP records, XP award transactions or corresponding migrations found |
| Matchmaking | No public queue events/service; existing participant input queues are movement buffers, not matchmaking |
| Reconnection | Client disables Socket.IO reconnection; server removes a disconnected participant immediately |
| Settings | Client localStorage; Account panel explicitly says synchronized settings are pending |
| Gameplay | Shared 60 Hz movement, jumps, mode scaling, capsule/head tracing, cover occlusion and authoritative held-fire damage |
| Project status | `docs/phase-5-validation.md` marks 5B/5C unimplemented; this agrees with source inspection |

## Integration boundaries after source clarification

1. Locate the completed source/persistence contract before designing schema changes. If the owner confirms this checkout is intended, add only the explicitly authorized missing persistence needed by this add-on, without rebuilding authentication or claiming broader Phase 5 completion.
2. A server-owned queue should reserve each verified account once, match only compatible mode/region entries, and make human pairing/cancel/AI acceptance mutually exclusive transitions. Timer and fallback eligibility originate from server time. A disconnected queue entry must never be paired as an active player.
3. Reuse Room's authoritative simulation. Give matches durable identifiers and an explicit human/AI classification. AI should submit bounded ordinary movement/aim/fire input; it must not modify HP or bypass cover/hitboxes. Observations must be visibility-gated, delayed and imperfect, with bounded aim rotation and prediction from previously visible movement.
4. Define reconnect grace and ownership using verified UUIDs, not a new socket's claimed player name. Rebinding must reconcile client sequence numbers and discard old inputs. Preserve existing private-room behavior unless a reviewed shared change requires otherwise.
5. Persist outcomes through the existing trusted finalization service once located. Match ID uniqueness must make retries idempotent. Keep AI counters and reduced reward rules separate from PvP/ranked counters, including forfeits/cancellations.
6. Verify duplicate queue/pairing races, cancellation, exact 300-second boundary, continued human search, atomic bot acceptance, bot visibility/reaction/movement rules, reconnect ownership, persistence permissions/idempotency, and private-room regression tests. Socket clients are not a substitute for the requested two real browser clients.

No add-on gameplay implementation or live database modification has been made during this source audit. The required source-location/scope clarification is pending. Browser-control tooling was not available in tool discovery; the two-browser acceptance gate must remain explicit until exercised.

Baseline verification on 2026-10-28: `npm.cmd run build` passed (including TypeScript checking); `npm.cmd test` passed 39/39 with localhost socket access. These verify the existing implementation only, not the requested add-on.

Follow-up: the owner supplied a 5A–5E milestone breakdown and the work proceeded in this checkout, preserving 5A and adding the missing result-persistence substrate for the add-on. The owner then applied the new migration and configured the server-only key. See `docs/addon-01.md` and `docs/addon-01-validation.md` for the final implementation and actual local/live verification; the pending statements above describe the initial audit stage.
