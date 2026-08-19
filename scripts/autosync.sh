#!/bin/bash
# Unattended upload: collect local activity and publish it to the server.
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
  say "skip — another run is in progress"
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

say "--- upload start ---"
if out=$(node bin/statshub.mjs "$@" 2>&1); then
  printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g; s/^/    /' >> "$LOG"
  say "--- upload done ---"
else
  printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g; s/^/    /' >> "$LOG"
  say "FAILED"
  exit 1
fi
