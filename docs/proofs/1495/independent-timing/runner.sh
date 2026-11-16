#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/1495 || exit 2
out=/workspace/work/resume-nov9/1495-independent-timing
export CODEX_TIMING_LOG="$out/heartbeat.jsonl"
[ ! -e "$out/started" ] || exit 2
git diff --quiet HEAD -- || exit 2
git rev-parse HEAD > "$out/source-head"
sha256sum scripts/.codex-p-1495-independent-timing.mjs > "$out/diagnostic-sha256"
node --version > "$out/node-version"
date -u +%FT%TZ > "$out/started"
node --input-type=module -e 'setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)' &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true' EXIT
node scripts/.codex-p-1495-independent-timing.mjs > "$out/run.log" 2>&1
result=$?
printf '%s\n' "$result" > "$out/exit"
date -u +%FT%TZ > "$out/ended"
printf 'Single prefix exit%s\n' "$result"
tail -n 5 "$out/run.log"
exit "$result"
