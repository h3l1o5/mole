# Auto-bootstrap Remote Shim 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推薦）或 superpowers:executing-plans 逐工作項實作此計畫。步驟以 checkbox（`- [ ]`）追蹤。

**Goal:** 讓 mole preflight 偵測遠端缺少 / 過時的 xclip shim 時於 TUI 內 prompt 並自動安裝；偵測缺 socat 時印出 distro-aware 安裝指令。

**Architecture:** preflight bash script 增加 `MOLE_*:` marker 回報 distro 與 shim hash；TS 端把結果解析為 discriminated union `PreflightOutcome`；TUI 增加 `prompt` / `installing` 兩個 step state；shim 透過 `import ... with { type: 'text' }` embed 進 binary，安裝走單一 ssh stdin pipe。

**Tech Stack:** Bun + TypeScript + Ink/React + bun:test + ink-testing-library。

**Spec:** `docs/2026-05-04-auto-bootstrap-shim-design.md`

**Constraints from CLAUDE.md:**
- No component library；hand-rolled Ink，glyphs 全 ASCII（不再用 `figures`）
- 所有顏色/icon/spinner 來自 `src/cli/components/theme.ts`
- Validation errors prefixed `colors.error` + `icons.warning`
- 依靠顏色 + icon 強調，不用 bold
- `Ctrl+N` / `Ctrl+P` 與方向鍵等價
- 任何 >200ms async 顯示 spinner
- 每次 UI 改動必須跑 `bun run preview`

**File Structure：**

| 檔案 | 動作 | 責任 |
| --- | --- | --- |
| `src/lib/ssh-exec.ts` | NEW | 抽出 `realSshRunner`（共用 `Bun.spawn` ssh stdin pipe 邏輯） |
| `src/lib/remote-shim.ts` | NEW | embed `remote/xclip` 為字串、計算 `SHIM_HASH`、startup assertion |
| `src/lib/remote-shim-install.ts` | NEW | `buildInstallScript(shim)` 與 `installShim(host)` |
| `src/lib/remote-preflight.ts` | MOD | bash script 加 distro / hash marker；改回傳 `PreflightOutcome` |
| `src/cli/preflight.tsx` | MOD | `PreflightStepState` 加 `'prompt'` / `'installing'`；prompt 接 useInput |
| `src/cli/preflight-runner.ts` | MOD | 消費 `PreflightOutcome`、orchestrate prompt → install → re-preflight |
| `tests/lib/ssh-exec.test.ts` | NEW | 抽出後的型別 surface |
| `tests/lib/remote-shim.test.ts` | NEW | embed 內容 / hash 格式 / assertion |
| `tests/lib/remote-shim-install.test.ts` | NEW | script 內容 / runner 行為 |
| `tests/lib/remote-preflight.test.ts` | MOD | 對 `PreflightOutcome` discriminated union |
| `tests/cli/preflight.test.tsx` | MOD | 新 state 渲染 |
| `tests/cli/preflight-runner.test.ts` | MOD | 對 outcome kind orchestration |
| `scripts/preview.tsx` | MOD | 新 cases：prompt-install / prompt-update / installing / socat-missing-arch |
| `README.md` | MOD | 移除 `On each Linux remote (once per host)` 章節 |
| `remote/install.sh` | KEEP | 手動 fallback；不變 |
| `remote/xclip` | KEEP | 單一真相來源；不變 |

---

## Task 1: 抽出共用 SSH runner

把 `runPreflight` 內嵌的 `Bun.spawn` 區塊抽到 `src/lib/ssh-exec.ts`，後續 `installShim` 也會使用。純重構，現有測試應全綠。

**Files:**
- Create: `src/lib/ssh-exec.ts`
- Create: `tests/lib/ssh-exec.test.ts`
- Modify: `src/lib/remote-preflight.ts`

- [ ] **Step 1.1: 建立 `tests/lib/ssh-exec.test.ts`**

```ts
import { test, expect, describe } from 'bun:test';
import type { SshRunner } from '../../src/lib/ssh-exec';

describe('SshRunner type', () => {
  test('runner accepts (host, script) and returns stdout/stderr/code', async () => {
    const fake: SshRunner = async (host, script) => ({
      stdout: `${host}:${script.length}`,
      stderr: '',
      code: 0,
    });
    const r = await fake('h', 'echo');
    expect(r.stdout).toBe('h:4');
    expect(r.code).toBe(0);
  });
});
```

- [ ] **Step 1.2: 跑測試確認失敗（檔案不存在）**

```
bun test tests/lib/ssh-exec.test.ts
```

預期：`Cannot find module '../../src/lib/ssh-exec'`。

- [ ] **Step 1.3: 建立 `src/lib/ssh-exec.ts`**

```ts
import { buildNonInteractiveSshArgs } from './ssh-spawn';

export type SshRunner = (
  host: string,
  script: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export const realSshRunner: SshRunner = async (host, script) => {
  const proc = Bun.spawn(
    ['ssh', ...buildNonInteractiveSshArgs(host, ['bash', '-s'])],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  proc.stdin.write(script);
  proc.stdin.end();
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};
```

- [ ] **Step 1.4: 改 `src/lib/remote-preflight.ts` 用 `realSshRunner`**

把現有 `SshRunner` 型別宣告與 `runPreflight` 內嵌的 `Bun.spawn` 區塊一併移除，改 import 自 `ssh-exec`：

```ts
import { realSshRunner, type SshRunner } from './ssh-exec';

// （刪除原檔內的 export type SshRunner = ... 整段）
// （刪除 runPreflight 內 Bun.spawn(...) async block 整段）

export async function runPreflight(
  host: string,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  return runPreflightWith(host, realSshRunner, opts);
}
```

`SshRunner` 在現有 codebase 中僅內部使用（`runPreflightWith` 的型別），不需要 re-export。

- [ ] **Step 1.5: 跑全部測試確認綠**

```
bun test
bun run typecheck
```

預期：所有 test pass，typecheck 無錯。

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/ssh-exec.ts src/lib/remote-preflight.ts tests/lib/ssh-exec.test.ts
git commit -m "refactor(lib): extract realSshRunner into ssh-exec"
```

---

## Task 2: Embed shim + 計算 hash

新增 `remote-shim.ts`，於 binary build 時嵌入 `remote/xclip` 內容並產生 12 字元 sha256 hash。Startup 驗證 shim 不含 heredoc terminator。

**Files:**
- Create: `src/lib/remote-shim.ts`
- Create: `tests/lib/remote-shim.test.ts`

- [ ] **Step 2.1: 建立 `tests/lib/remote-shim.test.ts`**

```ts
import { test, expect, describe } from 'bun:test';
import { SHIM_CONTENT, SHIM_HASH, HEREDOC_TERMINATOR } from '../../src/lib/remote-shim';

describe('remote-shim embed', () => {
  test('SHIM_CONTENT is non-empty bash script', () => {
    expect(SHIM_CONTENT.length).toBeGreaterThan(100);
    expect(SHIM_CONTENT.startsWith('#!')).toBe(true);
  });

  test('SHIM_HASH is 12 lowercase hex chars', () => {
    expect(SHIM_HASH).toMatch(/^[0-9a-f]{12}$/);
  });

  test('SHIM_CONTENT does not contain the heredoc terminator', () => {
    expect(SHIM_CONTENT).not.toContain(HEREDOC_TERMINATOR);
  });

  test('SHIM_HASH is stable for the same content', async () => {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(SHIM_CONTENT);
    const expected = hasher.digest('hex').slice(0, 12);
    expect(SHIM_HASH).toBe(expected);
  });
});
```

- [ ] **Step 2.2: 跑測試確認失敗**

```
bun test tests/lib/remote-shim.test.ts
```

預期：`Cannot find module`。

- [ ] **Step 2.3: 建立 `src/lib/remote-shim.ts`**

```ts
import shimContent from '../../remote/xclip' with { type: 'text' };

export const HEREDOC_TERMINATOR = 'MOLE_SHIM_EOF';

if (shimContent.includes(HEREDOC_TERMINATOR)) {
  throw new Error(
    `remote/xclip contains the reserved heredoc terminator '${HEREDOC_TERMINATOR}'. ` +
      `Pick a different terminator in src/lib/remote-shim.ts or remove the string from the shim.`,
  );
}

export const SHIM_CONTENT = shimContent;

export const SHIM_HASH = (() => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(shimContent);
  return hasher.digest('hex').slice(0, 12);
})();
```

- [ ] **Step 2.4: 跑測試確認綠**

```
bun test tests/lib/remote-shim.test.ts
bun run typecheck
```

預期：全綠。

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/remote-shim.ts tests/lib/remote-shim.test.ts
git commit -m "feat(lib): embed remote shim + sha256 hash for version detection"
```

---

## Task 3: Shim 安裝模組

`remote-shim-install.ts` 暴露 `buildInstallScript(shim)`（純函式）與 `installShim(host)`（呼叫 `realSshRunner`）。安裝腳本：建 `~/.local/bin`，heredoc 寫入 shim，chmod，補 `.bashrc` PATH（與現行 `remote/install.sh` 行為一致）。

**Files:**
- Create: `src/lib/remote-shim-install.ts`
- Create: `tests/lib/remote-shim-install.test.ts`

- [ ] **Step 3.1: 建立 `tests/lib/remote-shim-install.test.ts`**

```ts
import { test, expect, describe } from 'bun:test';
import {
  buildInstallScript,
  installShimWith,
  type InstallOutcome,
} from '../../src/lib/remote-shim-install';

describe('buildInstallScript', () => {
  const SHIM = '#!/usr/bin/env bash\necho hello\n';

  test('creates ~/.local/bin and writes shim via quoted heredoc', () => {
    const s = buildInstallScript(SHIM);
    expect(s).toContain('mkdir -p "$HOME/.local/bin"');
    expect(s).toContain("cat > \"$HOME/.local/bin/xclip\" <<'MOLE_SHIM_EOF'");
    expect(s).toContain(SHIM);
    expect(s).toContain('MOLE_SHIM_EOF');
    expect(s).toContain('chmod +x "$HOME/.local/bin/xclip"');
  });

  test('appends PATH export to .bashrc only when missing', () => {
    const s = buildInstallScript(SHIM);
    expect(s).toContain('grep -qF "$path_line" "$HOME/.bashrc"');
    expect(s).toContain('PATH="$HOME/.local/bin:$PATH"');
  });

  test('uses set -eu so writes fail loudly', () => {
    const s = buildInstallScript(SHIM);
    expect(s.startsWith('set -eu')).toBe(true);
  });
});

describe('installShimWith', () => {
  test('returns ok=true when ssh exits 0', async () => {
    const r = await installShimWith('host', '#!/bin/bash\n', async () => ({
      stdout: '',
      stderr: '',
      code: 0,
    }));
    expect(r).toEqual({ ok: true } satisfies InstallOutcome);
  });

  test('returns ok=false with stderr on non-zero exit', async () => {
    const r = await installShimWith('host', '#!/bin/bash\n', async () => ({
      stdout: '',
      stderr: 'mkdir: cannot create directory: Permission denied\n',
      code: 1,
    }));
    expect(r).toEqual({
      ok: false,
      error: 'mkdir: cannot create directory: Permission denied',
    } satisfies InstallOutcome);
  });

  test('falls back to generic message when stderr empty', async () => {
    const r = await installShimWith('host', '#!/bin/bash\n', async () => ({
      stdout: '',
      stderr: '',
      code: 255,
    }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exit code 255/);
  });
});
```

- [ ] **Step 3.2: 跑測試確認失敗**

```
bun test tests/lib/remote-shim-install.test.ts
```

預期：`Cannot find module`。

- [ ] **Step 3.3: 建立 `src/lib/remote-shim-install.ts`**

```ts
import { realSshRunner, type SshRunner } from './ssh-exec';
import { SHIM_CONTENT, HEREDOC_TERMINATOR } from './remote-shim';

export type InstallOutcome =
  | { ok: true }
  | { ok: false; error: string };

export function buildInstallScript(shimContent: string): string {
  return `set -eu
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/xclip" <<'${HEREDOC_TERMINATOR}'
${shimContent}
${HEREDOC_TERMINATOR}
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

export async function installShimWith(
  host: string,
  shimContent: string,
  runner: SshRunner,
): Promise<InstallOutcome> {
  const script = buildInstallScript(shimContent);
  const { stderr, code } = await runner(host, script);
  if (code === 0) return { ok: true };
  const trimmed = stderr.trim();
  return {
    ok: false,
    error: trimmed.length > 0 ? trimmed : `ssh install exited with code ${code}`,
  };
}

export async function installShim(host: string): Promise<InstallOutcome> {
  return installShimWith(host, SHIM_CONTENT, realSshRunner);
}
```

注意 `InstallResult`/`InstallFailure`：discriminated union，呼叫端 `if (r.ok)` narrows 掉 error。

- [ ] **Step 3.4: 跑測試確認綠**

```
bun test tests/lib/remote-shim-install.test.ts
bun run typecheck
```

預期：全綠。

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/remote-shim-install.ts tests/lib/remote-shim-install.test.ts
git commit -m "feat(lib): add installShim via ssh stdin heredoc"
```

---

## Task 4: 擴充 preflight bash script — distro 與 shim hash marker

`buildPreflightScript` 增加：
1. socat 缺失時讀 `/etc/os-release` 並印 `MOLE_SOCAT_MISSING: <distro>` stderr。
2. shim 存在時印 `MOLE_SHIM_HASH: <12-char>` stderr；缺失時印 `MOLE_SHIM_MISSING:`。

只動 script 字串，不動結果 parser（下一個 task 處理）。

**Files:**
- Modify: `src/lib/remote-preflight.ts`
- Modify: `tests/lib/remote-preflight.test.ts`

- [ ] **Step 4.1: 在 `tests/lib/remote-preflight.test.ts` 的 `describe('buildPreflightScript', ...)` 區段加新測試**

```ts
test('emits MOLE_SOCAT_MISSING with distro detected from /etc/os-release', () => {
  const script = buildPreflightScript();
  expect(script).toContain('MOLE_SOCAT_MISSING:');
  expect(script).toContain('/etc/os-release');
  expect(script).toContain('debian');
  expect(script).toContain('rhel');
  expect(script).toContain('arch');
});

test('emits MOLE_SHIM_HASH with first 12 chars of sha256 when shim present', () => {
  const script = buildPreflightScript();
  expect(script).toContain('MOLE_SHIM_HASH:');
  expect(script).toContain('sha256sum');
  expect(script).toContain('cut -c1-12');
});

test('emits MOLE_SHIM_MISSING when shim absent', () => {
  const script = buildPreflightScript();
  expect(script).toContain('MOLE_SHIM_MISSING:');
});
```

- [ ] **Step 4.2: 跑測試確認失敗**

```
bun test tests/lib/remote-preflight.test.ts
```

預期 3 個新 test 紅；舊 test 仍綠。

- [ ] **Step 4.3: 改 `src/lib/remote-preflight.ts` 的 `buildPreflightScript`**

把 socat 與 shim 兩段檢查改寫如下（其餘部份不動）：

```ts
// socat 區段：
if ! command -v socat >/dev/null 2>&1; then
  distro="unknown"
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "${ID_LIKE:-${ID:-}}" in
      *debian*|*ubuntu*) distro="debian" ;;
      *rhel*|*fedora*|*centos*) distro="rhel" ;;
      *arch*) distro="arch" ;;
    esac
  fi
  echo "MOLE_SOCAT_MISSING: $distro" >&2
  exit 1
fi

// shim 區段：
if [ ! -x "$HOME/.local/bin/xclip" ]; then
  echo "MOLE_SHIM_MISSING:" >&2
  exit 2
fi
remote_hash=$(sha256sum "$HOME/.local/bin/xclip" | cut -c1-12)
echo "MOLE_SHIM_HASH: $remote_hash" >&2
```

完整新 `buildPreflightScript`（保留現有 sshd / socat-bridge 區段，置換 socat 與 shim 區段）：

```ts
export function buildPreflightScript(opts: PreflightOptions = {}): string {
  const sock = opts.chromeSocket ?? '/tmp/mole-chrome.sock';
  const port = opts.chromePort ?? 9222;
  return `
set -eu
MOLE_SLBU_READ=""
for f in /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; do
  [ -r "$f" ] || continue
  MOLE_SLBU_READ="$MOLE_SLBU_READ $f"
done
if [ -z "$MOLE_SLBU_READ" ]; then
  echo "MOLE_WARN: cannot read /etc/ssh/sshd_config*; unable to verify 'StreamLocalBindUnlink yes'. If clipboard silently fails, check 'ls -la /tmp/mole-*.sock' on remote and ensure sshd_config has 'StreamLocalBindUnlink yes'." >&2
elif ! grep -hEi '^[[:space:]]*StreamLocalBindUnlink[[:space:]]+yes[[:space:]]*$' $MOLE_SLBU_READ >/dev/null 2>&1; then
  echo "ERROR: remote sshd missing 'StreamLocalBindUnlink yes'; a stale -R socket from another client will silently block mole's clipboard. Fix: echo 'StreamLocalBindUnlink yes' | sudo tee -a /etc/ssh/sshd_config && sudo systemctl reload ssh.service" >&2
  exit 3
fi
if ! command -v socat >/dev/null 2>&1; then
  distro="unknown"
  if [ -r /etc/os-release ]; then
    . /etc/os-release
    case "\${ID_LIKE:-\${ID:-}}" in
      *debian*|*ubuntu*) distro="debian" ;;
      *rhel*|*fedora*|*centos*) distro="rhel" ;;
      *arch*) distro="arch" ;;
    esac
  fi
  echo "MOLE_SOCAT_MISSING: $distro" >&2
  exit 1
fi
if [ ! -x "$HOME/.local/bin/xclip" ]; then
  echo "MOLE_SHIM_MISSING:" >&2
  exit 2
fi
remote_hash=$(sha256sum "$HOME/.local/bin/xclip" | cut -c1-12)
echo "MOLE_SHIM_HASH: $remote_hash" >&2
if ! pgrep -f 'socat.*mole-chrome' >/dev/null 2>&1; then
  nohup socat TCP-LISTEN:${port},bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:${sock} >/dev/null 2>&1 </dev/null &
  sleep 0.2
fi
`.trim();
}
```

注意：TypeScript template literal 中，bash 的 `${...}` 變數需要 escape 為 `\${...}`，避免被 JS 解讀。port/sock 的 `${port}`/`${sock}` 是 JS 插值，保留。

- [ ] **Step 4.4: 跑測試確認綠**

```
bun test tests/lib/remote-preflight.test.ts
bun run typecheck
```

預期：所有 buildPreflightScript test 全綠。`runPreflightWith` 既有 test 仍綠（解析行為下一個 task 才動）。

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/remote-preflight.ts tests/lib/remote-preflight.test.ts
git commit -m "feat(preflight): emit distro + shim-hash markers in remote bash"
```

---

## Task 5: PreflightOutcome discriminated union

把 `runPreflightWith` / `runPreflight` 的回傳從 `{ ok, errors[], warnings[] }` 改為結構化 `PreflightOutcome`。Parser 解析 `MOLE_SOCAT_MISSING` / `MOLE_SHIM_MISSING` / `MOLE_SHIM_HASH` / `MOLE_WARN`。

新 API 需要 `expectedShimHash: string` 來判定 outdated（呼叫端從 `remote-shim.ts` 帶入）。

**Files:**
- Modify: `src/lib/remote-preflight.ts`
- Modify: `tests/lib/remote-preflight.test.ts`

- [ ] **Step 5.1: 改 `tests/lib/remote-preflight.test.ts` 的 `describe('runPreflightWith', ...)` 區段**

整個 `describe('runPreflightWith', ...)` 重寫如下（替換掉舊 5 個 test）：

```ts
describe('runPreflightWith', () => {
  const HASH = 'aaaabbbbcccc';

  test('returns ok with empty warnings on success', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: `MOLE_SHIM_HASH: ${HASH}\n`,
        code: 0,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'ok', warnings: [] });
  });

  test('extracts MOLE_WARN: lines into ok outcome warnings', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: `MOLE_WARN: cannot read sshd config\nMOLE_SHIM_HASH: ${HASH}\n`,
        code: 0,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({
      kind: 'ok',
      warnings: ['cannot read sshd config'],
    });
  });

  test('classifies socat-missing with debian distro', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SOCAT_MISSING: debian\n',
        code: 1,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'socat-missing', distro: 'debian' });
  });

  test('classifies socat-missing with unknown distro fallback', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SOCAT_MISSING: weirdos\n',
        code: 1,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'socat-missing', distro: 'unknown' });
  });

  test('classifies shim-missing', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SHIM_MISSING:\n',
        code: 2,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'shim-missing' });
  });

  test('classifies shim-outdated when remote hash differs from expected', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'MOLE_SHIM_HASH: deadbeefdead\n',
        code: 0,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({
      kind: 'shim-outdated',
      remoteHash: 'deadbeefdead',
    });
  });

  test('classifies sshd-config-missing on exit 3', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr:
          "ERROR: remote sshd missing 'StreamLocalBindUnlink yes'; ...\n",
        code: 3,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({ kind: 'sshd-config-missing' });
  });

  test('falls back to error kind with all stderr lines on unknown failure', async () => {
    const r = await runPreflightWith(
      'host',
      async () => ({
        stdout: '',
        stderr: 'something exploded\nmore detail\n',
        code: 99,
      }),
      { expectedShimHash: HASH },
    );
    expect(r).toEqual({
      kind: 'error',
      errors: ['something exploded', 'more detail'],
    });
  });
});
```

- [ ] **Step 5.2: 跑測試確認失敗**

```
bun test tests/lib/remote-preflight.test.ts
```

預期：所有 runPreflightWith test 紅（型別不符）。

- [ ] **Step 5.3: 改 `src/lib/remote-preflight.ts` 的 result 部分**

完整改寫 `PreflightOptions`、新增 `PreflightOutcome`、`Distro`、parser：

```ts
import { realSshRunner, type SshRunner } from './ssh-exec';

export type Distro = 'debian' | 'rhel' | 'arch' | 'unknown';

export type PreflightOutcome =
  | { kind: 'ok'; warnings: string[] }
  | { kind: 'shim-missing' }
  | { kind: 'shim-outdated'; remoteHash: string }
  | { kind: 'socat-missing'; distro: Distro }
  | { kind: 'sshd-config-missing' }
  | { kind: 'error'; errors: string[] };

export interface PreflightOptions {
  chromeSocket?: string;
  chromePort?: number;
  expectedShimHash: string;
}

export function buildPreflightScript(
  opts: Pick<PreflightOptions, 'chromeSocket' | 'chromePort'> = {},
): string {
  // ...（Task 4 已完成）
}

function parseDistro(raw: string): Distro {
  const trimmed = raw.trim();
  if (trimmed === 'debian' || trimmed === 'rhel' || trimmed === 'arch') {
    return trimmed;
  }
  return 'unknown';
}

export async function runPreflightWith(
  host: string,
  runner: SshRunner,
  opts: PreflightOptions,
): Promise<PreflightOutcome> {
  const script = buildPreflightScript(opts);
  const { stderr, code } = await runner(host, script);
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const warnings = lines
    .filter((l) => l.startsWith('MOLE_WARN:'))
    .map((l) => l.replace(/^MOLE_WARN:\s*/, ''));

  const socatLine = lines.find((l) => l.startsWith('MOLE_SOCAT_MISSING:'));
  if (socatLine) {
    const distro = parseDistro(
      socatLine.replace(/^MOLE_SOCAT_MISSING:\s*/, ''),
    );
    return { kind: 'socat-missing', distro };
  }

  if (lines.some((l) => l.startsWith('MOLE_SHIM_MISSING'))) {
    return { kind: 'shim-missing' };
  }

  const hashLine = lines.find((l) => l.startsWith('MOLE_SHIM_HASH:'));
  if (hashLine) {
    const remoteHash = hashLine.replace(/^MOLE_SHIM_HASH:\s*/, '');
    if (remoteHash !== opts.expectedShimHash) {
      return { kind: 'shim-outdated', remoteHash };
    }
    if (code === 0) {
      return { kind: 'ok', warnings };
    }
  }

  if (code === 3) {
    return { kind: 'sshd-config-missing' };
  }

  if (code === 0) {
    return { kind: 'ok', warnings };
  }

  const errors = lines.filter(
    (l) =>
      !l.startsWith('MOLE_WARN:') &&
      !l.startsWith('MOLE_SOCAT_MISSING:') &&
      !l.startsWith('MOLE_SHIM_MISSING') &&
      !l.startsWith('MOLE_SHIM_HASH:'),
  );
  return { kind: 'error', errors };
}

export async function runPreflight(
  host: string,
  opts: PreflightOptions,
): Promise<PreflightOutcome> {
  return runPreflightWith(host, realSshRunner, opts);
}
```

注意：
- 移除舊的 `PreflightResult` interface。
- `PreflightOptions` 現在 `expectedShimHash` 是 required（來自 `remote-shim.ts`）。
- `SshRunner` 從 `ssh-exec` import。

- [ ] **Step 5.4: 跑單檔測試確認本檔綠**

```
bun test tests/lib/remote-preflight.test.ts
```

預期：本檔所有 test 綠。

> ⚠️ 此階段 `bun test`（整體）與 `bun run typecheck` 會在 `preflight-runner.ts` 呼叫端與 `preflight-runner.test.ts` 報錯，這是預期，Task 6 一併修復。**不要在這個 task 跑整體 typecheck，會造成誤判。**

- [ ] **Step 5.5: 不 commit，銜接 Task 6**

Task 5 + 6 構成原子單位（API 變更橫跨兩個檔案），合併 commit 在 Task 6.6。

---

## Task 6: 重寫 preflight-runner 以消費 PreflightOutcome 並 orchestrate install

`runPreflightStepsWith` 改成 outcome-driven：
- `ok` → 繼續 chrome
- `shim-missing` / `shim-outdated` → set step `prompt`，等使用者答覆 → installShim → re-run preflight（一次重試上限）
- `socat-missing` → set step `error`，附 distro one-liner
- `sshd-config-missing` / `error` → set step `error`，原訊息

`PreflightDeps` 增加 `installShim` 與 `expectedShimHash`。

**Files:**
- Modify: `src/cli/preflight-runner.ts`
- Modify: `src/cli/preflight.tsx`（只動 type、UI 在 Task 7）
- Modify: `tests/cli/preflight-runner.test.ts`

- [ ] **Step 6.1: 在 `src/cli/preflight.tsx` 擴充 `PreflightStepState`、新增 prompt 結構**

只改 type，不改渲染（Task 7 才改）。檔案最上方 type 區段：

```ts
export type PreflightStepState =
  | 'pending'
  | 'running'
  | 'prompt'
  | 'installing'
  | 'ok'
  | 'error';

export type PreflightStepId = 'daemon' | 'remote' | 'chrome';

export type PreflightPromptKind = 'install-shim' | 'update-shim';

export interface PreflightPrompt {
  kind: PreflightPromptKind;
  host: string;
  remoteHash?: string;
  expectedHash?: string;
  onAnswer: (yes: boolean) => void;
}

export interface PreflightStep {
  id: PreflightStepId;
  label: string;
  state: PreflightStepState;
  error?: string;
  warning?: string;
  prompt?: PreflightPrompt;
  installingMessage?: string;
}
```

注意 `PreflightView` 現有 switch 沒有 `prompt`/`installing` case；先讓 type 有，render 在 Task 7 補。為了避免 `case 'pending': default:` 漏案吞掉，渲染端目前會把 `prompt`/`installing` 當 pending（暫時可接受，下一個 task 修正）。

- [ ] **Step 6.2: 改 `tests/cli/preflight-runner.test.ts` 的 `harness()` 與 outcome 期望**

把 `harness()` 改為支援新 deps 與 outcome 形狀：

```ts
import { test, expect, describe } from 'bun:test';
import {
  initialPreflightSteps,
  runPreflightStepsWith,
  type PreflightDeps,
  type SetStep,
} from '../../src/cli/preflight-runner';
import type {
  PreflightStep,
  PreflightStepId,
  PreflightPrompt,
} from '../../src/cli/preflight';
import type { SshHost } from '../../src/lib/ssh-config';
import type { ProfileInfo } from '../../src/lib/chrome-profile';
import type { PreflightOutcome } from '../../src/lib/remote-preflight';
import type { InstallOutcome } from '../../src/lib/remote-shim-install';

const HOST: SshHost = { name: 'vbm' };
const PROFILE = (
  status: ProfileInfo['status'] = 'free',
  pid?: number,
): ProfileInfo => ({ name: 'work', path: '/p/work', status, pid });

interface Trace {
  steps: Map<PreflightStepId, Partial<PreflightStep>>;
  order: Array<{ id: PreflightStepId; patch: Partial<PreflightStep> }>;
  chromeLaunched: boolean;
  sleeps: number[];
  preflightCalls: number;
  installCalls: number;
}

const harness = (
  over: Partial<PreflightDeps> = {},
): { setStep: SetStep; trace: Trace; deps: PreflightDeps } => {
  const trace: Trace = {
    steps: new Map(),
    order: [],
    chromeLaunched: false,
    sleeps: [],
    preflightCalls: 0,
    installCalls: 0,
  };
  const setStep: SetStep = (id, patch) => {
    trace.order.push({ id, patch });
    const prev = trace.steps.get(id) ?? {};
    trace.steps.set(id, { ...prev, ...patch });
  };
  const deps: PreflightDeps = {
    isDaemonHealthy: async () => true,
    runPreflight: async (): Promise<PreflightOutcome> => {
      trace.preflightCalls += 1;
      return { kind: 'ok', warnings: [] };
    },
    installShim: async (): Promise<InstallOutcome> => {
      trace.installCalls += 1;
      return { ok: true };
    },
    launchChrome: () => {
      trace.chromeLaunched = true;
    },
    sleep: async (ms) => {
      trace.sleeps.push(ms);
    },
    ...over,
  };
  return { setStep, trace, deps };
};
```

接下來把既有 happy path 與 failure short-circuit 測試改用 outcome 形狀（替換掉舊的 `{ ok, errors, warnings }`）：

```ts
describe('runPreflightStepsWith — happy path', () => {
  test('runs daemon → remote → chrome in order, returns ok=true, launches Chrome', async () => {
    const { setStep, trace, deps } = harness();
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE() },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.order.map((o) => o.id)).toEqual([
      'daemon',
      'daemon',
      'remote',
      'remote',
      'chrome',
      'chrome',
    ]);
    expect(trace.chromeLaunched).toBe(true);
  });

  test('skips chrome step entirely when profile is "skip"', async () => {
    const { setStep, trace, deps } = harness();
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.order.some((o) => o.id === 'chrome')).toBe(false);
  });
});

describe('runPreflightStepsWith — failure short-circuit', () => {
  test('daemon down → no remote, no chrome', async () => {
    const { setStep, trace, deps } = harness({
      isDaemonHealthy: async () => false,
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: PROFILE() },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.steps.get('daemon')!.state).toBe('error');
  });

  test('socat-missing → error step with distro hint, no install attempt', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'socat-missing', distro: 'debian' };
      },
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.steps.get('remote')!.state).toBe('error');
    expect(trace.steps.get('remote')!.error).toMatch(/sudo apt install/);
    expect(trace.installCalls).toBe(0);
  });

  test('socat-missing arch → pacman one-liner', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'socat-missing', distro: 'arch' };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toMatch(/sudo pacman/);
  });

  test('socat-missing unknown → generic guidance', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'socat-missing', distro: 'unknown' };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toMatch(/socat/);
    expect(trace.steps.get('remote')!.error).toMatch(/install via your package manager/i);
  });

  test('sshd-config-missing → existing guidance', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'sshd-config-missing' };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toMatch(/StreamLocalBindUnlink/);
  });

  test('error kind → joined stderr', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'error', errors: ['boom', 'kapow'] };
      },
    });
    await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(trace.steps.get('remote')!.error).toBe('boom; kapow');
  });
});

describe('runPreflightStepsWith — shim install flow', () => {
  test('shim-missing → prompt → user answers Y → installShim → re-preflight → ok', async () => {
    let preflightCallCount = 0;
    let promptOnAnswer: ((yes: boolean) => void) | undefined;

    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        preflightCallCount += 1;
        trace.preflightCalls += 1;
        if (preflightCallCount === 1) return { kind: 'shim-missing' };
        return { kind: 'ok', warnings: [] };
      },
      installShim: async () => {
        trace.installCalls += 1;
        return { ok: true };
      },
    });

    // 包裝 setStep：捕捉 prompt 出現時的 onAnswer，立即在 next tick 模擬使用者按 Y。
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        promptOnAnswer = patch.prompt.onAnswer;
        queueMicrotask(() => promptOnAnswer!(true));
      }
    };

    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(trace.preflightCalls).toBe(2);
    expect(trace.installCalls).toBe(1);
    expect(trace.steps.get('remote')!.state).toBe('ok');
  });

  test('shim-missing → user answers n → ok=false, no install', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'shim-missing' };
      },
    });
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        queueMicrotask(() => patch.prompt!.onAnswer(false));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.installCalls).toBe(0);
  });

  test('shim-outdated → prompt with update kind → install → ok', async () => {
    let preflightCallCount = 0;
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        preflightCallCount += 1;
        trace.preflightCalls += 1;
        if (preflightCallCount === 1)
          return { kind: 'shim-outdated', remoteHash: 'aaa111bbb222' };
        return { kind: 'ok', warnings: [] };
      },
    });
    let capturedPrompt: PreflightPrompt | undefined;
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        capturedPrompt = patch.prompt;
        queueMicrotask(() => patch.prompt!.onAnswer(true));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(capturedPrompt!.kind).toBe('update-shim');
    expect(capturedPrompt!.remoteHash).toBe('aaa111bbb222');
  });

  test('install fails → error state, no further preflight', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'shim-missing' };
      },
      installShim: async () => {
        trace.installCalls += 1;
        return { ok: false, error: 'permission denied' };
      },
    });
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        queueMicrotask(() => patch.prompt!.onAnswer(true));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.preflightCalls).toBe(1);
    expect(trace.installCalls).toBe(1);
    expect(trace.steps.get('remote')!.state).toBe('error');
    expect(trace.steps.get('remote')!.error).toMatch(/permission denied/);
  });

  test('re-preflight after install still shim-missing → error (max retries reached)', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'shim-missing' };
      },
    });
    const wrappedSetStep: SetStep = (id, patch) => {
      setStep(id, patch);
      if (patch.state === 'prompt' && patch.prompt) {
        queueMicrotask(() => patch.prompt!.onAnswer(true));
      }
    };
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      wrappedSetStep,
      deps,
    );
    expect(result).toEqual({ ok: false });
    expect(trace.preflightCalls).toBe(2);
    expect(trace.installCalls).toBe(1);
    expect(trace.steps.get('remote')!.error).toMatch(/Reinstall did not stick/);
  });
});

// 既有的 warning surfacing test 改寫：
describe('runPreflightStepsWith — warning surfacing', () => {
  test('ok with warnings → step ok, warning visible', async () => {
    const { setStep, trace, deps } = harness({
      runPreflight: async () => {
        trace.preflightCalls += 1;
        return { kind: 'ok', warnings: ['cannot read sshd config'] };
      },
    });
    const result = await runPreflightStepsWith(
      { host: HOST, profile: 'skip' },
      setStep,
      deps,
    );
    expect(result).toEqual({ ok: true });
    expect(trace.steps.get('remote')!.state).toBe('ok');
    expect(trace.steps.get('remote')!.warning).toMatch(/cannot read sshd config/);
  });
});

// 移除舊的 'remote preflight fails with both warnings and errors' test
// （新模型下 errors 與 warnings 不會在同一個 outcome 出現）。
```

- [ ] **Step 6.3: 跑測試確認失敗**

```
bun test tests/cli/preflight-runner.test.ts
```

預期：所有測試紅，要實作。

- [ ] **Step 6.4: 改寫 `src/cli/preflight-runner.ts`**

完整新版：

```ts
import type { WizardSubmitPayload } from './wizard';
import type {
  PreflightStep,
  PreflightStepId,
  PreflightPrompt,
} from './preflight';
import type { SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import {
  runPreflight,
  type PreflightOutcome,
  type Distro,
} from '../lib/remote-preflight';
import { installShim, type InstallOutcome } from '../lib/remote-shim-install';
import { SHIM_HASH } from '../lib/remote-shim';

export interface PreflightRunResult {
  ok: boolean;
}

export type SetStep = (id: PreflightStepId, patch: Partial<PreflightStep>) => void;

export interface PreflightDeps {
  isDaemonHealthy: () => Promise<boolean>;
  runPreflight: (host: string) => Promise<PreflightOutcome>;
  installShim: (host: string) => Promise<InstallOutcome>;
  launchChrome: (opts: { profilePath: string }) => void;
  sleep: (ms: number) => Promise<void>;
}

export const initialPreflightSteps = (
  host: SshHost,
  profile: ProfileInfo | 'skip',
): PreflightStep[] => {
  const steps: PreflightStep[] = [
    { id: 'daemon', label: 'Mac daemon', state: 'pending' },
    { id: 'remote', label: `Remote preflight (${host.name})`, state: 'pending' },
  ];
  if (profile !== 'skip') {
    steps.push({
      id: 'chrome',
      label: `Chrome (profile: ${profile.name})`,
      state: 'pending',
    });
  }
  return steps;
};

const SOCAT_HINT: Record<Distro, string> = {
  debian: 'socat not installed. Run: sudo apt install socat xclip',
  rhel: 'socat not installed. Run: sudo dnf install socat xclip',
  arch: 'socat not installed. Run: sudo pacman -S socat xclip',
  unknown:
    'socat not installed. Install via your package manager (e.g. apt / dnf / pacman) along with xclip.',
};

const SSHD_HINT =
  "remote sshd missing 'StreamLocalBindUnlink yes'. Fix: " +
  "echo 'StreamLocalBindUnlink yes' | sudo tee -a /etc/ssh/sshd_config && sudo systemctl reload ssh.service";

async function handleRemoteOutcome(
  host: string,
  setStep: SetStep,
  deps: PreflightDeps,
  outcome: PreflightOutcome,
  remainingInstallAttempts: number,
): Promise<{ ok: boolean }> {
  switch (outcome.kind) {
    case 'ok': {
      const warning = outcome.warnings.length > 0 ? outcome.warnings.join(' ') : undefined;
      setStep('remote', { state: 'ok', warning });
      if (warning) await deps.sleep(1500);
      return { ok: true };
    }
    case 'socat-missing': {
      setStep('remote', { state: 'error', error: SOCAT_HINT[outcome.distro] });
      return { ok: false };
    }
    case 'sshd-config-missing': {
      setStep('remote', { state: 'error', error: SSHD_HINT });
      return { ok: false };
    }
    case 'error': {
      setStep('remote', { state: 'error', error: outcome.errors.join('; ') });
      return { ok: false };
    }
    case 'shim-missing':
    case 'shim-outdated': {
      const yes = await new Promise<boolean>((resolve) => {
        const prompt: PreflightPrompt =
          outcome.kind === 'shim-missing'
            ? { kind: 'install-shim', host, onAnswer: resolve }
            : {
                kind: 'update-shim',
                host,
                remoteHash: outcome.remoteHash,
                expectedHash: SHIM_HASH,
                onAnswer: resolve,
              };
        setStep('remote', { state: 'prompt', prompt });
      });
      if (!yes) {
        setStep('remote', {
          state: 'error',
          error: 'shim install declined.',
        });
        return { ok: false };
      }
      setStep('remote', {
        state: 'installing',
        installingMessage: `Installing mole shim on ${host}…`,
      });
      const installOutcome = await deps.installShim(host);
      if (!installOutcome.ok) {
        setStep('remote', {
          state: 'error',
          error: `shim install failed: ${installOutcome.error}`,
        });
        return { ok: false };
      }
      if (remainingInstallAttempts <= 0) {
        setStep('remote', {
          state: 'error',
          error:
            `Reinstall did not stick. Check $HOME/.local/bin/xclip on ${host}.`,
        });
        return { ok: false };
      }
      setStep('remote', { state: 'running' });
      const next = await deps.runPreflight(host);
      return handleRemoteOutcome(host, setStep, deps, next, remainingInstallAttempts - 1);
    }
  }
}

export async function runPreflightStepsWith(
  payload: WizardSubmitPayload,
  setStep: SetStep,
  deps: PreflightDeps,
): Promise<PreflightRunResult> {
  const { host, profile } = payload;
  const skipChrome = profile === 'skip';

  setStep('daemon', { state: 'running' });
  const healthy = await deps.isDaemonHealthy();
  if (!healthy) {
    setStep('daemon', {
      state: 'error',
      error:
        'Daemon not responding. Run: launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon',
    });
    return { ok: false };
  }
  setStep('daemon', { state: 'ok' });

  setStep('remote', { state: 'running' });
  const outcome = await deps.runPreflight(host.name);
  const remoteResult = await handleRemoteOutcome(
    host.name,
    setStep,
    deps,
    outcome,
    1, // 最多 1 次重試（safety guard）
  );
  if (!remoteResult.ok) return { ok: false };

  if (!skipChrome) {
    setStep('chrome', { state: 'running' });
    const p = profile as ProfileInfo;
    if (p.status === 'reusable') {
      setStep('chrome', { state: 'ok', label: `Chrome (reusing pid ${p.pid})` });
    } else {
      deps.launchChrome({ profilePath: p.path });
      await deps.sleep(1500);
      setStep('chrome', { state: 'ok' });
    }
  }

  return { ok: true };
}

export async function runPreflightSteps(
  payload: WizardSubmitPayload,
  setStep: SetStep,
): Promise<PreflightRunResult> {
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  return runPreflightStepsWith(payload, setStep, {
    isDaemonHealthy: () => isDaemonHealthy(socketPath),
    runPreflight: (host) => runPreflight(host, { expectedShimHash: SHIM_HASH }),
    installShim: (host) => installShim(host),
    launchChrome,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
}
```

- [ ] **Step 6.5: 跑測試確認綠**

```
bun test
bun run typecheck
```

預期：全綠。

- [ ] **Step 6.6: Commit**

```bash
git add src/cli/preflight.tsx src/cli/preflight-runner.ts src/lib/remote-preflight.ts tests/lib/remote-preflight.test.ts tests/cli/preflight-runner.test.ts
git commit -m "feat(preflight): outcome-driven runner with shim auto-install flow"
```

---

## Task 7: PreflightView 渲染 prompt + installing state，接受 Y/n input

`PreflightView` 為 `prompt` / `installing` 兩 state 加渲染；prompt step 用 `useInput` 接 Y/y/Enter（yes）與 N/n/Esc（no）。

**Files:**
- Modify: `src/cli/preflight.tsx`
- Modify: `tests/cli/preflight.test.tsx`

- [ ] **Step 7.1: 在 `tests/cli/preflight.test.tsx` 加新 test**

```ts
test('prompt state renders info icon and install question', () => {
  const { lastFrame, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight (droplet)',
          state: 'prompt',
          prompt: {
            kind: 'install-shim',
            host: 'droplet',
            onAnswer: () => {},
          },
        },
      ]}
    />,
  );
  const out = lastFrame()!;
  expect(out).toContain(icons.info);
  expect(out).toContain('Install now? [Y/n]');
  expect(out).toContain('droplet');
  unmount();
});

test('prompt update kind shows hash transition', () => {
  const { lastFrame, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight (droplet)',
          state: 'prompt',
          prompt: {
            kind: 'update-shim',
            host: 'droplet',
            remoteHash: 'aaaa11112222',
            expectedHash: 'bbbb33334444',
            onAnswer: () => {},
          },
        },
      ]}
    />,
  );
  const out = lastFrame()!;
  expect(out).toContain('aaaa11112222');
  expect(out).toContain('bbbb33334444');
  expect(out).toContain('Update now? [Y/n]');
  unmount();
});

test('installing state renders spinner with installingMessage', () => {
  const { lastFrame, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight (droplet)',
          state: 'installing',
          installingMessage: 'Installing mole shim on droplet…',
        },
      ]}
    />,
  );
  const out = lastFrame()!;
  expect(out).toContain(spinnerFrames[0]!);
  expect(out).toContain('Installing mole shim on droplet…');
  unmount();
});

test('Y key on prompt step calls onAnswer(true)', () => {
  let answer: boolean | undefined;
  const { stdin, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight (droplet)',
          state: 'prompt',
          prompt: {
            kind: 'install-shim',
            host: 'droplet',
            onAnswer: (yes) => {
              answer = yes;
            },
          },
        },
      ]}
    />,
  );
  stdin.write('y');
  expect(answer).toBe(true);
  unmount();
});

test('N key on prompt step calls onAnswer(false)', () => {
  let answer: boolean | undefined;
  const { stdin, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight',
          state: 'prompt',
          prompt: {
            kind: 'install-shim',
            host: 'droplet',
            onAnswer: (yes) => {
              answer = yes;
            },
          },
        },
      ]}
    />,
  );
  stdin.write('n');
  expect(answer).toBe(false);
  unmount();
});

test('Enter on prompt step defaults to yes (capital Y in [Y/n])', () => {
  let answer: boolean | undefined;
  const { stdin, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight',
          state: 'prompt',
          prompt: {
            kind: 'install-shim',
            host: 'droplet',
            onAnswer: (yes) => {
              answer = yes;
            },
          },
        },
      ]}
    />,
  );
  stdin.write('\r');
  expect(answer).toBe(true);
  unmount();
});

test('Esc on prompt step calls onAnswer(false)', () => {
  let answer: boolean | undefined;
  const { stdin, unmount } = render(
    <PreflightView
      steps={[
        {
          id: 'remote',
          label: 'Remote preflight',
          state: 'prompt',
          prompt: {
            kind: 'install-shim',
            host: 'droplet',
            onAnswer: (yes) => {
              answer = yes;
            },
          },
        },
      ]}
    />,
  );
  stdin.write(''); // Esc
  expect(answer).toBe(false);
  unmount();
});
```

- [ ] **Step 7.2: 跑測試確認失敗**

```
bun test tests/cli/preflight.test.tsx
```

預期：新增 7 個 test 紅。

- [ ] **Step 7.3: 改 `src/cli/preflight.tsx` 加渲染與 useInput**

完整檔（在 Task 6.1 type 定義基礎上加渲染與 input）：

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from './components/spinner';
import { colors, icons } from './components/theme';

export type PreflightStepState =
  | 'pending'
  | 'running'
  | 'prompt'
  | 'installing'
  | 'ok'
  | 'error';

export type PreflightStepId = 'daemon' | 'remote' | 'chrome';

export type PreflightPromptKind = 'install-shim' | 'update-shim';

export interface PreflightPrompt {
  kind: PreflightPromptKind;
  host: string;
  remoteHash?: string;
  expectedHash?: string;
  onAnswer: (yes: boolean) => void;
}

export interface PreflightStep {
  id: PreflightStepId;
  label: string;
  state: PreflightStepState;
  error?: string;
  warning?: string;
  prompt?: PreflightPrompt;
  installingMessage?: string;
}

const MarkerCell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box width={2}>{children}</Box>
);

const Marker: React.FC<{ state: PreflightStepState }> = ({ state }) => {
  let inner: React.ReactNode;
  switch (state) {
    case 'running':
    case 'installing':
      inner = <Spinner color={colors.primary} />;
      break;
    case 'ok':
      inner = <Text color={colors.success}>{icons.tick}</Text>;
      break;
    case 'error':
      inner = <Text color={colors.error}>{icons.cross}</Text>;
      break;
    case 'prompt':
      inner = <Text color={colors.info}>{icons.info}</Text>;
      break;
    case 'pending':
    default:
      inner = <Text dimColor>·</Text>;
      break;
  }
  return <MarkerCell>{inner}</MarkerCell>;
};

const labelColor = (state: PreflightStepState): string | undefined => {
  if (state === 'running' || state === 'installing') return colors.primary;
  if (state === 'error') return colors.error;
  if (state === 'prompt') return colors.info;
  return undefined;
};

const promptText = (p: PreflightPrompt): string => {
  if (p.kind === 'install-shim') {
    return `mole shim not installed on ${p.host}. Install now? [Y/n]`;
  }
  return `mole shim outdated on ${p.host} (${p.remoteHash ?? '?'} → ${p.expectedHash ?? '?'}). Update now? [Y/n]`;
};

const PromptInput: React.FC<{ prompt: PreflightPrompt; active: boolean }> = ({
  prompt,
  active,
}) => {
  useInput(
    (input, key) => {
      if (key.return || input === 'y' || input === 'Y') {
        prompt.onAnswer(true);
        return;
      }
      if (key.escape || input === 'n' || input === 'N') {
        prompt.onAnswer(false);
        return;
      }
    },
    { isActive: active },
  );
  return null;
};

export interface PreflightViewProps {
  steps: PreflightStep[];
}

const MARKER_GAP = ' ';

export const PreflightView: React.FC<PreflightViewProps> = ({ steps }) => {
  const promptStep = steps.find((s) => s.state === 'prompt' && s.prompt);
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {steps.map((s) => (
        <Box key={s.id} flexDirection="column">
          <Box>
            <Marker state={s.state} />
            <Text>{MARKER_GAP}</Text>
            <Text
              color={labelColor(s.state)}
              dimColor={s.state === 'pending'}
            >
              {s.state === 'installing' && s.installingMessage
                ? s.installingMessage
                : s.label}
            </Text>
          </Box>
          {s.state === 'prompt' && s.prompt ? (
            <Box paddingLeft={3}>
              <Text color={colors.info}>{promptText(s.prompt)}</Text>
            </Box>
          ) : null}
          {s.error ? (
            <Box paddingLeft={3}>
              <Text color={colors.error}>{s.error}</Text>
            </Box>
          ) : null}
          {s.warning ? (
            <Box paddingLeft={2}>
              <MarkerCell>
                <Text color={colors.warning}>{icons.warning}</Text>
              </MarkerCell>
              <Text>{MARKER_GAP}</Text>
              <Text color={colors.warning}>{s.warning}</Text>
            </Box>
          ) : null}
        </Box>
      ))}
      {promptStep?.prompt ? (
        <PromptInput prompt={promptStep.prompt} active={true} />
      ) : null}
    </Box>
  );
};
```

注意：
- `PromptInput` 是 zero-render component，唯一職責是綁定 useInput；放在 PreflightView 外殼結尾，避免 conditional hook（hook 一定要呼叫，靠 `isActive` 控制）。
- prompt 出現時 step label 仍渲染 host 名（像 `Remote preflight (droplet)`），因此 `expect(out).toContain('droplet')` 仍會找到。

- [ ] **Step 7.4: 跑測試**

```
bun test tests/cli/preflight.test.tsx
bun run typecheck
```

預期：全綠。

- [ ] **Step 7.5: 跑 preview 確認沒退步**

```
bun run preview preflight
```

肉眼掃過：所有舊 case 仍正常，無格錯。

- [ ] **Step 7.6: Commit**

```bash
git add src/cli/preflight.tsx tests/cli/preflight.test.tsx
git commit -m "feat(cli): render preflight prompt + installing states with Y/n input"
```

---

## Task 8: Preview cases for new states

`scripts/preview.tsx` 在 `preflightCases` 中新增 4 個 case 涵蓋 prompt-install / prompt-update / installing / socat-missing-arch。Preview 是純 snapshot，不會等鍵盤。

**Files:**
- Modify: `scripts/preview.tsx`

- [ ] **Step 8.1: 在 `preflightCases` 陣列加新 cases**

在現有 `preflightCases` 陣列尾端追加：

```tsx
{
  view: 'preflight',
  name: 'shim missing — prompt to install',
  run: () =>
    snapshot(
      <PreflightView
        steps={[
          { id: 'daemon', label: 'Mac daemon', state: 'ok' },
          {
            id: 'remote',
            label: 'Remote preflight (droplet)',
            state: 'prompt',
            prompt: {
              kind: 'install-shim',
              host: 'droplet',
              onAnswer: () => {},
            },
          },
          {
            id: 'chrome',
            label: 'Chrome (profile: work)',
            state: 'pending',
          },
        ]}
      />,
    ),
},
{
  view: 'preflight',
  name: 'shim outdated — prompt to update',
  run: () =>
    snapshot(
      <PreflightView
        steps={[
          { id: 'daemon', label: 'Mac daemon', state: 'ok' },
          {
            id: 'remote',
            label: 'Remote preflight (droplet)',
            state: 'prompt',
            prompt: {
              kind: 'update-shim',
              host: 'droplet',
              remoteHash: 'aaaa11112222',
              expectedHash: 'bbbb33334444',
              onAnswer: () => {},
            },
          },
          {
            id: 'chrome',
            label: 'Chrome (profile: work)',
            state: 'pending',
          },
        ]}
      />,
    ),
},
{
  view: 'preflight',
  name: 'installing shim',
  run: () =>
    snapshot(
      <PreflightView
        steps={[
          { id: 'daemon', label: 'Mac daemon', state: 'ok' },
          {
            id: 'remote',
            label: 'Remote preflight (droplet)',
            state: 'installing',
            installingMessage: 'Installing mole shim on droplet…',
          },
          {
            id: 'chrome',
            label: 'Chrome (profile: work)',
            state: 'pending',
          },
        ]}
      />,
    ),
},
{
  view: 'preflight',
  name: 'socat missing — arch',
  run: () =>
    snapshot(
      <PreflightView
        steps={[
          { id: 'daemon', label: 'Mac daemon', state: 'ok' },
          {
            id: 'remote',
            label: 'Remote preflight (arch-box)',
            state: 'error',
            error:
              'socat not installed. Run: sudo pacman -S socat xclip',
          },
          {
            id: 'chrome',
            label: 'Chrome (profile: work)',
            state: 'pending',
          },
        ]}
      />,
    ),
},
```

- [ ] **Step 8.2: 跑 preview 確認全部 case 正確輸出**

```
bun run preview preflight
```

預期：4 個新 case 都印出來，欄位對齊（marker 後 2 spaces、label 對齊）。

- [ ] **Step 8.3: Commit**

```bash
git add scripts/preview.tsx
git commit -m "test(preview): add cases for prompt/installing/socat-arch"
```

---

## Task 9: README 更新

移除 `On each Linux remote (once per host)` 章節，並修改 Requirements 段落說明 mole 會自動偵測並提示（shim 部分自動裝、socat 部分印 distro 指令）。

**Files:**
- Modify: `README.md`

- [ ] **Step 9.1: 刪除 README 中的 "On each Linux remote (once per host)" 段落**

完全刪掉這段：

```markdown
### On each Linux remote (once per host)

\`\`\`bash
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
\`\`\`
```

（外加上下空白行。）

- [ ] **Step 9.2: 在 Requirements/Linux 區段加說明**

把現有「Most distributions don't ship `socat` or `xclip`...」段改寫為：

```markdown
Most distributions don't ship `socat` by default. mole's preflight detects
this on first connect and prints the distro-aware install one-liner —
for example `sudo apt install socat xclip` on Debian/Ubuntu, `sudo dnf
install socat xclip` on RHEL/Fedora, or `sudo pacman -S socat xclip` on
Arch. mole does not auto-run these (sudo + system package manager is
intentionally manual).

The mole `xclip` shim, in contrast, lives in `~/.local/bin/` and needs no
sudo. mole's preflight installs (or updates) the shim automatically on
first connect after asking for confirmation.
```

把「`remote/install.sh` auto-appends...」段保留為手動 fallback 說明：

```markdown
For air-gapped hosts where you can't run `mole`, the legacy manual path
still works:

\`\`\`bash
scp remote/xclip remote/install.sh <host>:/tmp/
ssh <host> 'bash /tmp/install.sh'
\`\`\`

`remote/install.sh` auto-appends `export PATH="$HOME/.local/bin:$PATH"`
to `~/.bashrc` if missing.
```

- [ ] **Step 9.3: Commit**

```bash
git add README.md
git commit -m "docs: drop per-host setup; mole auto-installs shim now"
```

---

## Task 10: 最終驗證

跑完整測試 + typecheck + preview，確認沒有遺漏。**這個任務只跑檢查；如果有失敗則回填修正、重跑、commit**。

**Files:** —（驗證階段）

- [ ] **Step 10.1: bun test**

```
bun test
```

預期：所有 test 綠。失敗則 debug 並修正。

- [ ] **Step 10.2: typecheck**

```
bun run typecheck
```

預期：無錯。

- [ ] **Step 10.3: preview 全跑**

```
bun run preview
```

預期：所有 case 印出，無 React error、無 unmount 卡住。

- [ ] **Step 10.4: 真機 smoke**

如果有可連的測試遠端：

```
bun run dev:cli
```

走 wizard 選 host → preflight 觀察：
- 已裝過 shim 的 host：preflight 全綠跑過
- 未裝 shim 的 host：看到 `mole shim not installed on <host>. Install now? [Y/n]`，按 Y 看到 spinner + `Installing mole shim on <host>…`，完成後繼續
- 缺 socat 的 host：看到 `socat not installed. Run: sudo apt install socat xclip`（依 distro）

如果無法真機測試，記下這項並通知使用者後續手動驗證。

- [ ] **Step 10.5: 若有最終調整，commit；否則計畫完成**

```bash
# 若有額外修正：
git add -p   # 選擇要進的檔
git commit -m "fix: <具體修正>"
```

---

## 完成準則

- [ ] `bun test` 全綠
- [ ] `bun run typecheck` 無錯
- [ ] `bun run preview` 印出所有 case 包含 4 個新 case
- [ ] 新增/修改的檔案均已 commit
- [ ] README per-host setup 段落已移除
- [ ] 全程符合 CLAUDE.md UX 規則（顏色/icon/spinner 來自 theme.ts）

---

## 風險與緩解

| 風險 | 緩解 |
| --- | --- |
| `useInput` hook 在 PreflightView 內條件呼叫違反 React rules | 用 `PromptInput` 子元件 + `isActive` 參數，hook 永遠呼叫 |
| Bun `import with { type: 'text' }` 在 `bun build --compile` 失敗 | Bun 1.1+ 已支援；若失敗則 fallback 為 build script 讀檔產生 .ts |
| heredoc terminator 與 shim 內容衝突 | startup assertion 在 dev / build 立即炸 |
| re-preflight 無限循環 | `remainingInstallAttempts: 1` 防呆 |
| 新 outcome `error` kind 跟現有 `error` step state 命名衝突 | outcome `kind` 是 `error`，UI state 是 `error`；分屬不同類型 (`PreflightOutcome.kind` vs `PreflightStepState`)；型別系統各自獨立 |
