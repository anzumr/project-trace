# Rematches, friends and leaderboards

Implemented 2 November 2026. Apply `supabase/migrations/202611020001_social_leaderboards.sql` once in the Supabase SQL editor, after the four existing migrations, **before deploying this version**. No new environment variables or services are required. The migration is not applied automatically by the app.

Live migration status: the user confirmed applying this migration on 2 November 2026. Do not run it again on that database. Deployment from `codex/initial-release` was authorized on 2 November 2026; verify the Render rollout after pushing.

## Player flows

- Human matches (Quick Play and private rooms) offer **REMATCH** on the final results screen. The opponent sees **ACCEPT REMATCH**; both must approve. The match menu also offers **APPROVE MODE & REMATCH**. Both players must remain connected. Leave room declines by leaving; a departed player cannot be readied by the other player. AI rematches remain unavailable.
- **Friends** in the top bar opens the social hub. Add an exact username, case-insensitively. Incoming requests support accept/decline; outgoing requests support cancel. Accepted friends can be removed.
- **Invite to duel** creates a private lobby or reuses the inviter's empty private lobby. The recipient gets a badge and an invitation in Friends. **Join duel** uses the normal server join checks; full, closed or started rooms cannot be joined. Leave any current room/queue/practice before joining. Invites expire after ten minutes and can be dismissed. The inviter returns to the room automatically when the friend joins.
- Friends and incoming invites refresh every 15 seconds while the browser tab is visible, with a manual refresh button. This is not online-presence tracking, and no emails or push notifications are sent.
- **Leaderboards** offers global and friends-plus-self rankings to signed-in users. Quick Play, private duels and Extra Hard AI each have separate rankings, across character modes. Sort by wins, win percentage, accuracy, damage or longest tracking streak; filter by minimum match count. Results are paginated in batches of 50.

## Data and security

The new `friendships` and `duel_invites` tables have RLS enabled and no browser table privileges. Security-definer RPCs `social_state` and `social_action` use `auth.uid()`, never a client-supplied actor. Requests are unique per unordered pair; only the recipient can accept. Either participant can cancel/remove. Only accepted friends can invite. Removing a friendship deletes invitations in either direction. Limits: 200 relationships including pending requests, 50 outgoing pending requests, and 30 seconds between invitations to the same friend. One invite per sender/recipient is retained; expired invites are hidden and overwritten on the next invite.

The `leaderboard` RPC publishes usernames and aggregate saved gameplay stats to authenticated users. It does not broaden read access to profiles, match history, emails or raw account data. Friends rankings include only accepted friends and the viewer. Existing server-only result persistence remains authoritative.

Win percentage = wins / (wins + losses); loss percentage uses the same denominator. Forfeits count, cancelled matches do not. Accuracy = tracked firing time / attack time; no attack time displays a dash. Damage is total damage, and streak is the longest continuous tracking time. Sort uses the chosen metric descending, then wins descending, username and user ID for deterministic pagination. There is no skill rating or minimum-games requirement beyond the selected filter.

Each rematch receives a new result ID and resets rounds, stats and result status. The matchmaking cleanup timer resets between matches. Old asynchronous outbox completions cannot overwrite a new match's save status.

## Verification and deployment

Run `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:production` and `npm.cmd run test:browser`. Database tests execute all five migrations in embedded PostgreSQL and verify social permissions, invitation lifecycle, friendship isolation, ranking calculations and existing RLS. The browser script uses fixture authentication and real PostgreSQL RPCs for the new flows. `--live` requires the migration on the live database and explicitly creates temporary QA accounts.

After applying the migration and deploying, check with two real accounts: request/accept friendship, invite/join a private room, finish a human match and rematch, and compare saved rankings. Supabase migration and production deployment are separate manual steps; local checks do not perform them.

Local verification passed: typecheck, 67 tests, production build, production smoke test, and the full two-Chrome acceptance script including friends/invites, rematch consent, leaderboard filters, AI and practice. Screenshots are in `test-results/social-hub.png` and `test-results/leaderboards.png`. The existing >500 kB client chunk warning remains. Live authentication and the live database were not exercised.
