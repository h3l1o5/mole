#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/state/mole"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"

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

# unload if already loaded, then load
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
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
