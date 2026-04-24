#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/state/mole"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"

for cmd in pngpaste open launchctl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: missing command: $cmd" >&2
    if [ "$cmd" = "pngpaste" ]; then
      echo "Install with: brew install pngpaste" >&2
    fi
    exit 1
  }
done

if [ ! -f "$ROOT/dist/mole" ] || [ ! -f "$ROOT/dist/mole-daemon" ]; then
  echo "Binaries missing; running build first..."
  "$ROOT/scripts/build.sh"
fi

mkdir -p "$BIN_DIR" "$LOG_DIR" "$LA_DIR"
cp "$ROOT/dist/mole" "$BIN_DIR/mole"
cp "$ROOT/dist/mole-daemon" "$BIN_DIR/mole-daemon"
chmod +x "$BIN_DIR/mole" "$BIN_DIR/mole-daemon"
echo "Installed: $BIN_DIR/mole, $BIN_DIR/mole-daemon"

# generate plist from template
sed \
  -e "s|@BIN@|$BIN_DIR/mole-daemon|g" \
  -e "s|@LOG@|$LOG_DIR|g" \
  "$ROOT/launchd/${LABEL}.plist.template" > "$PLIST"
echo "Installed plist: $PLIST"

# unload if already loaded, then load
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Loaded launchd service: $LABEL"

# quick health check
sleep 0.5
if curl -sf --unix-socket /tmp/mole-clip.sock http://x/type >/dev/null 2>&1; then
  echo "Daemon healthy. All set."
else
  echo "WARNING: daemon did not respond on /tmp/mole-clip.sock"
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
