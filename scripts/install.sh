#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/state/mole"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"
SERVICE="gui/$UID/${LABEL}"

for cmd in swiftc open launchctl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: missing command: $cmd" >&2
    if [ "$cmd" = "swiftc" ]; then
      echo "Install Xcode Command Line Tools: xcode-select --install" >&2
    fi
    exit 1
  }
done

"$ROOT/scripts/build.sh"

mkdir -p "$BIN_DIR" "$LOG_DIR" "$LA_DIR"

# Stop existing daemon BEFORE replacing binaries: overwriting a running
# mach-o can yield "Text file busy" / EIO, and a half-loaded service makes
# the next bootstrap race with launchctl error 5.
if launchctl print "$SERVICE" >/dev/null 2>&1; then
  echo "Stopping existing daemon..."
  launchctl bootout "$SERVICE" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    launchctl print "$SERVICE" >/dev/null 2>&1 || break
    sleep 0.2
  done
  if launchctl print "$SERVICE" >/dev/null 2>&1; then
    echo "WARNING: daemon did not unload after 3s; proceeding anyway" >&2
  fi
fi

cp "$ROOT/dist/mole" "$BIN_DIR/mole"
cp "$ROOT/dist/mole-daemon" "$BIN_DIR/mole-daemon"
cp "$ROOT/dist/mole-pasteboard" "$BIN_DIR/mole-pasteboard"
chmod +x "$BIN_DIR/mole" "$BIN_DIR/mole-daemon" "$BIN_DIR/mole-pasteboard"
echo "Installed: $BIN_DIR/mole, $BIN_DIR/mole-daemon, $BIN_DIR/mole-pasteboard"

# generate plist from template
sed \
  -e "s|@BIN@|$BIN_DIR/mole-daemon|g" \
  -e "s|@LOG@|$LOG_DIR|g" \
  -e "s|@PATH@|$BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin|g" \
  "$ROOT/launchd/${LABEL}.plist.template" > "$PLIST"
echo "Installed plist: $PLIST"

BOOT_ERR="$(mktemp)"
trap 'rm -f "$BOOT_ERR"' EXIT
if ! launchctl bootstrap "gui/$UID" "$PLIST" 2>"$BOOT_ERR"; then
  # Stale registration can survive bootout. One forced retry.
  launchctl bootout "$SERVICE" 2>/dev/null || true
  sleep 0.5
  if ! launchctl bootstrap "gui/$UID" "$PLIST" 2>"$BOOT_ERR"; then
    echo "ERROR: launchctl bootstrap failed:" >&2
    cat "$BOOT_ERR" >&2 || true
    exit 1
  fi
fi
echo "Loaded launchd service: $LABEL"

# health check (retry; compiled bun binary takes a few seconds on first launch)
healthy=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.5
  if curl -sf --unix-socket /tmp/mole-clip.sock http://x/type >/dev/null 2>&1; then
    healthy=true
    break
  fi
done
if $healthy; then
  echo "Daemon healthy. All set."
else
  echo "WARNING: daemon did not respond on /tmp/mole-clip.sock after 5s"
  echo "Check logs:"
  echo "  tail $LOG_DIR/mole-daemon.err.log"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo
    echo "Reminder: add $BIN_DIR to PATH in your shell rc:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac
