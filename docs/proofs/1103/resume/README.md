# Lobby #1103 validation

Source commit: `3b02006` (Sol Agent 2, GPT-6.1 Sol).

The approved geometry replacements are isolated in commit `3cfe5ce`.
The desk authorized them in issue comment 6394236375.
No detector, existing ceiling, growth allowance, behavior check or accessibility check changed.

| Main file:line | Old assertion | Approved replacement | Reason |
|---|---|---|---|
| `scripts/chat-prove.mjs:474` | Top at least 11px; height at most viewport minus 23px; width viewport minus 24px | Exact 16px top/left margins; width and height viewport minus 32px, within 1px | The approved phone card is 358x812 at 390x844. |
| `scripts/chat-prove.mjs:490` | Footer gap at most 1px; no content below; Leave inside footer | Footer gap exactly 8px within 0.1px; same no-content-below and Leave checks | The approved card keeps 8px bottom padding. |

These are the two lines called 479 and 495 in the desk answer.
`loosen-prove` exits 1 and flags exactly those two authorized replacements.
Its detector remains unchanged and unbypassed.

The fresh-clone static results use source commit `3b02006`.
The built comparison checkout uses main commit `b32b40d90467`.
The three screenshots in the parent directory use the same source.
Chat occupies 52.16%, 40.79% and 40.53% of the card at the requested viewports.
The proof also checks 44px targets, 8px control gaps, reactions and sound bubbles clear of names.

The first resumed chat run exposed a real sound-bubble/name overlap.
The CSS fix preserves that assertion; the full chat regression then passes.
One retry encountered a busy port 8094; subsequent runs use the existing VITE_PORT override.
Earlier logs retain those failures for review.

Final validation uses Node 22.23.4, matching CI. Use the `node22-*.log` results.
Earlier Node 26 gzip results are retained as diagnostic history, not the final size claim.
Node 22 exposed a 50B index overage; consolidation into existing lazy chunks removed it.
Only LobbyView needs a new chunk ceiling. Existing ceilings and allowances remain unchanged.
Final Node 22 index: 125169 B, ceiling 125200 B, +7 B against the built base.

The final fresh-clone Node 22 layout, full chat, title-chunk and production chunk-recovery proofs all pass.
The three delivered PNGs have exactly the requested dimensions.
