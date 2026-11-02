# Circular duel arena

Built from the approved Concept 03 sketch on 2 November 2026. Replaces the square arena in private rooms, Quick Play, AI matches and offline practice.

- Closed circular boundary: 28 m diameter, 6 m outer wall. Movement stays inside the circle at every height.
- Central cylindrical pillar: 4 m diameter, 4.8 m tall, with circular collision and ray intersection rather than a square bounding box.
- Opposite spawns at `(0, 0, ±11.4)`, facing inward. Each has a 6 m wide, 3.2 m tall cover wall directly ahead at `z = ±8.6`, with a route around either end.
- Left/right stairs face the center and climb outward toward the perimeter, following the user's revised direction. Each 4.4 m wide staircase starts at `x = ±8.5` and rises through eight 0.25 m steps to a 2 m high landing at `x = ±12.5`. The landings extend flush to the curved wall, with no outside gap. Stairs can be walked up and down; players can jump from or fall off platform side edges. Tall sides and cover cannot be auto-stepped.
- Industrial grey surfaces, concentric floor markings, red trim and perimeter lights. Competitive graphics hide decorative elements while preserving all gameplay geometry.

`packages/shared/src/arena.ts` owns dimensions and solids. The client renderer in `apps/client/src/game/Arena.ts`, prediction, authoritative movement, shot occlusion and AI all consume this geometry. The existing `COVER` export aliases the round pillar for compatibility; gameplay uses the entire `ARENA_SOLIDS` set. Crouching, scaled modes, elevated shooter eye lines and rewound target heights use the existing shared body/eye helpers.

The practice bot remains on the ground floor, avoids the circular edge and all obstacles, and chooses unobstructed roaming segments. The match AI patrols around spawn cover and uses all obstacles for both sight and navigation. No protocol or database changes are needed.

Validation includes mode-scaled boundary containment, both spawn exits, both staircases in every mode, platform falls/jumps, cylinder sides/caps and shot occlusion. Existing combat fixtures now place players in clear lanes rather than assuming the old offset spawns. Browser acceptance walks a player from spawn up and down stairs using actual keyboard controls and captures `test-results/arena-overview.png`, `arena-spawn.png` and `arena-platform.png` before its multiplayer/AI/practice checks.

Deployment was authorized by the user on 2 November 2026. Restart the development server after these shared/server changes. Deploy client and server together so their map geometry remains identical.

Verified locally: typecheck, all 74 unit/database/network tests, production build and production smoke test, plus the complete two-Chrome acceptance run (keyboard stair traversal, social invitations, human matches/rematches, saved stats, AI and practice). The browser harness fixes its look direction during the keyboard route to isolate desktop mouse movement. A late-snapshot guard also prevents a room already left from reopening while switching activities. The existing bundle-size warning remains; verify the Render rollout and live asset version after pushing.
