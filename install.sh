#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------------ pretty io
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_PRIMARY=$'\033[36m'
  C_SUCCESS=$'\033[32m'
  C_ERROR=$'\033[31m'
  C_WARN=$'\033[33m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_RESET=$'\033[0m'
else
  C_PRIMARY=''; C_SUCCESS=''; C_ERROR=''; C_WARN=''
  C_DIM=''; C_BOLD=''; C_RESET=''
fi

if [ -t 2 ]; then PROGRESS_FLAG="--progress-bar"; else PROGRESS_FLAG="-sS"; fi

step() { printf '%s==>%s %s%s%s\n' "$C_PRIMARY" "$C_RESET" "$C_BOLD" "$*" "$C_RESET"; }
ok()   { printf '  %s[OK]%s %s\n'  "$C_SUCCESS" "$C_RESET" "$*"; }
warn() { printf '  %s[!]%s  %s\n'  "$C_WARN"    "$C_RESET" "$*" >&2; }
err()  { printf '%s[ERROR]%s %s\n' "$C_ERROR"   "$C_RESET" "$*" >&2; }
dim()  { printf '  %s%s%s\n'       "$C_DIM" "$*" "$C_RESET"; }

# ------------------------------------------------------------------ platform
if [[ "$(uname -s)" != "Darwin" ]]; then
  err "mole is macOS-only (uname -s = $(uname -s))"
  exit 1
fi

case "$(uname -m)" in
  arm64)  ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *)
    err "unsupported arch $(uname -m) (need arm64 or x86_64)"
    exit 1
    ;;
esac

# ------------------------------------------------------------------ paths
BIN_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/state/mole"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"
SERVICE="gui/$UID/${LABEL}"

mkdir -p "$BIN_DIR" "$LOG_DIR" "$LA_DIR"

# ------------------------------------------------------------------ version + url
# Overrides for local testing:
#   MOLE_RELEASE_URL — full tarball URL (skips GitHub API)
#   MOLE_VERSION     — release tag, e.g. v0.2.0 (default: latest)
TARBALL="mole-darwin-${ARCH}.tar.gz"

resolve_version() {
  if [ -n "${MOLE_VERSION:-}" ]; then
    echo "$MOLE_VERSION"
    return
  fi
  local api="https://api.github.com/repos/h3l1o5/mole/releases/latest"
  local tag
  tag="$(curl -fsSL "$api" 2>/dev/null \
    | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')" || true
  echo "${tag:-latest}"
}

VERSION="$(resolve_version)"

if [ -n "${MOLE_RELEASE_URL:-}" ]; then
  URL="$MOLE_RELEASE_URL"
elif [ "$VERSION" = "latest" ]; then
  URL="https://github.com/h3l1o5/mole/releases/latest/download/${TARBALL}"
else
  URL="https://github.com/h3l1o5/mole/releases/download/${VERSION}/${TARBALL}"
fi

# ------------------------------------------------------------------ banner
printf '\n%smole installer%s  %s%s (%s)%s\n\n' \
  "$C_BOLD" "$C_RESET" "$C_DIM" "$VERSION" "$ARCH" "$C_RESET"

# ------------------------------------------------------------------ download
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

step "Downloading $TARBALL"
dim "$URL"
if ! curl -fL $PROGRESS_FLAG -o "$TMP/$TARBALL" "$URL"; then
  err "failed to download $URL"
  err "check your network or the version tag"
  exit 1
fi
ok "downloaded $(du -h "$TMP/$TARBALL" | awk '{print $1}')"

step "Extracting"
if ! tar -xzf "$TMP/$TARBALL" -C "$TMP"; then
  err "failed to extract $TARBALL"
  exit 1
fi
ok "extracted to $TMP"

# ------------------------------------------------------------------ stop existing daemon
# Stop BEFORE replacing binaries: overwriting a running mach-o on macOS can
# yield "Text file busy" / EIO, and a half-loaded service makes the next
# bootstrap race with launchctl error 5.
if launchctl print "$SERVICE" >/dev/null 2>&1; then
  step "Stopping existing daemon"
  launchctl bootout "$SERVICE" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    launchctl print "$SERVICE" >/dev/null 2>&1 || break
    sleep 0.2
  done
  if launchctl print "$SERVICE" >/dev/null 2>&1; then
    warn "daemon did not unload after 3s; proceeding anyway"
  else
    ok "stopped"
  fi
fi

# ------------------------------------------------------------------ install binaries
step "Installing binaries to $BIN_DIR"
for bin in mole mole-daemon mole-pasteboard; do
  install -m 0755 "$TMP/$bin" "$BIN_DIR/$bin"
  ok "$bin"
done

xattr -d com.apple.quarantine \
  "$BIN_DIR/mole" "$BIN_DIR/mole-daemon" "$BIN_DIR/mole-pasteboard" \
  2>/dev/null || true

# ------------------------------------------------------------------ plist
step "Writing launchd plist"
sed \
  -e "s|@BIN@|$BIN_DIR/mole-daemon|g" \
  -e "s|@LOG@|$LOG_DIR|g" \
  -e "s|@PATH@|$BIN_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin|g" \
  "$TMP/com.h3l1o5.mole-daemon.plist.template" > "$PLIST"
ok "$PLIST"

# ------------------------------------------------------------------ bootstrap
step "Loading launchd service"
BOOT_ERR="$TMP/bootstrap.err"
if ! launchctl bootstrap "gui/$UID" "$PLIST" 2>"$BOOT_ERR"; then
  # Stale registration can survive bootout. One forced retry.
  launchctl bootout "$SERVICE" 2>/dev/null || true
  sleep 0.5
  if ! launchctl bootstrap "gui/$UID" "$PLIST" 2>"$BOOT_ERR"; then
    err "launchctl bootstrap failed:"
    cat "$BOOT_ERR" >&2 || true
    exit 1
  fi
fi
ok "loaded $LABEL"

# ------------------------------------------------------------------ health check
step "Health check"
healthy=false
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 0.5
  if curl -sf --unix-socket /tmp/mole-clip.sock http://x/type >/dev/null 2>&1; then
    healthy=true
    break
  fi
done

# ------------------------------------------------------------------ summary
echo
if $healthy; then
  printf '%s%s mole %s installed.%s\n' "$C_SUCCESS" "$C_BOLD" "$VERSION" "$C_RESET"
  ok "binaries: $BIN_DIR"
  ok "logs:     $LOG_DIR"
  ok "daemon:   running"
else
  printf '%s%s mole %s installed (daemon unhealthy).%s\n' "$C_WARN" "$C_BOLD" "$VERSION" "$C_RESET"
  warn "daemon did not respond on /tmp/mole-clip.sock after 5s"
  warn "check logs: tail $LOG_DIR/mole-daemon.err.log"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo
    warn "$BIN_DIR is not on \$PATH. Add to your shell rc:"
    dim 'export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac

echo
