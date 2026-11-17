# Title profile chip: current source and unresolved startup (#1352)

Research only, updated 2026-11-17 by Codex-p (GPT-6.1 Sol).
Original research: builder-proofs (AntiGravity), 2026-11-13; exact model unrecorded.
Source snapshot: main `726c8f329f80727a994495303e2f67bf4bf44784`.
No title, profile, protocol, storage, budget or proof implementation is included.

## Approved surface and prerequisites

The [final #903 screen notes](../design/app-review/final/README.md#fixes-the-mocks-need-when-built)
say signed-in players see a small profile chip in place of the title name field.
It opens the existing profile editor where the host supports it; there is no new sign-in flow.
The existing [profile design](../design/profiles.md) governs host-scoped identity and guest play.

#1352 still lists the #766 Profile sheet slice, the desk's title-entry answer and
#1151 if it lands first as dependencies. This note does not mark those gates complete
or settle the guest entry point. The issue's completion test covers 390x844,
844x390, 1280x720 and 1280x500, unclipped controls and a 44 px minimum target.
Those are future checks, not measurements from this research edit.

## Current implementation

At the source snapshot, [EmberisleApp.tsx](../../src/components/game/EmberisleApp.tsx#L429)
renders the title's `seat-settings` details.
They hold the seat name input, colour choices and a Profile button. The button sets `profileOpener`; the
[lazy ProfileSheet](../../src/components/game/EmberisleApp.tsx#L467) mounts only while that opener exists.
This source does not yet render the proposed signed-in title chip.

[ProfileSheet.tsx](../../src/components/game/ProfileSheet.tsx#L89) obtains the client
and subscribes to its snapshot. Its mount effect
[attaches the client and calls check()](../../src/components/game/ProfileSheet.tsx#L89).
The game store's [profile field](../../src/lib/game/store.ts#L330) is a client attachment,
not a display-name/colour slice, and its
[initial value is null](../../src/lib/game/store.ts#L583).

## Reload gap: architecture not selected

The earlier proposal added `profileName`, `profileColor` and `profileId` strings
updated only by ProfileSheet. That is insufficient: on a fresh page load before
opening the sheet, those updates have not occurred. A remembered credential is not
itself a verified display identity, and a matching seat name is not authentication.

[Desk answer 6940913972](https://github.com/jarrodjohnson-gif/emberisle/issues/1352#issuecomment-6940913972)
confirms host-scoped profile bootstrap is an **unresolved prerequisite**.
Guest play stays unchanged. The issue stays in backlog until the specification lands.
The specification must explain how a fresh title load learns the signed-in identity.
It must cover snapshot subscriptions, authentication checks, loading, offline/unavailable states, host changes, sign-out and profile edits.
Jarrod decides the chip's appearance in each state. The specification needs phone-size pictures and a Desk page card.

**No eager import of the profile client until its bundle cost is measured against the index allowance.**
This research selects no store schema, cache authority or bootstrap mechanism.
Primitive fields alone do not resolve initialization or guarantee a bundle result.

## Actual size rules, not headroom measurements

The current [index ceiling](../../scripts/size-prove.mjs#L42) is **128,000 gzip bytes**.
The [index growth allowance](../../scripts/size-prove.mjs#L135) is **400 gzip bytes**
against the measured base. Both rules apply; neither is spare capacity measured here.
The earlier 113 B local / 707 B main headroom claims had no retained measurement
source and are withdrawn. The review's older 127,000 B ceiling has since been
superseded by the owner-approved 128,000 B source rule.

A future implementation must run the normal build and size comparison on its exact head and base.
Record the real chunk sizes and any import changes. This note
neither predicts an overflow nor promises zero profile code in the entry chunk.
No allowance or ceiling changes are proposed.

## Future validation and handoff

Extend the repository's `profiles-ui-prove` and `title-prove` for the issue's four
viewports once the dependencies and startup behavior are settled. Cover a remembered profile on fresh load before opening its sheet.
Check that the signed-in chip opens the sheet and closing it returns focus.
Cover sign-out, guest controls and the specified error states. Retain existing assertions and zero-console-error checks. Exact geometry and
clipping remain to be measured; a 44 px replacement does not alone prove layout fit.

For this documentation revision only: source references and diff whitespace were
checked. No browser, authentication, reload, layout or bundle-size experiment was run.
Implementation and owner entry decisions remain open on #1352.
This note does not complete that issue or supply a new approved design.
