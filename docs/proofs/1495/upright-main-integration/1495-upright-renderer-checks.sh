#!/usr/bin/env bash
set -u
export PATH=/workspace/work/runtime/node_modules/node/bin:$PATH
cd /workspace/work/1495 || exit 2
[ "$(git rev-parse HEAD)" = ce3a0854a1366956cb7fa30e9adfedd617ff644a ] || exit 2
out=/workspace/work/resume-nov9/1495-upright-main-integration
git rev-parse HEAD > "$out/renderer-source-head"
node --version > "$out/renderer-node-version"
failed=0
for proof in board-look-prove upright-table-prove; do
 [ ! -e "$out/$proof.started" ] || exit 2
 git rev-parse "HEAD:scripts/$proof.mjs" > "$out/$proof.blob"
 date -u +%FT%TZ > "$out/$proof.started"
 npm run "$proof" > "$out/$proof.log" 2>&1
 result=$?
 echo "$result" > "$out/$proof.exit"
 date -u +%FT%TZ > "$out/$proof.ended"
 echo "$proof exit$result"
 tail -n 8 "$out/$proof.log"
 [ "$result" -eq 0 ] || failed=1
done
exit "$failed"
