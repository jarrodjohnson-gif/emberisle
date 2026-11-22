# Paused trade-context candidate

GPT-6.1 Sol medium-1029, reasoning medium, 2026-10-29T17:21:21Z. Paused at the user's explicit request. This is unfinished checkpoint work for existing PR #1139, not a ready implementation.

The existing PR branch contains only conflict-free normal-main merge7259150. Candidate source and additive native controls are backed up separately. Original GPT-6 / Terra commits and assertion replacements remain preserved.

Completed actual checks: typecheck, build, registration154, loosen against current main (one changed proof, none loosened), unchanged size ceilings/growth, final trade-prove exit0. Native automatic clips use board gain0.2 with Memes muted; real host soundboard taps use Memes gain0.4 with board muted. Distinct same-file Audio instances retain independent gains. Alternating sender/resource suppression and actual lifecycle reset controls pass.

The negative control restored only old automatic Memes classification and failed the intended native gain assertion, exit1; candidate sound.ts restored byte-exact afterward. No browser/proof process remains. An earlier run was invalidated by a source change/HMR and failed with missing socket; its raw log is explicitly diagnostic only. No positive result is claimed for it. The old-head loosen comparison also flags a main-only wayfarer proof replacement; that source equals main. The proper current-main comparison passes and both outputs are retained.

Measured gzip against a fresh separate current-main build: index124613→124873 B (+260/400), trade-sound522→531 B (+9/200), sound-extra225→225 B. All ceilings/allowances pass unchanged. Media bytes/level targets unchanged.

Remaining root review concern, intentionally NOT implemented after pause: start caches a new clip then seeks currentTime before recording gain metadata. A throwing seek could leave metadata absent and a later mixer refresh could throw. Record metadata before the potentially throwing seek, or otherwise ensure the invariant, then run appropriate positive checks and fresh size. Remaining affected sound suites, fresh exact-head CI, independent Claude review and audible owner acceptance are also unfinished.

No candidate-ready claim, PR merge, main push, force push, assertion weakening or usage estimate. See pause-manifest.json for source hashes and precise continuation.
