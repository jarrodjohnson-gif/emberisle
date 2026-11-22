# #1166: client restore failure after a failed IslandCanvas import

Claude Opus 5.5 (builder 2), 2026-10-31. Investigation evidence plus one diagnostics-only change to `scripts/client-prove.mjs`. No assertion, timeout, fixture or runtime change.

## Summary

- The failing step is always the same one: the host-down reload, the 7th of 7 page loads in `client-prove`. Loads 3 to 7 come within about 2.1 s.
- In the retained failure, 29 module fetches on that reload fail with `net::ERR_INSUFFICIENT_RESOURCES`, so the app never boots and the title card never appears.
- **Ruled out: file-descriptor exhaustion.** Capping the fd limit makes later navigations hang instead, with zero `ERR_INSUFFICIENT_RESOURCES`.
- **Supported, not proved: memory pressure at the reload burst.** The run's memory high-water mark is at the host-down reload. A memory cap just under that peak fails the unchanged proof at exactly that step, though as a renderer OOM crash, not as the graceful allocation failure. A cap just above it passes.
- The exact original signature (graceful `ERR_INSUFFICIENT_RESOURCES` on script fetches) was **not** reproduced here. The cause stays unproved. This records a bounded candidate and adds diagnostics so the next natural failure names its failed requests.

Environment: Linux, 2 CPUs, 7.9 GB RAM, `/dev/shm` 7.9 GB, `ulimit -n` 20000, Playwright 1.63.0 with its bundled Chromium headless shell (build 1243). Base `f209462`. Every browser run was serial, one at a time.

## 1. The retained failure, per page load

From `docs/proofs/627-refresh/client-diagnostic-2026-10-27/raw/candidate-trace.jsonl.gz` (commit `f3c47f5`, Codex-p's passive observer). "Unanswered" means requested but neither answered nor failed before the next navigation.

| Load | Started (ms) | Lasted (ms) | Requests | Answered | Failed | Unanswered |
|---|---|---|---|---|---|---|
| 1 | 555 | 33006 | 124 | 125 | 0 | 0 |
| 2 | 33561 | 17214 | 120 | 121 | 0 | 0 |
| 3 | 50775 | 822 | 68 | 68 | 0 | 1 |
| 4 | 51596 | 407 | 129 | 104 | 0 | 2 |
| 5 | 52003 | 311 | 103 | 98 | 0 | 6 |
| 6 | 52314 | 307 | 67 | 71 | 0 | 1 |
| 7 (host-down reload) | 52621 | – | 75 | 41 | **29** | 6 |

The passing main run in the same folder made the same burst with no failed requests. With at most about 130 requests per load, no request-count cap is near. In Chromium on Linux, an ordinary subresource fetch fails with `ERR_INSUFFICIENT_RESOURCES` mainly when the network service cannot allocate the response's shared-memory data pipe. That points at resource exhaustion in the process, not at the app's own code. Playwright already passes `--disable-dev-shm-usage`, so the size of `/dev/shm` alone is not the cause.

## 2. Unchanged proof, no limits

| Run | Result | Host-down title |
|---|---|---|
| `base1.log` | pass | 3090 ms |
| `base2.log` (with fd sampler) | pass | 3063 ms |
| `free.log` (in an uncapped child cgroup, with observer) | pass | 3353 ms |
| `tl.log` (with memory timeline) | pass | 3149 ms |
| `final.log` (with this PR's diagnostic) | pass | 3061 ms |

## 3. File descriptors: ruled out

An external sampler (`fdsample.py`) read `/proc` every 100 ms. The browser process peaked at 372 fds, 329 of them shared-memory regions, during the end-of-run reload burst. Sandboxed child processes were not readable.

The unchanged proof was then run under lower `ulimit -n`, with a passive `--import` observer (`observer.mjs`) that only adds listeners:

| `ulimit -n` | Result | `ERR_INSUFFICIENT_RESOURCES` |
|---|---|---|
| 384 | host-down passed (3136 ms), then the next `page.goto` hung for 30 s | 0 |
| 360 | host-down passed (3531 ms), then the next `page.goto` hung for 30 s | 0 |
| 340 | host-down passed (3321 ms), then the next `page.goto` hung for 30 s | 0 |
| 320 | a `page.reload` hung for 30 s, before host-down | 0 |

Fd exhaustion gives a different symptom (hanging navigations), so it does not explain this failure.

## 4. Memory: high-water mark at the host-down reload

The proof ran inside a child memory cgroup, sampled every 100 ms (`memtl.txt`) and aligned to the observer's navigation times (`obstl.jsonl`). The highest usage in each load's window:

| Load | Started (ms) | Max usage |
|---|---|---|
| 1 | 621 | 871 MB |
| 2 | 41901 | 938 MB |
| 3 | 62660 | 974 MB |
| 4 | 62929 | 976 MB |
| 5 | 63194 | 953 MB |
| 6 | 63461 | 960 MB |
| **7 (host-down reload)** | 63637 | **1029 MB (run peak)** |
| 8 | 66990 | 1007 MB |

Most of the charge is page cache, which the kernel can reclaim, so the absolute numbers are soft. The location of the peak is the finding.

The same unchanged proof under a memory cap (`memrun.sh`):

| Cap | Result | Where | Kernel |
|---|---|---|---|
| 700 MB | renderer crashed (`Target crashed`) | 1st load | 2 OOM kills |
| 950 MB | renderer crashed (`Target crashed`) | **7th of 7 loads, the host-down wait** | 1 OOM kill |
| 1000 MB | pass, host-down 3068 ms | – | 2872 limit hits, no OOM kill |

A cap just under the peak breaks the proof at exactly the original step and nowhere earlier. Under a cgroup the kernel answers with an OOM kill. Under memory pressure without a hard cap (for example, other proofs or a team browser on the same machine), the same peak can instead make Chromium's shared-memory allocation fail gracefully, which is the `ERR_INSUFFICIENT_RESOURCES` seen in the original. That last link is inference and was not reproduced.

## 5. What changed in `scripts/client-prove.mjs`

Diagnostics only:

- A separate `failedRequests` list records `requestfailed` events (error text, resource type, URL without query). It is not part of `errors`, so it never changes a pass or fail.
- The host-down `title-card` wait is wrapped in `try`/`catch`. On failure it prints whether the app booted and the failed requests since the reload, then rethrows the original error. The wait, its 6000 ms timeout, the 4500 ms check and every other assertion are unchanged.

Controlled demonstration (`bad.log`, a deliberate mutation through the external preload `inject-bad.mjs`, not a natural reproduction): `/src/lib/utils.ts` is aborted once the page reaches the dead host. Output:

```
host-down title wait failed; app booted: false ; failed requests since the reload: 1
  failed request: net::ERR_FAILED script http://127.0.0.1:8091/src/lib/utils.ts
FAIL locator.waitFor: Timeout 6000ms exceeded.
```

The full unchanged-strength run afterwards passed (`final.log`, host-down 3061 ms).

## Not proposed

No fix. The issue requires a fix to fail before and pass after. A candidate fix (for example, spacing out the reload burst) would change the proof's timing and needs the owner's or desk's call. The next natural failure in CI will now print its failed requests, which can confirm or kill the memory explanation.

## Raw files (`raw/`, gzip)

Logs: `base1`, `base2`, `free`, `tl`, `final`, `bad`, `lim384`, `lim360`, `lim340`, `lim320`, `mem700`, `mem950`, `mem1000`. Traces: `fd2.jsonl`, `obs*.jsonl`, `obstl.jsonl`, `memtl.txt`. Helpers: `observer.mjs`, `inject-bad.mjs`, `fdsample.py`, `memrun.sh`.
