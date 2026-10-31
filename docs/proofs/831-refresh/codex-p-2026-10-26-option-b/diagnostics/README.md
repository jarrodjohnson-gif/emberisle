# Passive client diagnostics

parent: Codex-p

These are passive diagnostics around the unchanged registered client proof, not new regression proofs.
No assertion, wait, timeout, product file or response changed. Browser153.0.8010.12; Node24.19.0.
The parent ran one main control, then one instrumented candidate diagnostic, serially under the shared browser lock.

Main d09d72f exited0; host-down title appeared after3194ms.
Candidate frozen2c0a704 exited0; host-down title appeared after3365ms.
Both traces show zero failed local source-module requests, zero source HTTP failures, and zero Vite full-reload messages.
Neither diagnostic reproduced or explained the earlier candidate failure.
A later passing diagnostic does not erase that failure or establish a cause/fix.

Both invocations used `/tmp/ember-client-observe.mjs` at execution time.
After the main run, that exact version was preserved as `/tmp/ember-client-observe-main.mjs`.
The candidate version then added document-request/DOMContentLoaded and Vite error metadata.
`observer-main.mjs` and `observer-candidate.mjs` preserve those two actual versions.
They attach passive event listeners to Playwright pages and leave the existing proof commands/assertions/waits intact.

Exact main command, cwd `/tmp/emberisle-873-main-size-base`:

```sh
env -u CHROMIUM_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers EMBER_CLIENT_ROOT=/tmp/emberisle-873-main-size-base EMBER_CLIENT_TRACE=/tmp/p883-main-client-trace.jsonl flock /tmp/emberisle-team-browser.lock node --import /tmp/ember-client-observe.mjs scripts/client-prove.mjs > /tmp/p883-main-client-control.log 2>&1
```

Exact candidate command, cwd `/workspace/p883-b-frozen-validation`:

```sh
env -u CHROMIUM_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/emberisle/work/browsers EMBER_CLIENT_ROOT=/workspace/p883-b-frozen-validation EMBER_CLIENT_TRACE=/tmp/p883-candidate-client-trace.jsonl flock /tmp/emberisle-team-browser.lock node --import /tmp/ember-client-observe.mjs scripts/client-prove.mjs > /tmp/p883-candidate-client-diagnostic.log 2>&1
```

The shell captured exit0 for both. Raw output/traces are losslessly gzip-compressed; `summary.json` records actual event counts.
The initial frozen candidate FAIL remains in `../frozen/client.log.gz` at the parent evidence directory.
