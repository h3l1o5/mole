# mole

> A zero-configuration bridge that makes a remote Linux shell feel local.

[繁體中文](./README.zh-TW.md)

`mole` is a single-binary CLI that tunnels your Mac's clipboard and Chrome
DevTools port into a Linux SSH session. Paste screenshots, drive a browser,
and run Claude Code on a remote host as if it were local — all through one
SSH connection.

## Features

- **Last-writer-wins across multiple Macs.** The most recent SSH session
  wins the reverse tunnel automatically, via
  `StreamLocalBindUnlink=yes`. Switch laptops without manual coordination.
- **Zero SSH config edits.** All tunnelling flags live on the command line.
  Your `~/.ssh/config` stays untouched.
- **Transparent `xclip`.** A bash shim on the remote intercepts image
  clipboard reads and passes everything else through to the real `xclip`.
  Works with any tool that calls `xclip` — Claude Code, Neovim, tmux copy,
  and so on.
- **Local Chrome, remote automation.** Chrome runs on your Mac in debug
  mode; remote tools connect to `localhost:9222` and drive it through a
  socat bridge.

## Architecture

```
 Mac (active) ── Chrome (debug) ─┐        ┌─ Claude Code ── xclip shim ─┐
                                 │  SSH   │                              │ unix socket
   mole-daemon ──────────────────┴────────┴─ socat (TCP 9222 → socket) ─┘
   (clipboard)                                       Linux remote
```

Three data paths share one SSH connection:

| Path         | Direction                                                  | Purpose            |
| ------------ | ---------------------------------------------------------- | ------------------ |
| Clipboard    | remote `xclip` → unix socket → SSH tunnel → `mole-daemon` → `osascript` | read Mac clipboard |
| Chrome CDP   | remote `localhost:9222` → `socat` → SSH tunnel → Mac `:9222` → Chrome  | control Mac Chrome |
| Shell        | keyboard ↔ `ssh` (stdio inherit) ↔ remote shell            | normal SSH session |

Full design: [`docs/2026-04-24-mole-design.md`](docs/2026-04-24-mole-design.md).

## Requirements

### Mac (local)

| Item          | Minimum                        |
| ------------- | ------------------------------ |
| macOS         | 13 (Ventura)                   |
| Bun           | 1.1 (build only)               |
| Google Chrome | any recent version             |

No external dependencies beyond macOS built-ins (`osascript`, `open`,
`launchctl`).

### Linux (remote)

| Item     | Minimum                                        |
| -------- | ---------------------------------------------- |
| OpenSSH  | 6.7 (needs `StreamLocalBindUnlink`)            |
| Shell    | `bash`, `curl`, `socat`                        |
| Fallback | `/usr/bin/xclip`                               |
| PATH     | `~/.local/bin` ahead of system directories     |

## Install

### On your Mac

```bash
git clone git@github.com:h3l1o5/mole.git ~/src/github.com/h3l1o5/mole
cd ~/src/github.com/h3l1o5/mole
bun install
bun run build
./scripts/install.sh
```

The installer will:

1. Verify that `osascript`, `open`, and `launchctl` are available.
2. Copy `mole` and `mole-daemon` to `~/.local/bin/`.
3. Install and load the launchd agent (`com.h3l1o5.mole-daemon`).
4. Ping the daemon to confirm it is serving on `/tmp/mole-clip.sock`.

Make sure `~/.local/bin` is in your `PATH`.

### On each Linux remote (once per host)

```bash
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
```

This installs the `xclip` shim at `~/.local/bin/xclip`. Confirm with
`ssh <host> 'which xclip'`; it should resolve to the shim rather than
`/usr/bin/xclip`.

### Chrome profile setup

```bash
mkdir -p ~/.chrome-profiles/work ~/.chrome-profiles/personal
```

The first time `mole` launches Chrome with a given profile you will need
to sign in to your sites again. Profile state is preserved thereafter.

## Usage

```bash
mole
```

1. Pick the SSH host from `~/.ssh/config`.
2. Pick a Chrome profile. Profiles marked `busy` (in use by a non-debug
   Chrome) are disabled; `reusable` profiles attach to the existing debug
   Chrome.
3. Watch the three preflight checks turn green: Chrome, Mac daemon,
   remote preflight.
4. You are dropped into the remote shell. `Ctrl+V` in Claude Code pastes
   your Mac clipboard. `http://localhost:9222` on the remote is your Mac
   Chrome.
5. When you are done, type `exit`. `mole` kills the remote socat bridge
   and returns you to your Mac shell silently.

## Switching between Macs

Run `mole` on whichever Mac you want to be active. The reverse tunnel
migrates automatically — the other Mac's clipboard and Chrome paths go
dark until you run `mole` on it again. The other SSH session (and any
tmux or Claude Code inside it) keeps running.

## Troubleshooting

<details>
<summary><strong>Daemon not responding</strong></summary>

```bash
launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon
tail ~/.local/state/mole/mole-daemon.err.log
```

</details>

<details>
<summary><strong>Remote preflight fails with <code>socat not installed</code></strong></summary>

```bash
sudo apt install socat   # Debian/Ubuntu
sudo dnf install socat   # RHEL/Fedora
```

</details>

<details>
<summary><strong><code>which xclip</code> on the remote still points to <code>/usr/bin/xclip</code></strong></summary>

`~/.local/bin` is not ahead of the system directories on the remote.
Add the following to `~/.bashrc` (or `~/.zshrc`):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

</details>

<details>
<summary><strong>Chrome profile stuck on <code>busy</code></strong></summary>

A non-debug Chrome instance is holding the profile's SingletonLock.
Quit that Chrome window, or pick a different profile.

</details>

## Uninstall

```bash
./scripts/uninstall.sh
```

Binaries, the launchd agent, and the daemon socket are removed. Logs in
`~/.local/state/mole/` are preserved.

## License

Private (for now).
