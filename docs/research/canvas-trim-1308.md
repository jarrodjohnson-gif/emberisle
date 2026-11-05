# IslandCanvas paired-trim research

Research for #1308. Builder: Codex-p, GPT-6.1 Sol; parent: Codex-p.
Claim6651383831. Canonical source: `f111d0d`.
This note does not implement or complete the parent's 1,000 B trim.
Implementation leaf: [#1311](https://github.com/jarrodjohnson-gif/emberisle/issues/1311).

## Measured baseline

Node22.23.4 built main with the existing locked dependency tree.
The final IslandCanvas file measures 765,516 bytes, 202,145 B gzip.
The current ceiling is 203,500 B, approved in #1307.
`size-prove` passes; no ceiling or allowance changed.

The attribution plugin reads module metadata before final minification and linking.
Its `renderedLength` values identify source weight; they are not marginal gzip savings.
The report reads final chunk files after `build()` returns for actual gzip sizes.
Do not sum individual module sizes or pre-final chunk estimates.

| Module | Pre-minification rendered length |
|---|---:|
| three.module.js | 542,808 |
| three.core.js | 447,714 |
| isle-renderer.ts | 76,863 |
| crystal-water.ts | 33,394 |
| OrbitControls.js | 27,396 |

The final Canvas imports index and dynamically loads jelly-board, harbor-jelly and DockInspection.
Classic is absent from its module graph already.
Wiring Classic lazily in #759 does not remove a current static Classic payload.

## One concrete leaf

Remove only GLSL `//` comment text in `crystal-water.ts` and `isle-renderer.ts`'s `makeWater`.
Keep every line break, token, preprocessor directive and JavaScript interpolation unchanged.
Keep useful explanations outside shader literals as JavaScript comments.
No minifier, third-party patch, build configuration change, async loading change or camera rewrite is needed.

The read-only experiment parses the final JavaScript artifact with Vite's existing parser.
It inspects shader-like literal fragments and matches their comments against those two application files.
Thirteen matching fragments produce a whole-chunk estimate of 200,790 B gzip.
That is 1,355 B below this baseline.
The estimate uses the complete chunk; gzip marginal effects are not additive.

This is an estimate on an artifact, not a source implementation or runtime validation.
It writes JSON only and never writes transformed executable output.
Its syntax-based classification is deliberately narrow; implementation must independently audit literal boundaries.
Actual source edits can change bundler names and compression, so #1311 must measure a fresh build.
The parent's 1,000 B goal stays unfulfilled until that measurement and runtime proofs pass.

The broader experiment also includes six dependency shader fragments.
Its 2,166 B estimate is excluded from the implementation recommendation.
Do not modify Three, its notices, shader source or dependencies.

## Ownership and validation

Fresh open issue timelines and PR filenames showed no existing #1308 task or research reservation.
The proposed source leaf uses separate functions from #881 dock projection and #905 keyboard fitting.
#759's scene-selection reservation, #1137's recovery lifecycle and #1155's upgrade markers stay untouched.
The historical #135 claim delivered PR #465; its closed state releases that reservation.
No claim belonging to another builder was released.

#1311 requires a one-off original/new GLSL equivalence audit, with meaningful negative fixtures.
Compare shader tokens, line breaks, directives and JavaScript interpolation syntax independently of the edit.
Keep this audit as evidence instead of freezing every shader in a permanent snapshot test.
Run registered waves-prove, splash-prove, board-look-prove, jelly-ocean-prove and dpr-prove serially.
Board-look covers simple and crystal water; no separate water-probe or crystal-water command exists.
Then run types/build/size/growth/registered/loosen and inspect exact-head CI.
No existing proof or acceptance gate changes.

## Reproduce

From the repository root, with installed locked dependencies:

```sh
npm exec --yes --package=node@22.23.4 -- node docs/research/canvas-trim-1308/audit-build.mjs
npm exec --yes --package=node@22.23.4 -- node docs/research/canvas-trim-1308/artifact-comment-audit.mjs
npm exec --yes --package=node@22.23.4 -- node scripts/size-prove.mjs
```

All three commands exited 0. Raw logs and JSON are beside this note.
Build timestamps and imported hashed filenames can change gzip by a few bytes on repeated builds.
Use fresh comparable builds for the implementation's acceptance decision.
No browser proof applies to this documentation-only research step.
Usage percentages were unavailable. Research PR uses Refs #1308; the parent remains open.
