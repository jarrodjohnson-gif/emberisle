# Shared profile song selection (#1043)

Runtime source: `7dbdfea535cf740ca845f4ce2fea9e169145b259` on main `82c440b2b78943494fd15e6bda98cec312454fc3`.
Separate approved assertion replacement: `02d71d66d6f82d98add9d1c7c5748aa587c1ba03`.
Proof-strengthening-only commit: `3285980` adds owner name/selection invariants after every invalid request and foreign target attempt. Its strengthened 23-check proof passed again in the fresh clone; runtime bytes are unchanged.

Node 22.23.4. A new remote shallow clone of this branch was used for validation; installed dependencies were shared via symlinks. No asset or lockfile changes.

The host's existing authenticated `profileEdit` transaction accepts an optional catalogue ID or null. Its existing owner response carries the validated selection. The one approved shared entry is long `isaac_win.mp3`, ID `isaac-win`, label `Isaac win music`; no soundboard, selector UI, playback or private binding is implemented. Owner projection normalizes removed IDs to null without rejecting the stored document or blocking unrelated edits/play.

## Validation

- Registered real-host `profile-songs-prove`: 23 checks. Creation/login null defaults, explicit owner select/clear, shared use, display/login rename, restart persistence, atomic URL/path/unlisted/type rejection, invalid credential rejection, authenticated-owner-only targeting, private seat/card projections, removed-entry fallback and table joining.
- Existing unchanged `profile-auth-prove`: 118 checks.
- Existing `profile-edit-prove`: 92 checks after the separately committed approved assertion replacement below.
- Existing unchanged `profile-seat-prove`: 177 checks.
- Types, production build, registration (179 proofs), size-delta fixtures, all absolute chunk ceilings and actual built-main growth allowances pass.
- Actual size: index 125530 B vs main125527 B (+3/400 allowance); IslandCanvas202147 B vs main202147 B (+0/667 allowance). No ceiling or allowance changed.
- `loosen-prove --base 82c440b...` reports exactly the authorized obsolete assertion below. Its detector and CI step are untouched; this result is advisory under the dated repository decision, not an all-green claim.

## Approved obsolete assertion

Authority: `docs/DECISIONS.md`, 2026-10-25, “Assertions an approved design makes obsolete may be replaced, never deleted”; #1043 completion contract requires removed entries to fall back; catalogue approved in owner answer6616366202. The original edit proof manually seeds unapproved `song_one`. The fixture and all other checks remain unchanged.

| File and line | Old assertion | New assertion | Why |
| --- | --- | --- | --- |
| `server/profile-edit-prove.mjs:239` | `check("winSongId is in owner view", resumeAfterEdit.profile.winSongId === "song_one");` | `check("removed winSongId falls back to null in owner view", resumeAfterEdit.profile.winSongId === null);` | An unlisted/removed stored ID must fall back to the default, rather than appearing as an available owner selection. |

## Retained failed attempts

`edit.log.gz` retains the original suite failure at that obsolete assertion, before replacement. `size.log.gz` retains an invocation error: passing a built checkout's `dist` path instead of its checkout root caused `dist/dist/assets` lookup failure. `size-corrected.log.gz` uses the correct built-main checkout path and passes. No product failure or test weakening was hidden by those corrected runs.

No browser appearance/audio/device acceptance is claimed by this shared-selection leaf. #766 owns the visible selector; later media leaves own playback and custom bindings.
