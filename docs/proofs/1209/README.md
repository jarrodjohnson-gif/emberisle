# #1209: deterministic steal-picker proof, 2026-10-30

Builder: Codex-p. Parent: Codex-p. Model: GPT-6.1 Sol. Source commit: `7044de5`; base main: `2e1635ca9516c42204a99765d7dc709a7b68dfdb`. Usage percentages unavailable.

## Cause and controlled failures

`rules.ts:8–12` draws each die from `crypto.getRandomValues`. `state.rng` is used by the separate `nextRand`, so `seed: 11` fixes the board but neither the roll-off nor either process's dice. The proof's setup-process preflight and the later authoritative-host roll draw independently. A successful preflight cannot predict a non-seven host roll.

Both reported failure signatures were reproduced against the **unchanged original proof** from main:

| Control | Actual outcome |
| --- | --- |
| Parent roll-off faces 6,4,2; preflight 3+4 | Original `setup: seeded roll must leave the same player and two legal victims` throw, exit 1. |
| Parent roll-off 6,4,2; preflight 4+4; independent host 3+4 | First five browser checks pass; the unchanged 30000 ms wait times out at original line149. Diagnostic client state is phase `robber`, current `p0`, dice `[3,4]`, picker null, error null. Exit 1. |

Raw output is in `original-setup-seven.log` and `original-host-seven.log`. `control-preload.txt` is the exact temporary preload used: finite parent dice, host-only child preload, and diagnostic wrapping that prints the client state on an existing wait failure before rethrowing it. It changes no original proof bytes, condition or deadline. The controlled host uses the real Roll button, action protocol, authoritative rules and pushed client state.

These controls establish a concrete sufficient cause of both signatures. The historical CI logs provide no recorded dice values; their download endpoint returned403 here, so this evidence does not claim to have observed the dice in those old CI runs.

## Fix

The existing registered proof now fixes its roll-off to6/4/2, its setup-process preflight to4/4, and its separate child-host roll to4/4. The finite fixture intercepts only single-word Uint32 dice requests; other entropy calls delegate to native crypto. The parent restores the original function and property descriptor in finally. The child restores immediately on its second die and verifies native function identity and own-property restoration before returning that die. No production flag or source change is involved. A new browser check requires the actual host dice to match the preflight and equal `[4,4]`.

Every original case, all seven original check calls, all six original throw lines, the exact setup condition, and all six wait/deadline lines remain byte-for-byte. `source-audit.json` records those checks and source/control hashes. The actual Roll click, host dispatch and original phase wait remain. No assertion replacement table is needed because no original assertion changed.

## Actual validation

- Five complete serial runs passed before adding the child restoration invariant; those logs remain in `before-host-restore-check/`.
- **Three complete runs on final source7044de5 pass**, with all original checks and the added real-host `[4,4]` check. See `final-1.log` through `final-3.log`.
- Typecheck, build, registered-prove160, whitespace and size ceilings/base-growth pass. Index measurements are in `size.log`; no allowance or ceiling moved.
- `loosen-committed.log`: one changed proof, none loosened. The earlier precommit `loosen.log` saw zero changed proofs because the detector reads committed HEAD; it is retained and superseded by this committed-source check.
- Production, server, package/CI registration, flaky configuration, lockfile and size-budget diffs against main are empty. The existing proof was already registered; no new proof command was added.
- Playwright1.63.0 / Chromium153.0.8010.12 / Nodev24.19.0; all browser proofs ran serially under `/tmp/emberisle-team-browser.lock`, with `PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers` and `CHROMIUM_PATH` unset.

## Reproduce

For the passing test, run `npm run steal-picker-push-prove` with the matching Playwright browser. For the original controls, use a separate checkout of base2e1635c, copy `control-preload.txt` to `/tmp/sol-next/control.mjs`, and run `node --import ./server/register.mjs --import /tmp/sol-next/control.mjs scripts/steal-picker-push-prove.mjs` with `STEAL_CONTROL=setup-seven` or `STEAL_CONTROL=host-seven`. The exact preload uses this workspace's installed Playwright package and `/tmp/sol-next/host-seven.mjs`; adapt those two local paths in another workspace. Keep the original proof unchanged and the serial browser lock.

Jarrod explicitly said “Take another one”, authorizing reuse of the sixth open-PR slot after #1214 merged; the existing five PRs remain untouched. Independent Claude review and fresh exact-head CI remain required. No merge, main push, force push, rebase, assertion/deadline relaxation, budget increase or lock change.

— Codex-p <codex-p@users.noreply.github.com>
