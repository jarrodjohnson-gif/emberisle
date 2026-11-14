# Research: Signed-In Profile Chip on Title Screen (Issue #1352)

- step: 1 Research
- date: 2026-11-13
- agent: builder-proofs
- lane: hud (tier 2)
- issue: #1352

## Overview

Issue #1352 tracks showing the #903 profile chip on the title screen.
Signed-in players see the profile chip in place of the name field.
The chip opens the Profile sheet.
Guests keep their existing name input, colour dots, and Profile button.
This note investigates layout, bundle size, and proof requirements.

## Current Title Implementation

The title screen lives in `src/components/game/EmberisleApp.tsx`.
No standalone `Title.tsx` exists in the repository.
The title UI renders inside `EmberisleApp.tsx` when `screen === "title"`.
Title controls are wrapped in `<details className="seat-settings">`.
The card holds a name input, colour dots, and a ghost Profile button.
All controls meet the 44 px minimum touch target requirement.

## Design Specifications from #903 and #766

`docs/design/app-review/final/README.md` defines the approved title behavior.
Signed-in players see a small profile chip in place of the name field.
The chip opens the existing profile editor.
No new authentication flow is introduced.
`docs/design/app-review/3-directions.md` details the visual presentation.
The chip reads "Signed in as <name>" with the player colour dot.
Guest players keep visible name and colour controls.

## Critical Bundle Headroom Constraint

`index` chunk size headroom is currently 113 B locally and 707 B on main.
`src/lib/net/profiles.ts` is currently isolated to the lazy `ProfileSheet` chunk.
Directly importing `createProfileClient` into `EmberisleApp.tsx` will bloat `index`.
This would immediately exceed the strict `index` chunk size ceiling.
Signed-in state must reach the title without importing `profiles.ts` into `index`.

### Recommended State Architecture

`ProfileSheet` already passes `profileClient` to `useGame.setState`.
`useGame` can expose a lightweight slice:
- `profileName`: Optional string for display name.
- `profileColor`: Optional string for profile colour.
- `profileId`: Optional string identifying the active profile.
When a profile signs in or edits, `ProfileSheet` updates these fields.
`EmberisleApp.tsx` reads only primitive strings from `useGame`.
Zero profile protocol or client code enters the `index` chunk.

## UI Layout and Dimensions

Replacing the 44 px text input with a 44 px chip preserves exact layout height.
This is critical for `title-prove` at 1280x500 short desktop viewports.
The closed title card height remains unchanged.
No controls are pushed out of view or clipped.

### Guest Layout
- `<details className="seat-settings">` summary with dot and name.
- 44 px text input for name.
- 44 px colour radio dots.
- 44 px ghost "Profile" button opening Profile sheet.

### Signed-in Layout
- `<details className="seat-settings">` summary with profile dot and name.
- 44 px profile chip button: "Signed in as <name>".
- Clicking the chip opens the Profile sheet.
- Colour radio dots remain available for table overrides.
- Redundant name text field is hidden.

## Testing and Verification Plan

The completion test requires extending `profiles-ui-prove.mjs` and `title-prove.mjs`:
- Test across 390x844, 844x390, 1280x720, and 1280x500 viewports.
- Confirm profile chip bounding box is at least 44x44 px.
- Confirm clicking the chip opens the Profile sheet.
- Verify closing the Profile sheet returns keyboard focus cleanly.
- Verify guest view remains intact when signed out.
- Ensure `title-prove` passes with zero console errors or clipping.

## Handoff

```yaml
done: Researched title profile chip layout, size constraints, and proof plan.
left: Implementation of store fields, title chip markup, and proof assertions.
broke: None.
next agent: Builder claiming Issue #1352 implementation.
```
