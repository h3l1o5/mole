# mole Codebase Simplify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 對 mole 全 codebase 執行 R1–R8 aggressive simplify pass，分 6 批以 bottom-up 順序進行，最終 merge 回 main 時無 regression。

**Architecture:** `feature/simplify` branch + 6 個 batch（lib → daemon → components → hooks → wizard → cli root）。每批 baseline → audit（列 finding 清單給 PM）→ execute（每 finding 一 commit）→ verify（test + typecheck + preview diff）→ pause（回 PM）。

**Tech Stack:** Bun 1.3+, TypeScript 5.6+, Ink 5, ink-testing-library 4。

**Spec:** `docs/2026-04-26-codebase-simplify-design.md`（commits `d3f9adc` + `3078cab` on main）。執行時必須跟 spec 對照——R1–R8 判準、批次範圍、commit 規則、自我 review checklist 都在 spec 內。

---

## Plan 模式說明（重要：與一般 TDD plan 不同）

這份 plan 的本質是 **audit-driven simplify**，不是 feature-driven TDD。差異：

- 一般 feature plan 的 step 是 "write failing test → implement → green"。這份 plan 的 step 是 "讀檔 → 套 R1–R8 → 列 finding → 確認 → 執行 → 驗收"。
- 「具體要動哪行」要等執行者真的讀過該批所有檔、套 R1–R8 判準後才知道。Plan 階段把 6 批範圍寫死，但每批內 finding 數量、種類、目標檔，是執行階段動態產出的。
- 因此每個 Phase 的 Task 3「execute」是個容器：實際 sub-step 在 Task 2「audit」結束時由執行者列出 finding 清單、PM 確認後填入。**這不是 placeholder——是 by-design 的 dynamic sub-step**，因為 simplify 工作的本質如此。

**Finding 清單格式**（每批 audit 階段執行者用此格式回報 PM）：

```
F<batch>.<seq> [Rx] <file>[:line] — <action description>
```

範例：
- `F1.1 [R2] src/lib/ssh-session.ts:14` — 砍 narrative 註解「added for issue #42」
- `F1.3 [R3] src/lib/chrome-profile.ts:80` — `internalHelper()` 只被 `readProfile()` 用一次，inline
- `F5.1 [R5] src/cli/wizard/layout.ts` — 拆成 `width.ts` + `breadcrumb-layout.ts`（已在 spec Batch 5 確認）

PM 確認清單後，執行者依序動作；每 finding 一個 commit，commit message 格式：
```
<type>(<scope>): R<x> — <action>
```
例：`refactor(lib): R3 — inline single-caller internalHelper into readProfile`

`<type>` 通用對應：
- R1 dead code → `chore`
- R2 narrative 註解、R6 命名、R7 文案 → `refactor`
- R3 inline、R4 抽 pure、R5 拆 → `refactor`
- R8 test 整理 → `test` 或 `chore`

---

## Phase 0: Setup

### Task 0.1: 確認起點乾淨並切 branch

**Files:** none changed

- [ ] **Step 1: 確認在 main 且 working tree 乾淨**

Run:
```bash
git status -sb
```
Expected: 第一行 `## main...origin/main`；底下無檔案。如有 uncommitted change → 停下處理，不開 branch。

- [ ] **Step 2: 切 `feature/simplify` branch**

Run:
```bash
git checkout -b feature/simplify
```
Expected: `Switched to a new branch 'feature/simplify'`

- [ ] **Step 3: 確認 branch 已建立**

Run:
```bash
git status -sb
```
Expected: `## feature/simplify`

### Task 0.2: 整體 baseline

**Files:** none changed（僅產出 `/tmp/` 內 baseline）

- [ ] **Step 1: 全 test 綠**

Run:
```bash
bun test
```
Expected: `195 pass / 0 fail`（或更多 pass，0 fail）

- [ ] **Step 2: typecheck 綠**

Run:
```bash
bun run typecheck
```
Expected: 無輸出（silent pass）

- [ ] **Step 3: 存 preview 整體基準**

Run:
```bash
bun run preview > /tmp/mole-preview-phase0.txt
wc -l /tmp/mole-preview-phase0.txt
```
Expected: 行數 > 0（具體數視 preview script 而定）；存到 `/tmp/mole-preview-phase0.txt` 之後 Phase 7 全程對比用。

- [ ] **Step 4: 確認 production install 健康（避免後面 simplify 完才發現 install 路徑早就壞）**

Run:
```bash
./scripts/install.sh
```
Expected: 安裝成功訊息；無 error。

- [ ] **Step 5: 確認 launchd daemon 跑得起來**

Run:
```bash
bun run daemon:stop && bun run daemon:start && bun run daemon:status
```
Expected: 最後輸出含 `state = running` 跟 `pid = <number>`。

> Phase 0 結束後**不**做 commit。`/tmp/mole-preview-phase0.txt` 是不入 git 的本地基準。

---

## Phase 1: Batch 1 — `lib/`

**Spec 對應:** §4 Batch 1
**範圍:** `src/lib/*.ts`（10 檔 ~600 行）+ `tests/lib/*.test.ts`（10 檔 ~700 行）
**預期動作:** R1–R4、R6 全套；不太可能拆檔
**風險:** 最低

### Task 1.1: lib/ 進批 baseline

- [ ] **Step 1: 確認當前綠**

Run:
```bash
bun test && bun run typecheck
```
Expected: test 全綠、typecheck silent。

- [ ] **Step 2: 存 batch 1 進批 preview snapshot**

Run:
```bash
bun run preview > /tmp/mole-preview-batch1-before.txt
```

### Task 1.2: lib/ audit

**Files:** Read only — `src/lib/*.ts`、`tests/lib/*.test.ts`

- [ ] **Step 1: 依序讀完所有 lib source 檔**

Files (一個一個讀完，不跳)：
- `src/lib/chrome-launcher.ts`
- `src/lib/chrome-profile.ts`
- `src/lib/client-id.ts`
- `src/lib/clipboard.ts`
- `src/lib/daemon-health.ts`
- `src/lib/remote-preflight.ts`
- `src/lib/ssh-config.ts`
- `src/lib/ssh-session.ts`
- `src/lib/ssh-spawn.ts`
- `src/types.ts`

讀的同時對每個檔回答：「這個檔做什麼？」（一句話內 + 無 `... and ...`）。

- [ ] **Step 2: 依序讀完所有 lib test 檔**

Files：`tests/lib/*.test.ts` 全 10 檔。

- [ ] **Step 3: 對每個檔套 R1–R8 判準，列 finding 清單**

判準速查（細節參 spec §3）：
- R1 dead code（含未用 import / `_unused` 變數）
- R2 narrative 註解
- R3 1-caller abstraction（fn / hook / type）→ inline
- R4 imperative shell 混 logic → 抽 pure
- R5 single-responsibility 違反 → 拆
- R6 命名修正
- R7 文案 / UI 字串（lib 層通常無）
- R8 tests 整理（含跨 it 重複 setup）

清單格式：`F1.<seq> [Rx] <file>[:line] — <action description>`

- [ ] **Step 4: 把清單回報 PM，等確認**

回報格式：
```
Batch 1 audit findings (lib/):

[Source]
F1.1 [Rx] src/lib/<file>:<line> — <action>
F1.2 ...

[Tests]
F1.N [Rx] tests/lib/<file>:<line> — <action>
...

問題：清單上有沒有任何條目你想 (a) 刪除、(b) 修改、(c) 補充？
```

⚠️ **PM 確認前不執行任何 source / test 動作。**

### Task 1.3: lib/ execute

**Files:** 依 Task 1.2 確認後的清單。每個 finding 一個 commit。

- [ ] **Step 1: 依 finding 清單序號，逐項執行**

> Sub-steps 在 Task 1.2 完成後由執行者填入。通用 pattern：
>
> ```bash
> # 編輯目標檔...
> bun test && bun run typecheck
> # 紅了 → 停下，看是 simplify 改錯還是測試本身需要連動修
> git add <staged-files>
> git commit -m "<type>(<scope>): R<x> — <action>"
> ```

- [ ] **Step 2: source / test commit 顆粒度規則**（spec §5.2）

- source-only commit 只動 `src/`。例外：rename / move source 連動的 `tests/` import path 修正屬於同一動作，跟 source 一起 commit。
- test-only commit 只動 `tests/` 自身的整理，不動 `src/`。
- 任一 commit 後跑 `bun test && bun run typecheck`，紅了停下檢查。

### Task 1.4: lib/ post-batch verify

- [ ] **Step 1: test 全綠**

Run:
```bash
bun test
```
Expected: 全綠（pass count 可能下降——若 R1 砍了 dead test、R8 整理 test 結構會減；不允許 fail）。

- [ ] **Step 2: typecheck 綠**

Run:
```bash
bun run typecheck
```
Expected: silent pass。

- [ ] **Step 3: preview diff 為零**

Run:
```bash
bun run preview > /tmp/mole-preview-batch1-after.txt
diff /tmp/mole-preview-batch1-before.txt /tmp/mole-preview-batch1-after.txt
```
Expected: 無輸出（zero diff）。

> 若 diff 非空 → 表示 lib 動作意外影響到上層渲染。停下，定位是哪個 commit 造成、回退或修正。

- [ ] **Step 4: self-review checklist**（spec §5.3）

對著本批所有 commit 過一輪：
- 每個動到的檔達到「reader 30 秒內能說出職責」
- commit message 是純動作描述（沒 narrative、沒 ticket、沒 reasoning）
- 沒「順便」改不在 scope 內的東西
- R1–R8 範疇內有沒有「猶豫沒動」的，重新評估

### Task 1.5: lib/ pause point

- [ ] **Step 1: 給 PM batch 1 summary**

格式：
```
Batch 1 (lib/) complete.

Commits this batch: <count>
- chore: <count> dead-code removals
- refactor: <count> inlines / abstractions / renames
- test: <count> test cleanups

Findings 全部執行完，無遺漏；無 scope 外 / architectural 問題；無新發現的 bug。
test: <pass count>; typecheck: green; preview diff: empty.

可進 Batch 2 嗎？
```

- [ ] **Step 2: 等 PM ok，才進 Phase 2**

⚠️ **PM 未 ack 前不開始下一個 phase。**

---

## Phase 2: Batch 2 — `daemon/`

**Spec 對應:** §4 Batch 2
**範圍:** `src/daemon/main.ts`、`src/daemon/server.ts` + `tests/daemon/server.test.ts`
**預期動作:** 跟 Batch 1 同調；`server.ts` 內若 handler 混雜可能拆 routes
**風險:** 低

### Task 2.1: daemon/ 進批 baseline

- [ ] **Step 1: 確認當前綠**
```bash
bun test && bun run typecheck
```
Expected: 全綠。

- [ ] **Step 2: 存 batch 2 baseline**
```bash
bun run preview > /tmp/mole-preview-batch2-before.txt
```

### Task 2.2: daemon/ audit

- [ ] **Step 1: 讀檔**

Files：
- `src/daemon/main.ts`
- `src/daemon/server.ts`
- `tests/daemon/server.test.ts`

- [ ] **Step 2: 套 R1–R8，列 finding 清單**（格式同 Task 1.2 Step 3）

- [ ] **Step 3: 回報 PM、等確認**（格式同 Task 1.2 Step 4）

⚠️ **PM 確認前不執行。**

### Task 2.3: daemon/ execute

- [ ] **Step 1: 依清單逐項執行**（規則同 Task 1.3）

### Task 2.4: daemon/ post-batch verify

- [ ] **Step 1: test 全綠**
```bash
bun test
```

- [ ] **Step 2: typecheck 綠**
```bash
bun run typecheck
```

- [ ] **Step 3: preview diff 為零**
```bash
bun run preview > /tmp/mole-preview-batch2-after.txt
diff /tmp/mole-preview-batch2-before.txt /tmp/mole-preview-batch2-after.txt
```
Expected: 無輸出。

- [ ] **Step 4: self-review checklist**（spec §5.3）

### Task 2.5: daemon/ pause point

- [ ] **Step 1: 給 PM summary**（格式同 Task 1.5）
- [ ] **Step 2: 等 PM ok 才進 Phase 3**

---

## Phase 3: Batch 3 — `cli/components/` + `theme.ts`

**Spec 對應:** §4 Batch 3
**範圍:** `src/cli/components/*.tsx|ts`（5 檔）+ `tests/cli/components/*.test.tsx`（5 檔）
**預期動作:** R1、R7 文案對齊；確認 component 嚴守 theme（沒硬編色或字符）
**風險:** 低

### Task 3.1: components/ 進批 baseline

- [ ] **Step 1:**
```bash
bun test && bun run typecheck
```

- [ ] **Step 2:**
```bash
bun run preview > /tmp/mole-preview-batch3-before.txt
```

### Task 3.2: components/ audit

- [ ] **Step 1: 讀檔**

Files：
- `src/cli/components/badge.tsx`
- `src/cli/components/select-list.tsx`
- `src/cli/components/spinner.tsx`
- `src/cli/components/status-message.tsx`
- `src/cli/components/text-input.tsx`
- `src/cli/components/theme.ts`
- 對應的 5 個 `tests/cli/components/*.test.tsx`

- [ ] **Step 2: 套 R1–R8 + theme 嚴守特檢**

額外檢查：
- 是否有任何 component 直接寫 hex / ANSI escape，而非從 `theme.ts` 取
- 是否直接寫 unicode glyph（如 `✓` `✗`），而非從 `figures` 或 `theme.icons`
- spinner frames 是否跟 `theme.ts` 對齊

- [ ] **Step 3: 列 finding 清單，回報 PM、等確認**

### Task 3.3: components/ execute

- [ ] **Step 1: 依清單執行**

### Task 3.4: components/ post-batch verify

- [ ] **Step 1: test**
```bash
bun test
```
- [ ] **Step 2: typecheck**
```bash
bun run typecheck
```
- [ ] **Step 3: preview diff 為零**
```bash
bun run preview > /tmp/mole-preview-batch3-after.txt
diff /tmp/mole-preview-batch3-before.txt /tmp/mole-preview-batch3-after.txt
```
- [ ] **Step 4: self-review**

### Task 3.5: components/ pause point

- [ ] **Step 1: PM summary**
- [ ] **Step 2: 等 ok 進 Phase 4**

---

## Phase 4: Batch 4 — `cli/hooks/`

**Spec 對應:** §4 Batch 4
**範圍:** `src/cli/hooks/use-extra-keys.ts`、`src/cli/hooks/use-profiles.ts` + `tests/cli/use-profiles.test.tsx`（注意 use-profiles test 目前位置不對齊，**留到 Batch 6 處理**——本批不動）
**預期動作:** use-extra-keys 用過的 key 是否還都在用？R3 1-caller judgment；test 重複 setup
**風險:** 低

### Task 4.1: hooks/ 進批 baseline

- [ ] **Step 1:**
```bash
bun test && bun run typecheck
```
- [ ] **Step 2:**
```bash
bun run preview > /tmp/mole-preview-batch4-before.txt
```

### Task 4.2: hooks/ audit

- [ ] **Step 1: 讀檔 + 確認 caller**

Files：
- `src/cli/hooks/use-extra-keys.ts`
- `src/cli/hooks/use-profiles.ts`
- `tests/cli/use-profiles.test.tsx`

額外查 caller：
```bash
grep -rn "useExtraKeys\|useProfiles" src/
```
確認哪些 component 用、用了哪些 key handler，以判斷 R3。

- [ ] **Step 2: 套 R1–R8，列 finding 清單**

- [ ] **Step 3: 回報 PM、等確認**

### Task 4.3: hooks/ execute

- [ ] **Step 1: 依清單執行**

> 若 finding 包含「整個 hook inline 回唯一 caller」這種大動作 → 該 commit 同時改 src + test，視為 spec §5.2 的 rename/move 例外（同一動作）。

### Task 4.4: hooks/ post-batch verify

- [ ] **Step 1: test**
- [ ] **Step 2: typecheck**
- [ ] **Step 3: preview diff 為零**
```bash
bun run preview > /tmp/mole-preview-batch4-after.txt
diff /tmp/mole-preview-batch4-before.txt /tmp/mole-preview-batch4-after.txt
```
- [ ] **Step 4: self-review**

### Task 4.5: hooks/ pause point

- [ ] **Step 1: PM summary**
- [ ] **Step 2: 等 ok 進 Phase 5**

---

## Phase 5: Batch 5 — `cli/wizard/`

**Spec 對應:** §4 Batch 5
**範圍:** `src/cli/wizard/*.{ts,tsx}`（9 檔 ~880 行）+ `tests/cli/wizard/*.test.{ts,tsx}`（6 檔 ~700 行）
**預期動作:** R1–R8 全套 + spec 已確認的兩項拆分動作
**風險:** 中

### Task 5.1: wizard/ 進批 baseline

- [ ] **Step 1:**
```bash
bun test && bun run typecheck
```
- [ ] **Step 2:**
```bash
bun run preview > /tmp/mole-preview-batch5-before.txt
```

### Task 5.2: wizard/ audit

- [ ] **Step 1: 讀檔**

Source（9）：
- `src/cli/wizard/index.tsx`
- `src/cli/wizard/layout.ts`
- `src/cli/wizard/reducer.ts`
- `src/cli/wizard/breadcrumb.tsx`
- `src/cli/wizard/review.tsx`
- `src/cli/wizard/frame.tsx`
- `src/cli/wizard/footer.tsx`
- `src/cli/wizard/text-input-keys.ts`
- `src/cli/wizard/will.ts`

Tests（6）：
- `tests/cli/wizard/breadcrumb.test.tsx`
- `tests/cli/wizard/layout.test.ts`
- `tests/cli/wizard/reducer.test.ts`
- `tests/cli/wizard/review.test.tsx`
- `tests/cli/wizard/text-input-keys.test.ts`
- `tests/cli/wizard/will.test.ts`

- [ ] **Step 2: 套 R1–R8，列 finding 清單**

清單必含以下 spec 已確認動作（直接寫進清單，不需 PM 再確認）：

```
F5.A [R5] src/cli/wizard/layout.ts —
  拆成 src/cli/wizard/width.ts（truncate / WIZARD_MIN_WIDTH / WIZARD_MAX_WIDTH /
  FALLBACK_THRESHOLD / computeWizardWidth / isFallbackMode）
  + src/cli/wizard/breadcrumb-layout.ts（planValues / buildSegments /
  segmentsWidth / tryFit / layoutBreadcrumb / 相關 type）。
  最終命名以 review pass 為準（執行階段如有更精準名 → 在 finding 補註說明）。
  test 同步拆：tests/cli/wizard/layout.test.ts → width.test.ts
  + breadcrumb-layout.test.ts。

F5.B [R6/陣列順序] src/cli/wizard/layout.ts:49 —
  將 import type { WizardStep } from './reducer' 移到檔頭 import 區。
```

> F5.A 跟 F5.B 在 layout.ts 拆分後若僅 F5.A 涵蓋（檔已不存在），F5.B 自動消化掉，不必獨立 commit。執行者依實際拆分結果調整。

- [ ] **Step 3: 列其他 R1–R8 finding，連同 F5.A / F5.B 回報 PM、等確認**

### Task 5.3: wizard/ execute

- [ ] **Step 1: 依清單執行**

實作 F5.A（拆 layout.ts）的具體流程建議：
1. 建立新檔 `src/cli/wizard/width.ts`，移入 width 相關 export
2. 建立新檔 `src/cli/wizard/breadcrumb-layout.ts`，移入 breadcrumb layout 相關 export
3. 刪除 `src/cli/wizard/layout.ts`
4. 更新所有 caller（grep `from './layout'`、`from '../wizard/layout'`）改 import 來源
5. 更新 test：`tests/cli/wizard/layout.test.ts` 拆成 `width.test.ts` + `breadcrumb-layout.test.ts`
6. 一個 commit 完成此整體 rename / split：
   ```
   refactor(wizard): R5 — split layout.ts into width.ts and breadcrumb-layout.ts
   ```

> 因為這是 rename / move，spec §5.2 規定 src + test 同 commit。

- [ ] **Step 2: 其他 finding 依序執行**

### Task 5.4: wizard/ post-batch verify

- [ ] **Step 1: test**
```bash
bun test
```
Expected: 全綠（test 數量視 layout test 拆分結果調整）。

- [ ] **Step 2: typecheck**
```bash
bun run typecheck
```

- [ ] **Step 3: preview diff 為零**
```bash
bun run preview > /tmp/mole-preview-batch5-after.txt
diff /tmp/mole-preview-batch5-before.txt /tmp/mole-preview-batch5-after.txt
```

> wizard 是 UI 重要區塊，preview diff 為零是這批最關鍵的 invariant。

- [ ] **Step 4: self-review**

### Task 5.5: wizard/ pause point

- [ ] **Step 1: PM summary**
- [ ] **Step 2: 等 ok 進 Phase 6**

---

## Phase 6: Batch 6 — `cli/` root

**Spec 對應:** §4 Batch 6
**範圍:**
- Source: `src/cli/index.tsx`、`src/cli/preflight.tsx`、`src/cli/profile-picker.tsx`、`src/cli/host-picker.tsx`、`src/cli/watchdog.ts`
- Test: `tests/cli/preflight.test.tsx`、`tests/cli/select-list.test.tsx`、`tests/cli/use-profiles.test.tsx`、`tests/cli/watchdog.test.ts`
**預期動作:** R1–R8 全套 + spec 已確認的拆分動作 + test 目錄重整
**風險:** 最高

### Task 6.1: cli/ 進批 baseline

- [ ] **Step 1:**
```bash
bun test && bun run typecheck
```
- [ ] **Step 2:**
```bash
bun run preview > /tmp/mole-preview-batch6-before.txt
```

### Task 6.2: cli/ audit

- [ ] **Step 1: 讀檔**

Source（5）：
- `src/cli/index.tsx`
- `src/cli/preflight.tsx`
- `src/cli/profile-picker.tsx`
- `src/cli/host-picker.tsx`
- `src/cli/watchdog.ts`

Test（4）：
- `tests/cli/preflight.test.tsx`
- `tests/cli/select-list.test.tsx`
- `tests/cli/use-profiles.test.tsx`
- `tests/cli/watchdog.test.ts`

- [ ] **Step 2: 套 R1–R8，列 finding 清單**

清單必含以下 spec 已確認動作：

```
F6.A [R5] src/cli/index.tsx — 抽出三個 module，留 index.tsx 為 thin entry：
  - fetchOurId 移到 lib/daemon-id.ts（或併入 lib/daemon-health.ts，
    讀完 daemon-health.ts 再決：若 daemon-health.ts 已是 health-only，
    fetchOurId 走獨立檔；若 daemon-health.ts 也只是 thin /id+/health
    wrapper，可合檔，命名改 lib/daemon-client.ts）
  - startHijackWatchdog 抽到 cli/hijack-watchdog.ts
    （搭 cli/watchdog.ts 一起 review，命名跟分工要釐清——
    現 watchdog.ts 只是 checkOnce pure function，
    新檔放整個 startHijackWatchdog imperative shell；
    若兩檔界線清楚保留兩檔；若混淆可能合一）
  - runPreflightSteps + initialPreflightSteps 抽到 cli/preflight-runner.ts

F6.B [R8] tests/cli/ 子目錄 mirror src/cli/：
  - tests/cli/select-list.test.tsx → tests/cli/components/select-list.test.tsx
  - tests/cli/use-profiles.test.tsx → tests/cli/hooks/use-profiles.test.tsx
```

- [ ] **Step 3: 列其他 R1–R8 finding（含 profile-picker.tsx 229 行 / host-picker.tsx 134 行 是否拆檔的判斷），連同 F6.A / F6.B 回報 PM、等確認**

⚠️ profile-picker / host-picker 拆檔與否屬於 audit 階段才能判斷，**不**預設動作。

### Task 6.3: cli/ execute

- [ ] **Step 1: 依清單執行**

F6.A 建議分多 commit：
1. `refactor(lib): R5 — extract fetchOurId from cli/index into lib/daemon-id` (或合檔變體)
2. `refactor(cli): R5 — extract startHijackWatchdog into cli/hijack-watchdog`
3. `refactor(cli): R5 — extract runPreflight orchestration into cli/preflight-runner`
4. 留 `index.tsx` 為 thin entry（驗證行數應顯著減少）

F6.B 建議單一 commit：
```
chore(test): R8 — mirror tests/cli/ subdirs to src/cli/ structure
```

- [ ] **Step 2: 其他 finding 依序執行**

### Task 6.4: cli/ post-batch verify

- [ ] **Step 1: test**
```bash
bun test
```
Expected: 全綠。

- [ ] **Step 2: typecheck**
```bash
bun run typecheck
```

- [ ] **Step 3: preview diff 為零**
```bash
bun run preview > /tmp/mole-preview-batch6-after.txt
diff /tmp/mole-preview-batch6-before.txt /tmp/mole-preview-batch6-after.txt
```

- [ ] **Step 4: 整體 baseline 對比**

```bash
diff /tmp/mole-preview-phase0.txt /tmp/mole-preview-batch6-after.txt
```
Expected: 無輸出。從 Phase 0 baseline 到現在所有 6 批 simplify 都不該影響 visual。

> 若有 diff → 表示某一批意外改了 visual。立刻定位（git bisect feature/simplify between phase0 baseline commit hash and HEAD）。

- [ ] **Step 5: self-review**

### Task 6.5: cli/ pause point

- [ ] **Step 1: PM summary**

```
Batch 6 (cli/ root) complete. All 6 batches done.

Per-batch commits: <Batch1 count> / <Batch2 count> / ... / <Batch6 count>
Total commits this branch: <total>
src/ LOC change: <before> → <after> (Δ <delta>)
tests/ LOC change: <before> → <after> (Δ <delta>)
test count: <before> → <after>
preview diff vs main baseline: empty.

可進 Phase 7 final merge 嗎？
```

- [ ] **Step 2: 等 PM ok 才進 Phase 7**

---

## Phase 7: Final manual verification + merge

### Task 7.1: PM 跑 spec §6 實機驗收 checklist

- [ ] **Step 1: 通知 PM 開始實機驗收**

執行者向 PM 發出：
```
請在 feature/simplify 上執行 spec §6 實機驗收 checklist。
具體 checklist 在 docs/2026-04-26-codebase-simplify-design.md §6
（A 環境重建 / B Happy path / C 邊角抽驗 / D UI 抽驗 / E hijack 選做）。
通過條件：A、B、C、D 全 pass。
任一項 fail 請告知，不要 merge。
```

- [ ] **Step 2: 等 PM 回報結果**

⚠️ **PM 未回報 PASS 前不執行 Task 7.2。**

### Task 7.2: Merge 回 main

- [ ] **Step 1: 切回 main、pull 最新**

Run:
```bash
git checkout main
git pull --ff-only
```
Expected: 已 up-to-date。若有新 main commit → 停下，先 rebase `feature/simplify` 上最新 main，重跑 Phase 7 Task 7.1。

- [ ] **Step 2: merge feature/simplify（保 history、不 squash）**

Run:
```bash
git merge --no-ff feature/simplify -m "$(cat <<'EOF'
Merge branch 'feature/simplify' — codebase simplify pass

依 docs/2026-04-26-codebase-simplify-design.md 執行 6 個 batch
（lib → daemon → components → hooks → wizard → cli root）的 R1–R8
aggressive simplify，PM 已通過 spec §6 實機驗收。
EOF
)"
```

Expected: merge 成功；`git log --oneline -1` 應為新 merge commit。

- [ ] **Step 3: 驗證 main 全綠**

Run:
```bash
bun test && bun run typecheck
```
Expected: 全綠。

- [ ] **Step 4: 驗證 main 上 preview 仍跟 phase 0 baseline 一致**

Run:
```bash
bun run preview > /tmp/mole-preview-merged.txt
diff /tmp/mole-preview-phase0.txt /tmp/mole-preview-merged.txt
```
Expected: 無輸出。

### Task 7.3: 清掃

- [ ] **Step 1: 刪掉本地 feature branch（可選）**

Run:
```bash
git branch -d feature/simplify
```

- [ ] **Step 2: 刪掉 /tmp baseline 檔（可選）**

Run:
```bash
rm /tmp/mole-preview-batch{1,2,3,4,5,6}-{before,after}.txt 2>/dev/null
rm /tmp/mole-preview-{phase0,merged}.txt 2>/dev/null
```
（部分檔可能沒建立，`2>/dev/null` 忽略錯誤即可。）

- [ ] **Step 3: push（PM 視意願執行）**

Plan 不主動 push。PM 想 push 時：
```bash
git push origin main
```

---

## 失敗模式 / 中斷恢復

### 某批 verify diff 非空（preview 變了）
1. 不進下一批
2. `git log --oneline feature/simplify ^main` 列出本批 commit
3. 從最後一個 commit 開始 `git revert` 逐個檢查，直到 `bun run preview` 跟 batch baseline 對得上
4. 重新 audit 那個 finding，看是不是 R1–R8 範圍判斷錯
5. 若無 root cause → 跟 PM 討論

### test 中途轉紅
1. 不進下一個 commit
2. 看是「simplify 動作改錯」還是「test 本身需要連動修但忘了」
3. 紅的 commit 修對為止；不允許「下個 commit 再修」

### 中途發現 scope 外問題（spec §5.4）
- architectural：不動，記到 conversation log，simplify 結束統一給 PM
- bug：停下問 PM
- scope 內跨批：當下搬，commit 標示「cross-batch move」

### Phase 7 PM 實機驗收 fail
1. 不 merge
2. PM 回報 fail 細節 → 執行者定位（哪個 batch 哪個 commit 造成）
3. 在 `feature/simplify` 上修 / revert
4. 修完 PM 重跑 §6 checklist
5. PASS 才 merge

---

## 附錄 A: 命令速查

| 動作 | 命令 |
|---|---|
| 全 test | `bun test` |
| Typecheck | `bun run typecheck` |
| Preview snapshot | `bun run preview > /tmp/mole-preview-<tag>.txt` |
| Preview diff | `diff /tmp/mole-preview-<a>.txt /tmp/mole-preview-<b>.txt` |
| Daemon 重啟 | `bun run daemon:stop && bun run daemon:start && bun run daemon:status` |
| Production install | `./scripts/install.sh` |
| Branch 切出 | `git checkout -b feature/simplify` |
| Merge 回 main（保 history） | `git merge --no-ff feature/simplify` |

## 附錄 B: Commit message 速查

| 動作類型 | type | 範例 |
|---|---|---|
| R1 dead code | `chore` | `chore(lib): R1 — drop unused export from chrome-profile` |
| R2 narrative comment | `refactor` | `refactor(daemon): R2 — strip narrative comments from server` |
| R3 inline 1-caller | `refactor` | `refactor(cli): R3 — inline single-caller helper into App` |
| R4 抽 pure | `refactor` | `refactor(lib): R4 — extract pure runPreflight body` |
| R5 拆檔 / 拆函式 | `refactor` | `refactor(wizard): R5 — split layout.ts into width and breadcrumb-layout` |
| R6 命名 | `refactor` | `refactor(lib): R6 — rename foo to <better>` |
| R7 文案 | `refactor` | `refactor(cli): R7 — align preflight error wording` |
| R8 test cleanup | `test` 或 `chore` | `test(lib): R8 — collapse repeated setup in chrome-profile.test` |
| 跨批 move | 上述 type | `refactor(lib): R5 — move foo from cli to lib (cross-batch)` |
