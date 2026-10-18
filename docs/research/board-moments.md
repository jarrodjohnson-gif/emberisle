# Approved board moments

- Research: #739, under [#642](https://github.com/jarrodjohnson-gif/emberisle/issues/642).
- Source baseline: `f3a4040`, inspected 2026-10-17.
- Builder: Codex-board-research-739, GPT-6.1 Sol. Opus was unavailable.
- Evidence: source and GitHub issue inspection only. No browser or runtime validation ran for this research.

## Approval and boundaries

#642 approves payout flights, piece landings, Bruno's robbery rat, a title flyover, award markers and brief bot target cues.
These concepts need no new approval. Missing timing, anchor and information contracts need design before implementation.

The current Jelly Ocean direction remains authoritative: #597 approves crystal water, a tilted diorama and harbour life.
This research proposes no alternative board style, rules, sounds or turn delays.
The renderer currently chooses diorama for landscape canvases at least 900 pixels wide; other canvases use overhead.
The title uses its separate free view (`src/lib/scene/isle-renderer.ts:529`).

## Shipped behavior and gaps

| Approved moment | Current source evidence | Remaining boundary |
| --- | --- | --- |
| Goods pop off paying hexes and fly into hand cards | `rules.ts:332–375` records actual production grants and paid hexes. `isle-renderer.ts:571–638` flashes hexes and pulses paying buildings. `GainFloats.tsx:29–111` shows local hand deltas after the roll moment. | No source implements resource objects flying from hexes to hand cards. Payout design must connect canonical grants, projected scene origins and visible hand targets. |
| Every piece drops, squashes and raises dust | `landing.ts:4` sets 220/280/320 ms landings. `isle-renderer.ts:1651–1672` detects new pieces and upgrades. `isle-renderer.ts:2177` grows paths, drops outposts and settles stronghold scale. `store.ts:126–134` delays existing sounds until landing ends. | Existing per-kind poses only partly match the universal drop-and-squash approval. No dust puff exists. The building child covers all three drop/squash poses and bounded dust without duplicating audio. |
| Bruno's rat visits the victim's piece and returns carrying a card | `bruno.ts:104–143` builds a shoulder rat with idle motion. `isle-renderer.ts:673–710` moves Bruno to the new hex. `rules.ts:389–418` applies theft and logs public victim names. | The rat stays on Bruno's shoulder. Successful theft capture and victim-piece selection need explicit contracts, especially online. |
| Slow title flyover showing island and harbours | `isle-renderer.ts:353` configures slow rotation at 0.28. `isle-renderer.ts:1247–1255` rotates the title camera only outside reduced motion. `IslandCanvas.tsx:9–10,40–74` supplies a separate demo island behind title/lobby. `isle-renderer.ts:1609–1647` constructs docks and boats. | Source confirms a slow orbit, not a bespoke harbour tour route. The current orbit serves the approved backdrop intent; this research adds no duplicate camera child. Visual framing was not runtime-verified. |
| Banner along longest path; flag on army holder's stronghold | `types.ts:126–127` carries canonical holders. `rules.ts:207–232` applies thresholds and retained ties. `store.ts:15–23` announces holder changes. | Renderer has no award banner or army flag. Path witnesses and a holder without a stronghold need deterministic anchor contracts. HUD counts belong to #645. |
| Briefly highlight bot pieces and wayfarer targets without slowing bots | #608 already specifies client presentation; #720–#723 own events, scheduling, renderer cues and integration. | Reuse those issues. No new bot cue child belongs here. |

Paths in this table abbreviate `src/lib/game/`, `src/lib/scene/` and `src/components/game/` as appropriate.
`IslandCanvas.tsx` lives in `src/components/scene/`.
Line references describe the inspected baseline and may move after unrelated work merges.

## Information and integration contracts

### Payouts

- Use `GameState.lastProduction`, not raw hand differences, to identify paid hexes, resources and actual quantities.
- Grants reflect bank shortage outcomes, blocked hexes and stronghold production (`rules.ts:332–360`).
- The optional grant vertex identifies a paying building; legacy grants can lack it (`types.ts:143`).
- Current payer pulses omit unknown vertices rather than inventing neighbours (`isle-renderer.ts:596–600`).
- The existing live-roll gate requires the same island and exactly one additional roll (`isle-renderer.ts:642–670`).
- Grants describe public production. They do not authorize inspecting opponents' current hands.
- `server/host.mjs:408–437` removes seed, RNG and opponent resource hands from live views.
- Watchers receive no private hand. A flight must not create an apparent private hand destination for them.
- Hotseat handovers establish new local-hand baselines; reconnects clear pending gain lines (`GainFloats.tsx:50–63`).
- Resolve destination loss, mobile layout, camera changes and centre ownership before adding scene-to-DOM flight.
- Preserve the existing readable GainFloats and payer gain-tick ownership; avoid duplicate gain announcements or sounds.

### Landings

- `buildPieces` disposes and recreates meshes whenever the state sequence changes (`isle-renderer.ts:1651`).
- Stable edge/vertex keys and `landStart` preserve landing progress through those rebuilds.
- Detect an upgrade by changed kind at the same vertex; do not treat every recreated mesh as new.
- Fresh boards stand at rest. Reduced motion also skips directly to rest (`isle-renderer.ts:1651–1672,1750–1755`).
- Define dust against the landing timeline; do not schedule a second placement sound.
- The bounded building implementation includes all three drop/squash poses; existing poses are not declared complete.
- Align final impact and dust with the existing LAND_MS sound; earlier squash contact must not emit dust.

### Robbery

- A wayfarer move does not establish a successful theft; empty victims can yield no card (`rules.ts:389–418`).
- A victim can own multiple buildings adjoining the destination. State does not identify a unique animation anchor.
- Theft initially logs names (`rules.ts:399`); canonical narration replaces that line (`rules.ts:480–487`).
- Canonical narration reveals victim and quantity, never the stolen resource. Do not parse the superseded wording.
- Coalesced snapshots can omit intermediate movements. Do not infer atomic routes or theft order from settled geometry.
- Use a generic card back; no animation may expose stolen resource, private hand or fortune identity.
- Current `robbed_fah` ownership is broader than an actual theft victim.
- `store.ts:123–125` flags a local building beside the destination when another seat was acting; hotseat is excluded.
- `store.ts:51–54` substitutes that sound for the normal wayfarer cue when the hex changes.
- The rat design must resolve this difference explicitly, preserving mute and preventing duplicate playback.
- A new public robbery event, if necessary, needs its own bounded prerequisite; #725 is scoped to bot actions.

### Awards

- Read canonical holder IDs; renderer decoration must not decide scores or award ownership.
- Longest-path counts alone do not identify the exact winning route through forks, cycles or blocked vertices.
- A path witness must follow the existing rule semantics without introducing a second rules engine.
- Largest army can exist without any stronghold. The approved flag location therefore needs an explicit absent-anchor contract.
- Multiple strongholds also need deterministic selection. HUD badges and counts remain exclusively in #645.

### Renderer lifecycle and accessibility

- Decorative effects must use separate groups and remain absent from legal marks and `pickables`.
- `buildMarks` recreates legal marks and picking targets (`isle-renderer.ts:1757–1763`); do not attach persistent effects there.
- Resolve stable IDs after rebuilds instead of retaining disposed piece or terrain references.
- Clear transients on hidden pages, scene replacement, reconnect baselines, rematch, leave and disposal.
- Renderer disposal already owns controls and scene cleanup (`isle-renderer.ts:744–779`). Extend that ownership for added resources.
- The tick loop pauses while hidden and respects reduced motion (`isle-renderer.ts:1209–1247`).
- Reduced motion requires static, bounded cues or omission of purely decorative travel, not accelerated animations.
- Preserve camera fit, legal placement, keyboard placement, touch picking and existing production flashes.
- Keep effects bounded and wake the renderer only while needed; preserve idle and bundle budgets.

## Existing bot work

- [#608](https://github.com/jarrodjohnson-gif/emberisle/issues/608) owns bot action lines, sounds and target cues.
- Jarrod chose client-only scope: exact practice actions, reliably attributable online changes or summaries.
- [#720](https://github.com/jarrodjohnson-gif/emberisle/issues/720) owns typed public events, committed capture and silent baselines.
- [#721](https://github.com/jarrodjohnson-gif/emberisle/issues/721) owns bounded scheduling and shared centre ownership.
- [#722](https://github.com/jarrodjohnson-gif/emberisle/issues/722) owns non-pickable edge, vertex and hex targets.
- [#723](https://github.com/jarrodjohnson-gif/emberisle/issues/723) owns integration, sound ownership, lifecycle and browser proofs.
- [#724](https://github.com/jarrodjohnson-gif/emberisle/issues/724) is a closed roll-fixture repair, not another bot feature.
- [#725](https://github.com/jarrodjohnson-gif/emberisle/issues/725) owns optional exact online ordering through public host events.
- #725 depends on #720–#723. Its events must not disclose private hands or bought fortune identities.
- The new board effects must cooperate with these contracts instead of implementing parallel bot observers or cue queues.

## Next layer in GitHub

The linked children below resolve only the next missing contracts beneath #642.
They remain separate PRs, one at a time, as the owner requested.
Implementation still requires fresh cross-lane claim checks, even when dependencies close.
The existing #538 renderer reservation must release before overlapping runtime work starts.

| Child | Deliverable and acceptance boundary | Dependencies and expected files |
| --- | --- | --- |
| [#740](https://github.com/jarrodjohnson-gif/emberisle/issues/740) | Payout flight design: canonical grants, public/private destinations, centre ownership and lifecycle fixture matrix. | Research acceptance #739; `docs/design/payout-flight.md`. |
| [#741](https://github.com/jarrodjohnson-gif/emberisle/issues/741) | All piece kinds drop, squash and emit bounded dust; prove impact/audio alignment, static reduced motion and cleanup. | Research acceptance #739 and released renderer claims; `landing.ts`, new `landing-dust.ts`, `isle-renderer.ts`, `scripts/landing-dust-prove.mjs`. |
| [#742](https://github.com/jarrodjohnson-gif/emberisle/issues/742) | Robbery design: successful public theft capture, generic card back, deterministic route and scoped audio ownership. | Research acceptance #739; `docs/design/rat-robbery.md`. |
| [#743](https://github.com/jarrodjohnson-gif/emberisle/issues/743) | Award design: canonical holders, deterministic path witness, stronghold anchors and lifecycle acceptance cases. | Research acceptance #739; `docs/design/award-markers.md`. |

All four children belong to milestone **5. Island**, in Backlog, beneath #642.
The scene filenames above live in `src/lib/scene/`.
#741 also expects proof registration in `package.json` and `.github/workflows/ci.yml`, subject to fresh shared-file reservations.
Each linked issue contains its completion test and exact scope; this note records findings rather than a local task list.

## Verification limits

Research inspected AGENTS.md, README.md, FRAMEWORK.md, LANES.md, relevant source and the named tracker issues.
The open-issue scan found no independent payout-flight, rat-route, dust or board-award child beyond #642.
#645 explicitly owns the HUD side. Existing bot children cover the entire bot-cue boundary.

No runtime code, tests, configuration or proof registrations changed.
Source inspection establishes existing mechanisms; it does not establish visual quality or fresh-clone runtime success.
Implementation acceptance belongs to the linked child issues and their focused proofs.
