# mole — Design Spec

**Date:** 2026-04-24
**Status:** Draft — pending review
**Author:** @h3l1o5

---

## 1. Overview

### 1.1 問題

在 Mac 上透過 SSH 連到 Linux remote、attach 一個常駐 tmux、在裡面跑 Claude Code 時，有兩件事痛：

1. **截圖貼不上**：Mac 的剪貼簿過不去 SSH，Claude Code 看到的遠端剪貼簿是空的。
2. **Chrome DevTools Protocol 斷連**：本機的 Chrome debug port（9222）在 remote 連不到，讓 Claude Code 的 chrome-devtools 類 MCP 無法操作本機 Chrome。

此外還有一個隱藏痛點：**使用者有多台 Mac**（公司、家裡），都可能同時 SSH 到同一個 remote、都掛著 tmux session。既有解法（例如 `cc-clip`）在 tunnel port 衝突這點沒乾淨解決方案。

### 1.2 目標

做一個名為 `mole` 的一站式 CLI 工具，在**單一指令**之內：

1. 挑選 SSH host（從 `~/.ssh/config` 列表）
2. 挑選並啟動（或 reuse）debug mode Chrome
3. 建立一條帶 reverse tunnel 的 SSH 連線
4. 把 terminal 交給真正的 `ssh`，讓使用者體驗跟手打 `ssh host` 無差

ssh 結束後靜悄悄清理、回到 Mac shell prompt。

### 1.3 非目標（明確不做）

- Token 認證 / 授權系統
- Codex CLI、opencode 等其他 agent 的支援
- Windows 端支援
- 通知系統（Claude Code hook、Codex notify）
- `doctor` 類健康檢查指令
- 建立新 Chrome profile 的功能
- Multi-remote 同時 active
- PTY proxy（ssh 中途呼叫 mole TUI）
- Race condition 防護（profile 偵測到啟動之間的 race）

### 1.4 使用情境假設

- **使用者：** solo developer，主要自用
- **本機：** macOS 13+，已安裝 Bun、`pngpaste`、Chrome、`ssh`
- **Remote：** Linux（amd64/arm64），有 `bash`、`curl`、`socat`、SSH server，OpenSSH 支援 `StreamLocalBindUnlink`
- **連線模式：** Mac → Linux remote → tmux（remote 長駐）→ Claude Code
- **多 Mac：** 可能同時有多台 Mac SSH 著，但實際貼圖/操作只會發生在「當前使用的那台」

---

## 2. 架構圖

```
┌──────────────────────────── Mac (當前使用的那台) ────────────────────────────┐
│                                                                              │
│  ┌──────────────┐                                                            │
│  │ Chrome       │ ← --remote-debugging-port=9222                             │
│  │ (debug mode) │   --user-data-dir=~/.chrome-profiles/<name>                │
│  └──────┬───────┘                                                            │
│         │ TCP 127.0.0.1:9222                                                 │
│         │                                                                    │
│  ┌──────┴─────────────────┐      ┌──────────────────────────┐                │
│  │ mole-daemon (Bun/TS)   │      │ mole CLI (Bun/TS + ink)  │                │
│  │ Unix socket:           │      │ • TUI host/profile picker│                │
│  │   /tmp/mole-clip.sock  │      │ • spawn Chrome           │                │
│  │ reads macOS clipboard  │      │ • spawn ssh w/ -R forward│                │
│  │ via `pngpaste`         │      │ • cleanup on exit        │                │
│  │ managed by launchd     │      └──────────┬───────────────┘                │
│  └────────┬───────────────┘                 │                                │
│           │                                 │                                │
└───────────┼─────────────────────────────────┼────────────────────────────────┘
            │                                 │
            │  SSH reverse tunnel             │ interactive ssh (inherit tty)
            │  (StreamLocalBindUnlink=yes)    │
            │                                 │
┌───────────┼─────────────────────────────────┼────────────────────────────────┐
│           ↓                                 ↓                                │
│  /tmp/mole-clip.sock         /tmp/mole-chrome.sock       user shell / tmux   │
│           ↑                                 ↑                      ↓         │
│  ┌────────┴────────┐         ┌──────────────┴──────────┐   ┌──────────────┐  │
│  │ fake xclip      │         │ socat                   │   │ Claude Code  │  │
│  │ (bash shim)     │         │ TCP-LISTEN:9222         │   │ (tmux pane)  │  │
│  │ ~/.local/bin/   │         │ UNIX-CONNECT:           │   │              │  │
│  │   xclip         │         │ /tmp/mole-chrome.sock   │   │ xclip, CDP   │  │
│  └─────────────────┘         └─────────────────────────┘   └──────────────┘  │
│                                                                              │
│                                Remote (Linux)                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 三條資料路徑

| 路徑 | 流向 | 作用 |
|---|---|---|
| **Clipboard** | Claude Code → fake xclip → remote socket → SSH tunnel → Mac daemon → `pngpaste` → macOS 剪貼簿 | 讀取 Mac 截圖 |
| **Chrome DevTools** | Claude Code → TCP 9222 → socat → remote socket → SSH tunnel → Mac 9222 → Chrome | 控制 Mac Chrome |
| **Interactive SSH** | 使用者鍵盤 ↔ ssh child process (stdio inherit) ↔ remote shell | 正常 SSH 體驗 |

---

## 3. 關鍵機制

### 3.1 多 Mac 的 Last-Writer-Wins

問題：兩台 Mac 同時想在 remote 建 reverse tunnel 到 `/tmp/mole-clip.sock`，預設情況下第二台會 fail（address already in use）。

解法：SSH 命令列加 `-o StreamLocalBindUnlink=yes`。這讓 SSH 在 bind socket 前**如果發現 socket 檔已存在，就直接刪掉它重建**。結果：

- Mac A ssh 著，socket 指向 A
- Mac B ssh → 舊 socket 被 unlink、新 socket 指向 B
- Mac A 的 SSH session 本身不受影響（tmux、Claude Code 都還活著），但它的 reverse forward 失效了
- 使用者走回 Mac A 時，重新跑 `mole` → 新 SSH session 搶回 socket

**切換不需要任何額外指令，只要「到哪台 Mac 就跑 mole」即可。** 這個行為剛好符合 solo developer 的直覺。

### 3.2 為什麼用 Unix Socket 而非 TCP Port

| 面向 | TCP Port (cc-clip 方式) | Unix Socket (本設計) |
|---|---|---|
| Port 衝突 | 需額外 coordination 或手動 kill | `StreamLocalBindUnlink=yes` 原生解決 |
| 權限 | 預設可被所有本機用戶連 | file permission 自然隔離 |
| 殘留清理 | stale port 不會自動釋放 | stale socket file 被 unlink 覆蓋 |

### 3.3 Fake xclip Shim

Claude Code 在 Linux 讀剪貼簿是呼叫 `xclip`。我們在 remote 的 `~/.local/bin/xclip` 放一個 bash script，並確保 `~/.local/bin` 在 `PATH` 最前面。Claude Code 呼叫 `xclip` 會先找到假的。

假 xclip 解析參數：
- `xclip -selection clipboard -t TARGETS -o` → 「問剪貼簿有什麼格式」→ 向 socket 問、回 `image/png` 或 fallback
- `xclip -selection clipboard -t image/png -o` → 「給我 PNG」→ 向 socket 拿 binary、寫到 stdout
- 其他任何呼叫（例如複製文字到剪貼簿）→ `exec` 真正的 `/usr/bin/xclip`，完全 pass-through

這樣設計可以**不影響任何其他程式的 xclip 用法**，只有圖片讀取被劫持。

### 3.4 Chrome 9222 的 Socket-to-TCP 橋接

Chrome 只 bind TCP port，不支援 Unix socket。所以 remote 端跑一個 socat：

```bash
socat TCP-LISTEN:9222,bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:/tmp/mole-chrome.sock
```

任何連 `localhost:9222` 的 remote 工具，實際上走 socat → unix socket → SSH tunnel → Mac 的 TCP 9222 → Chrome。對 Claude Code 的 MCP 工具完全透明。

**CDP WebSocket 小坑：** `/json/version` 回的 `webSocketDebuggerUrl` 寫死 `ws://localhost:9222/...`，hostname 硬編碼。Remote 看到的 `localhost:9222` 也指向 socat，所以 WebSocket 能正常建立。但如果 CDP session 建立到一半 Mac 被切換，WebSocket 會斷線，MCP 必須重連。這個視窗很小，接受此設計代價。

### 3.5 完整的 SSH 命令列

mole 實際執行的 ssh 指令（簡化版，不含日誌開關）：

```bash
ssh \
  -o StreamLocalBindUnlink=yes \
  -o ExitOnForwardFailure=no \
  -R /tmp/mole-clip.sock:/tmp/mole-clip.sock \
  -R /tmp/mole-chrome.sock:127.0.0.1:9222 \
  <host>
```

- `-R /tmp/mole-clip.sock:/tmp/mole-clip.sock`：remote unix socket ↔ Mac unix socket（剪貼簿）
- `-R /tmp/mole-chrome.sock:127.0.0.1:9222`：remote unix socket ↔ Mac TCP 9222（Chrome）
- `ExitOnForwardFailure=no`：即使某個 forward 失敗，ssh 仍建立連線（不讓小問題擋住 shell）
- `StreamLocalBindUnlink=yes`：socket 檔已存在時自動 unlink（last-writer-wins 的關鍵）

不改使用者 `~/.ssh/config`，所有設定走命令列。

---

## 4. 元件拆分

### 4.1 `mole` CLI（Mac 端，Bun + TypeScript + ink）

**職責：**
- 解析 `~/.ssh/config`，列出可選 Host（排除含 wildcard 的）
- TUI：host 選擇、Chrome profile 選擇、preflight 進度
- 掃描 `~/.chrome-profiles/` 底下的 profile，偵測每個狀態（FREE / STALE / REUSABLE / BUSY），每秒 refresh
- 啟動 / reuse debug Chrome（detached，不因 mole 退出而被殺）
- 檢查 mole-daemon 是否活著（via `launchctl list`），沒活就 `launchctl kickstart`
- 在 remote 透過 `ssh host 'command'` 執行 preflight：確認假 xclip 存在、確認 socat 啟動（若沒跑就背景啟動）
- 使用 `Bun.spawn(['ssh', ..., host], { stdio: 'inherit' })` 交出 TTY
- ssh 結束後：（背景地）kill remote socat process（若為本次 mole 啟動的）→ mole process exit

**不負責：**
- 管理 Chrome 生命週期（Chrome 自己活著、自己死）
- 管理 daemon 生命週期（launchd 負責）
- 自動部署 remote 假 xclip（一次性手動部署）

### 4.2 `mole-daemon`（Mac 端，Bun + TypeScript）

**職責：**
- 監聽 `/tmp/mole-clip.sock`，HTTP over Unix socket
- 兩個 endpoint:
  - `GET /type` → 回 JSON `{"type":"image","format":"png"}` 或 `{"type":"empty"}`
  - `GET /image` → 回 raw PNG bytes
- 實作上呼叫 `pngpaste -` 讀 clipboard（寫到 stdout）
- 由 launchd 管理（`~/Library/LaunchAgents/com.h3l1o5.mole-daemon.plist`），開機自動啟動、crash 自動重啟
- **不**處理 token、認證；socket 檔的 file permission 提供隔離

**HTTP / Unix socket** 用 Bun 原生 `Bun.serve({ unix: '/tmp/mole-clip.sock', fetch })`。

### 4.3 Remote 假 xclip（bash，約 50 行）

純 bash + curl 實作。核心邏輯：

```bash
#!/bin/bash
SOCK=/tmp/mole-clip.sock
case "$*" in
  *"-selection clipboard"*"-t TARGETS"*"-o"*)
    type=$(curl -sf --unix-socket "$SOCK" http://x/type | jq -r .type)
    if [ "$type" = "image" ]; then
      echo "image/png"
    else
      exec /usr/bin/xclip "$@"
    fi
    ;;
  *"-selection clipboard"*"-t image/png"*"-o"*)
    curl -sf --unix-socket "$SOCK" http://x/image || exec /usr/bin/xclip "$@"
    ;;
  *)
    exec /usr/bin/xclip "$@"
    ;;
esac
```

部署位置：`~/.local/bin/xclip`。使用者需確保 `~/.local/bin` 在 `PATH` 之前。

### 4.4 Remote socat

由 `mole` CLI 在 preflight 透過 ssh 啟動：

```bash
pgrep -f 'socat.*mole-chrome' >/dev/null || \
  nohup socat TCP-LISTEN:9222,bind=127.0.0.1,reuseaddr,fork \
              UNIX-CONNECT:/tmp/mole-chrome.sock \
              >/dev/null 2>&1 &
```

若 mole 啟動時發現 socat 已在跑，直接 reuse。mole 退出時把這個 socat kill 掉（透過 PID 記錄）。

---

## 5. TUI / CLI 設計

### 5.1 主命令

`mole`（無子命令）：預設走互動式 TUI 流程。

可能的未來子命令（不在 MVP）：`mole status`、`mole daemon restart`。

### 5.2 TUI 流程

```
1. Host picker
   從 ~/.ssh/config 讀取所有 Host 條目，排除含 * ? 的
   顯示 Host 名稱 + HostName + 最近使用時間（從 ~/.local/state/mole/history 讀）
   選擇後進下一步

2. Chrome profile picker
   掃描 ~/.chrome-profiles/ 底下所有 directory
   每秒 re-scan 並更新狀態
   每個 profile 顯示：name + status tag
     - free: 可開新 debug chrome
     - stale: 有殘留 lock 但 pid 已死（可覆蓋，視同 free）
     - reusable: 已有 debug chrome 跑著（會 reuse）
     - busy: 被非 debug chrome 佔著（disabled 不可選）

3. Preflight（自動，顯示進度）
   ✓ Chrome 啟動中 / reusing existing
   ✓ Daemon 狀態檢查
   ✓ Remote preflight (假 xclip + socat)
   → ssh 接管 terminal

4. ssh 執行中（TUI 消失，完全是 ssh 體驗）

5. ssh 結束後
   背景清理 → mole process exit → 回 Mac shell prompt
```

### 5.3 TUI Library

選用 `ink`（React for CLIs）。原因：
- 原生支援 state-driven 的 flicker-free re-render，符合「每秒 refresh profile 狀態」需求
- 游標選到的位置在 re-render 後會保留
- 未來擴充其他 TUI 畫面零摩擦

---

## 6. Chrome Profile 狀態偵測

### 6.1 狀態機

```
┌──────────────────────────┐
│ 掃描 ~/.chrome-profiles/ │
└────────────┬─────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│ For each profile dir:                   │
│   lock = <dir>/SingletonLock (symlink)  │
└────────────┬────────────────────────────┘
             │
   lock 不存在 ───────────────────→ [FREE]
             │
   lock 存在，解析 symlink target
   格式: <hostname>-<pid>
             │
   pid 不活 (kill -0 fail) ────────→ [STALE]（當 free 處理，啟動時會自動覆蓋）
             │
   pid 活著，讀 `ps -p <pid> -o command=`
             │
   cmdline 含 --remote-debugging-port ──→ [REUSABLE]
             │
   否則 ──────────────────────────────→ [BUSY]（disabled，不給選）
```

### 6.2 選擇後的行為

| 狀態 | 動作 |
|---|---|
| FREE | 啟動新 debug Chrome：`open -na "Google Chrome" --args --user-data-dir=<path> --remote-debugging-port=9222 --remote-allow-origins=*` |
| STALE | 直接啟動新 debug Chrome（Chrome 啟動過程會清掉 stale lock） |
| REUSABLE | 不啟動任何東西，直接進下一步（9222 已經在跑） |
| BUSY | TUI 不允許選中（disabled 標記） |

---

## 7. 專案結構

```
mole/
├── README.md
├── LICENSE                 # 若決定 public 再加
├── package.json
├── tsconfig.json
├── bunfig.toml
├── .gitignore
├── docs/
│   ├── 2026-04-24-mole-design.md   # 本檔
│   └── install.md                  # 使用者一次性部署指南
├── src/
│   ├── cli/
│   │   ├── index.tsx              # ink app entry
│   │   ├── host-picker.tsx
│   │   ├── profile-picker.tsx
│   │   ├── preflight.tsx
│   │   └── hooks/
│   │       └── use-profiles.ts    # 每秒 refresh 邏輯
│   ├── daemon/
│   │   └── index.ts               # mole-daemon (Bun.serve unix socket)
│   ├── lib/
│   │   ├── ssh-config.ts          # 解析 ~/.ssh/config
│   │   ├── chrome-profile.ts      # lock 偵測、狀態判斷
│   │   ├── chrome-launcher.ts     # spawn Chrome
│   │   ├── ssh-session.ts         # spawn interactive ssh
│   │   └── remote-preflight.ts    # ssh host 'command' 執行 preflight
│   └── types.ts
├── remote/
│   ├── xclip                      # bash shim script
│   └── install.sh                 # 一鍵部署 shim 到 remote
├── launchd/
│   └── com.h3l1o5.mole-daemon.plist
└── scripts/
    └── install.sh                 # Mac 端安裝（daemon + launchd + PATH）
```

---

## 8. 部署與首次安裝

### 8.1 Mac 端（一次性）

```bash
# 1. clone + install deps
git clone git@github.com:h3l1o5/mole.git ~/src/github.com/h3l1o5/mole
cd ~/src/github.com/h3l1o5/mole
bun install

# 2. 編譯 daemon + CLI 成 standalone binary
bun run build        # outputs dist/mole, dist/mole-daemon

# 3. 安裝到 PATH
./scripts/install.sh # 複製 dist/ 到 ~/.local/bin/，安裝 launchd plist

# 4. 確保 pngpaste 存在
brew install pngpaste
```

### 8.2 Remote 端（每個 remote host 一次性）

```bash
# 在 Mac 執行
cd ~/src/github.com/h3l1o5/mole
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
```

`remote/install.sh` 的內容：
- 複製 xclip shim 到 `~/.local/bin/xclip` 並 chmod +x
- 檢查 `PATH` 是否包含 `~/.local/bin`，不包含則 append 到 `~/.bashrc`
- 確認 `socat` 已裝（若沒有就提示使用者裝）

### 8.3 Chrome profile 準備

使用者自行準備：

```bash
mkdir -p ~/.chrome-profiles/work ~/.chrome-profiles/personal
# 第一次 mole 啟動 Chrome 會建立 profile 的初始狀態，自行登入 GitHub / Google 等
```

---

## 9. 邊界情況與錯誤處理

| 情境 | 處理 |
|---|---|
| Daemon 沒活 | `launchctl kickstart` 拉起；失敗則 TUI 顯示錯誤並退出 |
| `~/.ssh/config` 不存在 / 沒有可選 Host | TUI 顯示「請先設定 SSH Host」並退出 |
| `~/.chrome-profiles/` 不存在 / 為空 | TUI 顯示「請先建立 profile 目錄」並退出 |
| Chrome 啟動失敗（port 9222 被非 Chrome 佔） | 報錯退出（先不自動 kill） |
| Remote 沒裝 socat | preflight 偵測到 `command -v socat` fail，顯示安裝提示並退出 |
| Remote 沒有 `~/.local/bin/xclip` shim | preflight 偵測到缺失，顯示部署指示並退出 |
| ssh 啟動時 host key 驗證失敗 | ssh 本身會印錯誤並 exit non-zero；mole 不特別處理，直接 exit |
| ssh session 中途斷線 | ssh 自己 exit；mole 感知到、執行清理、退出 |
| Terminal 強制關閉 (Cmd+Q) | SIGHUP 殺到 mole 和 ssh；ssh 會 graceful shutdown（unlink remote sockets）；Chrome 因 detached 活著 |
| 電腦強制斷電 | 下次 ssh 時 `StreamLocalBindUnlink=yes` 自動清掉 stale socket |
| 使用者在 TUI preflight 階段按 Ctrl+C | 清理已啟動的東西（若 Chrome 是本次啟動的不要殺——留著）、退出 |

---

## 10. 前置需求摘要

### Mac 端
- macOS 13+
- Bun ≥ 1.0
- `pngpaste`（`brew install pngpaste`）
- Google Chrome
- SSH 已設好 `~/.ssh/config` 和金鑰

### Remote 端
- Linux（OpenSSH ≥ 6.7，以支援 `StreamLocalBindUnlink`）
- `bash`、`curl`、`jq`、`socat`
- `~/.local/bin` 在 `PATH` 之前
- `/usr/bin/xclip` 存在（當 fallback）

---

## 11. Convention / Hardcoded 值

MVP 為了簡化，以下為 hardcoded convention，未來可 env var override（不在 MVP 範圍）：

| 項目 | 值 |
|---|---|
| Mac daemon socket | `/tmp/mole-clip.sock` |
| Remote clipboard socket | `/tmp/mole-clip.sock` |
| Remote chrome socket | `/tmp/mole-chrome.sock` |
| Chrome debug port | `9222` |
| Chrome profile 根目錄 | `~/.chrome-profiles/` |
| mole state 目錄 | `~/.local/state/mole/` |
| Launchd service label | `com.h3l1o5.mole-daemon` |

## 12. 開放問題（留給實作階段決定）

- CLI 打包方式：`bun build --compile` 單檔，或 npm 發佈？→ 傾向前者（solo tool 不需要 registry）
- TUI 的色彩主題：跟 terminal 預設走就好，還是自訂 palette？→ 預設
- 首次使用的 onboarding：要不要做 `mole setup` 指令？→ MVP 先用手動 README，未來視需求加

---

## 13. 成功標準

MVP 被視為成功的條件：

1. 在兩台 Mac 都跑 `mole`，能分別接管 remote 的 reverse tunnel（last-writer-wins 行為正確）
2. 在 Claude Code 裡按 Ctrl+V 能貼上當前 active Mac 的剪貼簿截圖
3. Remote 的 chrome-devtools MCP 能透過 `localhost:9222` 操作 active Mac 的 Chrome
4. ssh 體驗（中途輸入、resize、Ctrl+C）和手打 `ssh host` 無差異
5. ssh 結束後 mole 靜悄悄退出，不彈選單
6. 強退、關機、斷電等情境不會卡住下一次 mole 啟動
