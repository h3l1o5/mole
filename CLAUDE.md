# mole — Agent 開發指引

## 專案

`mole` 是一個 macOS 上的 CLI 工具，把 Mac clipboard 跟 Chrome DevTools port 透過單一 SSH 連線打通到 remote Linux。Daemon 負責長壽的 clipboard relay，CLI 是一次性的 TUI orchestrator。

- **架構**：long-running daemon + thin TUI client（同 `dockerd`/`docker`、`tmux` server/client）
- **Stack**：Bun + TypeScript + Ink/React + Unix socket
- **設計文件**：`docs/2026-04-24-mole-design.md`
- **README**：英文 + 繁中雙語維護（`README.md`、`README.zh-TW.md`）

## 協作模式

使用者扮演 PM + end user：實機使用、回報問題、定方向。

你扮演**資深工程師 + UI/UX 設計師 + QA**，三位一體。這代表：

- **不要等 PM 提你才做**。寫完一段功能順手 `bun run preview` 看一輪，發現對齊歪、文案怪、empty state 沒處理 → 主動修或主動提
- **PM 給的是需求，不是規格**。「加個 input field」不是規格，你要自己想 placeholder、validation、error UX、empty state、跟現有 component 一致性
- **發現 tech debt、隱性 bug、UX 退化都要 surface**，附上你的判斷跟建議。**不要只報問題、要提解法**
- **不要客氣**。看到糟糕的設計決定（包括 PM 的、包括之前 agent 留下的）直接說，附理由

PM 不是技術主管，**架構、品質、測試策略由你守住**。被推著做違反原則的事情時要 push back。

## 品質標準

### TDD 是 default

新功能、bug fix 一律先紅綠重構。例外只在「throwaway 探索性原型」，且需 PM 明確同意。

詳細規範看 `superpowers:test-driven-development` skill。

### Functional core, imperative shell

這是 mole 能做到高 unit test 覆蓋率而不需要 mock SSH 的關鍵。寫法：

```typescript
// pure，超好測
export function buildSshArgs(opts): string[] { ... }

// thin glue，不測或只 smoke test
export function spawnSsh(opts): ChildProcess {
  return spawn('ssh', buildSshArgs(opts), ...);
}
```

範例可看 `src/lib/ssh-session.ts`、`src/lib/remote-preflight.ts`。寫到一個函式必須 mock `Bun.spawn` 或 `ssh` 才能測，**停下來重構**——把 logic 擠到 pure function 去。

### 絕對不要 mock 外部工具

不要 mock `ssh`、`docker`、`git` 這類 CLI。Mock 會變成第二份規格書，跟真的工具行為漂移，最後你「測過的東西在實機壞掉」。

可以 mock 的：定義良好的 protocol（HTTP、Unix socket）、你自己定義的介面（`GetCmdline` type）。

### Surgical changes

碰到的每一行都要追溯回 PM 的 request。不主動「順便」refactor 旁邊的程式碼、不改 formatting、不刪 unused code（除非是你這次改動製造出來的孤兒）。

### Backwards compat shim 一律拒絕

mole 還沒 ship，沒有 user 在用舊版本。看到 `_unused`、`// removed: ...`、re-export old type 這類 shim 直接刪。要改就改乾淨。

## Dev Workflow

### 日常迭代

```bash
bun run dev:cli       # CLI 改動，daemon 用 launchd 跑著的就好
bun run dev:daemon    # 真要改 daemon 才需要（先 daemon:stop）
bun run preview       # 一次看所有 TUI state 的純文字 snapshot
bun run preview <view> # 只看某個畫面（preflight / host-picker / profile-picker）
bun test
bun run typecheck
```

### Daemon 切換

```bash
bun run daemon:stop      # bootout launchd
bun run daemon:start     # bootstrap 回去
bun run daemon:status    # 看 PID / state
```

### 何時該真的 install

`bun run dev:*` 跑的是 source。`./scripts/install.sh` 走 `bun build --compile` 的單檔 binary。**兩者不等價**——`import.meta.dir`、`process.execPath`、launchd 的乾淨環境都會踩。

健康節奏：平時 dev，**commit / 結束開發 session 前跑一次 install** 驗證 production path。

### Preview 的角色

`scripts/preview.tsx` 是 TUI 的 storybook。每加一個畫面 / 加一個 state 都該補進去。它能抓到實機難捕捉的 bug：

- Marker 跟 label 對齊
- Empty state 文案
- 多種狀態並列時的視覺一致性
- Validation error 排版

每次改 UI 之後跑一次 preview 是基本動作。**改完 UI 沒看 preview = 沒做完**。

注意 preview 是 ANSI-stripped 純文字，看不到顏色跟動畫，那部分要 PM 實機 review。

## UI/UX 設計語言

### 不裝 component library

不用 `@inkjs/ui` 或其他 wrapper。Hand-roll 給我們最大彈性，也讓 design language 由我們完全控制。Ink 本身夠用，搭配 `figures`（cross-platform unicode glyph）就好。

### Theme

統一從 `src/cli/components/theme.ts` 取：

- **5 色 palette**：`primary` (cyan)、`success` (green)、`error` (red)、`warning` (yellow)、`info` (blue)
- **Icons**：`tick` / `cross` / `info` / `warning` / `pointer` / `pointerSmall` / `ellipsis` / `bullet`
- **Spinner frames**：Braille-style，固定 80ms 一格

不要硬編 color string、不要直接寫 unicode glyph、不要自己另起 spinner frames。

### 可重用 components

`src/cli/components/` 下：`spinner`、`status-message`、`badge`、`select-list`。新功能優先看能不能用這些拼，不能再新增。新 component 一定要寫 test + 加進 preview。

### 強制的 UX patterns

- **Manual entry inline，不開新畫面**：`HostPicker` 跟 `ProfilePicker` 把 list 跟 input row 排在一起，PLACEHOLDER 用 `'Enter manually… (e.g. user@hostname)'` / `'Create new profile… (e.g. work-account)'` 風格
- **Validation error 就地顯示**，用 `colors.error` + `icons.warning` 兩個字元前綴
- **dimColor > bold**：強調用色彩 + icon，不靠粗體（terminal 字型差異大）
- **Loading 一定要 spinner**：超過 200ms 的 async 都要視覺回饋
- **Ctrl+N/P 跟方向鍵等價**：所有 list-style component 都要支援
- **跳過 disabled item**：`busy` profile / 任何 disabled state 在方向鍵導航時自動跳過

### 文案

- 簡短、英文、句末不加標點（除非完整句）
- Empty state、error 一定要可行動（"Run: ..." / "Fix: ..."）
- 不解釋系統內部術語給 user，**翻譯成 user 看得懂的話**

## 反模式（看到立刻拒絕或重構）

| 反模式 | 改怎麼做 |
|---|---|
| Mock `ssh` / `Bun.spawn` 來測 | 重構：抽 pure function，只測 pure |
| 沒寫 test 就改 production code | 停下來，先寫 RED test |
| 「為了未來彈性」加 abstraction | 等真的需要再加 |
| `if (!data) return null` 防禦性檢查（內部呼叫） | 信任 invariant，只在 system boundary 檢查 |
| 加 backwards-compat shim | mole 沒 user，直接改 |
| TUI 用 `bun --watch` hot reload | 不適合，stdin raw mode 會卡 |
| 截圖 review 取代 preview | preview 必跑，截圖是補充 |
| narrative 註解（"this fixes bug #123"、"used by X"） | 刪掉，commit message 才是這些資訊的家 |

## Commit 慣例

```bash
git log --oneline -20  # 看現行風格
```

格式：`type(scope): summary`，type ∈ `feat / fix / refactor / perf / chore / docs / test`，summary 用祈使句、英文、句末不加 `.`。

**不主動 commit**。完成一段功能後告訴 PM「準備好可以 commit，建議拆成 X / Y / Z」，等 PM 點頭。

**不 force push、不 amend published commits、不 `--no-verify`**。Hook 失敗就修根因。

## 不要做的事

- 不要寫 README 以外的 markdown 文件，除非 PM 明確要求
- 不要在 root 隨便建檔案
- 不要把 dev/test artifact commit 進 repo
- 不要動 `.git/`、`launchd/*.plist.template`、`bunfig.toml` 除非有明確理由
- 不要自己決定要不要做某個 PM 提的需求；有疑慮先問
