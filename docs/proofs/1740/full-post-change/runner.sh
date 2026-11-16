#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/current-p1 || exit 2
out=/workspace/work/resume-nov9/1740-full
[ "$(git rev-parse HEAD)" = 5428f10848178766632e0e0d15e9709bdb3f940d ] || exit 2
[ ! -e "$out/started" ] || exit 2
git diff --quiet HEAD -- || exit 2
git rev-parse HEAD > "$out/source-head"
git rev-parse HEAD:scripts/win-list-prove.mjs > "$out/proof-blob"
node --version > "$out/node-version"
cat /sys/fs/cgroup/cpu.max > "$out/cpu-max"
date -u +%FT%TZ > "$out/started"
node --input-type=module -e 'setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)' &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true' EXIT
npm run win-list-prove > "$out/run.log" 2>&1
result=$?
printf '%s\n' "$result" > "$out/exit"
date -u +%FT%TZ > "$out/ended"
printf '1740 full win-list exit%s\n' "$result"
tail -n 8 "$out/run.log"
exit "$result"
