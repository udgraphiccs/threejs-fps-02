# Dustline Yard — a three.js tactical FPS

A round-based, Counter-Strike-style FPS that runs offline from static files.
One player (Vanguard) against five Rustjackal bots in a freight yard at dusk.

- **Rounds:** first to 5 (max 9), 100 seconds each. Win by eliminating the
  other side, or by planting the spike at site A or B and holding it through
  its 35-second fuse. Bots retake and defuse.
- **Money & buy menu:** $800 to start; $3,250 a round win, $1,900 a loss,
  $300 a kill, $300 a plant. Buy the Hornet-9 SMG ($1,500), Longshot-7 rifle
  ($2,700), Needle-50 sniper ($4,750, right-click scope), spark grenades
  ($400, blinds bots) and plating ($650).
- **Gunplay:** hitscan with headshot multipliers, recoil and spread that
  punish firing on the move, acceleration/crouch/jump movement with AABB
  collision against the map.
- **Bots:** waypoint patrols, line-of-sight engagement with burst fire and
  strafing, investigation of heard gunfire, and site retakes to defuse.
- **Map:** an original 36×30 m yard — two sites, a mid lane, container rows,
  crates and a gantry — with a dusk amber/teal palette and synthesised
  WebAudio sound (no audio files, no network).

Play it: `node serve.ts`, then open http://localhost:8080.
