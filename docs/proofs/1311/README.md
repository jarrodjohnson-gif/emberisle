# Water shader comment relocation

Issue #1311, paired trim #1308. Builder: Codex-p, GPT-6.1 Sol; parent: Codex-p.
Claim6651512782; exact documentation expansion6651663779.

## Source and measured cut

Runtime source `ff26be5eab6ef2fdee1a55d19267055e2924439d` moves28 shader comment lines outside seven GLSL literals.
All explanations remain as JavaScript comments. Shader line breaks remain in place.
Only `crystal-water.ts` and `isle-renderer.ts`'s `makeWater` change.
No shader values, non-comment runtime syntax, directives, interpolation expressions or behavior change.

One combined cut: application GLSL comment text across those two files.
Do not add per-module gzip estimates; shared compression makes them non-additive.

| Build pair | Main Canvas gzip | PR Canvas gzip | Saving |
|---|---:|---:|---:|
| f111d0d vs frozen ff26be5 | 202146 B | 200781 B | 1365 B |
| current main82c440b2 vs merge7cd02a2 | 202147 B | 200786 B | 1361 B |

Both whole-chunk measurements exceed the1,000 B target.
Every chunk passes absolute ceilings and growth allowances. The Canvas ceiling remains203,500 B.
Current-main index125527 B versus PR125525 B also passes.
Build metadata and imported hashed filenames explain why fresh builds can differ by a few bytes.
Use the actual paired outputs; the research's1355 B potential was an estimate only.

## Independent equivalence evidence

`equivalence-audit.mjs` is a one-off review tool, not a permanent snapshot or new CI proof.
It compiles the original and changed TypeScript with Vite's existing transformer.
It compares the complete compiled JavaScript AST, ignoring source locations and raw spelling.
Only GLSL line-comment text and horizontal whitespace normalize inside shader template fragments.
Shader token boundaries, every newline, preprocessor tokens and interpolation ASTs remain equal.
Every other compiled JavaScript node remains equal.
Four in-memory negative fixtures reject a changed shader numeric token, newline, directive and interpolation.
The audit passes against f111d0d and current main82c440b2.
The separate edit-map identifies original literal lines and moved comment counts.

## Runtime and static checks

Node22.23.4, Playwright1.63.0, pinned Chromium1243 headless shell.
Browser commands run once on frozen sourceff26be5, strictly serially under the team lock:

- `npm run waves-prove`: exit0; CPU twin and rendered foam checks pass.
- `npm run splash-prove`: exit0; crystal/simple, physical response, bounded splashes and reduced motion pass.
- `npm run board-look-prove`: exit0; actual dealt crystal frame/diagnostics retained.
- `npm run jelly-ocean-prove`: exit0 at1280x720,390x844 and844x390.
- `npm run dpr-prove`: exit0 for coarse simple/crystal and fine-pointer paths.

Types/build/registered179/loosen and fresh-base size/growth pass.
Normal merge7cd02a2 consumes current main82c440b2, which differs from f111d0d in documentation only.
Runtime, existing proofs, registrations and lockfiles still match frozen sourceff26be5 exactly.
Post-merge types/build/size/growth and equivalence audit pass; browser checks need no repeat for documentation.
Raw logs and exit results are retained. Usage percentages were unavailable.

## Corrections and retained limits

The original research note and child issue mistakenly named separate water-probe and crystal-water commands.
Neither command exists. The issue and merged research note now name the actual registered proofs above.
Board-look covers the simple and crystal paths. No existing proof, assertion or registration was changed.
The research note correction changes documentation only.

The first fresh baseline checkout failed with ENOSPC; setup-notes.txt records the exact operation and recovery.
No source was lost, and no other builder's worktree or dependency installation was removed.
Only this invocation's clean disposable baseline was reclaimed; the published research worktree supplied the fresh baseline.

A passing current colour sample does not explain #905's historical missing-seed failure.
No terrain, GPU, timing or historical-colour causal claim follows.
Exact-head hosted CI and independent Claude review remain required.
No ceiling, allowance, dependency, build configuration, existing proof or assertion changes occurred.
No manual CI retry, merge, force-push or physical-device acceptance is claimed.
