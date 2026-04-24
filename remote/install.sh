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
  echo "" >&2
  echo "Install with one of:" >&2
  echo "  sudo apt install ${missing[*]}     # Debian/Ubuntu" >&2
  echo "  sudo dnf install ${missing[*]}     # RHEL/Fedora" >&2
  echo "  sudo pacman -S ${missing[*]}       # Arch" >&2
  exit 1
fi

if [ ! -x /usr/bin/xclip ]; then
  echo "WARNING: /usr/bin/xclip not found. Non-image clipboard operations will fall through to nothing." >&2
  echo "Install with one of:" >&2
  echo "  sudo apt install xclip     # Debian/Ubuntu" >&2
  echo "  sudo dnf install xclip     # RHEL/Fedora" >&2
  echo "  sudo pacman -S xclip       # Arch" >&2
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

path_line='export PATH="$HOME/.local/bin:$PATH"'
case ":$PATH:" in
  *":$BIN_DIR:"*)
    echo "PATH already includes $BIN_DIR"
    ;;
  *)
    rc="$HOME/.bashrc"
    if grep -qF "$path_line" "$rc" 2>/dev/null; then
      echo "$BIN_DIR not in current PATH, but $rc already has the export."
      echo "Open a new shell (or 'source $rc') to pick it up."
    else
      printf '\n# Added by mole installer\n%s\n' "$path_line" >> "$rc"
      echo "Appended to $rc: $path_line"
      echo "Open a new SSH session (or 'source $rc') to pick it up."
    fi
    ;;
esac

echo "Done. Run 'which xclip' in a new shell to verify it points to $XCLIP_SHIM"
