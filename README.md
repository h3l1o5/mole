# mole

One-shot CLI that makes remote Claude Code feel local: paste screenshots over
SSH, drive your local Chrome via DevTools — all through a single SSH session.

- **Last-writer-wins across Macs**: jump between laptops, the most recent SSH
  session wins the reverse tunnel automatically. No manual coordination.
- **Zero config files edited**: all SSH flags are on the command line, your
  `~/.ssh/config` stays clean.
- **No agent plumbing**: Claude Code, Codex, or any tool calling `xclip` just
  works.

## Requirements

**Mac (local):**
- macOS 13+
- [Bun](https://bun.sh) 1.x (for building from source)
- `pngpaste` — `brew install pngpaste`
- Google Chrome

**Linux (remote):**
- OpenSSH ≥ 6.7 (for `StreamLocalBindUnlink`)
- `bash`, `curl`, `socat`
- `/usr/bin/xclip` (fallback)
- `~/.local/bin` first in `PATH`

## Install

```bash
git clone git@github.com:h3l1o5/mole.git ~/src/github.com/h3l1o5/mole
cd ~/src/github.com/h3l1o5/mole
bun install
bun run build
./scripts/install.sh
```

Make sure `~/.local/bin` is in your PATH.

## Deploy to a remote (one-time per host)

```bash
cd ~/src/github.com/h3l1o5/mole
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
```

## Create Chrome profiles

```bash
mkdir -p ~/.chrome-profiles/work ~/.chrome-profiles/personal
```

First time mole launches Chrome with one of these, you'll need to log back
into your sites. Settings persist in the profile directory forever after.

## Usage

```bash
mole
```

Pick your host, pick your Chrome profile, let preflight finish, and you're
in the remote shell. `Ctrl+V` in Claude Code now pastes your Mac clipboard.
Chrome DevTools Protocol is available on `localhost:9222` from the remote.

When you're done, `exit` the remote shell — mole cleans up and returns you
to your Mac shell silently.

## Switching between Macs

Just run `mole` on the Mac you want to be active. The reverse tunnel
automatically migrates. The other Mac's SSH session keeps running (tmux,
Claude Code, etc.) but its clipboard/Chrome paths go dark until you run
`mole` on it again.

## Troubleshooting

**Daemon not responding.**
```bash
launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon
tail ~/.local/state/mole/mole-daemon.err.log
```

**Remote preflight fails (`socat not installed`).**
```bash
# On remote:
sudo apt install socat   # debian/ubuntu
sudo dnf install socat   # rhel/fedora
```

**`which xclip` on remote points to `/usr/bin/xclip` instead of the shim.**
Your `PATH` doesn't have `~/.local/bin` first. Fix in `~/.bashrc`:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

**Chrome profile shows `busy`.** Close your regular Chrome instance that's
using that profile, or pick a different profile.

## Design

See [docs/2026-04-24-mole-design.md](docs/2026-04-24-mole-design.md).

## Uninstall

```bash
./scripts/uninstall.sh
```

## License

Private (for now).
