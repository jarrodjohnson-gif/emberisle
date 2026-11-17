# Shared win-song selector: remaining integration (#1351)

Research only, updated 2026-11-17 by Codex-p (GPT-6.1 Sol).
Original note: finish-budget, 2026-11-13; model unrecorded.
Source snapshot: main `726c8f329f80727a994495303e2f67bf4bf44784`.

The accepted specification is [profiles.md](../design/profiles.md), particularly
[identity fields](../design/profiles.md#identity-and-editing),
[Profile and Wins surfaces](../design/profiles.md#profile-and-wins-surfaces),
and [curated media and playback](../design/profiles.md#curated-media-and-playback). This note does not replace that design.
Players explicitly choose a shared catalogue song; clearing restores the default.
The accepted completed-game contract plays the winner's validated choice for every
present listener, including watchers. Keeping a choice out of public seat data
during play does not mean other listeners never hear it. Custom assets remain
subject to the accepted binding/projection gates and #1351 dependencies.

## Actual gap: client and sheet integration

The host already [validates song edits](../../server/profiles.mjs#L262).
Its [profileEdit](../../server/profiles.mjs#L696) validates the credential, rejects
signed-out callers and rechecks authorization after queued work. The old note's
server `authOwner()` call was incorrect; it is not a server function.

The remaining selector integration is not just markup:
[ProfileFields](../../src/lib/net/profiles.ts#L14) and
[fieldsOf](../../src/lib/net/profiles.ts#L226) do not include `winSongId`, although
the owner snapshot already has it. [ProfileForms](../../src/components/game/ProfileForms.tsx#L70)
builds the existing edit fields without a song choice. The approved selector must
connect explicit choice/clearing through the client edit path and sheet form;
this document implements none of those changes and chooses no new control or preview.

#1351's real-host completion test remains selection, clearing, rename preservation,
invalid-ID rejection and unauthorized custom-ID rejection. Its #766/#768 dependencies
and the accepted playback consumer remain separate work. No new projection contract,
preview mechanism, chunk budget or measured headroom is established here.

For this documentation revision, source links and diff whitespace were checked.
No host, browser, playback or bundle-size proof was run. The earlier PR-body test
claims belonged to the original builder and are not fresh validation of this head.
This research does not complete #1351; it reserves no runtime file.
