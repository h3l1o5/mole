# Auto-bootstrap remote xclip shim 設計

關聯 issue：[#4](https://github.com/h3l1o5/mole/issues/4)

## 問題

mole 需要遠端有兩樣東西：

1. `socat`（系統套件，需 sudo 安裝）
2. `~/.local/bin/xclip` shim（mole 自帶的 bash 腳本，使用者目錄即可）

今天若兩者皆缺，使用者要手動 `scp` shim 與 installer、ssh 過去執行、自己挑對 distro 的 package manager。preflight 偵測到這些缺失只丟 raw 錯誤訊息然後 bail，沒有引導。

## 目標

讓使用者從「host 設定好」走到「進入遠端 shell」全程不離開 TUI（issue #4 的 Done When）。

## 範圍

In scope：

- 偵測到 shim 缺失或過時時，TUI 內 prompt `[Y/n]`，同意後自動安裝。
- shim 內容變動時自動觸發更新提示（content-hash 驅動）。
- 偵測到 socat 缺失時，讀取遠端 `/etc/os-release` 判定 distro，列出對應 `apt/dnf/pacman` one-liner。

Out of scope：

- 自動執行 `sudo apt install socat`（issue 已將其標為 too magical）。
- ssh 認證失敗的友善訊息（已分拆為 [#7](https://github.com/h3l1o5/mole/issues/7)）。
- 多缺失同時呈現於同一畫面（採線性逐項解決，下節說明）。

## 設計決策

| 主題 | 選項 | 結論 |
| --- | --- | --- |
| Y/n 提示位置 | inline / 新 wizard step / 不問直接裝 | **inline**（PreflightView 多 `prompt` state） |
| Shim 傳送方式 | scp + ssh / 單一 ssh stdin pipe | **stdin pipe**（不留遠端 temp 檔，一次連線） |
| 多缺失呈現 | 同畫面合併 / 逐項解決 | **逐項**（preflight 一次回報第一項，修完重跑） |
| Shim 版本判斷 | 手動 semver / mole 版號 / 內容 hash / git SHA | **內容 hash**（build 時算 sha256 嵌入 binary） |

選擇理由請見下方各章節。

## 架構

```
src/
├── lib/
│   ├── remote-shim.ts          ★ NEW  embed shim 內容、計算 hash
│   ├── remote-shim-install.ts  ★ NEW  ssh stdin pipe 安裝
│   └── remote-preflight.ts     ✎ MOD  bash script 多回報 distro / shim hash；result 改結構化
├── cli/
│   ├── preflight-runner.ts     ✎ MOD  新增 install 階段、re-preflight
│   └── preflight.tsx           ✎ MOD  PreflightStepState 加 'prompt' / 'installing'；接收 Y/n
remote/
├── xclip                       — 不變（單一真相來源）
└── install.sh                  — 保留作手動 fallback；README 提及為次選
scripts/
├── build.sh                    — 不變（embed 由 Bun import 處理，hash 在 runtime 算）
└── preview.tsx                 ✎ MOD  新增 prompt / installing 範例
```

**單向相依**：`preflight.tsx` ← `preflight-runner.ts` → `{ remote-preflight, remote-shim, remote-shim-install }`。所有 ssh I/O 收斂在 `lib/`，`cli/` 只管狀態與渲染，維持現有分層。

### Embed 機制

```ts
// src/lib/remote-shim.ts
import shimContent from '../../remote/xclip' with { type: 'text' };
import { CryptoHasher } from 'bun';

export const SHIM_CONTENT = shimContent;
export const SHIM_HASH = new CryptoHasher('sha256')
  .update(shimContent)
  .digest('hex')
  .slice(0, 12);
```

Bun `--compile` 把整個檔案 bytes 直接烤進 binary，runtime 一次性算 hash。**不需要 build script 額外動作**——hash 永遠等於 binary 裡那份 shim 的內容雜湊。

### Shim 安裝（stdin pipe）

```ts
// src/lib/remote-shim-install.ts（pseudo）
export async function installShim(host: string, shimContent: string): Promise<InstallResult> {
  const script = buildInstallScript(shimContent);
  // 走 BatchMode 的 ssh，stdin 餵 bash script
  return runSshScript(host, script);
}

function buildInstallScript(shim: string): string {
  // heredoc 用 quoted terminator，shim 裡的 $ 不會被展開
  return `set -eu
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/xclip" <<'MOLE_SHIM_EOF'
${shim}
MOLE_SHIM_EOF
chmod +x "$HOME/.local/bin/xclip"

path_line='export PATH="$HOME/.local/bin:$PATH"'
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    if ! grep -qF "$path_line" "$HOME/.bashrc" 2>/dev/null; then
      printf '\\n# Added by mole installer\\n%s\\n' "$path_line" >> "$HOME/.bashrc"
    fi
    ;;
esac
`;
}
```

**前提條件**：shim 內容不可包含字串 `MOLE_SHIM_EOF`。`remote-shim.ts` 載入時做 startup assertion，在 build/dev 階段就會炸（不會在使用者連線時才出事）。

## 狀態機

```
preflight 結果 PreflightOutcome（discriminated union）：

  | { kind: 'ok'; warnings: string[] }
  | { kind: 'shim-missing' }
  | { kind: 'shim-outdated'; remoteHash: string }
  | { kind: 'socat-missing'; distro: 'debian' | 'rhel' | 'arch' | 'unknown' }
  | { kind: 'sshd-config-missing' }    // StreamLocalBindUnlink
  | { kind: 'error'; errors: string[] } // 其他 ssh / bash 錯誤
```

### Runner 流程

```
runPreflightSteps()
  ├─ daemon check           (existing)
  ├─ runPreflight(host)     → PreflightOutcome
  │   ├─ ok                 → continue to chrome step
  │   ├─ shim-missing       → setStep('remote', { state: 'prompt', prompt: 'install' })
  │   │                       wait for Y/n
  │   │                       Y → setStep('remote', { state: 'installing' })
  │   │                           installShim() → on success, recurse runPreflight
  │   │                           on fail → setStep('remote', { state: 'error' })
  │   │                       n → return { ok: false }
  │   ├─ shim-outdated      → 同上，prompt 文字改為 update
  │   ├─ socat-missing      → setStep('remote', { state: 'error', error: distro one-liner })
  │   ├─ sshd-config-missing → 既有錯誤訊息（不變）
  │   └─ error              → setStep('remote', { state: 'error', error: errors.join('; ') })
  └─ chrome check           (existing)
```

**遞迴上限**：re-preflight 最多 1 次（裝完一次就停）。理論上不會無限循環——裝完 shim 後該偵測點不會再回報 shim-missing。但加防呆計數器（`maxRetries=1`）避免邏輯錯誤造成 ssh 風暴。

### TUI 狀態與按鍵

`PreflightStepState` 從 `'pending' | 'running' | 'ok' | 'error'` 擴充為 `'pending' | 'running' | 'prompt' | 'installing' | 'ok' | 'error'`。

```
state         marker          內文
─────────     ─────────       ─────────────────────────────────
pending       · (dim)         label
running       spinner         label (cyan)
prompt        ⓘ (info)        label + 下方 prompt 文字（見下）
installing    spinner         "Installing shim on <host>..."
ok            ✓ (green)       label
error         ✘ (red)         label + 錯誤多行
```

`prompt` state 兩種文案：

```
install:  mole shim not installed on <host>. Install now? [Y/n]
update:   mole shim outdated on <host> (<remoteHash> → <SHIM_HASH>). Update now? [Y/n]
```

**按鍵處理**：只在某 step `state === 'prompt'` 時，於 `preflight.tsx` 用 `useInput` 收 `y/Y/Enter` 與 `n/N/Esc`。其他 state 完全忽略鍵盤。

`preflight-runner.ts` 透過 setStep 回 callback 拿到使用者選擇——例如：

```ts
setStep('remote', {
  state: 'prompt',
  prompt: { kind: 'install-shim', onAnswer: (yes: boolean) => { ... } },
});
```

PreflightView 把 `prompt.onAnswer` 接到 `useInput`。

## Bash script 變更

`buildPreflightScript` 在現有檢查上加：

1. **socat 缺失時讀 distro**：
   ```bash
   if ! command -v socat >/dev/null 2>&1; then
     distro="unknown"
     if [ -r /etc/os-release ]; then
       . /etc/os-release
       case "${ID_LIKE:-$ID}" in
         *debian*|*ubuntu*) distro="debian" ;;
         *rhel*|*fedora*)   distro="rhel" ;;
         *arch*)            distro="arch" ;;
       esac
     fi
     echo "MOLE_SOCAT_MISSING: $distro" >&2
     exit 1
   fi
   ```

2. **shim hash 回報**：
   ```bash
   if [ ! -x "$HOME/.local/bin/xclip" ]; then
     echo "MOLE_SHIM_MISSING:" >&2
     exit 2
   fi
   remote_hash=$(sha256sum "$HOME/.local/bin/xclip" | cut -c1-12)
   echo "MOLE_SHIM_HASH: $remote_hash" >&2
   ```
   `runPreflight` 比對 stderr 的 `MOLE_SHIM_HASH` 與 `SHIM_HASH`，不同就回 `shim-outdated`。

3. **sshd_config 檢查**：不變。

4. **socat bridge 啟動**：不變，只在所有檢查通過後執行。

**stderr marker convention**：所有結構化訊息以 `MOLE_<TYPE>:` 前綴，runner 用 prefix 解析。維持現有 `MOLE_WARN:` 風格的一致性。

## 錯誤處理

| 情境 | 行為 |
| --- | --- |
| 使用者按 `n` 拒絕安裝 | `runPreflightSteps` 回 `{ ok: false }`，TUI 顯示原 prompt 訊息但 marker 變紅，mole exit 1 |
| 安裝 ssh exit 255（網路） | step 變 error，stderr 整段顯示，mole exit 1 |
| 安裝寫入失敗（NFS / 權限） | step 變 error，遠端 stderr（如 `Input/output error`）顯示，mole exit 1 |
| 安裝完 re-preflight 仍 shim-missing | 視為失敗，error 訊息 `Reinstall did not stick. Check $HOME/.local/bin/xclip on <host>.` |
| Ctrl+C 在 prompt / installing 時 | Ink 標準行為：unmount，mole exit 130 |
| shim 內容含 `MOLE_SHIM_EOF` | startup assertion 在 dev/build 時就 fail，使用者連線時不會遇到 |

## 測試策略

| 層級 | 檔案 | 重點 |
| --- | --- | --- |
| Unit | `tests/lib/remote-preflight.test.ts` | 解析新 marker（`MOLE_SOCAT_MISSING`、`MOLE_SHIM_MISSING`、`MOLE_SHIM_HASH`）→ outcome kind |
| Unit | `tests/lib/remote-shim-install.test.ts`（new） | mock SshRunner，驗證 install script 與 stdin 餵法；驗證 shim 內容含 EOF terminator 時 startup 報錯 |
| Unit | `tests/lib/remote-shim.test.ts`（new） | embed 內容非空、hash 為 12 字元 hex |
| Unit | `tests/cli/preflight-runner.test.ts` | 各 outcome kind 對應 setStep 順序；prompt 回 Y → 觸發 install + re-preflight；prompt 回 n → 回 ok=false |
| Snapshot | `scripts/preview.tsx` | 新 case：`prompt-install`、`prompt-update`、`installing`、`socat-missing-arch` 等 |

`bun test` 與 `bun run preview` 是必要驗證；UI 部分另在真實 terminal 跑一次確認顏色與動畫。

## 影響範圍與遷移

- **README**：移除 `On each Linux remote (once per host)` 章節；保留「`socat` / `xclip` 仍需 sudo」段落，並指明 mole 會自動偵測並列出對應指令。
- **`remote/install.sh`**：保留作為手動安裝 fallback（無 mole binary 在手時）；README 提及為次選。
- **既有 host**：第一次升級到新版 mole 後，preflight 會偵測到 shim hash 不同（如果 shim 內容改了）並提示更新；hash 相同則無感。
- **新 host**：第一次連線 → shim missing 提示 → 一鍵裝完。

## 未涵蓋（後續可考慮）

- shim 安裝後若使用者的 `.bashrc` 結構特殊（例如 `[[ $- != *i* ]] && return` 在 `PATH` export 之前），新 ssh session 仍可能撈不到 `~/.local/bin`。本 spec 不嘗試解決，與現行 `remote/install.sh` 行為一致。
- 並行 mole session 同時安裝 shim 的 race condition：`cat > file` 非 atomic，但實務上發生機率低，且兩個 session 寫入內容相同，最壞情況檔案內容混雜後 hash mismatch 觸發再裝一次。先不處理。
