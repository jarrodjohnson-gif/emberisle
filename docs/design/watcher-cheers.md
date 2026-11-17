# Watcher cheers: unpicked idea

- Parent: [#1450](https://github.com/jarrodjohnson-gif/emberisle/issues/1450), ranked item 7.
- Status: unapproved backlog note; tier 3 documentation correction only.

Jarrod selected awards, dice story and share card on 2026-11-08.
Watcher cheers were not among those picks.
Keeping this PR open does not approve the feature.
Owner Hub comment 6928706929 supersedes the earlier stale-PR closure request.
Desk comment 6946410569 permits factual corrections and withdrawal of unsupported requirements.

## Accepted watcher boundary

The accepted [spectator contract](spectator.md) records Jarrod's decision at line 15:

> Can a watcher talk? **No.** It receives chat and reactions and sends neither.

That contract remains authoritative.
Watcher cheers would change that permission and therefore need an owner decision.
This note does not grant that permission.

## Current source facts

These observations use main `c770fc04490a531c9dd729a2c388665d5ea467b2`.

`server/host.mjs:1533` assigns the watching room to `ws.watch`.
Its existing seated-chat emoji allowlist at line 1981 contains these six strings:

- 😠
- 😊
- 👏
- 😂
- 🔥
- 🐑

An existing emoji set does not authorize watcher messages.
The watcher dispatch branch at line 2100 retains the watching-only boundary.

## Withdrawn requirements

The earlier draft prescribed cheer frames, watcher sending, throttles and coalescing.
It also prescribed bubble origins, appearance, lifetime, motion and audio behavior.
Those are withdrawn as implementation requirements.
The zero-byte growth and performance claims were not measured grants.
No new permission, protocol, rate limit, sound, look, budget or proof follows from this note.

Any future proposal needs an owner choice and a separately scoped issue.
It must reconcile the accepted spectator contract before implementation.
