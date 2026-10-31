# Longest-army fixture construction

Research for #1050 by Codex-open-table-833 (GPT-6.1 Sol), 2026-10-23.
Audited main `297a86aedc1e8814ed2a5e96a930404ff6763ff9` and #1048 head `79ba06b45cb0f02c36df6e8e4b88229828b6dbd9`.
Their application and longest-army proof bytes match. #1048 adds only a server-seat test.

## Observed failure

[CI run39982515840](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/39982515840), job120513429566, failed at 16:08:30 UTC.
The connector retrieved the completed job log while the aggregate run continued.
The CLI refused that early download; its missing-log result did not establish a runner defect.

```text
AssertionError [ERR_ASSERTION]: the rules built every scenario on some island
    at scripts/longest-army-prove.mjs:111:10
actual: null
expected: true
```

This assertion precedes browser pages and rendered badge checks.
It reports fixture construction, not an occlusion, animation or screenshot timeout.
The production renderer does not construct these states.

## Source boundary

- [Roll-off](../../src/lib/game/rules.ts#L303) uses native crypto dice and reorders players before setup.
- [The fixture](../../scripts/longest-army-prove.mjs#L47) plays that roll-off, then always chooses the first legal setup locations.
- [Greedy growth](../../scripts/longest-army-prove.mjs#L63) lengthens fixed player IDs without backtracking around another player's placements.
- [The seed search](../../scripts/longest-army-prove.mjs#L86) tries seeds1–59 until all nine states exist.
- [Its guard](../../scripts/longest-army-prove.mjs#L111) rejects a null result before any browser scenario.

A board seed does not fix the crypto-driven roll-off order.
Changing seeds therefore does not guarantee a usable placement order.
The proof's SHA256 is `d398943d757b68dcb236e988d811f8ab8651ecbe4dad417d275b0ee804e8e634`.

## Controlled results

An isolated Node diagnostic executed the current fixture block through Vite's real board and rules modules.
It supplied four distinct, valid dice draws for each possible setup order.
It retained the original seeds1–59 search and every legal setup/path/knight action.
No repository source changed. Native crypto was restored in `finally`.

| Controlled setup order | Seed attempts | Constructed states | Expected holder checks |
|---|---:|---:|---:|
| p0,p2,p3,p1 | 1 | 9 | 18 passed |
| p0,p3,p2,p1 | 1 | 9 | 18 passed |
| p3,p2,p0,p1 | 1 | 9 | 18 passed |
| Each of the other 21 orders | 59 each | 0 | No states to check |

The controlled run made 1,242 deals across all 24 orders.
Each successful order worked at seed1 and preserved every expected path/army holder.
An unusable order reproduces the null fixture result across the complete seed search.
This establishes order dependence; it does not recover the failed CI run's actual dice sequence.

A separate 100-trial construction run used unchanged native crypto. All 100 constructed nine states.
That run did not execute 100 browser proofs and did not reproduce the CI failure naturally.
The sample does not establish a failure rate. Roll-off orders also need not be uniformly distributed.

The complete unchanged browser proof passed locally once at all four existing viewports on #1048.
That pass does not make the failed CI run green or prove the bounded search reliable.

## Reproduce the controlled construction

Run this in a clean checkout after `npm ci`.
It extracts the existing fixture instead of maintaining a second implementation.
It prints construction outcomes; it is a research diagnostic, not a new CI proof.

```sh
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
const source = readFileSync('scripts/longest-army-prove.mjs', 'utf8');
const fixture = source.slice(source.indexOf('  const act ='), source.indexOf('  assert.ok(steps,'));
const { createGame } = await vite.ssrLoadModule('/src/lib/game/board.ts');
const { applyAction, legalRoads, legalSettle, roadLength } = await vite.ssrLoadModule('/src/lib/game/rules.ts');
const build = new Function('createGame', 'applyAction', 'legalRoads', 'legalSettle', 'roadLength', 'assert', fixture + '\nreturn steps;');
const orders = a => a.length ? a.flatMap((x, i) => orders(a.filter((_, j) => i !== j)).map(p => [x, ...p])) : [[]];
const native = crypto.getRandomValues;
try {
  for (const order of orders(['p0', 'p1', 'p2', 'p3'])) {
    let draws = 0, deals = 0;
    const values = Array.from({ length: 4 }, (_, i) => 5 - order.indexOf('p' + i));
    crypto.getRandomValues = a => { a[0] = values[draws++ % 4]; return a; };
    const counted = opts => { deals++; return createGame(opts); };
    const steps = build(counted, applyAction, legalRoads, legalSettle, roadLength, assert);
    if (steps) for (const s of steps) {
      assert.equal(s.st.longestRoad, s.path, s.name);
      assert.equal(s.st.largestArmy, s.army, s.name);
    }
    console.log(JSON.stringify({ order, deals, states: steps?.length ?? 0 }));
  }
} finally {
  crypto.getRandomValues = native;
  console.log('native crypto restored:', crypto.getRandomValues === native);
  await vite.close();
}
JS
```

## Bounded correction

[#1051](https://github.com/jarrodjohnson-gif/emberisle/issues/1051) owns deterministic construction through the real rules.
It must retain the nine scenarios and all four viewport, holder, tie, geometry and motion assertions.
A known unusable order must still fail the fixture guard.
Any fixture-local entropy control must restore native crypto on both success and failure.
Production dice, scoring, rendering, deadlines and budgets stay unchanged.
Increasing the search or rerunning CI would not remove the hidden order dependency.

The child remains Backlog and reserves no files.
[#539](https://github.com/jarrodjohnson-gif/emberisle/issues/539) reserves browser proofs; coordination must precede editing `longest-army-prove.mjs`.
This report supplies no authority to override that reservation.

## Validation boundary

Source diagnostics used fresh checkout79ba06b, whose frontend and fixture match audited main297a86a.
The document's fresh-clone links, source hash, one-document scope and whitespace checks are recorded in the PR.
There is no runtime, browser-proof, CI, budget or asset edit in this research change.
No listening, physical-device acceptance or independent review is claimed.
