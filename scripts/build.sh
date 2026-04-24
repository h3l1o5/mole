#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p dist

echo "Building mole CLI..."
bun build \
  --compile \
  --minify \
  --target=bun-darwin-arm64 \
  --outfile=dist/mole \
  src/cli/index.tsx

echo "Building mole-daemon..."
bun build \
  --compile \
  --minify \
  --target=bun-darwin-arm64 \
  --outfile=dist/mole-daemon \
  src/daemon/main.ts

echo "Done. Binaries in dist/"
ls -la dist/
