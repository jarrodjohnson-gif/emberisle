#!/usr/bin/env bash
set -u
export CHROMIUM_PATH=/usr/bin/chromium
flock /tmp/emberisle-team-browser.lock bash -c '
  node --input-type=module -e '\''setInterval(()=>{const until=performance.now()+100;while(performance.now()<until){}},200)'\'' &
  load_pid=$!
  trap '\''kill "$load_pid" 2>/dev/null || true'\'' EXIT
  date -u +%FT%TZ > docs/proofs/1495/terra-frame-timeline/run.started
  node scripts/.codex-terra-1495-frame-timeline.mjs > docs/proofs/1495/terra-frame-timeline/run.log 2>&1
  result=$?
  printf "%s\n" "$result" > docs/proofs/1495/terra-frame-timeline/run.exit
  date -u +%FT%TZ > docs/proofs/1495/terra-frame-timeline/run.ended
  exit "$result"
'
