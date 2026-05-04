#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

host_arch="$(uname -m)"
case "$host_arch" in
  arm64)  default_arch="arm64" ;;
  x86_64) default_arch="x64" ;;
  *)      default_arch="$host_arch" ;;
esac
TARGET_ARCH="${TARGET_ARCH:-$default_arch}"

case "$TARGET_ARCH" in
  arm64)
    BUN_TARGET="bun-darwin-arm64"
    SWIFT_TARGET="arm64-apple-macos11"
    ;;
  x64)
    BUN_TARGET="bun-darwin-x64"
    SWIFT_TARGET="x86_64-apple-macos11"
    ;;
  *)
    echo "ERROR: unsupported TARGET_ARCH: $TARGET_ARCH (need arm64 or x64)" >&2
    exit 1
    ;;
esac

mkdir -p dist

echo "Building mole CLI ($BUN_TARGET)..."
bun build \
  --compile \
  --minify \
  --target="$BUN_TARGET" \
  --outfile=dist/mole \
  src/cli/index.tsx

echo "Building mole-daemon ($BUN_TARGET)..."
bun build \
  --compile \
  --minify \
  --target="$BUN_TARGET" \
  --outfile=dist/mole-daemon \
  src/daemon/main.ts

echo "Building mole-pasteboard ($SWIFT_TARGET)..."
swiftc -O -target "$SWIFT_TARGET" -o dist/mole-pasteboard native/mole-pasteboard.swift

echo "Done. Binaries in dist/"
ls -la dist/
