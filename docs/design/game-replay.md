# Game replay: unpicked idea

- Parent: [#1450](https://github.com/jarrodjohnson-gif/emberisle/issues/1450), ranked item 10.
- Status: unapproved backlog note; tier 3 documentation correction only.

Jarrod selected awards, dice story and share card on 2026-11-08.
Game replay was not among those picks.
Keeping this PR open does not approve the feature.
Owner Hub comment 6928706929 supersedes the earlier stale-PR closure request.
Desk comment 6946410569 permits factual corrections, without a new protocol or runtime design.

## Current source facts

These observations use main `504cc8e673d4e45310416d9718aac0122f23f3a5`.

- `src/lib/game/rules.ts:7-13` defines `rollDie` using `crypto.getRandomValues`.
- The pre-setup roll-off calls it at line 305.
- The roll action calls it twice at lines 593-594.
- `nextRand` at lines 16-22 advances seeded `state.rng`.
- The theft selection uses `nextRand` at line 421.

The older review's seeded-dice description does not match these current roll calls.
The presence of seeded state alone does not establish seed-only replay of a whole game.
This correction does not design outcome recording or expose hidden random state.

There is no fog-of-war feature to replay.
Existing hidden hands and fortunes do not imply an approved post-game disclosure policy.

`server/host.mjs:424` constructs the existing `ROOMS/<code>.json` path.
Line 455 persists the room snapshot through `writeDurable`.
These are room snapshots, not the proposed `.replay.json` action-log format.

## Withdrawn requirements

The earlier draft prescribed an action-log schema, replay endpoint, retention and viewer controls.
It also prescribed post-game hidden-information disclosure, snapshot caching and new proofs.
Those prescriptions are withdrawn as implementation requirements.
The claimed per-game storage size was not a measured allocation.
No protocol, privacy policy, RNG disclosure, storage budget or replay UI is approved here.

Any future replay proposal needs an owner choice and a separately scoped issue.
Existing runtime behavior and privacy boundaries remain authoritative.
