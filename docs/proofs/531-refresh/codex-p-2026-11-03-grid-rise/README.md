# Grid-aligned current-turn rise, 2026-11-03

Builder: Codex-p (GPT-6.1 Sol); parent: Codex-p.
Product commit: `0de30e73738ad5c4c2c96befdb405ee91e3d4b20`.
Separate proof-only commit: `daa2a59d419db801d63050bb8aa42ad704fa98db`.
Base control: `30d1a5ceef43fb6698c3483a64606e9c69eb5812`.
Node 24.19.0; npm 11.9.0; pinned Playwright 1.63.0.

## Failure and control

Exact CI41473951895, job125375132706, fails the army clearance assertion on `a3be675`.
The 390x844 army2/p1 tally top is37.000450134277344; points bottom is37.00045108795166.
All three original clearance clauses are false. The complete hosted job log is retained.
Previous CI41467806587 has the same clearance family and remains in the preceding evidence directory.
Neither run was manually retried.

The additive marker regression fails the unfixed runtime on the unchanged clearance predicate.
The fail-first log precedes added endpoint/progression assertions; that clearance predicate remains identical.
At0.01ms of native rise, the vertical gap is−0.00000095367431640625px.
DejaVu Sans matches the hosted point/tally widths13.71875/25.640625px; horizontal clearance is false.
The native local font has a horizontal-clear alternative despite negative vertical drift.
Logs preserve that distinction, both early incomplete controls, and the DejaVu reproduction.
The control uses browser Animation.pause/currentTime on real CSS transitions.
It changes neither production timing nor the army proof.
This demonstrates transform arithmetic drift under controlled fractional progress.
The hosted failure's exact animation progress was not captured.

## Product and regression

The reviewer's relative `top` offsets replace the nested transform chain.
The card, inset ring, pointer and content retain the2px rise and150ms easing.
The button retains its44px box at the safe-area edge throughout the rise.
Reduced motion retains the ring/pointer and removes all offsets.
Ring z-index1 and pointer z-index2 remain unchanged.

The existing registered marker proof adds56 controlled fractional samples across both phone orientations and two fonts.
Each sample checks both tallies against the original clearance predicate, card containment,44px height and fixed control bounds.
The endpoints are exactly12→10px; content follows the card; progression stays monotonic.
The original turn/seat/count/visibility/pixel/trade/win and reduced-motion checks remain.
`scripts/longest-army-prove.mjs` remains byte-exact.
No assertion tolerance, wait, deadline, lockfile, size ceiling or allowance changes.

## Equivalent assertion replacement

Authority: owner-approved2px rise; Claude review6581086057 explicitly recommends grid-aligned relative positioning.
The2026-10-25 owner decision permits equivalent replacements in a separate commit.
Only the implementation-specific transform assertion changes; every existing behavioral assertion remains.
The proof has36→46assertion lines:35verbatim,1replacement,11additions.
The advisory detector still flags the replaced line; it is not edited or bypassed.

| File and line | Exact old assertion | Exact new assertion | Why |
|---|---|---|---|
| `scripts/turn-marker-prove.mjs`: old217; new270 | ``assert.deepEqual([moving.card, moving.button, ...new Set(moving.kids)], [matrix(-2), matrix(2), matrix(-2)], `${v.tag}: card, button and content transforms ${JSON.stringify(moving)}`);`` | ``assert.deepEqual(moving.offsets, ["-2px", "2px", "-2px", "-2px"], `${v.tag}: card, button and content use the 2 px layout rise ${JSON.stringify(moving)}`);`` | The approved2px rise now uses layout offsets. This separate proof-only commit retains exact offset and observable geometry checks. |

New271requires transforms all`none`; original272requires`[cardAbove,buttonAbove]=[2,0]`.
New314requires reduced offsets all`0px`; original315–317still require static geometry and the visible ring/mark.
New103–115check exact2px endpoints, progression, card/content alignment, fixed44px controls and unchanged tally clearance.

## Pre-resume validation on0de30e7/daa2a59

Six focused browser proofs pass: marker, safe-area269, hole500, seat-rail, army and trade.
The candidate chat proof fails in the phone lobby before Start.
After Real badman, scrolling Gong fails with `Element is not attached to the DOM`.
This is a validation limitation; no all-checks-passing or ready claim applies.
The initial main control stops before hostPort because server ws is not installed.
That setup failure and pinned installation output are retained.
The installed unchanged main control passes: `chat-prove: ok; zero errors`,142s.
Its pass does not explain the candidate failure; no candidate retry follows.
Chat proof SHA256 is9539a294d29391cc42432a71e5a7c0b2dd936776612578d73809321280ca7bd9 on candidate/main30d1a5c/oldf630606.
The failure occurs before the game mounts a current-turn strip. Attribution remains unproved.
No chat source/proof change or candidate retry follows it.
Exact results are in `results.json`.
Browser proofs use `/tmp/emberisle-team-browser.lock` one at a time.
Typecheck, registration170, build and corrected size comparison pass.
Index124923/125200B; growth+39/400B against built main30d1a5c.
The first size command mistakenly supplied`--base <checkout>/dist`; its real failure is retained.
The corrected invocation supplies the checkout root.
Default loosen used the untouched stale originfork reference and reported unrelated historical changes.
The explicit`--base a3be675` run reports only the equivalent assertion above.
All such outputs remain available; none is claimed green.

The six pre-resume owner views were individually inspected.
Their screenshot files are now refreshed from the finalb0512d8 marker run described below.
Trade screenshots retain synthetic offer fixtures; winner screenshots remain generated by the existing proof.
No new winner screenshot copies are stored here.
The inset ivory ring remains low contrast by design; its ink edge and pointer remain visible.
Question6547754105 and owner picture acceptance remain open.
Fresh exact-head CI and independent Claude review remain mandatory.


## Resume: hosted size ceiling and current-main integration

Full hosted build125683842271 used Node22.23.4 and synthetic merge5bc31a6 into mainfa8b967.
It failed index125226/125200B; growth+30/400B over base125196B.
That real failure is retained as a compressed full log.
The earlier Node24 measurement was a different build/runtime, not evidence that hosted CI passed.

Normal main mergea9da8b60588eabe3a76f7c907b2d2831f0a221d4 integrates maind5b6e48 without conflicts.
Product trims938887e0335365cfb6ee7499bc58b8a3e438abfa andb0512d8e06bdce7174321cee5c0c182758edaab1 stay within marker hunks.
They reuse the immutable empty marker span, remove its redundant class, and simplify marker booleans.
The existing data-testid selects the same pointer; aria-hidden and every painted property remain unchanged.
SeatCard reuses its turn boolean for aria-current; TradeToast reuses its offer-colour lookup for the ring.
The exact static card utilities move from JSX into the existing CSS rule.
No lazy load, new DOM node, changed motion, hitbox, assertion or budget is introduced.

| Computed property | Original utilities | Moved CSS |
|---|---|---|
| position | relative | relative |
| --tw-duration | .2s | .2s |
| transition-property | color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to | identical |
| transition-timing-function | var(--tw-ease, var(--default-transition-timing-function)) | identical |
| transition-duration | .2s | .2s |

The existing strip shorthand still overrides these transitions with its unchanged150ms top rise.
Pinned Node22.23.4 build/typecheck/size on committed sourceb0512d8 pass.
Index125173/125200B; growth−21/400B over built current maind5b6e48 at125194B.
Intermediate static-element, boolean, style and CSS-only trim attempts that still exceed the ceiling are retained.
The938887e committed-head check passes125199B, so further deduplication creates usable headroom.
No measurement is replaced with an estimate.

One safe-area run started before the last source edit and was stopped deliberately after that edit.
Its partial log is non-final evidence and does not count as validation.
A new stable-source serial run starts afterb0512d8; source stays frozen throughout.
The final proof logs/results and refreshed owner pictures are recorded separately below.

Loosen against pre-merge daa2a59 reports four main-inherited trade/countdown replacements.
Those inherited lines are unchanged here; the actual output is retained.
Loosen against current maind5b6e48 reports zero changed proofs; no detector is edited or bypassed.
The earlier transform-equivalence table above still records this PR's separate proof-only commit.
Registration now covers176 proofs after the normal main merge.


## Stable-source safe-area result

The stable-source marker proof passes34/32/29 moves and7 passes at1280/390/844, plus56 fractional samples.
The stable-source safe-area run then fails after844x390 setup-path geometry.
The next page.evaluate reports `Cannot read properties of undefined (reading 'getState')` on window.__emberisle.
The run supplies no causal navigation/console evidence; no full safe-area pass applies to this source.
One unchanged maind5b6e48 control passes the full safe-area proof with zero console errors.
Passing main does not explain, fix or attribute the candidate failure.
The candidate safe-area proof is not retried; no timing, wait, fixture or runtime change follows this failure.
The earlier passing safe-area run applies only to the pre-resume source listed above.
The edited-during-execution partial run remains excluded.
No P1 flaky-proof work is started under the owner's P2/P3 scope.


The independent stable-source hole proof fails at its first geometry read (`scripts/hole-prove.mjs:64`).
`window.__isle` is undefined when reading `liveInsets`; only the preceding stylesheet breakpoint check passed.
No500-pair pass applies to resumed source; attribution remains unproved and no candidate retry follows.
The earlier passing hole run applies only to its recorded pre-resume source.

## Hosted source checkpoint

Pushed sourceb0512d8 has successful build job126202626264 in automatic CI41717447343, attempt1.
Actor and triggering actor are`joshjenjarrod001-tech`; event is`pull_request`.
No manual rerun was requested.
The actual hosted checkout is mergebe1cd22 into current maind5b6e48, using Node22.23.4.
Hosted index125171/125200B; base125186B; growth−15/400B; all ceilings and growth checks pass.
The full decoded hosted log is retained.
Build metadata differs from the local build; both actual measurements are reported separately.
Other CI jobs and independent Claude/owner gates remain outstanding at this checkpoint.


## Final selected checks and owner pictures

Stable source remainsb0512d8 throughout every final browser run.
The final seat-rail and unchanged full longest-army proofs pass.
The final trade proof fails in its lobby: Start click times out after30000ms.
The game/current-turn marker has not mounted; this observation does not establish a cause.
The final trade candidate is not retried and no P1 setup-flake fix is started.
Final source has three passing selected browser proofs: marker, seat-rail and army.
Safe-area, hole and trade fail as recorded; earlier candidate chat failure also remains unresolved.
No all-pass, ready-for-merge, or resolved-flake claim applies.

All six screenshots here now come from the final stable-source marker proof and were individually inspected.
They show phone upright, sideways and desktop, each with and without an offer.
The visible ring/pointer remain; the ivory ring remains low contrast and reads through its ink edge.
Trade screenshots use the existing synthetic long-lived offer fixture (the599s countdown is fixture data).
They do not claim the changed human-offer lifetime or unrelated trade flows were validated.
Winner fixtures remain covered by the marker proof; no new winner screenshot copies are stored.
Owner Question6547754105 and picture acceptance remain open.

`resume-size/final-results.json` separates final source, pre-resume results, control, and excluded interruption.
Every resume log is compressed losslessly under`resume-size/`; the payload manifest records SHA256 hashes.
No new proof script, tolerance, deadline, timeout, budget, lockfile or manual CI retry is introduced.
