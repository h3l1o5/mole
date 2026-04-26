# mole — Codebase Simplify Design

**Date:** 2026-04-26
**Status:** Draft — pending review
**Author:** @h3l1o5
**Branch:** `feature/simplify`

---

## 1. Overview

### 1.1 背景

mole 第一版功能完整、195 個 unit test 全綠、`tsc --noEmit` 乾淨。但 codebase 在連續 feature commit 後累積了 dead code、narrative 註解、1-caller 抽象、肥檔職責混雜等可整理面。

這份 design 規劃一次系統性的 simplify。**不視為 v1 前最後一步**——是純粹的 codebase 整理，目標是讓「現在」的可維護性、可讀性、封裝邊界提升到 v1 應有的水準。

### 1.2 範圍邊界

整理依據是 **mole 當前實際使用場景**：macOS host + ssh 到 remote linux + Claude Code。**不**為任何假想的擴展（其他 OS client、其他 agent CLI）做提前抽象。

### 1.3 非目標（明確不做）

- 為「未來支援 linux / windows client」抽象任何 platform layer
- 為「未來支援其他 agent CLI」抽象任何 agent layer
- 任何 backwards-compat shim（mole 沒 user）
- 「順便」重構不在 simplify 範疇內的東西
- 補 e2e 自動化（獨立 project，不在範圍）
- 留下「擴展熱區地圖」（等真有第二個 case 時再分析）

---

## 2. 動 / 不動的對象

### 2.1 動的對象

1. dead code、未使用 import、`_unused` 變數
2. narrative 註解（`fixes bug #X`、`originally by Y`、`used by Z`、`workaround for ticket A`、`TODO: refactor when ...`）
3. 1-caller 的 hook / component / abstraction（aggressive default：inline）
4. imperative shell 裡仍混著 logic 的函式（拆成 pure + thin glue，符合 functional core 原則）
5. 違反 single-purpose 的肥檔（拆檔）
6. 不準的命名、不一致的文案
7. `tests/` 套同樣標準

### 2.2 成功標準

- 195 unit test 全綠（每批 commit 前後）
- `tsc --noEmit` 全綠（每批 commit 前後）
- `bun run preview` 視覺 diff 為零（功能行為不變）
- 最終實機跑一次完整 happy path 無 regression
- 每個動到的檔達到「reader 第一次讀 30 秒內能說出它的職責」

---

## 3. Aggressive 判準清單

每條 default 都是「動」。「保留例外」是唯一不動的理由。

### R1 — dead code

- **動**：未被任何地方引用的 export / function / type / const / import
- **判準**：grep 確認 export 無 caller、typecheck 不抗議
- **保留例外**：無

### R2 — narrative 註解

- **動**：歷史性註解（`fixes bug #X`、`originally written by Y`、`used by Z`、`workaround for ticket A`、`TODO: refactor when ...`）
- **保留例外**：解釋**非顯然 why** 的註解（例：`destroy stdin after spawn ssh to stop fd 0 race`），但要重寫成 reader 30 秒能 grok 的形式（不附 ticket、不附歷史）
- **判準**：移除後下一個 reader 是否會踩坑？踩 → 重寫；不踩 → 刪

### R3 — 1-caller abstraction（fn / hook / component / type）

- **動**：default inline 回唯一 caller
- **保留例外**：
  - 抽出來是為了測試（pure function 跟 imperative shell 切開）
  - 抽出來讓 caller 一眼讀懂、命名即文件
- **判準**：inline 後 caller 是否變得難讀？難讀 → 留；一樣清楚或更清楚 → inline

### R4 — imperative shell 混 logic

- **動**：函式內若混了「決定要做什麼」的邏輯（條件、計算、轉換）跟「真的去做」的副作用調用，把邏輯抽成 pure
- **保留例外**：邏輯只有 1–2 行、抽出來反而拗
- **判準**：這函式需要 mock `Bun.spawn` / `ssh` 才能單測嗎？需要 → 抽；不需要 → 維持

### R5 — 肥檔拆檔

- **動**：檔案職責超過一個（明顯違反 single purpose），拆檔
- **不**訂行數 threshold（行數只是 signal）
- **判準**：「這個檔做什麼？」回答需要 `... and ...` → 拆

### R6 — 命名修正

- **動**：default 改名直到「reader 不用讀 implementation 就能猜中行為」
- **保留例外**：已建立的 domain term（`SshHost` / `ProfileInfo` / `PreflightStep` 等）不為「美感」改
- **判準**：新人會誤解這個名字嗎？

### R7 — 文案 / UI 字串

- **動**：對齊 CLAUDE.md 的 UX 規則（簡短、英文、句末不加標點、empty / error 可行動）
- **判準**：違反任何一條 → 改

### R8 — tests

- 套用 R1–R7
- **額外動**：跨 `it` 重複的 setup → 抽 helper 或 `beforeEach`
- **保留例外**：test 的「自我說明性」優先於 DRY—抽 helper 不能讓 reader 跳檔才看懂測什麼

---

## 4. 批次規劃（bottom-up）

策略是 bottom-up：從測試覆蓋最高、最 pure 的核心開始往外推。每進下一層前一層都已乾淨；最薄、沒 e2e 自動測的 `cli/index.tsx` 主流程擺最後，那時 PM 已經驗收過 5 批，手感最熟。

### Batch 1 — `lib/`

- **範圍**：10 source（~600 行）+ 10 test（~700 行）
- 檔案：`chrome-launcher.ts`、`chrome-profile.ts`、`client-id.ts`、`clipboard.ts`、`daemon-health.ts`、`remote-preflight.ts`、`ssh-config.ts`、`ssh-session.ts`、`ssh-spawn.ts`、`types.ts`
- **預期動作**：R1–R4、R6 全套；不太可能拆檔（檔都不大）
- **風險**：最低，全 pure，195 個 test 大半罩這層

### Batch 2 — `daemon/`

- **範圍**：2 source（~96 行）+ 1 test（~84 行）
- 檔案：`main.ts`、`server.ts`
- **預期動作**：跟 Batch 1 同調；`server.ts` 內若 handler 混雜可能拆 routes
- **風險**：低，`server.test.ts` 涵蓋 protocol

### Batch 3 — `cli/components/` + `theme.ts`

- **範圍**：5 source（~190 行）+ 5 test（~190 行）
- 檔案：`badge.tsx`、`select-list.tsx`、`spinner.tsx`、`status-message.tsx`、`text-input.tsx`、`theme.ts`
- **預期動作**：R1、R7 文案對齊；確認 component 嚴守 theme（沒硬編色或字符）
- **風險**：低

### Batch 4 — `cli/hooks/`

- **範圍**：2 source（~80 行）
- 檔案：`use-extra-keys.ts`、`use-profiles.ts`
- **預期動作**：use-extra-keys 用過的 key 是否還都在用？R3 1-caller judgment；test 重複 setup 整理
- **風險**：低

### Batch 5 — `cli/wizard/`

- **範圍**：9 source（~880 行）+ 6 test（~700 行）
- 檔案：`index.tsx`、`layout.ts`、`reducer.ts`、`breadcrumb.tsx`、`review.tsx`、`frame.tsx`、`footer.tsx`、`text-input-keys.ts`、`will.ts`
- **已確認動作**：
  - **拆 `layout.ts`**（258 行混了 wizard width 計算 + breadcrumb layout 兩個職責）→ 分成 `wizard/width.ts`（`truncate`、`WIZARD_*`、`computeWizardWidth`、`isFallbackMode`）跟 `wizard/breadcrumb-layout.ts`（`planValues`、`buildSegments`、`tryFit`、`layoutBreadcrumb` 等）。最終命名以最後 review pass 為準
  - **修 `layout.ts` 內 import 順序**：第 49 行的 `import type { WizardStep } from './reducer'` 出現在中段 export 之後，對齊到檔頭
- **預期動作**：上述 + R1–R8 全套；檢查 wizard 內部還有沒有未收斂的接縫（最近大改的區）
- **風險**：中

### Batch 6 — `cli/` root

- **範圍**：5 source（~762 行）+ 4 test（~309 行）
- 檔案：`index.tsx`、`preflight.tsx`、`profile-picker.tsx`、`host-picker.tsx`、`watchdog.ts`
- **已確認動作**：
  - **拆 `cli/index.tsx`**（293 行混了 entry + main flow + preflight orchestration + ssh handover + watchdog + fetchOurId）：
    - `fetchOurId` → 移到 `lib/daemon-id.ts`（或併入 `lib/daemon-health.ts`，看內容後決）
    - `startHijackWatchdog` → 抽到 `cli/hijack-watchdog.ts`，跟 `cli/watchdog.ts` 一起 review（兩者命名跟分工要釐清）
    - `runPreflightSteps` + `initialPreflightSteps` → 抽到 `cli/preflight-runner.ts`
    - 留 `cli/index.tsx` 為 thin entry
  - **`tests/cli/` 子目錄 mirror `src/cli/`**：
    - `tests/cli/select-list.test.tsx` → `tests/cli/components/select-list.test.tsx`
    - `tests/cli/use-profiles.test.tsx` → `tests/cli/hooks/use-profiles.test.tsx`
- **預期動作**：上述 + R1–R8；`profile-picker.tsx`（229 行）/ `host-picker.tsx`（134 行）讀完內容後判斷是否拆檔
- **風險**：最高，main flow 沒 e2e 自動測，動完要靠 PM 實機驗

---

## 5. 工作流程

### 5.1 Branch / merge 策略

- 從 `main` 切 `feature/simplify`
- 所有 simplify commit 都在這 branch 上
- 完成後 **merge commit 回 main**（保留 history，不 squash—每個 commit 是個原子 simplify 動作，未來 bisect 找 regression 才有解析度）

### 5.2 每批執行流程

1. **Baseline**（進批前）：
   ```bash
   bun test && bun run typecheck && bun run preview > /tmp/preview-before.txt
   ```
   全綠 + 存 preview 純文字快照
2. **執行**：依 R1–R8 動，每個語意完整動作一個 commit
3. **commit 顆粒度規則**：
   - source-only commit 只動 `src/` 內的程式碼。例外：當動作是 rename / move source 時，連動修改 `tests/` 的 import path 屬於同一動作，跟 source 一起 commit（不拆兩個）
   - test-only commit 只動 `tests/` 自身的整理（test 結構、setup helper、test 內 narrative 註解等），不動 `src/`
   - 任一 commit 後跑 `bun test && bun run typecheck`，紅了停下檢查
4. **Post-batch verify**（這批所有 commit 完）：
   - `bun test` 全綠
   - `bun run typecheck` 全綠
   - `bun run preview > /tmp/preview-after.txt && diff /tmp/preview-before.txt /tmp/preview-after.txt` → **零 diff**
   - self-review checklist 過
5. **Pause point**：回對話給 PM 一份 summary（這批刪了什麼、拆了什麼、改了什麼），等 PM ok 才進下一批

### 5.3 Self-review checklist（每批完跑）

- 動到的每個檔達到「reader 30 秒內能說出職責」
- commit message 是純動作描述（沒 narrative、沒 ticket、沒 reasoning）
- 沒「順便」改不在 scope 內的東西
- R1–R8 範疇內有沒有「猶豫沒動」的，重新評估

### 5.4 中途發現 scope 外問題的處理

- **architectural 問題**（例：「這 component 應整個改 props shape」）：不動，記下來，simplify 結束後跟 PM 討論
- **明顯 bug**：停下問 PM，不混進 simplify
- **scope 內但跨批的問題**（例：在 `lib/` 看到一個 fn 其實該住在 `cli/`）：當下就搬，commit message 標示這是跨批移動

---

## 6. 最終實機驗收 checklist（PM 執行）

預計 8–12 分鐘。所有批次驗收都過、`feature/simplify` 準備 merge 前跑這一輪。任一項失敗 → 不 merge，回頭定位。

### A. 環境重建（2 min）

- 在 `feature/simplify` 上跑 `./scripts/install.sh` → 看到新 binary 安裝完
- `bun run daemon:stop && bun run daemon:start && bun run daemon:status` → daemon 從 launchd 重新 bootstrap，狀態 running
- `which mole && mole`（無 flag 啟動）→ 跑的是 production binary，不是 dev source

### B. Happy path（3 min）

- `mole` 啟動 → wizard 出現，breadcrumb 顯示在第 1 步（host）
- 選一個 host → 進到 profile 步，看到 reusable / available / busy 至少兩種狀態
- 選一個 profile（試一次「Skip Chrome」、試一次選真 profile）→ 進到 review，欄位都對
- Enter 提交 → preflight 三段（daemon / remote / chrome）依序變綠
- ssh 提示出現 → 在 remote 跑 `echo hi | xclip -selection clipboard` 確認 mac 收到剪貼簿；mac 上 `pbcopy` 一段字後 remote `xclip -selection clipboard -o` 確認回流
- 在 remote `curl -s http://localhost:9222/json/version` → Chrome devtools 連得到
- `exit` → mole 乾淨退出（watchdog 沒留住 event loop）

### C. Error / 邊角抽驗（2 min）

- 故意 `bun run daemon:stop` 後跑 `mole` → preflight daemon 段變紅、訊息可行動（提示重啟指令）
- 故意選一個不存在的 host（或臨時編輯 ssh config）→ preflight remote 段變紅
- terminal 縮到寬度 < 50 col 跑 wizard → 進入 fallback mode（無 border、step counter 風格）

### D. UI 抽驗（2 min）

- `bun run preview` 全 view 一輪 → 跟 simplify 前的視覺一致，無退化
- wizard 內試方向鍵 + Ctrl+N/P + Home/End + Cmd+Arrow → 全部正常
- busy profile 行用方向鍵移過 → 自動跳過

### E. Hijack（選做，~3 min，需另一台 mac）

- 從第二台 mac 也 `mole` 連同一個 remote → 第一台 mac 在 watchdog 間隔內看到黃字 `[mole] another client took over...` 並乾淨退出

### 通過條件

- A、B、C、D 全 pass = 可 merge
- E 有條件做就做；只一台 mac → 跳過、accept risk

---

## 7. Out of scope（記錄但不做）

- 補 e2e 自動化測試（會大幅降低實機驗收成本，但屬獨立 project，不在這次範圍）
- 為 linux / windows client 抽 platform layer
- 為其他 agent CLI 抽 agent layer
- 補「擴展熱區地圖」

simplify 結束後若 PM 想推進這些，各自獨立 brainstorm。
