#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/1518 || exit 2
out=/workspace/work/resume-nov9/1525-cap-validation
mkdir -p "$out"
[ ! -e "$out/source-head" ] || exit 2
[ "$(git rev-parse HEAD)" = c0d8c27de22720c8865b0fe98ee7e3bc20634cee ] || exit 2
git diff --quiet HEAD -- || exit 2
git rev-parse HEAD > "$out/source-head"
git rev-parse HEAD:scripts/your-turn-stay-prove.mjs > "$out/proof-blob"
node --version > "$out/node-version"
cat /sys/fs/cgroup/cpu.max > "$out/cpu-max"
node --input-type=module -e 'setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)' &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true' EXIT
for run in $(seq 1 20); do
 date -u +%FT%TZ > "$out/$run.started"
 ONLY=online node scripts/your-turn-stay-prove.mjs > "$out/$run.log" 2>&1
 result=$?
 printf '%s\n' "$result" > "$out/$run.exit"
 date -u +%FT%TZ > "$out/$run.ended"
 printf 'online four-seat run %s exit %s\n' "$run" "$result"
 if [ "$result" -ne 0 ]; then tail -n 18 "$out/$run.log"; exit "$result"; fi
 if ! rg -q '^your-turn-stay-prove: all passed$' "$out/$run.log"; then printf 'missing terminal success\n'; exit 3; fi
done
date -u +%FT%TZ > "$out/full.started"
node scripts/your-turn-stay-prove.mjs > "$out/full.log" 2>&1
result=$?
printf '%s\n' "$result" > "$out/full.exit"
date -u +%FT%TZ > "$out/full.ended"
tail -n 18 "$out/full.log"
[ "$result" -eq 0 ] || exit "$result"
rg -q '^your-turn-stay-prove: all passed$' "$out/full.log"
