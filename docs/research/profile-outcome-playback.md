# Profile outcome playback: source boundaries and prerequisites (#1045)

Research only, updated 2026-11-17 by Codex-p (GPT-6.1 Sol).
Original research: builder-a11y, 2026-11-13; model unrecorded.
Source snapshot: main `787d386185a299d108058f09a40654d7f4d5722b`.
This note changes no host, transport, store, audio, projection, assertion or budget implementation.

## Design references and actual dependency state

Read [profile-media.md](profile-media.md) and
[profiles.md: curated media and playback](../design/profiles.md#curated-media-and-playback)
with the [current #1045 deliverable](https://github.com/jarrodjohnson-gif/emberisle/issues/1045).
They require the actual durable terminal producer, frozen participant attribution and reviewed public playback contract.
Deduplication uses authoritative **host, room and game** identity, not a game-only variable or inferred map/score identity.
Present listeners include watchers. Initial finished-state loads, rejoin, resync and backlog must not replay outcome audio.

#1043 and the #768 research issue are closed. That does not complete #1045 or approve an arbitrary wire payload.
#1044 remains open. Its proposed `playForeground`, `cancelForeground`, `foregroundScope` and `playEndMusic`
helpers belong to `builder-opus/issue-1044`. The main snapshot's sound module does not provide them.
This research does not present that branch as shipped or reserve its builder's files.
Integration must use the reviewed real audio owner after its dependency lands.

## Existing host and privacy boundary

[resultOf](../../server/host.mjs#L300) returns only tracked/wins for a finished room with profile-bound roster rows.
It returns undefined when no such row exists. Putting all playback identity under `result.playback` would miss guest-only games.
The host's internal roster UUID does not itself prove clients receive it.
The future contract must handle profile-free terminal identity without inventing IDs or a parallel publication path.
It must preserve the actual journaled outcome boundary and frozen winner binding.

[profile-seat-prove](../../server/profile-seat-prove.mjs#L631) asserts that private fields, including `winSongId`, never reach table or watcher sockets.
The earlier direct `result.playback.winSongId` example conflicts with that assertion. I withdraw that example.
Closing the #768 research issue does not waive this privacy gate.
This note selects no replacement assertion or public playback field.
Any future owner-approved contract that makes a test obsolete must follow the replacement rule in [DECISIONS](../DECISIONS.md).
Use its own commit, an old/new table and equivalent coverage. Never delete or bypass the assertion.
Otherwise retain the existing assertion unchanged. This note changes no test.

## Listener behavior is a requirement, not working integration

The designed selected-outcome path plays the validated choice for every present listener, including watchers.
The documented default is `win` for the winner and `game_lose` for others.
I withdraw the earlier invented spectator-default sound. This note changes no listener policy.
[Question 6941304872](https://github.com/jarrodjohnson-gif/emberisle/issues/1045#issuecomment-6941304872)
received [desk answer 6941314110](https://github.com/jarrodjohnson-gif/emberisle/issues/1045#issuecomment-6941314110).
The desk gates three things on #1044 and a reviewed public playback contract:
the wire shape, any replacement of the line 631 privacy assertion, and audio integration.
The contract must also cover guest-only games. It requires Opus review for this tier:1 issue.
Any new sound behavior goes to Jarrod. This research selects none of those implementation choices.

Preserve per-listener mute, gesture and Skip controls, cancellation and the reviewed fallback once.
Do not delay gameplay or result recording for audio. Queue end music after actual outcome-clip completion.
Navigation, rematch, cancellation and stale async completion must suppress late fallback/end starts.
These are future acceptance requirements, not evidence that absent #1044 helpers work on main.
This note introduces no gain, priority rank, watcher sound, projection or fixed end-delay rule.

## Future evidence and handoff

#1045 requires registered real-host and audio-stub/browser checks against the real consumers.
Cover live winner/watchers, duplicate host/room/game events, initial completed state, rejoin, resync and rapid rematch.
Include host/room replacement, missing/removed selections, rejected/late playback, duration-based end music and cancellation.
Assert private data stays out of state/chat/playback frames under the reviewed projection contract.
Preserve finish, persistence, rejoin, watch, profile-seat, sounds, music, mixer and budget coverage.
Real iPhone selected/default/mute/Skip listening remains a separate release gate; stubs cannot establish audible acceptance.

For this document revision, I checked cited source facts, repository targets and diff whitespace.
I ran no host, browser, audio-stub or physical-device proof. Earlier PR-body PASS claims are not fresh validation.
This research does not complete #1045 or authorize a protocol/privacy/audio design change.
