# #1166: client restore failure after a failed IslandCanvas import

## 2026-11-22: the cause, reproduced (claude-opus-a, Claude Opus 5.5)

**The original signature is reproduced with the unchanged proof.** Every fetch's response is streamed through a 2 MiB shared-memory file. On the host-down reload about 300 of them are alive at once, about 600 MB. When the filesystem that holds them has less room than that, Chromium cannot create the pipe, and the fetch fails with `net::ERR_INSUFFICIENT_RESOURCES`. The app's modules never load, so the title card never shows.

This is the bounded environmental explanation the completion test asks for. It is not a player bug, and no fix is proposed (see "Players" below).

### Where the files live

- Playwright launches Chromium with `--disable-dev-shm-usage`. As shipped, Chromium then keeps every shared-memory file in `TMPDIR` (default `/tmp`), not `/dev/shm`.
- In a container `/tmp` is usually disk with a fixed allowance, and `/dev/shm` is often 64 MB.
- The cloud container used here wraps Chromium (`/opt/pw-browsers/chromium` is a shell script). The wrapper drops `--disable-dev-shm-usage`, and keeps only the network process's files in `TMPDIR`, and only when `TMPDIR` has 2 GiB free. Otherwise they go to `/dev/shm` (16 GB here). That is why plain runs here never fail. `CHROMIUM_FULL_AS_SHIPPED=1` turns the wrapper off, as on a machine without it.

### Measured: the peak is at the failing step

`run.sh` mounts a fresh tmpfs of a given size as `TMPDIR`, runs the unchanged `scripts/client-prove.mjs` with the passive observer from 2026-10-31, and samples the tmpfs's used space every 50 ms with `df`. `align.py` takes the highest sample in each page load's window. Every run was serial, one at a time. Load 7 is the host-down reload.

| Load | `base2` (wrapper, 2 GiB) | `ship2g` (as shipped, 2 GiB) |
|---|---|---|
| 1 | 7 MB | 34 MB |
| 2 | 22 MB | 35 MB |
| 3 | 5 MB | 33 MB |
| 4 | 7 MB | 38 MB |
| 5 | 114 MB | 134 MB |
| 6 | 136 MB | 184 MB |
| **7 (host-down reload)** | **608 MB** | **635 MB (run peak)** |

What the space is (`fdscan.py`, peak sample of `base3`): one Chromium process held 309 deleted `.org.chromium.Chromium.*` files of exactly 2.0 MiB each, 580 MB in all. With `TMPDIR` at 1 GiB, the wrapper sent them to `/dev/shm` instead: 344 files, 652 MB (`cap1gfd`).

### Capped runs, Chromium as shipped (`CHROMIUM_FULL_AS_SHIPPED=1`)

| `TMPDIR` size | Result | What failed |
|---|---|---|
| 400 MB (`ship400`) | fail | 21 fetches `net::ERR_INSUFFICIENT_RESOURCES` at load 7, the reload's document among them (`page.reload` failed) |
| **520 MB (`ship520`)** | **fail, the original signature** | **20 script fetches `net::ERR_INSUFFICIENT_RESOURCES` on the host-down reload; app booted: false; `title-card` wait timed out at 6000 ms** |
| 520 MB (`diag520`, with this PR's diagnostic) | fail, the same | 17 script fetches; `5 MiB free of 520 MiB` |
| 640 MB (`ship640m`) | pass, host-down 3352 ms | – |
| 760 MB (`ship760m`) | pass, host-down 3363 ms | – |
| 2 GiB (`ship2g`) | pass, host-down 3135 ms | – |

From `ship520.log`:

```
live seat at a missing table: {"screen":"title","error":"Seat is gone.","restoring":false}
host-down title wait failed; app booted: false ; failed requests since the reload: 20
  failed request: net::ERR_INSUFFICIENT_RESOURCES script http://127.0.0.1:8091/src/components/game/WinFailed.tsx
  failed request: net::ERR_INSUFFICIENT_RESOURCES script http://127.0.0.1:8091/src/components/game/Announcer.tsx
  ...
FAIL locator.waitFor: Timeout 6000ms exceeded.
```

This matches the retained 2026-10-27 failure: script fetches failing with `ERR_INSUFFICIENT_RESOURCES` on the 7th load, then an app that never booted. A dynamic `import()` that hits the same error gives "Failed to fetch dynamically imported module", which is the original `IslandCanvas.tsx` report. The run's peak varies (397 to 635 MB), so the line between pass and fail is soft, about 600 MB.

The original machine's free space at the time was not recorded, so it cannot be shown that this was the cause there. It is the only mechanism found that gives this exact signature. Memory pressure (2026-10-31) gave renderer crashes, and fd limits gave hanging navigations. A `/tmp` on a nearly full disk allowance, with many retained logs and worktrees, would do it.

### Players

The dev server sends one fetch per source module, about 300 per load. The production build is 58 JS files (2 MB), and a player does not load five pages in about a second. So players are not exposed, and no runtime change is proposed.

### This PR's change to `scripts/client-prove.mjs`

Diagnostics only, inside the existing `catch` of the host-down wait. When the wait fails, it also prints the free and total space of `TMPDIR` (or `/tmp`) and `/dev/shm`. The wait, its 6000 ms timeout, the 4500 ms check and every other assertion are unchanged. The plain run passes (`plain.log`, host-down 3316 ms).

### Side note: the 4500 ms check under load

Two runs with the `/proc` scanner running beside the proof failed the separate 4500 ms check (`base3` 4859 ms, `cap1gfd` 4939 ms), and so did `cap400` (4577 ms). In each one the title card did show and no fetch failed. Plain runs take 3.1 to 3.4 s. That check has only about 1.2 s of headroom on a busy 4-CPU machine. It is a different symptom from this issue, recorded here only so it is not mistaken for it.

### Raw files (`raw/2026-11-22/`, gzip)

Logs (`*.log.gz`), tmpfs samples (`*.tmp.txt.gz`), observer traces (`*.obs.jsonl.gz`) and fd-scan peaks (`*.fd-peak.json.gz`) for `base2`, `base3`, `cap400`, `cap600m`, `cap1g`, `cap1gfd`, `ship2g`, `ship400`, `ship520`, `diag520`, `ship640m`, `ship760m` and `plain`. Helpers: `run.sh`, `align.py`, `fdscan.py`, `observer.mjs`. Environment: Linux, 4 CPUs, 15 GB RAM, Playwright 1.63.0, Chrome for Testing 153.0.8010.12 (the original failure's version).

## 2026-10-31 investigation (Claude Opus 5.5, builder 2)

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
