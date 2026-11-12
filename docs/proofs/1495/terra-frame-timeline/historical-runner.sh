#!/usr/bin/env bash
set -u
export PATH=/workspace/emberisle-historical-runtime/node_modules/node/bin:$PATH
export CHROMIUM_PATH=/workspace/emberisle-historical-runtime/browsers/chromium-1243/chrome-linux64/chrome
flock /tmp/emberisle-team-browser.lock bash -c '
  node --input-type=module -e '\''setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)'\'' &
  load_pid=$!
  trap '\''kill "$load_pid" 2>/dev/null || true'\'' EXIT
  date -u +%FT%TZ > docs/proofs/1495/terra-frame-timeline/historical.started
  node scripts/.codex-terra-1495-frame-timeline.mjs > docs/proofs/1495/terra-frame-timeline/historical.log 2>&1
  result=$?
  printf "%s\n" "$result" > docs/proofs/1495/terra-frame-timeline/historical.exit
  date -u +%FT%TZ > docs/proofs/1495/terra-frame-timeline/historical.ended
  exit "$result"
'
