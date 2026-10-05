# Research: old connection, placement, dice, sound, trade, and download issues

- gate worked: research
- date: 2026-10-05
- agent: ChatGPT
- scope: issues #41–#65 and #88; recommendations for Jarrod's review
- repository inspected: `8c09099`

## What I read

The live issue bodies, states, labels, milestones, and all comments for the 26 issues
listed below. Related evidence includes [#32](https://github.com/jarrodjohnson-gif/emberisle/issues/32)
(art-pack/engine inspection), [#128](https://github.com/jarrodjohnson-gif/emberisle/issues/128)
(the accepted browser/Unreal sequence), and merged PRs
[#68](https://github.com/jarrodjohnson-gif/emberisle/pull/68) and
[#115](https://github.com/jarrodjohnson-gif/emberisle/pull/115).

Repository sources: [README](../../README.md), [BUILD_BIBLE](../BUILD_BIBLE.md),
[connection design](../design/connection.md), [placement design](../design/placement.md),
[dice design](../design/dice.md), [Windows packaging research](windows-package.md),
[install/join design](../design/install-join.md), and
[same-origin serving design](../design/same-origin.md). Implementation and proof sources
are linked in the rows below.

## What is true

The playable client is React/Three.js in a browser, connected to the Node rules host.
It already hosts and joins by code, receives legal placements, renders server dice,
plays sounds, and handles trades, discards, and steals. Built pages and WebSockets
share the host's origin; `npm run night` builds, starts the host, and prints the
Cloudflare command. Friends open a URL and enter a table code.

Unreal has not been canceled. README describes it as the later client on Jarrod's
gaming PC, using the same rules host. The accepted #128 decision explicitly keeps
Unreal for v3. Browser work supersedes the old issues' application to the current
browser release; it does not establish that a packaged Unreal client exists.
No `.uproject` or Unreal implementation is present in this repository.

The old titles often omit which client they mean. Closing every such issue as a
browser duplicate would lose the later Unreal work. The recommendation is to make
that client explicit where work remains, preserve completed history, and retain
the real-machine browser tunnel test.

Recommendation meanings:

| Recommendation | Meaning |
|---|---|
| Keep | The current deliverable still describes distinct, unfinished work. |
| Rewrite | Preserve the goal, but update its client, acceptance evidence, or dependencies before scheduling it. |
| Close | Completed or superseded work should not remain active; already closed issues should stay closed. |

There are **2 keep, 15 rewrite, and 9 close** recommendations. All nine recommended
closures are already closed. This report changes no issue, label, milestone, or
GitHub comment.

## Issue-by-issue recommendations

### Connection and placement: #41–#47

| Issue | Observed state / label | Recommendation | Evidence and reason |
|---|---|---|---|
| [#41 — Design the host-button connection](https://github.com/jarrodjohnson-gif/emberisle/issues/41) | Open / `status:in-review` | **Rewrite** | The design landed in PR #68; [connection.md](../design/connection.md) specifies Unreal `DefaultGame.ini` and `Saved/Config/host.txt`. The browser instead uses [`hostUrl`](../../src/lib/net/table.ts), taking `?host=` or the served origin. Retitle this as the future Unreal connection design and resolve its saved-file lookup against #62's beside-launcher `host.txt` proposal. Refresh its obsolete claim that the browser cannot rejoin; no new browser connection implementation is needed. |
| [#42 — Connect the host button to the rules server](https://github.com/jarrodjohnson-gif/emberisle/issues/42) | Open / `status:backlog` | **Rewrite** | [`table.ts`](../../src/lib/net/table.ts) already sends `hello` for browser Host and Join, and [`Lobby.tsx`](../../src/components/game/Lobby.tsx) displays the code. Preserve this as Unreal Host/Join implementation after #41 and the gaming-PC project inspection (#32), using the existing host rather than another rules engine. |
| [#43 — Test two clients seeing the same seat list](https://github.com/jarrodjohnson-gif/emberisle/issues/43) | Open / `status:backlog` | **Rewrite** | [`server/table-prove.mjs`](../../server/table-prove.mjs) joins three sockets, and [`scripts/tabs-prove.mjs`](../../scripts/tabs-prove.mjs) drives real browser lobbies. Specify Unreal plus browser, or two Unreal clients, against that same host after #42. Require both rendered seat lists and the server seat list; existing browser coverage should be cited rather than rebuilt. |
| [#44 — Research how legal vertices are chosen](https://github.com/jarrodjohnson-gif/emberisle/issues/44) | Closed / `status:done` | **Close — retain closure** | Its completion comment identifies `distanceOk`, `legalSettle`, and `legalRoads` in [`rules.ts`](../../src/lib/game/rules.ts). The distance rule and the host legal lists remain shared by both clients. Preserve this research history; old line numbers can be refreshed when a client needs them without reopening the completed node. |
| [#45 — Design the glow and click-to-place flow](https://github.com/jarrodjohnson-gif/emberisle/issues/45) | Open / `status:in-review` | **Rewrite** | [placement.md](../design/placement.md) landed in PR #68; host `legal` lists and illegal-neighbor rejection already exist. Browser placement, cancellation, and keyboard selection now have [`keyboard-place-prove`](../../scripts/keyboard-place-prove.mjs). Narrow this to Unreal input/glow adaptation, preserving the shared `place {kind,id}` protocol and local cancellation behavior. |
| [#46 — Glow legal spots and send a placement](https://github.com/jarrodjohnson-gif/emberisle/issues/46) | Open / `status:backlog` | **Rewrite** | The browser already draws legal marks and sends placements; [`tabs-prove`](../../scripts/tabs-prove.mjs) completes setup through the host and [`keyboard-place-prove`](../../scripts/keyboard-place-prove.mjs) checks the visible legal choices. Preserve only the Unreal actor/highlight/input implementation after #45 and the Unreal project/id mapping are ready. |
| [#47 — Test that a neighbor vertex stays dark](https://github.com/jarrodjohnson-gif/emberisle/issues/47) | Open / `status:backlog` | **Rewrite** | [`server/table-prove.mjs`](../../server/table-prove.mjs) already computes every adjacent vertex, excludes them from the next seat's legal list, and checks an illegal placement error. Its evidence is protocol-level, not an Unreal screenshot. Make this a rendered Unreal test after #46, checking **all** adjacent vertices (a corner can have three), the occupied corner, and unchanged state after an illegal click. |

### Dice: #48–#51

| Issue | Observed state / label | Recommendation | Evidence and reason |
|---|---|---|---|
| [#48 — Research which dice meshes the pack includes](https://github.com/jarrodjohnson-gif/emberisle/issues/48) | Open / `status:backlog` | **Keep** | This already explicitly asks to inspect the Unreal pack and allows a text fallback. [`Dice.tsx`](../../src/components/game/Dice.tsx) supplies browser pip faces but says nothing about the external art pack. The real blocker is the gaming-PC/art-pack inspection in #32; the placement screenshot in #47 is a sequencing dependency, not a technical prerequisite to inspecting meshes. |
| [#49 — Design the tumble that lands on server faces](https://github.com/jarrodjohnson-gif/emberisle/issues/49) | Open / `status:in-review` | **Rewrite** | [dice.md](../design/dice.md) landed in PR #68 and specifies 700 ms physics plus an 80 ms snap. The current browser deliberately uses a 900 ms roll moment and 220 ms settle in [`Dice.tsx`](../../src/components/game/Dice.tsx), covered by [`roll-moment-prove`](../../scripts/roll-moment-prove.mjs). Scope the old physics design to Unreal after #48, reconcile its motion/audio requirements, and preserve server authority over the result. |
| [#50 — Show the two dice the server rolled](https://github.com/jarrodjohnson-gif/emberisle/issues/50) | Open / `status:backlog` | **Rewrite** | Browser pip faces already read game dice, and [`toIntent`](../../src/lib/net/table.ts) sends only `{type:"roll"}`. The issue's only comment rejects an unused off-process `feat/show-dice` branch; it is not completion evidence and should not be revived. Retitle this as Unreal server-dice rendering after #49, accepting either inspected meshes or #48's fallback. |
| [#51 — Test twenty rolls against the server log](https://github.com/jarrodjohnson-gif/emberisle/issues/51) | Open / `status:backlog` | **Rewrite** | [`server/table-prove.mjs`](../../server/table-prove.mjs) checks 20 host-message/state rolls; [`tabs-prove`](../../scripts/tabs-prove.mjs) checks pip faces, labels, and log agreement on five browser rolls. Neither is evidence for 20 rendered Unreal rolls. Preserve this as the #50 acceptance proof, recording 20 displayed Unreal face pairs against the host; avoid claiming the old exact visual completion test is already satisfied. |

### Sound and trade: #52–#59

| Issue | Observed state / label | Recommendation | Evidence and reason |
|---|---|---|---|
| [#52 — Research a free sound set for table actions](https://github.com/jarrodjohnson-gif/emberisle/issues/52) | Closed / `status:done`, `mark:changed` | **Close — retain closure** | Its completion comment records the Kenney Interface Sounds CC0 source and intentionally absent ambience. [`public/audio/`](../../public/audio/) contains the wavs and [`cue.mjs`](../../server/cue.mjs) maps them. The research is reusable for Unreal; a future import does not require reopening source selection. |
| [#53 — Design the event-to-file sound map](https://github.com/jarrodjohnson-gif/emberisle/issues/53) | Closed / `status:done` | **Close — retain closure** | The completion comment names the implemented map in [`cue.mjs`](../../server/cue.mjs); [`sound.ts`](../../src/lib/sound.ts) now maps browser events to the same files. Keep the historical acceptance. Any later change to chip-gain timing or Unreal sound playback should have its own scope and evidence. |
| [#54 — Play a sound for each table action](https://github.com/jarrodjohnson-gif/emberisle/issues/54) | Closed / `status:done`, `mark:changed` | **Close — retain closure** | Accepted host cue work is recorded in its completion comment, and the browser now plays dice, placement, trade, card, error, and win sounds through [`sound.ts`](../../src/lib/sound.ts). README records the later browser sound proof. Do not reuse this completed host/browser issue as an implicit Unreal audio implementation task. |
| [#55 — Test that a missing sound file does not crash](https://github.com/jarrodjohnson-gif/emberisle/issues/55) | Closed / `status:done` | **Close — retain closure** | Its accepted evidence is [`server/sound-prove.mjs`](../../server/sound-prove.mjs), which checks that missing `amb_wind` returns `null` without throwing; [`cue.mjs`](../../server/cue.mjs) also checks mapped-file existence. The browser's [`play`](../../src/lib/sound.ts) catches construction/playback failures. This history proves the host behavior, not the original literal exercise of removing `ui_click` in every client. Keep that distinction if defining a later Unreal failure test. |
| [#56 — Research bank rate, discard, and steal](https://github.com/jarrodjohnson-gif/emberisle/issues/56) | Closed / `status:done` | **Close — retain closure** | The issue records nine shared docks, `harborRate`, discard `floor(count/2)` above seven cards, and `stealTargets`. Those remain host/rules responsibilities in [`rules.ts`](../../src/lib/game/rules.ts), so the research is neither obsolete nor unfinished client work. |
| [#57 — Design the trade panel and the discard modal](https://github.com/jarrodjohnson-gif/emberisle/issues/57) | Closed / `status:done` | **Close — retain closure** | Its accepted comment specifies steppers, bank rates, first-yes acceptance, a 20-second offer, and forced discard completion. The browser has [`TradePanel`](../../src/components/game/TradePanel.tsx), [`TradeToast`](../../src/components/game/TradeToast.tsx), and [`DiscardBar`](../../src/components/game/DiscardBar.tsx). The old phrase “No chat” is scope for that design, not a prohibition on the chat that now exists. |
| [#58 — Take bank trades, offers, discards, and steals](https://github.com/jarrodjohnson-gif/emberisle/issues/58) | Closed / `status:done`, `mark:changed` | **Close — retain closure** | Its accepted implementation was the shared host intents, not proof of an Unreal panel. [`server/trade-prove.mjs`](../../server/trade-prove.mjs) checks four wool becomes one ore and an insufficient three-wool trade fails; [`scripts/trade-prove.mjs`](../../scripts/trade-prove.mjs) covers browser table offers. Keep the completed shared implementation and define any later Unreal UI separately. |
| [#59 — Test a four-card discard and one steal](https://github.com/jarrodjohnson-gif/emberisle/issues/59) | Closed / `status:done` | **Close — retain closure** | [`server/trade-prove.mjs`](../../server/trade-prove.mjs) still contains the exact cases in the accepted issue comment: an eight-card hand rejects discarding three, accepts four, and transfers one ore from the chosen neighbor. These are shared engine checks. They need not block package research, a hostname decision, or art inspection. |

### Windows packaging and real-machine testing: #60–#65 and #88

| Issue | Observed state / label | Recommendation | Evidence and reason |
|---|---|---|---|
| [#60 — Decide: the hostname the packaged game calls](https://github.com/jarrodjohnson-gif/emberisle/issues/60) | Open / `status:backlog` | **Rewrite** | There is no decision comment. Keep this as a future **packaged Unreal endpoint/override decision**, coordinated with #41, #62, and #64. The browser follows its served origin, and [`night.mjs`](../../scripts/night.mjs) prints a quick-tunnel command, so #88 does not require a fixed hostname. [L16 serving research](L16-serve.md) also explains why a named tunnel needs a domain on Jarrod's account; a `cfargotunnel.com` target alone is not a public baked address. |
| [#61 — Decide: whether the first test includes a Mac build](https://github.com/jarrodjohnson-gif/emberisle/issues/61) | Open / `status:backlog` | **Rewrite** | There is no decision comment. The current browser release needs no Mac-specific client package, and [`night.mjs`](../../scripts/night.mjs) uses a platform-aware Node/npm invocation. Rename this as **Unreal package target platforms for the later release**; tie it to available cook hardware, #32's engine/plugins, and a Mac tester rather than the first browser game night. |
| [#62 — Research the Windows package steps for this engine](https://github.com/jarrodjohnson-gif/emberisle/issues/62) | Open / `status:in-review`, `mark:changed` | **Rewrite** | Generic UE4/UE5 Shipping steps already landed in PR #115 as [windows-package.md](windows-package.md). Its own completion comment explicitly says no editor was opened and the engine version is unknown. Narrow the remainder to **verify those steps against the actual #32 project on the gaming PC**: engine version, plugins/C++, launcher name, cook maps, prerequisites, and the host-file location. It cannot yet be called verified for “this engine.” |
| [#63 — Design how a friend installs and joins](https://github.com/jarrodjohnson-gif/emberisle/issues/63) | Open / `status:in-review`, `mark:changed` | **Rewrite** | The zip/Extract All/SmartScreen design landed in PR #68 as [install-join.md](../design/install-join.md). That describes future Unreal distribution; today's friend opens the host URL. Retitle it as **Unreal install and join instructions**, finish the exact launcher path after #62, and align the endpoint instructions with #60. Browser instructions already live in README/#88. |
| [#64 — Package a Windows build pointed at the host](https://github.com/jarrodjohnson-gif/emberisle/issues/64) | Open / `status:backlog` | **Rewrite** | A Windows Unreal zip is not present, and `npm run build` produces browser `dist/`, not an exe. Make the future Unreal deliverable and `needs: gaming-pc` explicit. Dependencies should include #32/#62, agreed install/endpoint/platform decisions (#63/#60/#61), and a working Unreal host-connected client. Resolve beside-launcher versus saved `host.txt` precedence before packaging; do not present this as current browser release packaging. |
| [#65 — Test a second PC joining with a code](https://github.com/jarrodjohnson-gif/emberisle/issues/65) | Open / `status:backlog` | **Rewrite** | Its body requires unzipping #64's build and reporting zip size. Preserve it as **test the packaged Unreal client on a second PC** after #64, including executable/prerequisite/endpoint checks and a placed outpost. It overlaps #88's game outcome but tests a distinct installed artifact; neither should substitute for the other. |
| [#88 — Test a second computer joining over the tunnel](https://github.com/jarrodjohnson-gif/emberisle/issues/88) | Open / `status:backlog` | **Keep** | This is the current browser's distinct real-machine proof. Its comment distinguishes local smoke testing from the actual Cloudflare/second-computer test, and contains no successful two-machine result. [`serve-prove`](../../server/serve-prove.mjs), [`served-prove`](../../scripts/tabs-prove.mjs), and [`night-prove`](../../scripts/night-prove.mjs) cover local infrastructure but do not verify Jarrod's PC, an actual public tunnel, or a friend's network. Retain `needs: jarrod`; a quick tunnel removes the stated #60 dependency. Starting to place requires three or four seated players, so the host plus friend must add another seat before the placement portion. |

## Dependencies and overlap

The browser chain is already implemented locally: host serving and same-origin
sockets → `npm run night` → #88's actual second-machine tunnel test. #60's baked
Unreal hostname, #61's cook platforms, and #64's exe are not prerequisites for
opening the current browser URL.

The retained Unreal goals need an explicit later-release chain: #32 establishes
the real project/engine → client-specific connection and placement work (#41–#47)
and asset/dice work (#48–#51) → project-specific package verification (#62), agreed
endpoint/platform/install details (#60/#61/#63), and a working client → #64's zip
→ #65's second-PC artifact test. Mesh inspection, documentation, and decisions can
be researched without waiting for unrelated gameplay screenshots or trade tests.

#43/#47/#51 overlap existing browser/host proofs but still lack Unreal rendering
evidence. #65/#88 overlap joining and placing an outpost but exercise different
artifacts and delivery paths. Keep those distinctions when deciding which issues
to rewrite. The accepted shared rules, trade, and sound work in #44/#52–#59 should
remain closed; a later Unreal adapter is separate work using those results.

## What I am not sure about

- The external art pack has not been opened here. #32 is still open; this report
  cannot identify its engine version, plugins, or actual dice meshes.
- No successful public-tunnel/two-computer evidence appears in #88's fetched
  comments. An unrecorded manual test may exist, but it is not evidence in this audit.
- `status:in-review` labels are observed state, not evidence of owner acceptance.
  Merged documentation proves that the files landed, not that Unreal was built
  or that a human installation test passed.

## Prove output

Research only: no application tests were run. The implementation/proof references
above come from reading current files and accepted issue comments; this report
does not claim a new fresh-clone run.

Read-only tracker checks used:

```text
gh api repos/jarrodjohnson-gif/emberisle/issues?state=all&per_page=100&page=5
  selected issue bodies/states/labels for #41–#65 and #88: 26 issues
gh api graphql <repository issue/comment query for those 26 numbers>
  read milestones and all available comments; no issue mutations
gh api repos/jarrodjohnson-gif/emberisle/pulls/68
  state: closed; merged_at: 2026-09-27T04:07:50Z
gh api repos/jarrodjohnson-gif/emberisle/pulls/115
  state: closed; merged_at: 2026-09-27T08:12:38Z
```

## Handoff

```text
done: 26 issue recommendations checked against current tracker evidence and repository files
left: Jarrod decides which recommendations to apply to the tracker
broke: nothing; no code or GitHub issue was changed
next agent: keep Unreal rewrites in its later release scope; keep #88 as the browser manual test
```
