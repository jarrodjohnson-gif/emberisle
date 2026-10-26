#!/usr/bin/env bash
# emberisle-up: update to newest main, (re)start the host only if the code changed, make sure a public link exists.
# Prints ONE line: "SUCCESS <link>", "FAIL <reason>" or "ERROR <reason>". Details go to ~/.emberisle-up/log.
# FAIL = the game or the link did not come up. ERROR = this script could not run (no repo, missing tool).
# The link is checked through public DNS (1.1.1.1), not this machine's resolver: a quick tunnel's name is new, and a
# local or work resolver can remember "no such host" for minutes even though everyone else can open the link.
set -u
PORT=8787
STATE="$HOME/.emberisle-up"
LOG="$STATE/log"
mkdir -p "$STATE"
[ -n "${EMBERISLE_UP_REEXEC:-}" ] || : > "$LOG"
say() { printf '%s\n' "$1"; exit "${2:-0}"; }
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >> "$LOG"; }

REPO="${EMBERISLE_DIR:-}"
if [ -z "$REPO" ]; then
  for d in "$PWD" /workspaces/emberisle "$HOME/emberisle"; do
    [ -f "$d/scripts/night.mjs" ] && REPO="$d" && break
  done
fi
[ -n "$REPO" ] && [ -f "$REPO/scripts/night.mjs" ] || say "ERROR no emberisle checkout found (set EMBERISLE_DIR)" 2
cd "$REPO" || say "ERROR cannot cd to $REPO" 2
for t in git node npm curl; do command -v "$t" >/dev/null || say "ERROR $t is not installed" 2; done

# 1. newest main
OLD_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
log "git fetch"
git fetch -q origin main >>"$LOG" 2>&1 || say "FAIL git fetch failed (see $LOG)" 1
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  say "FAIL local changes in $REPO block the update (see git status)" 1
fi
git checkout -q main >>"$LOG" 2>&1 || say "FAIL cannot switch to main" 1
git merge -q --ff-only origin/main >>"$LOG" 2>&1 || say "FAIL main cannot fast-forward" 1
HEAD_SHA="$(git rev-parse HEAD)"

# 1b. run the newest copy of this script, so a fix here reaches every machine with the next play
NEWEST="$REPO/scripts/emberisle-up.sh"
if [ -z "${EMBERISLE_UP_REEXEC:-}" ] && [ -f "$NEWEST" ] && { ! cmp -s "$NEWEST" "$0" || { [ -n "$OLD_HEAD" ] && ! git diff --quiet "$OLD_HEAD" HEAD -- scripts/emberisle-up.sh; }; }; then
  log "running the newest scripts/emberisle-up.sh"
  EMBERISLE_UP_REEXEC=1 exec bash "$NEWEST" "$@"
fi

# 2. dependencies, only when a lockfile changed or modules are missing
LOCKSUM="$(cat package-lock.json server/package-lock.json 2>/dev/null | { sha256sum 2>/dev/null || shasum -a 256; } | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ ! -d server/node_modules ] || [ "$LOCKSUM" != "$(cat "$STATE/locksum" 2>/dev/null)" ]; then
  log "npm ci (root)"; npm ci >>"$LOG" 2>&1 || say "FAIL npm ci failed (see $LOG)" 1
  log "npm ci (server)"; npm --prefix server ci >>"$LOG" 2>&1 || say "FAIL server npm ci failed (see $LOG)" 1
  printf '%s' "$LOCKSUM" > "$STATE/locksum"
fi

# a pid file can outlive its process (reboot, PID reuse): only treat the pid as ours if its command matches
pid_is() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null && ps -p "$(cat "$1")" -o command= 2>/dev/null | grep -Eq "$2"; }

# 3. host: restart only if it is down or running older code (a restart ends tables in progress)
up() { [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://127.0.0.1:$PORT/")" = 200 ]; }
if up && [ "$(cat "$STATE/host-sha" 2>/dev/null)" = "$HEAD_SHA" ]; then
  log "host already on $HEAD_SHA"
else
  log "restarting host on $HEAD_SHA"
  pid_is "$STATE/host-pid" "npm|node" && kill "$(cat "$STATE/host-pid")" 2>/dev/null
  pkill -f "scripts/night.mjs" 2>/dev/null; pkill -f "server/host.mjs" 2>/dev/null
  sleep 1
  nohup npm run night >"$STATE/host.log" 2>&1 &
  echo $! > "$STATE/host-pid"
  for _ in $(seq 1 60); do up && break; sleep 2; done
  up || say "FAIL host did not come up on $PORT (see $STATE/host.log)" 1
  printf '%s' "$HEAD_SHA" > "$STATE/host-sha"
fi

# 4. link: Codespaces forwards the port at a fixed address; elsewhere reuse a registered cloudflared quick tunnel or start one
registered() { grep -q "Registered tunnel connection" "$STATE/cf.log" 2>/dev/null; }
tunnel_alive() { pid_is "$STATE/cf-pid" cloudflared; }
start_tunnel() {
  tunnel_alive && kill "$(cat "$STATE/cf-pid")" 2>/dev/null
  rm -f "$STATE/cf-pid" "$STATE/link"
  : > "$STATE/cf.log"
  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" >"$STATE/cf.log" 2>&1 &
  echo $! > "$STATE/cf-pid"
  LINK=""
  for _ in $(seq 1 45); do
    LINK="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$STATE/cf.log" | grep -v '//api\.' | head -1)"
    tunnel_alive || say "FAIL cloudflared stopped: $(tail -1 "$STATE/cf.log" | cut -c1-160)" 1
    [ -n "$LINK" ] && registered && break
    sleep 2
  done
  [ -n "$LINK" ] && registered || say "FAIL tunnel did not register (see $STATE/cf.log)" 1
  printf '%s' "$LINK" > "$STATE/link"
}

# the link must answer: through public DNS first (so this machine's resolver is not asked about a brand-new name
# and does not cache "no such host"), then through this machine's resolver
answers() {
  host="${LINK#https://}"; host="${host%%/*}"
  if command -v dig >/dev/null; then
    ip="$(dig +short +time=3 +tries=1 "$host" @1.1.1.1 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)"
    [ -n "$ip" ] && [ "$(curl -s -o /dev/null -m 8 -w '%{http_code}' --resolve "$host:443:$ip" "$LINK")" = 200 ] && return 0
  fi
  [ "$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$LINK")" = 200 ]
}
wait_answers() { for _ in $(seq 1 "$1"); do answers && return 0; sleep 2; done; return 1; }

LINK=""
if [ -n "${CODESPACE_NAME:-}" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  command -v gh >/dev/null && gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME" >>"$LOG" 2>&1
  LINK="https://${CODESPACE_NAME}-${PORT}.${DOMAIN}/"
  wait_answers 15 || say "FAIL link did not answer: $LINK" 1
else
  command -v cloudflared >/dev/null || say "ERROR cloudflared is not installed" 2
  if tunnel_alive && registered && [ -s "$STATE/link" ]; then
    LINK="$(cat "$STATE/link")"
    log "tunnel already open: $LINK"
  fi
  if [ -z "$LINK" ] || ! wait_answers 4; then
    [ -n "$LINK" ] && log "link $LINK did not answer; replacing the tunnel"
    start_tunnel
    wait_answers 30 || say "FAIL link did not answer: $LINK (see $LOG)" 1
  fi
fi
say "SUCCESS $LINK"
