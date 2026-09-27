# Hex-id map onto the level (issue #33)

The server's ids are the truth (build bible 10). The level takes its names from them.

## Ids the rules host sends

Source: `src/lib/game/hex.ts`, `src/lib/game/board.ts`.

| Thing | Count | Id format | Example |
|---|---|---|---|
| Hex | 19 | axial `q,r` | `0,0` is the center |
| Vertex | 54 | world `x,z`, 3 decimals | `-2.91,-0.56` |
| Edge | 72 | two vertex ids joined by `\|`, smaller first | `-2.91,-0.56\|-2.91,0.56` |

The build bible's example `h:0,0` and `v:1,0,0` show the shape of the message only. Send the bare ids above.

Hex size is `HEX_SIZE = 1.12` engine units, pointy-top: `x = 1.12·√3·(q + r/2)` and `z = 1.12·1.5·r`.

## Hex actors

Rename each hex slab actor to `Hex_<q>_<r>`, with `m` for a minus sign (Unreal labels read better without `-`). Positions are in Unreal units at 1 engine unit = 100 UU. Engine `z` is Unreal `Y`. If the pack's slabs are a different size, scale every position by `pack_hex_radius / 112`. Do not move the slabs.

| Server id | Actor | Ring | X (UU) | Y (UU) |
|---|---|---|---|---|
| `-2,0` | `Hex_m2_0` | 2 | -388.0 | 0.0 |
| `-2,1` | `Hex_m2_1` | 2 | -291.0 | 168.0 |
| `-2,2` | `Hex_m2_2` | 2 | -194.0 | 336.0 |
| `-1,-1` | `Hex_m1_m1` | 2 | -291.0 | -168.0 |
| `-1,0` | `Hex_m1_0` | 1 | -194.0 | 0.0 |
| `-1,1` | `Hex_m1_1` | 1 | -97.0 | 168.0 |
| `-1,2` | `Hex_m1_2` | 2 | 0.0 | 336.0 |
| `0,-2` | `Hex_0_m2` | 2 | -194.0 | -336.0 |
| `0,-1` | `Hex_0_m1` | 1 | -97.0 | -168.0 |
| `0,0` | `Hex_0_0` | 0 | 0.0 | 0.0 |
| `0,1` | `Hex_0_1` | 1 | 97.0 | 168.0 |
| `0,2` | `Hex_0_2` | 2 | 194.0 | 336.0 |
| `1,-2` | `Hex_1_m2` | 2 | 0.0 | -336.0 |
| `1,-1` | `Hex_1_m1` | 1 | 97.0 | -168.0 |
| `1,0` | `Hex_1_0` | 1 | 194.0 | 0.0 |
| `1,1` | `Hex_1_1` | 2 | 291.0 | 168.0 |
| `2,-2` | `Hex_2_m2` | 2 | 194.0 | -336.0 |
| `2,-1` | `Hex_2_m1` | 2 | 291.0 | -168.0 |
| `2,0` | `Hex_2_0` | 2 | 388.0 | 0.0 |

Ring 0 is the center, ring 1 is 6 hexes, and ring 2 is 12. To match a pack slab to a row, find the slab nearest that X, Y after scaling.

## Terrain is not fixed to an actor

`createGame` shuffles terrain and tokens on every deal. `Hex_0_0` can be fields in one game and wastes in the next. On each `state`, the level reads `game.hexes[i].terrain` and `pip` and swaps the top dressing (grass and sheep, wheat, dunes, rock, pines) on that actor. The white slab stays. If the pack has only one baked island, show it for the first test and add a note on #34. Do not change the server to match the art.

## Vertices and edges

Do not hand-name 54 + 72 actors. At level load (or on the first `state`), spawn one invisible socket actor per `game.vertices[i]` at `(x·100, z·100)` scaled as above, tagged with its id. Do the same for each `game.edges[i]` at the midpoint of `va` and `vb`, rotated along them. Glow and click hit-testing use these sockets (see [placement.md](placement.md)).

## Debug key H

Hold H to draw each hex id at the slab's center, plus the vertex ids within 3 m of the cursor. #35 compares one screenshot against `game.hexes` in the server state.

## Done-when check

- 19 rows, with ids from `hex.ts` (`axialKey`). Generate them with `hexesInRadius(2)`.
- The positions come from `hexToWorld`. Recompute them if `HEX_SIZE` changes.
