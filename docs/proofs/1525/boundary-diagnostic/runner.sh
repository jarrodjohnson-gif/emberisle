#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/1518 || exit 2
out=/workspace/work/resume-nov9/1525-boundary-diagnostic
[ ! -e "$out/1.started" ] || exit 2
git rev-parse HEAD > "$out/source-head"
sha256sum scripts/.codex-p-1525-boundary-diagnostic.mjs > "$out/diagnostic-sha256"
node --version > "$out/node-version"
cat /sys/fs/cgroup/cpu.max > "$out/cpu-max"
node --input-type=module -e 'setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)' &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true' EXIT
date -u +%FT%TZ > "$out/1.started"
ONLY=online node scripts/.codex-p-1525-boundary-diagnostic.mjs > "$out/1.log" 2>&1
result=$?
printf '%s\n' "$result" > "$out/1.exit"
date -u +%FT%TZ > "$out/1.ended"
tail -n 14 "$out/1.log"
exit "$result"
