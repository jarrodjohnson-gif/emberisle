#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/1495 || exit 2
out=/workspace/work/resume-nov9/1495-loop-diagnostic
[ "$(git rev-parse HEAD)" = 50282a81bbe89957134bb7af1b73ec5e4c55535c ] || exit 2
git diff --quiet HEAD -- || exit 2
[ ! -e "$out/1.started" ] || exit 2
git rev-parse HEAD > "$out/source-head"
git rev-parse HEAD:scripts/chat-prove.mjs > "$out/permanent-proof-blob"
sha256sum scripts/.codex-p-1495-loop-diagnostic.mjs > "$out/diagnostic-sha256"
node --version > "$out/node-version"
cat /sys/fs/cgroup/cpu.max > "$out/cpu-max"
node --input-type=module -e 'setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)' &
load_pid=$!
trap 'kill "$load_pid" 2>/dev/null || true' EXIT
for run in $(seq 1 8); do
 date -u +%FT%TZ > "$out/$run.started"
 node scripts/.codex-p-1495-loop-diagnostic.mjs > "$out/$run.log" 2>&1
 result=$?
 printf '%s\n' "$result" > "$out/$run.exit"
 date -u +%FT%TZ > "$out/$run.ended"
 printf 'Full diagnostic %s exit%s\n' "$run" "$result"
 if [ "$result" -ne 0 ]; then tail -n 22 "$out/$run.log"; exit "$result"; fi
 rg -q '^chat loop diagnostic ok \(not a causal fix\)$' "$out/$run.log" || exit 3
done
