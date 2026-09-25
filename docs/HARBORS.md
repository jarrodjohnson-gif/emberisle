# Docks

How the nine coastal docks are dealt. The rule a player reads is on the README. This file is where the code does it.

`src/lib/game/board.ts` builds `harborTypes` as four `any` and one of each resource, shuffles them, and walks the coastal edges in angle order. It places one type on every ninth of that walk, on both corners of the edge (`board.ts` around the `harborTypes` list).

`harborRate` in `src/lib/game/rules.ts` looks at the acting player's buildings. A matching resource dock returns 2. Otherwise an `any` dock returns 3. Otherwise the bank rate is 4.

[docs/harbors-example.png](harbors-example.png) is one legal coast: five 2-for-1 docks and four 3-for-1 docks, sitting on the water edge rather than inland. A deal may rotate types. It keeps those counts.
