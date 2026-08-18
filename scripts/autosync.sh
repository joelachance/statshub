#!/bin/bash
# Unattended sync: refresh stats, commit if anything changed, optionally push.
# Invoked by launchd (see scripts/schedule.sh) or by hand.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

LOG="${STATSHUB_LOG:-$HOME/Library/Logs/statshub-sync.log}"
mkdir -p "$(dirname "$LOG")"
say() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

# The Cursor scan takes minutes; never let two runs overlap.
LOCK="$REPO/.sync.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  say "skip — another sync is running ($LOCK)"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

say "--- sync start ---"

if ! out=$(npm run --silent sync 2>&1); then
  say "FAILED: $(printf '%s' "$out" | tail -5 | tr '\n' ' ')"
  exit 1
fi
printf '%s\n' "$out" | sed 's/^/    /' >> "$LOG"

if [ -z "$(git status --porcelain data/stats.json)" ]; then
  say "no change — nothing to commit"
  exit 0
fi

tokens=$(node -e 'const s=require("./data/stats.json");console.log(s.headline.tokens.toLocaleString())' 2>/dev/null)
git add data/stats.json
git commit -q -m "sync stats — ${tokens:-refresh} tokens as of $(date '+%Y-%m-%d')" && say "committed"

if [ "${STATSHUB_PUSH:-0}" = "1" ] && [ -n "$(git remote)" ]; then
  if git push -q 2>>"$LOG"; then say "pushed — Vercel will redeploy"; else say "push FAILED"; fi
else
  say "push skipped (set STATSHUB_PUSH=1 and add a remote to enable)"
fi

say "--- sync done ---"
