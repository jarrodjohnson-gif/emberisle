# Profile media: runtime boundaries

Research for #768, checked against main `30737a5c81f194b1c6235c1409555ee8e6cb19bd` on 2026-10-23.
Builder: Codex-open-table-833 (GPT-6.1 Sol), with same-model read-only source tracing.
This report changes no runtime code and claims no playback validation or new design approval.

The category mixer exists. Profile song selection, verified custom bindings, profile arrivals,
authoritative outcome playback and an exclusive long-clip owner do not exist on this main.
The next leaves are [#1043](https://github.com/jarrodjohnson-gif/emberisle/issues/1043),
[#1044](https://github.com/jarrodjohnson-gif/emberisle/issues/1044) and
[#1045](https://github.com/jarrodjohnson-gif/emberisle/issues/1045). They are Backlog, reserve no
runtime files and remain blocked by their stated dependencies and the decisions below.

## What is implemented

| Boundary | Current source | Consequence for integration |
|---|---|---|
| Mixer | [sound-settings.ts](../../src/lib/sound-settings.ts#L4), [live volume updates](../../src/lib/sound.ts#L323); #980/#981 are merged | Four categories, persisted master/category settings and multiplicative gain are available. Reuse them. The Sound sheet in #669 is a separate, still-open surface. |
| Profile owner response | [ownerView](../../server/profiles.mjs#L53), [wire allowlist](../../server/profile-protocol.mjs#L75) | `winSongId` is returned to the owner. This field alone is not a selection API. |
| Profile creation/storage | [stored shape](../../server/profiles.mjs#L96), [creation](../../server/profiles.mjs#L335) | Creation sets `winSongId` and `mediaKey` to null. Stored strings have a shape/length check, not catalogue or binding authorization. No selection writer consumes them. |
| Public profile data | [seat/card projections](../../server/profiles.mjs#L65), [seat envelope](../../server/host.mjs#L182), [table-card authorization](../../server/profile-protocol.mjs#L189) | Seats/cards omit selected songs and bindings. Public profile IDs already exist; a profile ID must not be mistaken for a secret credential. Table-card access is limited to the socket's current visible profiles. |
| Game identity | [freezeRoster](../../server/host.mjs#L203), [load validation](../../server/host.mjs#L210), [snapshot](../../server/host.mjs#L264) | The host owns the UUID and frozen participant attribution, but keeps them in room metadata. Start/rematch call it at [start](../../server/host.mjs#L967) and [rematch](../../server/host.mjs#L1058). |
| Client state | [state publication](../../server/host.mjs#L638), [resync](../../server/host.mjs#L680), [watch baseline](../../server/host.mjs#L952), [TableEvents](../../src/lib/net/table.ts#L85) | There is no authoritative `gameId` or media projection for the audio receiver. A map signature, player name or local animation cannot substitute for it. |
| Terminal result | [engine winner](../../src/lib/game/rules.ts#L264), [ordinary save scheduling](../../server/host.mjs#L245) | The engine's winner is authoritative for rules. Durable-before-publication outcome freezing/journalling is proposed by #889 / unmerged PR #997, not an implemented main consumer. |
| Profile edit/results | [current protocol routes](../../server/profile-protocol.mjs#L7), [store API](../../server/profiles.mjs#L430) | #763 / PR #857 is unmerged. #890 receipts/history and #891 deletion remain Backlog. Neither proposed APIs nor the journal may be treated as available runtime code. |

There is no shared profile song catalogue, profile selector, verified local custom-binding
operation or profile-media manifest consumer in this source tree. The static sound-role map
and readable soundboard labels are different contracts. The approved background track in
[sound.md](../design/sound.md#game-music-814) is not, by itself, a selectable win-song list.
No existing track is added to such a list by this report.

## Playback and cancellation matrix

These rows describe actual callers, not the older sound design's historical line numbers.
Priority and mix category are separate concerns: moving ownership must not silently move an
existing clip to another category or change its caller gain.

| Role | Current producer/consumer and mix | Current ownership, deduplication and cancellation | Accepted target / missing boundary |
|---|---|---|---|
| Shared selected win song | No host selection, public playback event or client consumer | None | Owner-selected, host-validated catalogue key; Music category; every listener present at completion, including watchers. #1043 then #1045. |
| Custom win / optional personal loss | No authorized binding or custom outcome consumer | None | Explicit owner selection plus current verified UUID binding; personal loss never overlaps selected winner music. Custom implementation stays gated on visibility and binding contracts. |
| First profile arrival | No event or opt-in consumer | None | Once per room, present opted-in seated listeners only; no replay on rejoin, edit or rematch and no chat/backlog transport. Host attachment is in [seatCredential](../../server/profile-protocol.mjs#L146); the existing client [seat receiver](../../src/lib/net/table.ts#L5) is not an arrival producer. |
| Game start | [practice start](../../src/lib/game/store.ts#L592), [online setup transition](../../src/lib/game/store.ts#L138); gain 0.5, Music | Session signature prevents the usual repeated setup request. Hotseat/watchers do not request this role. [First dice landing](../../src/lib/sound.ts#L168) pauses the active start clip; there is no general Leave/rematch cancellation for queued and active starts. | Route the actual callers through the reviewed owner, without changing their listener policy. |
| Match point | [threshold/dedup](../../src/lib/game/store.ts#L68), [caller](../../src/lib/game/store.ts#L148); gain 0.5, Memes | Public-score crossing is deduplicated by the existing game signature. No foreground priority/cancellation owner. | Preserve the current Memes assignment while adding the accepted priority. Do not derive outcome UUID identity from this signature. |
| Soundboard | [received event](../../src/lib/game/store.ts#L1163), [end-screen React](../../src/components/game/WinScreen.tsx#L197); gain 0.4, Memes | Sender mute gates receipt; it does not cancel already-playing audio. Different symbolic roles can overlap. | Drop blocked requests; apply sender/category/master gates and foreground ownership. A soundboard label is not a profile song permission. |
| Default win/loss | [soundsFor](../../src/lib/game/store.ts#L36), [live outcome handling](../../src/lib/game/store.ts#L121); win gain 1, Game; loss gain 0.5, Music | State transitions choose the role. A fresh finished-state load has no preceding state and stays quiet. Watchers have [empty local ID](../../src/lib/game/store.ts#L1177) and currently take the default win path. This is not selected-winner playback for every present listener. | Preserve approved fallback once, add authoritative UUID deduplication and the reviewed selected-song path. |
| End music | [fixed timer](../../src/lib/game/store.ts#L85), [seated live transition](../../src/lib/game/store.ts#L143); gain 0.5, Music | Starts after 1,500 ms rather than clip completion. Named `stop` cancels playing, queued and delayed instances. Leave/new game/rematch/disconnect and global mute call the existing end-music stop. | Wait for actual selected-outcome completion; cancellation must suppress the entire sequence and every late completion. |
| Background loop | [screen owner](../../src/components/game/EmberisleApp.tsx#L38), [separate player](../../src/lib/sound.ts#L292); base gain 0.25, Music | Pauses on mute/category zero/music-off; resets when the screen no longer wants it. Existing designated stings duck it. Autoplay retries recheck current flags. | Its relationship to the exclusive long-clip rule needs an explicit reviewed reading. Do not silently delete the approved loop or invent a new overlap/ducking policy. |

The [cached clips](../../src/lib/sound.ts#L163) own one audio element per symbolic role, not
one foreground channel. The [150 ms / eight-entry pacing queue](../../src/lib/sound.ts#L145)
is burst control, not priority arbitration. [Delayed playback](../../src/lib/sound.ts#L196)
has no host/room/game generation guard. [Named stop](../../src/lib/sound.ts#L208) is useful,
but calling it for end music does not cancel every other role.

Global/category mute updates active ordinary clips to zero volume; ordinary playback and
pending work are not generally invalidated. Unmuting can expose a remaining tail. The mixer
engine's immediate gain behavior therefore does not prove the stronger profile cancellation
contract. [Look around/Escape](../../src/components/game/WinScreen.tsx#L45) only hide the
panel today. [Page visibility handling](../../src/lib/game/store.ts#L1267) wakes networking;
it does not cancel an outcome. #539's general Skip support is still open, and no existing
profile-audio Skip control can be assumed.

## Adapter boundaries for review

These are integration constraints for the filed leaves, not new accepted message schemas.

1. **Catalogue and owner write (#1043).** A reviewed shared catalogue must be consumed by real
   host validation and the later #766 selector. Extend the authenticated edit boundary only
   after #763 lands; preserve null creation, clearing, rename and shared selection. Paths,
   URLs and arbitrary client keys are never accepted. Keep custom options out of public
   metadata and out of this first shared-only leaf.
2. **Audio owner (#1044).** Wire existing start, match-point, soundboard, default outcome and
   end callers in `sound.ts` / `store.ts`, plus actual approved hide/Skip callers. Use the
   existing category settings and gesture path. The accepted priority is outcome, start,
   match point, soundboard, arrival, end. Blocked arrivals/soundboard requests are dropped;
   preempted work never resumes. Only cancellable end music may wait behind its outcome.
   Short gameplay cues keep their own category and may coexist as already specified.
3. **Authoritative outcome (#1045).** Consume #889's real durable terminal producer and frozen
   roster, not a second `pushState`/resync/watch publication path. Resolve the winning profile
   through frozen attribution. Carry only the reviewed public playback projection, deduplicate
   against authoritative host/room/game identity, and suppress initial-finished-state replay.
   Listener audio does not wait for #890's later aggregate transaction once the independent
   outcome is durable. Freeze/revalidate playback metadata at the reviewed terminal boundary;
   do not let a late lookup or completion switch the sequence after navigation/rematch.

This is the next layer, not authorization to implement every profile-media surface at once.
Arrival opt-in/production and verified custom administration need a later decomposition when
their reviewed consumer contracts exist. Their known targets are #766's real profile/lobby
surface, `server/profile-protocol.mjs` attachment authorization, `server/host.mjs` room
lifecycle, and `src/lib/net/table.ts` / `store.ts` live event handling. No unused arrival API,
parallel mixer or automatic name-based binding should be shipped in anticipation of them.

All three leaves are Backlog and reserve no files. #1043 waits on #763 and this contract;
#1044 waits on #669's reservation, #539 and this contract; #1045 waits on both leaves and
#889. Existing #766 owns its selector UI, #890 owns recording/history and #891 owns deletion.
No duplicate UI, result store or terminal journal is proposed here.

## Decisions and privacy gate

The [question on #768](https://github.com/jarrodjohnson-gif/emberisle/issues/768#issuecomment-6368047928)
asks for the actual approved shared catalogue, the allowed custom playback disclosure and
the existing background loop's relationship to foreground exclusivity. None is settled by
this report. Suggested readings there are recommendations, not accepted policies.

The private relation between a profile and a custom asset is distinct from hiding the profile
ID itself: current seats already expose an opaque profile ID. Publicly playing a selected
asset for a publicly known winner can reveal an association even if the admin binding table
never leaves disk. Opaque filenames do not remove that inference. Do not promise stronger
privacy, publish a friend-to-asset mapping or choose aliases as a workaround. Final custom
selection/projection leaves wait for the reviewed visibility contract.

The newer [profile playback contract](../design/profiles.md#curated-media-and-playback)
controls: intro/lose clips at most five seconds, win clips at most 15; arrival gain 0.15 capped
at 0.25; proposed personal-outcome gain 0.5; no uploads, seeds, arbitrary URLs or runtime
conversion. Preserve [handover provenance/size limits](../design/sound.md#handing-over-clips)
and receiver controls. The background music amendment is newer than the older no-loop row;
the newer profile priority is not the older sound design's historical proposal. Conflicting
ambience defaults in #662/#669 are outside this research's authority to choose.

## Proof and release boundary

The implementation leaves require registered real-module audio stubs and real-host tests:
owner/foreign credentials, ID validation/removal/clearing, explicit projections, present
watchers, duplicate UUIDs, fresh completed-state loads, priority collisions, every mute/Skip/
hide/Leave/rematch cancellation, rejected/late play promises and stale `ended` events. A
deliberately omitted ownership or generation check must fail. No assertion or size budget
may be relaxed to integrate this work.

Stubs cannot prove iPhone autoplay, audible level, clipping, overlapping playback or the
device's hide/resume behavior. Release also needs an actual iPhone gesture/playback run with
selected/default outcomes, present watchers, mute/Skip/hide and rapid rematch, plus listening
to the actual approved assets. No such listening or device run was performed for this report.

Research validation is limited to a fresh-clone check of source references, tracker links,
scope and whitespace. No runtime, audio, browser, host or iPhone validation is claimed.
