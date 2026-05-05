#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: mole is macOS-only (uname -s = $(uname -s))" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64)  ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *)
    echo "ERROR: unsupported arch $(uname -m) (need arm64 or x86_64)" >&2
    exit 1
    ;;
esac

BIN_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/state/mole"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"

mkdir -p "$BIN_DIR" "$LOG_DIR" "$LA_DIR"

TARBALL="mole-darwin-${ARCH}.tar.gz"
URL="https://github.com/h3l1o5/mole/releases/latest/download/${TARBALL}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL ..."
if ! curl -fsSL "$URL" | tar -xzf - -C "$TMP"; then
  echo "ERROR: failed to download or extract $URL" >&2
  exit 1
fi

for bin in mole mole-daemon mole-pasteboard; do
  install -m 0755 "$TMP/$bin" "$BIN_DIR/$bin"
done

xattr -d com.apple.quarantine \
  "$BIN_DIR/mole" "$BIN_DIR/mole-daemon" "$BIN_DIR/mole-pasteboard" \
  2>/dev/null || true

sed \
  -e "s|@BIN@|$BIN_DIR/mole-daemon|g" \
  -e "s|@LOG@|$LOG_DIR|g" \
  -e "s|@PATH@|$BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin|g" \
  "$TMP/com.h3l1o5.mole-daemon.plist.template" > "$PLIST"

launchctl bootout "gui/$UID/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"

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
    echo "Add $BIN_DIR to PATH in your shell rc:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac
