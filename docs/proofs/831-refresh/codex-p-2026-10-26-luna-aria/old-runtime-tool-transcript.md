# Fail-first tool transcript

Command, run with the browser lock and reviewed local-process permission:

```sh
flock -n /tmp/emberisle-team-browser.lock env PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers npm run trade-tabs-prove
```

This ran after adding the proof assertions and before changing `TradePanel.tsx`. It exited 1 on the old runtime at `selectedTab` line 128. The output was captured in the tool transcript, not a raw shell log:

```text
AssertionError [ERR_ASSERTION]: Table: both route controls resolve to the rendered panel {"tabs":[{"id":"trade-tab-table","controls":"trade-route-table","target":"trade-route-table"},{"id":"trade-tab-bank","controls":"trade-route-bank","target":null}],"panel":{"id":"trade-route-table","labelledBy":"trade-tab-table"}}
    at selectedTab (file:///workspace/emberisle/work/p-luna883/scripts/trade-tabs-prove.mjs:128:10)
    at async tableAndRoutes (file:///workspace/emberisle/work/p-luna883/scripts/trade-tabs-prove.mjs:311:3)
    at async file:///workspace/emberisle/work/p-luna883/scripts/trade-tabs-prove.mjs:683:9 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: false,
  expected: true,
  operator: '==',
  diff: 'simple'
}

Node.js v24.19.0
```

Exit code: 1. No timing is inferred or reported.
