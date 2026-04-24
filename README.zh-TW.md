# mole

> 免 SSH 設定的跨機橋接，讓遠端 Linux shell 用起來像在本機。

[English](./README.md)

`mole` 是一個單檔 CLI，透過一條 SSH 連線把 Mac 的剪貼簿與 Chrome DevTools port
送到 Linux remote。在遠端貼截圖、操作本機瀏覽器、跑 Claude Code——全部走同一條
SSH session。

## 特色

- **多 Mac 自動切換（last-writer-wins）。** 靠 `StreamLocalBindUnlink=yes`,
  最新開啟的 SSH session 會自動搶到 reverse tunnel。換台 Mac 不用下任何指令。
- **不改 SSH config。** 所有 tunnel 參數都放在命令列,`~/.ssh/config`
  保持乾淨。
- **`xclip` 透明接管。** Remote 上的 bash shim 只攔截圖片剪貼簿讀取,其他
  呼叫全部 fallback 到真的 `xclip`。Claude Code、Neovim、tmux copy 都能共用。
- **本機 Chrome、遠端操作。** Chrome 跑在 Mac 的 debug mode;remote 工具
  連 `localhost:9222`,透過 socat 橋接回本機。

## 架構

```
 Mac (當前使用) ── Chrome (debug) ─┐        ┌─ Claude Code ── xclip shim ─┐
                                   │  SSH   │                              │ unix socket
     mole-daemon ──────────────────┴────────┴─ socat (TCP 9222 → socket) ─┘
     (剪貼簿)                                     Linux remote
```

一條 SSH 連線承載三條資料路徑:

| 路徑        | 方向                                                                         | 作用            |
| ----------- | ---------------------------------------------------------------------------- | --------------- |
| 剪貼簿      | remote `xclip` → unix socket → SSH tunnel → `mole-daemon` → `osascript`      | 讀取 Mac 剪貼簿 |
| Chrome CDP  | remote `localhost:9222` → `socat` → SSH tunnel → Mac `:9222` → Chrome        | 操作 Mac Chrome |
| Shell       | 鍵盤 ↔ `ssh`(stdio inherit)↔ remote shell                                    | 一般 SSH 體驗   |

完整設計規格見 [`docs/2026-04-24-mole-design.md`](docs/2026-04-24-mole-design.md)。

## 系統需求

### Mac(本機)

| 項目          | 最低版本            |
| ------------- | ------------------- |
| macOS         | 13(Ventura)         |
| Bun           | 1.1(只在 build 時)  |
| Google Chrome | 任何近期版本        |

不需要 macOS 內建以外的任何工具(`osascript`、`open`、`launchctl`
都是系統自帶)。

### Linux(遠端)

| 項目     | 最低版本                                |
| -------- | --------------------------------------- |
| OpenSSH  | 6.7(需支援 `StreamLocalBindUnlink`)     |
| Shell    | `bash`、`curl`、`socat`                 |
| Fallback | `/usr/bin/xclip`                        |
| PATH     | `~/.local/bin` 要在系統路徑之前         |

多數發行版預設沒裝 `socat` 與 `xclip`,在跑 `remote/install.sh` 之前先裝:

```bash
sudo apt install socat xclip     # Debian/Ubuntu
sudo dnf install socat xclip     # RHEL/Fedora
sudo pacman -S socat xclip       # Arch
```

`remote/install.sh` 會自動把 `export PATH="$HOME/.local/bin:$PATH"` append
到 `~/.bashrc`(若尚未存在)。裝完後開新的 SSH session(或 `source ~/.bashrc`),
shim 才會排在 `/usr/bin/xclip` 之前。

## 安裝

### Mac 端

```bash
git clone git@github.com:h3l1o5/mole.git ~/src/github.com/h3l1o5/mole
cd ~/src/github.com/h3l1o5/mole
bun install
bun run build
./scripts/install.sh
```

安裝腳本會:

1. 確認 `osascript`、`open`、`launchctl` 存在。
2. 把 `mole` 與 `mole-daemon` 複製到 `~/.local/bin/`。
3. 安裝並載入 launchd agent(`com.h3l1o5.mole-daemon`)。
4. Ping daemon,確認它在 `/tmp/mole-clip.sock` 上服務。

確保 `~/.local/bin` 已加入 `PATH`。

### 每台 Linux remote(每台一次)

```bash
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
```

這會把 `xclip` shim 裝到 `~/.local/bin/xclip`。以 `ssh <host> 'which xclip'`
驗證,它應該指向 shim,而不是 `/usr/bin/xclip`。

### 建立 Chrome profile

```bash
mkdir -p ~/.chrome-profiles/work ~/.chrome-profiles/personal
```

第一次 `mole` 用某個 profile 啟動 Chrome 時,需要重新登入各網站;之後 profile
目錄會保存狀態。

## 使用

```bash
mole
```

1. 從 `~/.ssh/config` 選 SSH host。
2. 選 Chrome profile。標記 `busy`(被非 debug Chrome 佔用)的 profile 不可選;
   `reusable` 會直接接上現有的 debug Chrome。
3. 三個 preflight 步驟會轉綠:Chrome、Mac daemon、Remote preflight。
4. 進入遠端 shell。Claude Code 按 `Ctrl+V` 直接貼 Mac 剪貼簿;remote 端的
   `http://localhost:9222` 就是你的 Mac Chrome。
5. 完成後在遠端打 `exit`。`mole` 會自動關掉 remote socat,安靜回到 Mac shell。

## 在多台 Mac 之間切換

要讓哪台 Mac 生效,就在那台上跑 `mole`。Reverse tunnel 會自動接管——另一台
Mac 的剪貼簿與 Chrome 路徑會暫時失效,直到下次在那台執行 `mole`。另一台的 SSH
session(含 tmux、Claude Code)繼續活著。

## 疑難排解

<details>
<summary><strong>Daemon 沒反應</strong></summary>

```bash
launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon
tail ~/.local/state/mole/mole-daemon.err.log
```

</details>

<details>
<summary><strong>Remote preflight 回報 <code>socat not installed</code></strong></summary>

```bash
sudo apt install socat   # Debian/Ubuntu
sudo dnf install socat   # RHEL/Fedora
```

</details>

<details>
<summary><strong>Remote 上的 <code>which xclip</code> 仍指向 <code>/usr/bin/xclip</code></strong></summary>

Remote 的 `~/.local/bin` 沒有排在系統路徑之前。在 `~/.bashrc` 或 `~/.zshrc` 裡
加上:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

</details>

<details>
<summary><strong>Chrome profile 卡在 <code>busy</code></strong></summary>

有非 debug 的 Chrome 視窗佔著這個 profile 的 SingletonLock。關掉那個視窗,或
選別的 profile。

</details>

## 解除安裝

```bash
./scripts/uninstall.sh
```

Binary、launchd agent、daemon socket 會被移除。`~/.local/state/mole/` 的
log 會保留。

## 授權

Private(暫時)。
