#!/usr/bin/env bash
# Start one Emberisle builder (Claude Code) on one issue, in the background, in its own git worktree.
# Usage:  bash docs/builder-kit/launch.sh <issue> <opus|sonnet> <total-usd>
# Example: bash docs/builder-kit/launch.sh 1103 sonnet 8
# The dollar amount is the TOTAL for the issue across all runs. It asks for your API key (hidden) if it is not already set.
set -euo pipefail
ISSUE="${1:?issue number}"; MODEL="${2:?opus or sonnet}"; BUDGET="${3:?total dollars}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
command -v claude >/dev/null || { echo "claude (Claude Code) is not installed"; exit 1; }
command -v gh >/dev/null || { echo "gh (GitHub CLI) is not installed"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not logged in: run gh auth login"; exit 1; }
unset CLAUDE_CODE_USE_BEDROCK AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  read -rsp "Paste your Emberisle API key, then press Enter: " ANTHROPIC_API_KEY; echo
  export ANTHROPIC_API_KEY
fi
cd "$REPO"
git fetch -q origin main
DIR="$REPO/../emberisle-$ISSUE"
if [ ! -d "$DIR" ]; then git worktree add -q -b "builder/issue-$ISSUE" "$DIR" origin/main; fi
cd "$DIR"
echo "Installing packages (a minute or two)..."
npm ci >/dev/null 2>&1
(cd server && npm ci >/dev/null 2>&1)
LOG="$HOME/builder-$ISSUE.log"
nohup claude -p "$(sed "s/__ISSUE__/$ISSUE/g" "$REPO/docs/builder-kit/builder-agent.md")" \
  --model "$MODEL" --max-turns 80 --max-budget-usd "$BUDGET" --permission-mode acceptEdits \
  --allowedTools "Bash(git status:*) Bash(git add:*) Bash(git commit:*) Bash(git diff:*) Bash(git log:*) Bash(git fetch:*) Bash(git merge:*) Bash(git checkout:*) Bash(git switch:*) Bash(git branch:*) Bash(git show:*) Bash(git rev-parse:*) Bash(git push -u origin builder/issue-$ISSUE) Bash(npm:*) Bash(node:*) Bash(gh issue:*) Bash(gh pr:*) Bash(gh repo view:*) Read Edit Write Glob Grep" \
  > "$LOG" 2>&1 &
echo "Started #$ISSUE ($MODEL, \$$BUDGET total). Progress: tail -n 20 $LOG"
