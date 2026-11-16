#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/1495 || exit 2
out=/workspace/work/resume-nov9/1495-cpu-trace
export CODEX_TIMING_LOG="$out/heartbeat.jsonl"
export CODEX_CPU_PROFILE="$out/node.cpuprofile"
[ ! -e "$out/started" ] || exit 2
git diff --quiet HEAD -- || exit 2
git rev-parse HEAD > "$out/source-head"
sha256sum scripts/.codex-p-1495-cpu-trace.mjs > "$out/diagnostic-sha256"
node --version > "$out/node-version"
date -u +%FT%TZ > "$out/started"
node --input-type=module -e 'setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)' &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true' EXIT
node scripts/.codex-p-1495-cpu-trace.mjs > "$out/run.log" 2>&1
result=$?
printf '%s\n' "$result" > "$out/exit"
date -u +%FT%TZ > "$out/ended"
printf 'Single full diagnostic exit%s\n' "$result"
tail -n 3 "$out/run.log"
exit "$result"
