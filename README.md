# mole

> A zero-configuration bridge that makes a remote Linux shell feel local.

`mole` is a single-binary macOS CLI that tunnels your Mac clipboard and Chrome
DevTools port into a Linux SSH session over one connection. Paste screenshots,
drive a remote browser, and run Claude Code on the remote as if it were local.

https://github.com/user-attachments/assets/5d98634e-520c-4c7f-b70a-daff27dd4783

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
| Clipboard    | remote `xclip` → unix socket → SSH tunnel → `mole-daemon` → `mole-pasteboard` | read Mac clipboard |
| Chrome CDP   | remote `localhost:9222` → `socat` → SSH tunnel → Mac `:9222` → Chrome  | control Mac Chrome |
| Shell        | keyboard ↔ `ssh` (stdio inherit) ↔ remote shell            | normal SSH session |

## Requirements

### Mac (local)

| Item                 | Minimum                                       |
| -------------------- | --------------------------------------------- |
| macOS                | 13 (Ventura)                                  |
| Google Chrome        | any recent version                            |

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
curl -fsSL https://raw.githubusercontent.com/h3l1o5/mole/main/install.sh | bash
```

The installer will:

1. Detect your CPU architecture (`arm64` or `x86_64`).
2. Download the matching tarball from the latest GitHub Release.
3. Drop `mole`, `mole-daemon`, and `mole-pasteboard` into `~/.local/bin/`.
4. Install and load the launchd agent (`com.h3l1o5.mole-daemon`).
5. Ping the daemon to confirm it is serving on `/tmp/mole-clip.sock`.

Re-run the same one-liner to upgrade. Make sure `~/.local/bin` is in your `PATH`.

### On each Linux remote

Nothing to do up front. The first time `mole` connects to a host its
preflight detects whether the shim is missing or outdated and prompts to
install it inline (`Install now? [Y/n]`). If you're on an air-gapped
host where running `mole` against it isn't an option, the legacy manual
path still works:

```bash
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
```

## Uninstall

### On your Mac

```bash
mole uninstall            # lists files, asks to confirm
mole uninstall --yes      # skip the prompt
```

Stops the launchd agent and removes the binaries, plist, socket, and log
directory. If the `mole` binary itself is broken, do the same by hand:

```bash
launchctl bootout gui/$UID/com.h3l1o5.mole-daemon 2>/dev/null
rm -f ~/.local/bin/{mole,mole-daemon,mole-pasteboard}
rm -f ~/Library/LaunchAgents/com.h3l1o5.mole-daemon.plist
rm -rf /tmp/mole-clip.sock ~/.local/state/mole/
```

### On each Linux remote

```bash
ssh <host> 'rm -f ~/.local/bin/xclip'
```

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
5. `exit` drops you straight back to your Mac shell. The remote socat
   bridge stays running idle and is reused on the next connection.

To switch active Macs, run `mole` on the other one. The reverse tunnel
migrates automatically; the previous SSH session (and any tmux or Claude
Code inside it) keeps running, just without clipboard and Chrome paths.

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

## Development

```bash
bun install
bun run dev:cli       # iterate on the CLI; the launchd daemon keeps running
bun run dev:daemon    # iterate on the daemon (run `bun run daemon:stop` first)
bun run preview       # snapshot every TUI screen as plain text
bun test
bun run typecheck
```

For a full local install from source (the same flow CI runs):

```bash
bun run build
./scripts/install.sh
```

This requires `bun` and Xcode Command Line Tools (`swiftc`).

`bun run dev:*` runs source directly. `./scripts/install.sh` produces a
`bun build --compile` single-file binary; the two paths diverge on
`import.meta.dir`, `process.execPath`, and launchd's stripped environment.
Run a real install once before shipping.

To run a dev daemon alongside the prod one, set `MOLE_SOCKET` on both the
daemon and the remote shell (the `xclip` shim honours it):

```bash
MOLE_SOCKET=/tmp/mole-clip-dev.sock bun run dev:daemon
MOLE_SOCKET=/tmp/mole-clip-dev.sock bun run dev:cli
```
