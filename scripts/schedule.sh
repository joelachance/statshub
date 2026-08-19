#!/bin/bash
# Install/remove a launchd job that syncs stats on a schedule.
#
# launchd runs with a bare PATH and no login shell, so tool locations are
# resolved NOW and baked into the plist. That matters most for node: an
# nvm-managed binary lives under a version-specific directory that changes
# every time you upgrade node, so re-run `install` after a node upgrade.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.statshub.sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/statshub-sync.log"
HOUR="${STATSHUB_HOUR:-9}"
MINUTE="${STATSHUB_MINUTE:-0}"

usage() { echo "usage: $0 {install|uninstall|status|run|logs}"; exit 1; }
[ $# -ge 1 ] || usage

case "$1" in
install)
  need=""
  for t in node sqlite3; do
    command -v "$t" >/dev/null || need="$need $t"
  done
  [ -z "$need" ] || { echo "missing tools:$need"; exit 1; }

  # Bake in every directory the job needs, deduped, in a stable order.
  BIN_PATH="$(for t in node sqlite3; do dirname "$(command -v $t)"; done \
              | awk '!seen[$0]++' | paste -sd: -):/usr/bin:/bin:/usr/sbin:/sbin"

  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/autosync.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$BIN_PATH</string>
    <key>HOME</key><string>$HOME</string>
    <key>STATSHUB_CLIENT_ID</key><string>${STATSHUB_CLIENT_ID:-}</string>
    <key>STATSHUB_SERVER</key><string>${STATSHUB_SERVER:-}</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>$HOUR</integer>
    <key>Minute</key><integer>$MINUTE</integer>
  </dict>
  <!-- If the Mac was asleep at the scheduled time, run once on wake. -->
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
PLISTEOF

  launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$PLIST"
  echo "installed — runs daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE")"
  echo "  plist  $PLIST"
  echo "  log    $LOG"
  echo "  server ${STATSHUB_SERVER:-<default>}"
  [ -n "${STATSHUB_CLIENT_ID:-}" ] || echo "  ${0##*/}: STATSHUB_CLIENT_ID was empty — set it and re-run install"
  ;;
uninstall)
  launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removed"
  ;;
status)
  if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
    launchctl print "gui/$UID/$LABEL" | grep -E '^\s+(state|last exit code|program) ' || true
    echo "next run: daily $(printf '%02d:%02d' "$HOUR" "$MINUTE")"
  else
    echo "not installed"
  fi
  ;;
run)  launchctl kickstart -p "gui/$UID/$LABEL" && echo "triggered — tail with: $0 logs" ;;
logs) tail -n 40 "$LOG" 2>/dev/null || echo "no log yet at $LOG" ;;
*) usage ;;
esac
