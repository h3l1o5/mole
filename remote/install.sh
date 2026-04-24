#!/usr/bin/env bash
# mole remote install — run this on the remote host
set -euo pipefail

BIN_DIR="$HOME/.local/bin"
XCLIP_SHIM="$BIN_DIR/xclip"

missing=()
for cmd in socat curl bash; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "ERROR: missing required commands: ${missing[*]}" >&2
  echo "Install them first (e.g. 'sudo apt install ${missing[*]}')" >&2
  exit 1
fi

if [ ! -x /usr/bin/xclip ]; then
  echo "WARNING: /usr/bin/xclip not found. Non-image clipboard operations will fail." >&2
  echo "Install with: sudo apt install xclip" >&2
fi

mkdir -p "$BIN_DIR"

# shim is expected to be in the same directory as this script
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$script_dir/xclip"
if [ ! -f "$src" ]; then
  echo "ERROR: cannot find xclip shim at $src" >&2
  exit 2
fi

cp "$src" "$XCLIP_SHIM"
chmod +x "$XCLIP_SHIM"
echo "Installed shim: $XCLIP_SHIM"

case ":$PATH:" in
  *":$BIN_DIR:"*)
    echo "PATH already includes $BIN_DIR"
    ;;
  *)
    echo "WARNING: $BIN_DIR is not in your PATH."
    echo "Add this to your ~/.bashrc or ~/.zshrc:"
    echo ''
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac

echo "Done. Run 'which xclip' to verify it points to $XCLIP_SHIM"
