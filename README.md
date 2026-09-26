# Emberisle

A private island settler for friends on their own computers. One person runs the table. The others join with a four-character code. The island is the art pack. This repo is the rules and the host.

Work is not listed here. It lives in the [milestone issues](https://github.com/jarrodjohnson-gif/emberisle/issues?q=is%3Aopen). Agents follow [docs/TRACKING.md](docs/TRACKING.md).

## Rule set

Three or four players. First to 10 points wins. One island of 19 hexes.

### Land

Each hex is forest, clay hills, pasture, fields, mountains, or the wastes. A token from 2 to 12 sits on every hex except the wastes. There is no 7 token. The wastes produce nothing.

### Pieces

| Piece | Cost | You start with |
|---|---|---|
| Path | 1 timber, 1 clay | 15 |
| Outpost | 1 timber, 1 clay, 1 wool, 1 grain | 5 |
| Stronghold | 2 ore, 3 grain, on an outpost you own | 4 |
| Fortune | 1 wool, 1 grain, 1 ore | a shared deck of 25 |

The deck is 14 knights, 2 path-building, 2 plenty, 2 monopoly, and 5 hidden points. A fortune bought this turn cannot be played this turn. A knight may be played before the roll.

### Points

An outpost is 1. A stronghold is 2. The longest path is 2, and it takes at least 5 segments to hold it. The largest army is 2, and it takes at least 3 knights to hold it. A tie does not take either award away. Hidden points stay hidden until the end.

### Setup

Seat order, then the reverse. Each turn in setup is one outpost and one path from it. Only the second outpost pays starting goods: one card for each hex it touches.

An outpost must not touch another building, including your own. After setup, a new outpost must also touch one of your paths. A path must touch your own path or building.

### A turn

Roll two dice. The server rolls. Sums that match a token pay every building on that hex, unless the wayfarer is standing there. An outpost takes 1. A stronghold takes 2. If the bank cannot pay everyone for a resource, nobody gets that resource.

Then you may trade, build, buy fortunes, and play fortunes bought on an earlier turn. Pass ends the turn.

### A seven

Anyone with more than 7 cards discards half, rounded down. Then the roller moves the wayfarer onto a different hex and may steal one random card from a player who has a building there.

### Docks

There are 9 docks, on the coast, spaced around the island. You do not get one for sitting down.

- 5 are 2-for-1, one for each resource: timber, clay, wool, grain, ore.
- 4 are 3-for-1, and those take any resource.

You get a dock's rate only when a building of yours sits on one of that dock's two corners. Otherwise the bank is 4 of one resource for 1 of another. A specific dock beats a 3-for-1, and a 3-for-1 beats the bank. The bank pays only if it still has the card.

The picture in [docs/harbors-example.png](docs/harbors-example.png) is one legal coast. A new game uses the same nine docks and may rotate which type sits where. It does not add docks, and it does not give a player their own 2-for-1.

### Bank

The bank starts with 19 of each resource.

## Names

Say timber, clay, wool, grain, ore, outpost, stronghold, path, fortune, and wayfarer. The window title is Emberisle.
