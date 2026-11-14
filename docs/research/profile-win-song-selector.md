# Research: Profile Sheet Shared Win-Song Selector (#1351)

## Overview

This document specifies the shared win-song selector for the player Profile sheet.
It delivers Issue #1351 as slice 4 of profile customization (#766).
The feature allows authenticated owners to select an optional win anthem.
Playback triggers for all table listeners when the player wins.

## Core Invariants

1. Default state: `winSongId` starts at `null` upon profile creation.
2. Explicit choice: only an intentional user selection assigns a song.
3. Default restoration: clearing the selection restores `winSongId: null`.
4. Curated catalogue only: only approved catalogue IDs are sent.
5. No custom clips: custom per-friend audio remains disallowed pending review.
6. Owner privacy: `winSongId` remains hidden from public seat projections during play.

## Current System State

The backend already implements host-side song storage and validation.
- `src/lib/profile-songs.ts` defines `PROFILE_SONGS` and the `isProfileSongId` validator.
- `server/profiles.mjs` enforces catalogue validation inside `_applyEditFields`.
- `server/profile-songs-prove.mjs` tests host persistence, clearing, and rename preservation.
The UI layer currently lacks controls for choosing or clearing win songs.

## Client State Management

### 1. Store and Types (`src/lib/net/profiles.ts`)

`ProfileOwner` already includes `winSongId: string | null`.
`ProfileFields` must be updated to include optional `winSongId`:
```typescript
export interface ProfileFields {
  displayName: string;
  login: string;
  color: string;
  backupColor?: string | null;
  catchphrase?: string;
  winSongId?: string | null;
}
```
The client helper `fieldsOf` must include `"winSongId"` in its allowlist.
This ensures `c.edit({ winSongId })` transmits the selection over WebSockets.

### 2. Sheet State (`src/components/game/ProfileSheet.tsx`)

`ProfileSheet` manages high-level modal navigation and sub-chunk loading.
Form state extends to hold the active selection:
- Initial value reads from `snap.profile?.winSongId ?? null`.
- Cancelling or navigating back discards unsaved selections.
- Saving invokes `c.edit(fields)` through the existing `send()` wrapper.

### 3. Edit Form UI (`src/components/game/ProfileForms.tsx`)

`ProfileForms` renders the profile editing inputs inside a lazy chunk.
The win-song selector adds a segmented control or option list:
- Option 1: "Default (None)" sets `winSongId: null`.
- Catalogue options: rendered dynamically from `PROFILE_SONGS`.
- Each option displays the track label (e.g., "Isaac win music").
- An audition button plays a preview using `play(asset)`.
- Selecting an option updates form state without immediately saving.

## Host Validation and Protocol

Host requests flow through `server/profile-protocol.mjs` to `server/profiles.mjs`.

### 1. Request Envelope

The client submits `profileEdit` carrying the chosen ID:
```json
{
  "type": "profileEdit",
  "winSongId": "isaac-win"
}
```

### 2. Validation Pipeline

The host executes the following checks:
1. Verifies the caller's session credential via `authOwner()`.
2. Rejects foreign profile mutation attempts with `ProfileError("signedOut")`.
3. Validates `f.winSongId === null || isProfileSongId(f.winSongId)`.
4. Throws `ProfileError("invalid")` on unknown strings or invalid types.
5. Persists the mutation atomically in `profiles.json`.

### 3. Projection Invariants

`server/profiles.mjs` strictly partitions public and private data:
- `ownerView()` exposes `winSongId` solely to the authenticated owner.
- `seatView()` and table cards completely omit `winSongId`.
- Other players never observe the winner's choice until game completion.

## Bundle Size Impact

`ProfileForms` has a gzip ceiling of 2,350 bytes in `scripts/size-prove.mjs`.
The current chunk measures 2,182 bytes, leaving 168 bytes of headroom.
The selector component must remain lightweight to stay under ceiling:
- Import `PROFILE_SONGS` directly from `src/lib/profile-songs.ts`.
- Avoid heavy UI dependencies or separate audio libraries.
- Reuse existing button and label styling primitives.

## Verification and Completion Test Plan

The implementation will be verified through real-host proofs:
1. Shared catalogue selection: selecting "isaac-win" persists across reload.
2. Selection clearing: choosing "Default" restores `winSongId: null`.
3. Rename preservation: changing display name retains existing song selection.
4. Invalid ID rejection: sending `"unknown-track"` fails with error code `"invalid"`.
5. Unauthorized custom ID rejection: sending unlinked custom IDs fails atomically.
6. Size ceiling check: `npm run size-prove` confirms `ProfileForms` passes.
7. Proof suite: `npm run profiles-ui-prove` and `server/profile-songs-prove.mjs` pass.
