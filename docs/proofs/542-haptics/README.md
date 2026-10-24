# Phone haptics verification (#542 / #844)

Builder: Codex-open-table-833, GPT-6.1 Sol; original Cursor history retained.
The engineering split follows [the desk answer](https://github.com/jarrodjohnson-gif/emberisle/issues/542#issuecomment-6383719450).
The approved row and all existing bundle limits remain unchanged.

## Build and size

Independent clone `work/verify844-split`, frozen root/server installs, Node 24.19.0.
Main `5bb959c` was merged normally; final implementation is `e7c0842`.
Final types/build/static checks and the production haptics run use `af25310`.
The latter adds only bounded cold-test evaluation and the menu captures to the previously checked runtime.

[Real size output](size.log): index **125191 B**, below **125200 B**; built main
`5bb959c` is **125141 B**, growth **50 B / 400 B**. The previous pushed checkpoint
`cfd796a` measured **125566 B** (then-main `c0d15d0`), so the refreshed split index is
**375 B smaller**. Intervening main changes are proof/research changes; these are actual
measurements at the named heads, not an attribution of every byte to one edit.
The newly emitted phone chunk has an initial **1200 B** ceiling. Existing ceilings and
allowances are untouched. [The 1201 B control is rejected](new-ceiling-control.log).
All original size fixtures retain their values and add only the new chunk.

## Behavior and initialization

The synchronous entry starts an async bootstrap. On a supported coarse pointer it awaits
the phone module, including callback/offer-subscription registration, before rejoining a
saved seat or rendering interactive controls. Unsupported devices skip the download. A
rejected optional module leaves the game usable. The entry itself has no top-level await:
the deferred module shares React, sound and store exports with the entry.

The module owns the motor guard, stored preference, approved row, event durations and
local-piece/fortune ownership. Store landing callbacks still own both sound and vibration
timing. Incoming offers use the same new-offer store transition in practice and online.
Payer sound remains in its existing renderer callback at 0.35, with the original eight-tick
cap, while the motor receives the existing local-owner boolean. Other sound categories and
`touchHex` are unchanged.

[Full haptics output](haptics.log) passes:

- Source and production downloads held across a queued first native tap: rejoin remains
  uncalled while held, resumes once after initialization, and the first real legal placement
  buzzes within the original 100 ms of its recorded knock. The cold fixture observes each
  native Roll button's actual click sound before the next roll, avoiding a synthetic burst
  of queued UI clicks before measuring placement audio. Shared-entry evaluation has the
  existing 30 s step bound, so a module-cycle deadlock cannot hang the probe.
- Unsupported desktop and missing-API cold starts download no haptics chunk and show no
  row; a rejected module still permits a game and its Table menu. A loaded phone changed
  to a fine pointer stays quiet.
- Local/opponent/closing-path ownership; local, opponent-only, watcher, mixed and hotseat
  payouts with audible ticks; toggle and persistence; reduced motion; fortune/win; mute;
  missing API; real client trade frames for seated recipients, watchers and sender.

[All three menu sizes](table-menu.log), [full flash](flash.log), and
[full sounds](sounds.log) also pass, serially. The menu captures were inspected and retain
phone Haptics between Music and Water; desktop has no Haptics row.

## Negative controls and unchanged checks

[Controls](controls.json) run serially against the same implementation using the `2ccec1f`
proof (before the bounded-evaluation helper/capture-only final change). Removing awaited
initialization fails the interactive-controls gate; removing the live coarse-pointer guard
fails the pointer-change check; removing mute fails the existing mute assertion. Each
source mutation is restored in `finally`; all three exit 1 at the intended assertion.
The [harness](controls.py) records the clone and environment used; individual logs are here.
Earlier fixture/harness development attempts are not counted as successful controls.

[Typecheck](types.log), [build](build.log), [registration of all 130 proofs](registered.log),
[assertion-preservation audit](loosen.log), and [size-delta cases](size-delta.log) pass.
No original assertion, tolerance, timeout, tick cap, budget or DECISIONS row was relaxed.
The existing haptics proof remains registered in package.json and CI; CI's browser leg
already downloads the production build used by its added cold-start cases.

These are local results. CI and independent review remain separate gates; no merge was performed.
