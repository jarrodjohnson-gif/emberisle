# Flaky list audit, 2026-11 (#1727)

- date: 2026-11-15
- agent: Claude (Opus 5.5)
- basis: `.github/flaky.json` and `scripts/flake-rerun.mjs` at commit a5982448
- range: CI runs created 2026-11-01 to 2026-11-15 (UTC), on `main` and on PRs

## Result

| Entry (proof: pattern) | Issue | Hits | Last hit |
| --- | --- | --- | --- |
| `hotseat-prove`: `Error: Leave played [click, click], not click_001.wav once` | #860 | 0 | none since 2026-11-01 |
| `turn-gain-prove`: `FAIL …: no gain line is up while "Your turn" is` | #860 | 0 | none since 2026-11-01 |
| `chat-prove`: `FAIL phone game 390x844 {…"newest":false…}: N whole chat lines on screen` | #860 | 0 | none since 2026-11-01 |
| `tokens-prove`: `FAIL 7 no numeral behind the scenery (1280x720): the N: 1 of 5 points` | #1511 | 0 | none since 2026-11-01 |
| `board-touch-prove`: `setup: a tap on a Pasture hex plays nothing` | #1510 | 0 | none since 2026-11-01 |
| `lobby-layout-prove`: `"Copy" has at least 8 px between text and button edge (7.x / 7.x)` | #1176 | 0 | none since 2026-11-01 |
| `connection-health-prove`: `+   saving: false,` / `-   saving: true,` | #1200 | 0 | none since 2026-11-01 |
| `server-needs-prove`: `Error: timeout p0 state:` | #1326 | 10 | [run 42758315547](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42758315547), 2026-11-10, PR #1520 |

The table shortens each pattern. The search used the exact `pattern` string from `.github/flaky.json`.

### The 10 `server-needs-prove` hits

Each hit is the `server` job, run attempt 1.
"Re-run by flake-rerun" means the flake-rerun log says `known flake server-needs-prove`.

| Started (UTC) | Run | Event | Failed step | Re-run by flake-rerun | Later attempts |
| --- | --- | --- | --- | --- | --- |
| 2026-11-04 07:17 | [41791153113](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/41791153113) | push to `main` | `node … server/needs-prove.mjs` | no | attempt 2 green |
| 2026-11-04 23:39 | [41935235069](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/41935235069) | PR #1310 | `node … server/needs-prove.mjs` | no | attempt 2 green |
| 2026-11-05 06:26 | [41980351836](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/41980351836) | push to `main` | `node … server/needs-prove.mjs` | no | none, run red |
| 2026-11-05 22:07 | [42118701242](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42118701242) | push to `main` | `node … server/needs-prove.mjs` | no | attempt 2 green |
| 2026-11-06 05:11 | [42166773861](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42166773861) | PR #1334 | `node … server/needs-prove.mjs` | no | attempt 2 green |
| 2026-11-07 01:01 | [42321590706](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42321590706) | push to `main` | `npm run server-needs-prove` | yes | attempt 2 green |
| 2026-11-07 02:25 | [42329154002](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42329154002) | push to `main` | `npm run server-needs-prove` | yes | attempt 2 green |
| 2026-11-07 20:16 | [42410187293](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42410187293) | PR #1432 | `npm run server-needs-prove` | yes | attempt 2 green |
| 2026-11-09 22:47 | [42714895644](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42714895644) | PR #1488 | `npm run server-needs-prove` | no, `loosen` also failed | none, run red |
| 2026-11-10 04:51 | [42758315547](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/42758315547) | PR #1520 | `npm run server-needs-prove` | yes | attempts 2 and 3 cancelled, attempt 4 green |

- The first five hits ran the proof as `node --import ./server/register.mjs server/needs-prove.mjs`.
- `flake-rerun.mjs` matches only a step named `npm run <id>`, so it called those five "not a known flake".
- Their attempt 2 was started by hand or by another tool, not by flake-rerun.
- #1326 closed on 2026-11-06 at 20:33 UTC. Five hits came after that, the last on 2026-11-10.
- No hit came in the five days from 2026-11-10 05:00 to 2026-11-15 20:31.

## What was searched

- CI runs listed: 976 (`ci.yml`, created 2026-11-01 to 2026-11-15). 252 were pushes, 724 were PRs.
- Job records read: 15,487, across every attempt of those 976 runs.
- Job logs downloaded and searched: 309, from 193 runs.
- Those 309 are every `failure` or `timed_out` job named `server`, `browser-a (…)` or `browser-b (…)`.
- By attempt: 262 from attempt 1, 22 from attempt 2, 13 from attempt 3, 12 from attempt 4.
- Logs unavailable: 0. Every one of the 309 downloads returned text.
- flake-rerun runs listed: 1,049. Of those, 258 ran the script; 791 were skipped.
- flake-rerun logs searched: all 258.

### Where a hit can show

- `flake-rerun.yml` runs after a CI run fails. It re-runs only attempt 1, and only if every failed job is a known flake.
- The re-run is a new attempt with new job ids. The attempt 1 job keeps its red result and its log.
- So a run can end green while its attempt 1 job holds a matched pattern.
- `jobs?filter=all` returns the jobs of every attempt, so the search saw those attempt 1 jobs.
- None of the eight proofs re-runs itself after a failure. A grep of the eight files for `retry` and `attempt` found none.
- `ci.yml` has no `continue-on-error`. So a green job cannot hold a hit.
- flake-rerun prints one line per failed job, for example `"server": known flake server-needs-prove`.
- That line appears 5 times in the 258 logs, all for `server-needs-prove`. All 5 match a hit above.
- 4 of those 5 runs printed `re-running failed jobs`. Run 42714895644 did not, because `loosen` also failed.

### Not checked

- 520 `cancelled` jobs and 7,513 `success` jobs in the same legs. A proof failure ends a job as `failure`, not either of those.
- Run [43758560075](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/43758560075) (PR #1728) was still running when listed. Its jobs had no result yet.
- flake-rerun run [43319613044](https://github.com/jarrodjohnson-gif/emberisle/actions/runs/43319613044) failed on a 503 log fetch.
- That fetch was job 131524494281, `browser-b (presentation)` in run 43315777707. This audit searched that log; it had no hit.

## How the logs were searched

Run these from any directory. `gh` needs read access to the repo.

```sh
R=repos/jarrodjohnson-gif/emberisle
D=/tmp/claude-0/flaky-audit
mkdir -p $D/runs $D/jobs $D/logs $D/rr

# 1. List the runs. The API caps a query at 1,000 results, so list one day at a time.
for w in ci.yml flake-rerun.yml; do
  for d in $(seq -w 1 15); do for p in 1 2; do
    gh api "$R/actions/workflows/$w/runs?per_page=100&page=$p&created=2026-11-$d" \
      --jq '.workflow_runs[] | [.id,.run_attempt,.event,.head_branch,.conclusion,.created_at,.html_url] | @tsv'
  done; done > $D/runs/$w.tsv
done

# 2. Read every CI run's jobs, from every attempt. Re-fetch any file that is not JSON (a 502).
cut -f1 $D/runs/ci.yml.tsv | xargs -P8 -I{} sh -c \
  "test -s $D/jobs/{}.json || gh api '$R/actions/runs/{}/jobs?per_page=100&filter=all' > $D/jobs/{}.json"

# 3. Pick failed jobs in the legs that run the eight proofs, and download their logs.
cat $D/jobs/*.json | jq -r '.jobs[]
  | select(.conclusion=="failure" or .conclusion=="timed_out")
  | select(.name|test("^(server|browser-a \\(|browser-b \\()"))
  | [.id,.run_id,.run_attempt,.name,.conclusion,.started_at,.html_url] | @tsv' | sort -u > $D/cand.tsv
cut -f1 $D/cand.tsv | xargs -P6 -I{} sh -c \
  "test -s $D/logs/{}.log || gh api $R/actions/jobs/{}/logs > $D/logs/{}.log"

# 4. Search with JavaScript regexes, as flake-rerun.mjs does (new RegExp(pattern), no flags, whole log).
node search.mjs .github/flaky.json $D/cand.tsv $D/logs

# 5. Read flake-rerun's own verdict lines.
awk -F'\t' '$5=="success"||$5=="failure"{print $1}' $D/runs/flake-rerun.yml.tsv | xargs -P8 -I{} sh -c \
  "gh api $R/actions/runs/{}/logs > $D/rr/{}.zip && mkdir -p $D/rr/x/{} && unzip -oq $D/rr/{}.zip -d $D/rr/x/{}"
grep -rhE ': known flake |run [0-9]+ attempt' $D/rr/x
```

`search.mjs`, kept outside the repo:

```js
// node search.mjs <flaky.json> <cand.tsv> <logs dir>
import { readFileSync } from "node:fs";
const [flakyPath, candPath, logDir] = process.argv.slice(2);
const flakes = JSON.parse(readFileSync(flakyPath, "utf8")).flakes.map((f) => ({ ...f, regex: new RegExp(f.pattern) }));
const jobs = readFileSync(candPath, "utf8").trim().split("\n").map((l) => l.split("\t"));
const hits = Object.fromEntries(flakes.map((f) => [f.id, []]));
for (const [id, runId, attempt, name, , started] of jobs) {
  const log = readFileSync(`${logDir}/${id}.log`, "utf8");
  for (const f of flakes) if (f.regex.test(log)) hits[f.id].push({ runId, attempt, name, started, id });
}
console.log(`${jobs.length} job logs searched`);
for (const f of flakes) {
  const h = hits[f.id].sort((a, b) => a.started.localeCompare(b.started));
  console.log(`${f.id}\t#${f.issue}\t${h.length}`);
  for (const x of h) console.log(`  ${x.started} run ${x.runId} attempt ${x.attempt} ${x.name} job ${x.id}`);
}
```

Output of step 4:

```
309 job logs searched
hotseat-prove	#860	0
turn-gain-prove	#860	0
chat-prove	#860	0
tokens-prove	#1511	0
board-touch-prove	#1510	0
lobby-layout-prove	#1176	0
connection-health-prove	#1200	0
server-needs-prove	#1326	10
  2026-11-04T07:17:22Z run 41791153113 attempt 1 server job 126444794069
  2026-11-04T23:39:18Z run 41935235069 attempt 1 server job 126942433412
  2026-11-05T06:26:26Z run 41980351836 attempt 1 server job 127088974478
  2026-11-05T22:07:56Z run 42118701242 attempt 1 server job 127565436970
  2026-11-06T05:11:05Z run 42166773861 attempt 1 server job 127725292379
  2026-11-07T01:01:00Z run 42321590706 attempt 1 server job 128247374808
  2026-11-07T02:25:47Z run 42329154002 attempt 1 server job 128271566235
  2026-11-07T20:16:15Z run 42410187293 attempt 1 server job 128516572483
  2026-11-09T22:47:22Z run 42714895644 attempt 1 server job 129493995946
  2026-11-10T04:51:17Z run 42758315547 attempt 1 server job 129638211776
```

### Near-miss check

A zero can mean the proof's message changed, so the regex can no longer match.
This audit grepped the 309 logs and the current proofs for a short fixed part of each message.

- `hotseat-prove`: two clicks is now the passing result. The log prints `Leave played ["/audio/click_001.wav","/audio/click_001.wav"]`, then `hotseat-prove: ok`.
- That two-click line is in 18 logs. Six more logs print one click, the older passing result.
- `hotseat-prove`: the error now reads `Leave table and Leave played …, not click_001.wav once each`. The pattern cannot match it.
- `turn-gain-prove`: `no gain line is up` is no longer in `scripts/turn-gain-prove.mjs`. It is only in `scripts/flake-rerun-prove.mjs`.
- `chat-prove`: one log failed on `phone lobby 390x844`. The pattern covers only `phone game`, so it did not match.
- `lobby-layout-prove`: one log failed on `"Add bot"` at 375x667 (-0.4 / -0.4). The pattern covers only `"Copy"` at 7.x px.
- `tokens-prove`, `board-touch-prove`, `connection-health-prove`: no log held the message at all.

## What the counts suggest

- Seven entries had no hit since 2026-11-01. The desk decides whether any of them stay.
- The window is 15 days. A flake rarer than that could still be live.
- Those seven are `hotseat-prove`, `turn-gain-prove`, `chat-prove`, `tokens-prove`, `board-touch-prove`, `lobby-layout-prove` and `connection-health-prove`.
- For `hotseat-prove` and `turn-gain-prove`, the current proof can no longer print the matched message.
- `server-needs-prove` still fires: 10 hits, 5 after #1326 closed. The last was 2026-11-10.
