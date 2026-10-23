# Profile media: runtime boundaries

Research checkpoint for #768, based on main `30737a5c81f194b1c6235c1409555ee8e6cb19bd`, 2026-10-23.
Builder: Codex-open-table-833 (GPT-6.1 Sol), with same-model read-only source tracing.

**Unvalidated checkpoint:** the execution environment became unavailable during corrections and final fresh-clone reference checks (`exec-server transport closed`). This report was preserved through GitHub access; fresh-clone link, source-reference, scope and whitespace checks remain unrun on this checkpoint. No runtime, audio, browser, host, listening or iPhone validation is claimed.

The category mixer exists. Profile song selection, verified custom bindings, profile arrivals, authoritative outcome playback and an exclusive long-clip owner do not exist on the audited main. The next bounded leaves are [#1043](https://github.com/jarrodjohnson-gif/emberisle/issues/1043), [#1044](https://github.com/jarrodjohnson-gif/emberisle/issues/1044) and [#1045](https://github.com/jarrodjohnson-gif/emberisle/issues/1045). They are Backlog, reserve no runtime files and remain blocked by their stated dependencies and the decisions below.

## Implemented boundaries

| Boundary | Current source | Integration consequence |
|---|---|---|
| Mixer | [sound-settings.ts](../../src/lib/sound-settings.ts#L4), [live volumes](../../src/lib/sound.ts#L323); #980/#981 merged | Four persisted categories and multiplicative master/category/caller gain exist. Reuse them; the Sound sheet in #669 is separate and open. |
| Owner response | [ownerView](../../server/profiles.mjs#L53), [wire allowlist](../../server/profile-protocol.mjs#L75) | The owner sees `winSongId`; this does not establish a selection writer or catalogue. |
| Stored/created media | [shape check](../../server/profiles.mjs#L96), [creation](../../server/profiles.mjs#L335) | Creation sets `winSongId` and `mediaKey` to null. Stored strings have length/shape validation, not catalogue or binding authorization. |
| Public profile data | [seat/card projections](../../server/profiles.mjs#L65), [seat envelope](../../server/host.mjs#L182), [table-card gate](../../server/profile-protocol.mjs#L189) | Songs and bindings are omitted. Public profile IDs already exist and are not credentials. Table cards are scoped to the requesting socket's current visible profiles. |
| Game identity | [freezeRoster](../../server/host.mjs#L203), [load validation](../../server/host.mjs#L210), [snapshot](../../server/host.mjs#L264) | The host owns the UUID and frozen participant attribution in private room metadata; it creates them at [start](../../server/host.mjs#L967) and [rematch](../../server/host.mjs#L1058). |
| Client state | [state publication](../../server/host.mjs#L638), [resync](../../server/host.mjs#L680), [watch baseline](../../server/host.mjs#L952), [TableEvents](../../src/lib/net/table.ts#L85) | Clients receive neither authoritative `gameId` nor media playback metadata. Names, map signatures and local animation cannot substitute. |
| Terminal durability | [engine winner](../../src/lib/game/rules.ts#L264), [ordinary saves](../../server/host.mjs#L245) | Rules choose the winner. Durable-before-publication freezing/journalling is proposed by #889 / unmerged PR #997, not available on main. |
| Edit/results APIs | [current routes](../../server/profile-protocol.mjs#L7), [store API](../../server/profiles.mjs#L430) | #763 / PR #857 is unmerged; #890 receipts/history and #891 deletion remain Backlog. Proposed APIs cannot be treated as implemented consumers. |

There is no shared profile-song catalogue, selector, verified custom-binding operation or custom manifest consumer in this tree. Static sound roles and soundboard labels are different contracts. The approved track in [Game music](../design/sound.md#game-music-814) is not, by itself, a selectable win-song list. This report assigns no existing asset to such a list.

## Playback and cancellation matrix

These are actual callers. Foreground priority and mix category are separate: adding an owner must not silently change an existing clip's category or caller gain.

| Role | Current producer/consumer | Ownership/cancellation today | Accepted target or gate |
|---|---|---|---|
| Shared selected win | No selection API, event or receiver | None | Explicit owner choice, host-validated ID, Music category, every listener present at completion including watchers. #1043 then #1045. |
| Custom win / personal loss | No authorized binding or consumer | None | Custom wins require explicit owner selection and current verified UUID binding. Personal loss cannot overlap selected winner music; its selection mechanism is unspecified. Custom work remains gated. |
| First profile arrival | No event or opt-in consumer | None | Once per room to present opted-in seated listeners, no rejoin/edit/rematch replay and no chat/backlog transport. [seatCredential](../../server/profile-protocol.mjs#L168) authorizes attachment; the [seat receiver](../../src/lib/net/table.ts#L5) does not produce arrivals. |
| Game start | [Practice](../../src/lib/game/store.ts#L592), [online setup](../../src/lib/game/store.ts#L138); gain 0.5, Music | Session-signature dedup; hotseat/watchers do not request it. [First dice landing](../../src/lib/sound.ts#L168) pauses the active start clip, without general queued/active Leave/rematch cancellation. | Wire actual callers through the reviewed owner while retaining their listener policy. |
| Match point | [Threshold/dedup](../../src/lib/game/store.ts#L68), [caller](../../src/lib/game/store.ts#L148); gain 0.5, Memes | Public-score crossing uses an existing game signature; no priority/cancellation owner. | Preserve the Memes assignment. This signature is not an outcome UUID. |
| Soundboard | [Received event](../../src/lib/game/store.ts#L1163), [end-screen React](../../src/components/game/WinScreen.tsx#L197); gain 0.4, Memes | Sender mute gates receipt, not already-playing audio. Different symbolic roles overlap. | Drop blocked requests; retain sender/category/master gates. A soundboard label is not profile-song authorization. |
| Default win/loss | [soundsFor](../../src/lib/game/store.ts#L36), [live outcome](../../src/lib/game/store.ts#L121); win gain 1, Game; loss gain 0.5, Music | State transition chooses the role. Fresh finished-state load stays quiet. Watchers have [empty local ID](../../src/lib/game/store.ts#L1177) and currently take default win, not loss. No selected-winner event exists. | Preserve approved fallback once; add authoritative identity and the selected-song receiver. |
| End music | [1,500 ms timer](../../src/lib/game/store.ts#L85), [live seated transition](../../src/lib/game/store.ts#L143); gain 0.5, Music | Named stop cancels active/queued/delayed instances. Leave, new game, rematch, terminal connection closure and global mute call it; transient reconnects do not. | Wait for actual selected-outcome completion; cancellation suppresses all late sequence completion. |
| Background loop | [Screen owner](../../src/components/game/EmberisleApp.tsx#L38), [separate player](../../src/lib/sound.ts#L292); base gain 0.25, Music | Pauses for mute/category zero/music-off; resets when the screen no longer wants it. Designated stings duck it. Autoplay retries recheck current flags. | Its relationship to foreground exclusivity needs a reviewed reading. Do not silently remove the approved loop or invent overlap/ducking policy. |

[Cached clips](../../src/lib/sound.ts#L163) own one audio element per symbolic role, not one foreground channel. The [150 ms/eight-entry pacing queue](../../src/lib/sound.ts#L145) is burst control, not arbitration. [Delayed playback](../../src/lib/sound.ts#L196) has no host/room/game generation guard. [Named stop](../../src/lib/sound.ts#L208) is useful but stopping end music does not cancel other roles.

Global/category mute updates ordinary active clip volumes to zero without generally invalidating playback or pending requests; unmuting can expose a remaining tail. The mixer engine's immediate gain behavior does not prove the stronger profile cancellation contract. [Look around/Escape](../../src/components/game/WinScreen.tsx#L45) only hide the panel. [Visibility handling](../../src/lib/game/store.ts#L1267) wakes networking, not audio cancellation. #539 remains open; a profile-audio Skip control is not an available consumer.

## Bounded adapters for review

These are integration constraints, not newly accepted wire schemas.

- **#1043, catalogue/owner write:** a reviewed shared catalogue must be consumed by real host validation and the later #766 selector. Extend the authenticated edit boundary after #763 lands. Preserve null creation, clearing, rename and shared selection. Reject paths, URLs, unlisted IDs and foreign credentials. Keep custom permissions and private bindings out of this shared-only leaf. Proposed module `src/lib/profile-songs.ts` must have actual consumers, not be a dormant selector API.
- **#1044, foreground owner:** wire existing start, match-point, soundboard, default outcome and end callers in `sound.ts`/`store.ts`, plus the actual approved hide/Skip callers. Use the current mixer and gesture path. Accepted priority: outcome, start, match point, soundboard, arrival, end. Drop blocked arrival/soundboard requests; never resume preempted work. Only cancellable end music may wait behind its outcome. Keep short gameplay cues in their category.
- **#1045, authoritative shared outcome:** consume #889's actual durable terminal producer and frozen roster, not a parallel pushState/resync/watch publication path. Resolve the winner through frozen attribution. Send only the reviewed public playback projection, deduplicate by authoritative host/room/game identity and suppress initial-finished-state replay. Audio need not wait for #890's aggregate transaction after the independent outcome is durable. Review playback snapshot timing at the terminal boundary; late lookups or completions cannot switch/restart another table's sequence. This first leaf is shared-only, without personal-loss selection or custom binding.

This is the next layer, not an all-at-once implementation. Arrival opt-in/production and verified custom administration need later decomposition when reviewed consumers exist. Known targets are #766's real profile/lobby surface, `server/profile-protocol.mjs` attachment authorization, `server/host.mjs` lifecycle and `src/lib/net/table.ts`/`store.ts` live events. Do not ship an unused arrival API, automatic name-based binding or parallel mixer.

#1043 waits on #763 and #768; #1044 on #669's reservation, #539 and #768; #1045 on both leaves, #889 and #768. Existing #766 owns the selector UI, #890 recording/history and #891 deletion. All leaves are Backlog and reserve no files.

## Decisions and privacy

The [question on #768](https://github.com/jarrodjohnson-gif/emberisle/issues/768#issuecomment-6368047928) requests the approved shared catalogue, permitted custom playback disclosure and the background loop's relationship to foreground exclusivity. Recommendations there are not accepted policies.

The private profile-to-custom-asset relation differs from hiding profile IDs: seats already expose an opaque profile ID. Playing a selected public asset for a publicly known winner can reveal an association even when the admin binding table never leaves disk. Opaque filenames do not remove that inference. Do not promise stronger secrecy, publish a friend-to-asset mapping or invent aliases. Final custom selection/projection leaves wait for a reviewed visibility contract.

The newer [profile playback contract](../design/profiles.md#curated-media-and-playback) controls: intro/lose at most five seconds; win at most 15; arrival gain 0.15 capped at 0.25; proposed personal-outcome gain 0.5. No uploads, seed imports, arbitrary URLs or runtime conversion. Preserve [handover provenance/size limits](../design/sound.md#handing-over-clips) and receiver controls. The background-music amendment supersedes the old no-loop row; newer profile priority is distinct from the old sound proposal. Conflicting ambience defaults in #662/#669 are not resolved here.

## Proof and release boundary

Implementation leaves require registered real-module audio stubs and real-host checks: owner/foreign credentials, valid/removed/cleared IDs, explicit projections, present watchers, duplicate UUIDs, initial completed-state loads, priority collisions, relevant mute/Skip/hide/Leave/rematch cancellation, rejected/late play promises and stale ended events. Deliberately missing ownership or generation guards must fail. Existing assertions and size budgets stay intact.

Stubs cannot establish iPhone autoplay, audible level, clipping, overlap or hide/resume behavior. Release also needs a real iPhone gesture/playback run for selected/default outcomes, present watchers, mute/Skip/hide and rapid rematch, and listening to the actual approved assets. None was performed for this report.

Same-model source verification caught and corrected two distinctions preserved in this checkpoint: custom-win explicit selection does not establish a personal-loss selector, and terminal closure cancellation does not cover transient reconnects. Fresh-clone reference/anchor/scope/whitespace validation is still required before this draft is ready. No runtime validation is claimed.
