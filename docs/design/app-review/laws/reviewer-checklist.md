# Design laws: reviewer checklist

Answer each question with `yes`, `no` or `n/a` and a line of evidence. **Auto** means a proof can and should answer it (reject a PR whose proof output is missing or "estimated"). **Owner** means it needs Jarrod's eyes on screenshots or the hosted build; the reviewer flags it, the desk collects the owner's answer.

| # | Law | Question | Who checks |
|---|---|---|---|
| 1 | 1 | Does the PR paste the hand-row top y and dock height for every state at 390x844 and 844x390, and are they identical? | Auto (reflow/dock proof) |
| 2 | 2 | Does every element that can come and go have a fixed slot, and does the Fortunes button keep one box and one label? | Auto (box equality); Owner (does anything "push" when a bot acts?) |
| 3 | 3 | Is the island's fit unchanged across states, and is its share at or above the agreed minimum at both sizes? | Auto (`__isle.fit` equality, share logged); Owner (does the map feel big enough?) |
| 4 | 4 | Is `hud-safe-area-prove` green, and does new CSS use only the spacing scale? | Auto |
| 5 | 5 | Are all on-turn actions in the bottom third on both phone sizes? | Auto (y thresholds) |
| 6 | 6 | Is every new interactive element at least 44x44 with 8 px gaps, and are Trade and End turn apart? | Auto (box listing) |
| 7 | 7 | Does no dock element sit over a legal setup corner or edge? | Auto (`touch-place-prove` style count) |
| 8 | 8 | Is there exactly one primary button per state? | Auto (count); Owner (is it the right one?) |
| 9 | 9 | Five type sizes only, nothing under 12 px, one instruction sentence, no uppercase-tracked labels? | Auto (computed font sizes); Owner (does the copy read as one voice?) |
| 10 | 10 | Does each new sheet show Close at three viewports, close on Esc, and never stack? | Auto |
| 11 | 11 | No layout animation; nothing over 320 ms that a tap cannot skip; no intent delayed by motion? | Auto (CSS scan, timing proof); Owner (does it feel snappy, not "AI slop"?) |
| 12 | 12 | Do gains and losses still animate on another seat's turn, with sign and number? | Auto (flash fires in practice mode); Owner (frames of a bot roll) |
| 13 | 13 | `contrast-prove` green for new chips; reduced-motion run shows steady states and loses nothing? | Auto |
| 14 | 14 | Names, colours and surfaces consistent with README "Names" and polish.md; verb-plus-amount labels? | Reviewer by reading the diff; Owner for any new word |

**Adding something new** (when the PR adds an element or feature):

| Question | Who checks |
|---|---|
| Does the issue name the journey and the fixed slot or sheet, and did no existing slot appear, disappear or resize? | Auto (slot equality across states); Owner (does it belong there?) |
| Do practice, hosting and joining still work with it never opened or unavailable? | Auto (flows proofs) |
| Does it take at most one slot in portrait and short landscape, with the island share unchanged? | Auto (`__isle.fit`, box listing) |
| Does it show a greyed slot, not a gap, when it has nothing to say? | Owner (frame of the quiet state) |
| Does closing it move nothing else? | Auto (before/after boxes) |
| Is its proof registered and does it cover slot, targets and contrast? | Reviewer (package.json, ci.yml) |
| Is there a linked owner approval of a mock placed beside the current screen? | Owner |

Always: screenshots of every state at both phone sizes attached for the owner (DECISIONS 2026-10-22: "shows the island size at each setting before anything is built"). A loosened or skipped proof is a reject regardless of the table above.
