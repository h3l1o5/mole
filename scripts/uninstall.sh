#!/usr/bin/env bash
set -uo pipefail

BIN_DIR="$HOME/.local/bin"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST" "$BIN_DIR/mole" "$BIN_DIR/mole-daemon" "$BIN_DIR/mole-pasteboard"
rm -f /tmp/mole-clip.sock

echo "Uninstalled. Logs in ~/.local/state/mole/ preserved."
