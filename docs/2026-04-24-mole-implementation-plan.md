# mole Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作 mole — 一站式 Bun CLI，讓多台 Mac 透過 SSH reverse tunnel + Unix socket 把剪貼簿和 Chrome debug port 送到 Linux remote，搭配 ink TUI 做 host / Chrome profile 的選擇與 preflight。

**Architecture:** CLI（Bun + ink）編排流程，spawn 一次互動式 ssh 交出 TTY；mac-side daemon（Bun.serve over Unix socket）讀 `pngpaste`；remote 端一個 bash xclip shim 攔截剪貼簿呼叫 + socat 把 TCP 9222 橋接到 Unix socket；`StreamLocalBindUnlink=yes` 保證多 Mac last-writer-wins。

**Tech Stack:** Bun 1.x、TypeScript、React、ink（TUI）、Bash（remote shim）、socat（remote 橋接）、launchd（macOS service）。

參考設計 spec：`docs/2026-04-24-mole-design.md`

---

## Task 1: 專案 bootstrap（package.json、tsconfig、資料夾骨架）

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bunfig.toml`
- Create: `src/types.ts`
- Create: 空目錄 `src/cli/hooks/`、`src/lib/`、`src/daemon/`、`remote/`、`launchd/`、`scripts/`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "mole",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "mole": "./dist/mole",
    "mole-daemon": "./dist/mole-daemon"
  },
  "scripts": {
    "dev:cli": "bun run src/cli/index.tsx",
    "dev:daemon": "bun run src/daemon/main.ts",
    "test": "bun test",
    "build": "bash scripts/build.sh",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/bun": "^1.1.0",
    "ink-testing-library": "^4.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: 建立 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "types": ["bun-types"],
    "lib": ["ESNext"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: 建立 `bunfig.toml`**

```toml
[test]
preload = []
coverage = false
```

- [ ] **Step 4: 建立 `src/types.ts`（通用型別）**

```typescript
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

- [ ] **Step 5: 建立所有空目錄**

```bash
mkdir -p src/cli/hooks src/lib src/daemon remote launchd scripts tests/lib tests/daemon
```

- [ ] **Step 6: 安裝依賴**

```bash
bun install
```

Expected: `bun.lockb` 產生、`node_modules/` 建好、無錯誤。

- [ ] **Step 7: 確認 typecheck 通過**

```bash
bun run typecheck
```

Expected: 無輸出（表示 OK）或 "Found 0 errors"。

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json bunfig.toml bun.lockb src/types.ts src/
git commit -m "chore: bootstrap bun + ink project skeleton"
```

---

## Task 2: `lib/ssh-config.ts` — 解析 `~/.ssh/config`

**Files:**
- Test: `tests/lib/ssh-config.test.ts`
- Create: `src/lib/ssh-config.ts`

職責：從 ssh config 格式文字抽出 Host 條目，排除 wildcard（含 `*` 或 `?`）。提供純函數 `parseSshConfig(content)` 和讀檔版 `loadSshHosts(path?)`。

- [ ] **Step 1: 寫測試 — 基本 Host + HostName**

檔案 `tests/lib/ssh-config.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import { parseSshConfig } from '../../src/lib/ssh-config';

describe('parseSshConfig', () => {
  test('parses a single Host with HostName', () => {
    const input = `
Host foo
    HostName foo.example.com
    User alice
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.example.com' },
    ]);
  });

  test('parses multiple Host entries', () => {
    const input = `
Host foo
    HostName a.com
Host bar
    HostName b.com
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'a.com' },
      { name: 'bar', hostname: 'b.com' },
    ]);
  });

  test('skips wildcard Host entries', () => {
    const input = `
Host *
    IdentityFile ~/.ssh/id_rsa
Host foo
    HostName foo.com
Host *.internal
    User admin
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.com' },
    ]);
  });

  test('ignores comments and blank lines', () => {
    const input = `
# this is a comment
Host foo

    HostName foo.com
# trailing comment
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.com' },
    ]);
  });

  test('handles Host without HostName', () => {
    const input = `Host naked\n`;
    expect(parseSshConfig(input)).toEqual([{ name: 'naked' }]);
  });

  test('takes first name when Host line has multiple', () => {
    const input = `Host primary alias\n    HostName p.com\n`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'primary', hostname: 'p.com' },
    ]);
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/ssh-config.test.ts
```

Expected: 全部 fail，錯誤訊息類似 `Cannot find module '../../src/lib/ssh-config'`。

- [ ] **Step 3: 實作 `src/lib/ssh-config.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SshHost {
  name: string;
  hostname?: string;
}

export function parseSshConfig(content: string): SshHost[] {
  const hosts: SshHost[] = [];
  let current: SshHost | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const hostMatch = line.match(/^Host\s+(.+)$/i);
    if (hostMatch) {
      if (current) hosts.push(current);
      const firstName = hostMatch[1].split(/\s+/)[0];
      if (!firstName || firstName.includes('*') || firstName.includes('?')) {
        current = null;
      } else {
        current = { name: firstName };
      }
      continue;
    }

    if (!current) continue;

    const kv = line.match(/^(\S+)\s+(.+)$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key!.toLowerCase() === 'hostname') {
      current.hostname = value!.trim();
    }
  }

  if (current) hosts.push(current);
  return hosts;
}

export function loadSshHosts(
  configPath: string = join(homedir(), '.ssh', 'config'),
): SshHost[] {
  if (!existsSync(configPath)) return [];
  return parseSshConfig(readFileSync(configPath, 'utf8'));
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/ssh-config.test.ts
```

Expected: 全部 pass，`6 pass, 0 fail`。

- [ ] **Step 5: Commit**

```bash
git add src/lib/ssh-config.ts tests/lib/ssh-config.test.ts
git commit -m "feat(lib): parse ssh config and exclude wildcard hosts"
```

---

## Task 3: `lib/chrome-profile.ts` — Chrome profile 狀態偵測

**Files:**
- Test: `tests/lib/chrome-profile.test.ts`
- Create: `src/lib/chrome-profile.ts`

職責：掃描 `~/.chrome-profiles/`，對每個 profile 判斷 `free` / `stale` / `reusable` / `busy`。相依的 `readPidCmdline` 用 DI 讓測試可 mock。

- [ ] **Step 1: 寫測試 — parseLockTarget 和 isPidAlive**

檔案 `tests/lib/chrome-profile.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import {
  parseLockTarget,
  isPidAlive,
  checkProfileStatus,
  scanProfiles,
} from '../../src/lib/chrome-profile';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parseLockTarget', () => {
  test('extracts pid from hostname-pid format', () => {
    expect(parseLockTarget('MyMac.local-12345')).toBe(12345);
  });

  test('returns null for malformed target', () => {
    expect(parseLockTarget('no-pid-here')).toBe(null);
    expect(parseLockTarget('')).toBe(null);
  });

  test('extracts pid when hostname has hyphens', () => {
    expect(parseLockTarget('Mac-Work-Laptop-9876')).toBe(9876);
  });
});

describe('isPidAlive', () => {
  test('returns true for current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test('returns false for likely-dead pid', () => {
    expect(isPidAlive(999_999_999)).toBe(false);
  });
});

describe('checkProfileStatus', () => {
  const makeTempProfile = () => mkdtempSync(join(tmpdir(), 'mole-profile-'));

  test('no SingletonLock → free', async () => {
    const dir = makeTempProfile();
    try {
      const r = await checkProfileStatus(dir, async () => null);
      expect(r.status).toBe('free');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('lock pointing at dead pid → stale', async () => {
    const dir = makeTempProfile();
    try {
      symlinkSync('deadhost-999999999', join(dir, 'SingletonLock'));
      const r = await checkProfileStatus(dir, async () => null);
      expect(r.status).toBe('stale');
      expect(r.pid).toBe(999999999);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('lock pointing at live pid without debug port → busy', async () => {
    const dir = makeTempProfile();
    try {
      symlinkSync(`host-${process.pid}`, join(dir, 'SingletonLock'));
      const r = await checkProfileStatus(dir, async () => 'bun /some/thing');
      expect(r.status).toBe('busy');
      expect(r.pid).toBe(process.pid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('lock pointing at live pid with debug port → reusable', async () => {
    const dir = makeTempProfile();
    try {
      symlinkSync(`host-${process.pid}`, join(dir, 'SingletonLock'));
      const r = await checkProfileStatus(
        dir,
        async () =>
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9222 --user-data-dir=/foo',
      );
      expect(r.status).toBe('reusable');
      expect(r.pid).toBe(process.pid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scanProfiles', () => {
  test('returns empty when base dir does not exist', async () => {
    const r = await scanProfiles('/nonexistent/path/that/never/exists');
    expect(r).toEqual([]);
  });

  test('returns profile list with statuses', async () => {
    const base = mkdtempSync(join(tmpdir(), 'mole-base-'));
    try {
      mkdirSync(join(base, 'work'));
      mkdirSync(join(base, 'personal'));
      const r = await scanProfiles(base, async () => null);
      const names = r.map((p) => p.name).sort();
      expect(names).toEqual(['personal', 'work']);
      expect(r.every((p) => p.status === 'free')).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/chrome-profile.test.ts
```

Expected: 全部 fail，`Cannot find module` 或類似訊息。

- [ ] **Step 3: 實作 `src/lib/chrome-profile.ts`**

```typescript
import { existsSync, readdirSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ProfileStatus = 'free' | 'stale' | 'reusable' | 'busy';

export interface ProfileInfo {
  name: string;
  path: string;
  status: ProfileStatus;
  pid?: number;
}

export function parseLockTarget(target: string): number | null {
  const match = target.match(/-(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readPidCmdline(pid: number): Promise<string | null> {
  const proc = Bun.spawn(['ps', '-p', String(pid), '-o', 'command='], {
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) return null;
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type GetCmdline = (pid: number) => Promise<string | null>;

export async function checkProfileStatus(
  profilePath: string,
  getCmdline: GetCmdline = readPidCmdline,
): Promise<{ status: ProfileStatus; pid?: number }> {
  const lockPath = join(profilePath, 'SingletonLock');

  let target: string;
  try {
    target = readlinkSync(lockPath);
  } catch {
    return { status: 'free' };
  }

  const pid = parseLockTarget(target);
  if (pid === null) return { status: 'free' };

  if (!isPidAlive(pid)) {
    return { status: 'stale', pid };
  }

  const cmdline = await getCmdline(pid);
  if (cmdline && cmdline.includes('--remote-debugging-port')) {
    return { status: 'reusable', pid };
  }

  return { status: 'busy', pid };
}

export async function scanProfiles(
  baseDir: string = join(homedir(), '.chrome-profiles'),
  getCmdline: GetCmdline = readPidCmdline,
): Promise<ProfileInfo[]> {
  if (!existsSync(baseDir)) return [];

  const entries = readdirSync(baseDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const results: ProfileInfo[] = [];
  for (const e of dirs) {
    const path = join(baseDir, e.name);
    const { status, pid } = await checkProfileStatus(path, getCmdline);
    results.push({ name: e.name, path, status, pid });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/chrome-profile.test.ts
```

Expected: 全部 pass。

- [ ] **Step 5: Commit**

```bash
git add src/lib/chrome-profile.ts tests/lib/chrome-profile.test.ts
git commit -m "feat(lib): detect chrome profile lock status (free/stale/reusable/busy)"
```

---

## Task 4: `lib/clipboard.ts` — 讀取 macOS 剪貼簿（pngpaste）

**Files:**
- Test: `tests/lib/clipboard.test.ts`
- Create: `src/lib/clipboard.ts`

職責：抽出一層 `readClipboard()` 接 `pngpaste -`；把 spawn 的細節用 DI 讓測試可 mock。

- [ ] **Step 1: 寫測試**

檔案 `tests/lib/clipboard.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import { readClipboardWith } from '../../src/lib/clipboard';

describe('readClipboardWith', () => {
  test('returns image when spawn yields bytes and exit code 0', async () => {
    const r = await readClipboardWith(async () => ({
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      code: 0,
    }));
    expect(r.type).toBe('image');
    if (r.type === 'image') {
      expect(r.format).toBe('png');
      expect(r.data.byteLength).toBe(4);
    }
  });

  test('returns empty when spawn exits non-zero', async () => {
    const r = await readClipboardWith(async () => ({
      data: new Uint8Array(),
      code: 1,
    }));
    expect(r.type).toBe('empty');
  });

  test('returns empty when stdout is zero bytes', async () => {
    const r = await readClipboardWith(async () => ({
      data: new Uint8Array(),
      code: 0,
    }));
    expect(r.type).toBe('empty');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
bun test tests/lib/clipboard.test.ts
```

Expected: `Cannot find module`.

- [ ] **Step 3: 實作 `src/lib/clipboard.ts`**

```typescript
export type ClipboardResult =
  | { type: 'image'; format: 'png'; data: Uint8Array }
  | { type: 'empty' };

export type ClipboardRunner = () => Promise<{
  data: Uint8Array;
  code: number;
}>;

export async function readClipboardWith(
  run: ClipboardRunner,
): Promise<ClipboardResult> {
  const { data, code } = await run();
  if (code !== 0 || data.byteLength === 0) {
    return { type: 'empty' };
  }
  return { type: 'image', format: 'png', data };
}

export async function readClipboard(): Promise<ClipboardResult> {
  return readClipboardWith(async () => {
    const proc = Bun.spawn(['pngpaste', '-'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const chunks: Uint8Array[] = [];
    for await (const chunk of proc.stdout) {
      chunks.push(chunk);
    }
    const code = await proc.exited;
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const data = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.byteLength;
    }
    return { data, code };
  });
}
```

- [ ] **Step 4: 跑測試確認 pass**

```bash
bun test tests/lib/clipboard.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/clipboard.ts tests/lib/clipboard.test.ts
git commit -m "feat(lib): add clipboard reader wrapping pngpaste"
```

---

## Task 5: Daemon — Bun.serve over Unix socket

**Files:**
- Test: `tests/daemon/server.test.ts`
- Create: `src/daemon/server.ts`
- Create: `src/daemon/main.ts`

職責：`createServer(socketPath, readClipboardFn)` 啟動 HTTP over Unix socket，支援 `GET /type` 和 `GET /image`。`main.ts` 是 bin entry，從環境變數或預設路徑拿 socket path。

- [ ] **Step 1: 寫測試**

檔案 `tests/daemon/server.test.ts`：

```typescript
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { createServer } from '../../src/daemon/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClipboardResult } from '../../src/lib/clipboard';

describe('daemon server', () => {
  let tempDir: string;
  let sockPath: string;
  let server: { stop: () => Promise<void> };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mole-sock-'));
    sockPath = join(tempDir, 'test.sock');
  });

  afterEach(async () => {
    if (server) await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('GET /type returns image when clipboard has image', async () => {
    server = await createServer(sockPath, async (): Promise<ClipboardResult> => ({
      type: 'image',
      format: 'png',
      data: new Uint8Array([1, 2, 3]),
    }));
    const r = await fetch('http://x/type', { unix: sockPath });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ type: 'image', format: 'png' });
  });

  test('GET /type returns empty when no image', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/type', { unix: sockPath });
    expect(await r.json()).toEqual({ type: 'empty' });
  });

  test('GET /image returns bytes with image/png content type', async () => {
    server = await createServer(sockPath, async () => ({
      type: 'image',
      format: 'png',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    }));
    const r = await fetch('http://x/image', { unix: sockPath });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    const buf = new Uint8Array(await r.arrayBuffer());
    expect(buf.byteLength).toBe(8);
    expect(buf[0]).toBe(0x89);
  });

  test('GET /image returns 404 when clipboard empty', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/image', { unix: sockPath });
    expect(r.status).toBe(404);
  });

  test('unknown path returns 404', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/whatever', { unix: sockPath });
    expect(r.status).toBe(404);
  });

  test('re-creating server on same socket path succeeds (unlinks stale)', async () => {
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    await server.stop();
    server = await createServer(sockPath, async () => ({ type: 'empty' }));
    const r = await fetch('http://x/type', { unix: sockPath });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
bun test tests/daemon/server.test.ts
```

Expected: `Cannot find module`.

- [ ] **Step 3: 實作 `src/daemon/server.ts`**

```typescript
import { existsSync, unlinkSync } from 'node:fs';
import type { ClipboardResult } from '../lib/clipboard';

export type ReadClipboardFn = () => Promise<ClipboardResult>;

export interface MoleServer {
  socketPath: string;
  stop: () => Promise<void>;
}

export async function createServer(
  socketPath: string,
  readClipboard: ReadClipboardFn,
): Promise<MoleServer> {
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // ignore
    }
  }

  const server = Bun.serve({
    unix: socketPath,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/type') {
        const r = await readClipboard();
        if (r.type === 'image') {
          return Response.json({ type: 'image', format: r.format });
        }
        return Response.json({ type: 'empty' });
      }
      if (url.pathname === '/image') {
        const r = await readClipboard();
        if (r.type !== 'image') {
          return new Response('no image', { status: 404 });
        }
        return new Response(r.data, {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return new Response('not found', { status: 404 });
    },
  });

  return {
    socketPath,
    stop: async () => {
      server.stop(true);
      if (existsSync(socketPath)) {
        try {
          unlinkSync(socketPath);
        } catch {
          // ignore
        }
      }
    },
  };
}
```

- [ ] **Step 4: 跑測試確認 pass**

```bash
bun test tests/daemon/server.test.ts
```

Expected: 6 pass。

- [ ] **Step 5: 建立 `src/daemon/main.ts` 作為 bin entry**

```typescript
import { createServer } from './server';
import { readClipboard } from '../lib/clipboard';

const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
const server = await createServer(socketPath, readClipboard);
console.log(`mole-daemon listening on ${server.socketPath}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 6: 手動煙霧測試**

```bash
bun run src/daemon/main.ts &
DAEMON_PID=$!
sleep 0.3
curl --unix-socket /tmp/mole-clip.sock http://x/type
# Expected: {"type":"empty"} 或 {"type":"image","format":"png"}（看剪貼簿狀態）
kill $DAEMON_PID
```

- [ ] **Step 7: Commit**

```bash
git add src/daemon/ tests/daemon/
git commit -m "feat(daemon): HTTP-over-unix-socket server with /type and /image endpoints"
```

---

## Task 6: Remote 假 xclip shim（bash）

**Files:**
- Create: `remote/xclip`

職責：bash script 偽裝 xclip，解析 Claude Code 的呼叫模式，向 Unix socket 查資料；其他呼叫 pass-through 到真 xclip。

- [ ] **Step 1: 撰寫 shim**

檔案 `remote/xclip`：

```bash
#!/usr/bin/env bash
# mole fake xclip — intercepts clipboard image reads and serves from mole daemon
set -uo pipefail

SOCK="${MOLE_SOCKET:-/tmp/mole-clip.sock}"
REAL_XCLIP="${MOLE_REAL_XCLIP:-/usr/bin/xclip}"
FETCH_TIMEOUT="${MOLE_FETCH_TIMEOUT:-5}"

log() {
  [ "${MOLE_DEBUG:-}" = "1" ] && echo "mole-xclip: $*" >&2
}

fallback() {
  log "falling back to $REAL_XCLIP $*"
  exec "$REAL_XCLIP" "$@"
}

has_socket() {
  [ -S "$SOCK" ]
}

fetch_type() {
  curl -sf --max-time "$FETCH_TIMEOUT" --unix-socket "$SOCK" http://x/type
}

fetch_image() {
  curl -sf --max-time "$FETCH_TIMEOUT" --unix-socket "$SOCK" http://x/image
}

args="$*"

case "$args" in
  *"-selection clipboard"*"-t TARGETS"*"-o"*)
    log "intercepting TARGETS query"
    if ! has_socket; then fallback "$@"; fi
    resp="$(fetch_type 2>/dev/null)" || fallback "$@"
    if echo "$resp" | grep -q '"type":"image"'; then
      echo "image/png"
      exit 0
    fi
    fallback "$@"
    ;;
  *"-selection clipboard"*"-t image/png"*"-o"*)
    log "intercepting image/png fetch"
    if ! has_socket; then fallback "$@"; fi
    tmp="$(mktemp)" || fallback "$@"
    if curl -sf --max-time "$FETCH_TIMEOUT" --unix-socket "$SOCK" http://x/image -o "$tmp"; then
      if [ -s "$tmp" ]; then
        cat "$tmp"
        rm -f "$tmp"
        exit 0
      fi
    fi
    rm -f "$tmp"
    fallback "$@"
    ;;
  *)
    fallback "$@"
    ;;
esac
```

- [ ] **Step 2: 加執行權限（在 repo 裡存檔後需要 git 記住 mode）**

```bash
chmod +x remote/xclip
git update-index --chmod=+x remote/xclip 2>/dev/null || true
```

- [ ] **Step 3: 本機 shim 煙霧測試（確認 fallback 行為不爛；不需要真 daemon）**

```bash
MOLE_SOCKET=/nonexistent MOLE_REAL_XCLIP=/usr/bin/echo \
  bash remote/xclip -selection clipboard -t TARGETS -o
# Expected: echo 輸出 `-selection clipboard -t TARGETS -o`（代表 exec 到 REAL_XCLIP）
```

- [ ] **Step 4: Commit**

```bash
git add remote/xclip
git commit -m "feat(remote): add fake xclip shim for clipboard interception"
```

---

## Task 7: Remote install 腳本

**Files:**
- Create: `remote/install.sh`

職責：部署 xclip shim 到 remote `~/.local/bin/xclip`，確認前置工具（`/usr/bin/xclip`、`socat`、`curl`），並建議 PATH 設定。

- [ ] **Step 1: 撰寫腳本**

檔案 `remote/install.sh`：

```bash
#!/usr/bin/env bash
# mole remote install — run this on the remote host
set -euo pipefail

BIN_DIR="$HOME/.local/bin"
XCLIP_SHIM="$BIN_DIR/xclip"

missing=()
for cmd in socat curl bash; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "ERROR: missing required commands: ${missing[*]}" >&2
  echo "Install them first (e.g. 'sudo apt install ${missing[*]}')" >&2
  exit 1
fi

if [ ! -x /usr/bin/xclip ]; then
  echo "WARNING: /usr/bin/xclip not found. Non-image clipboard operations will fail." >&2
  echo "Install with: sudo apt install xclip" >&2
fi

mkdir -p "$BIN_DIR"

# shim is expected to be in the same directory as this script
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$script_dir/xclip"
if [ ! -f "$src" ]; then
  echo "ERROR: cannot find xclip shim at $src" >&2
  exit 2
fi

cp "$src" "$XCLIP_SHIM"
chmod +x "$XCLIP_SHIM"
echo "Installed shim: $XCLIP_SHIM"

case ":$PATH:" in
  *":$BIN_DIR:"*)
    echo "PATH already includes $BIN_DIR"
    ;;
  *)
    echo "WARNING: $BIN_DIR is not in your PATH."
    echo "Add this to your ~/.bashrc or ~/.zshrc:"
    echo ''
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac

echo "Done. Run 'which xclip' to verify it points to $XCLIP_SHIM"
```

- [ ] **Step 2: 加執行權限**

```bash
chmod +x remote/install.sh
git update-index --chmod=+x remote/install.sh 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add remote/install.sh
git commit -m "feat(remote): add install script to deploy shim and verify prereqs"
```

---

## Task 8: `lib/ssh-session.ts` — SSH command builder

**Files:**
- Test: `tests/lib/ssh-session.test.ts`
- Create: `src/lib/ssh-session.ts`

職責：純函數 `buildSshArgs(opts)` 組 ssh 參數（方便測）；加一層 `spawnSsh(opts)` 做實際 spawn。

- [ ] **Step 1: 寫測試**

檔案 `tests/lib/ssh-session.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import { buildSshArgs } from '../../src/lib/ssh-session';

describe('buildSshArgs', () => {
  test('uses defaults', () => {
    expect(buildSshArgs({ host: 'prod' })).toEqual([
      '-o', 'StreamLocalBindUnlink=yes',
      '-o', 'ExitOnForwardFailure=no',
      '-R', '/tmp/mole-clip.sock:/tmp/mole-clip.sock',
      '-R', '/tmp/mole-chrome.sock:127.0.0.1:9222',
      'prod',
    ]);
  });

  test('respects custom socket paths and port', () => {
    expect(
      buildSshArgs({
        host: 'dev',
        clipSocket: '/tmp/a.sock',
        chromeSocket: '/tmp/b.sock',
        chromePort: 9333,
      }),
    ).toEqual([
      '-o', 'StreamLocalBindUnlink=yes',
      '-o', 'ExitOnForwardFailure=no',
      '-R', '/tmp/a.sock:/tmp/a.sock',
      '-R', '/tmp/b.sock:127.0.0.1:9333',
      'dev',
    ]);
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/ssh-session.test.ts
```

- [ ] **Step 3: 實作 `src/lib/ssh-session.ts`**

```typescript
export interface SshOptions {
  host: string;
  clipSocket?: string;
  chromeSocket?: string;
  chromePort?: number;
}

export function buildSshArgs(opts: SshOptions): string[] {
  const clip = opts.clipSocket ?? '/tmp/mole-clip.sock';
  const chrome = opts.chromeSocket ?? '/tmp/mole-chrome.sock';
  const port = opts.chromePort ?? 9222;
  return [
    '-o', 'StreamLocalBindUnlink=yes',
    '-o', 'ExitOnForwardFailure=no',
    '-R', `${clip}:${clip}`,
    '-R', `${chrome}:127.0.0.1:${port}`,
    opts.host,
  ];
}

export function spawnSsh(opts: SshOptions): Bun.Subprocess {
  return Bun.spawn(['ssh', ...buildSshArgs(opts)], {
    stdio: ['inherit', 'inherit', 'inherit'],
  });
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/ssh-session.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ssh-session.ts tests/lib/ssh-session.test.ts
git commit -m "feat(lib): build ssh args with reverse forwards and unlink flag"
```

---

## Task 9: `lib/chrome-launcher.ts` — Chrome 啟動指令

**Files:**
- Test: `tests/lib/chrome-launcher.test.ts`
- Create: `src/lib/chrome-launcher.ts`

職責：`buildChromeArgs(opts)` 組 `open` 的參數；`launchChrome(opts)` 做 detached spawn，立刻 return。

- [ ] **Step 1: 寫測試**

檔案 `tests/lib/chrome-launcher.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import { buildChromeArgs } from '../../src/lib/chrome-launcher';

describe('buildChromeArgs', () => {
  test('produces open args with user-data-dir and remote debugging', () => {
    expect(
      buildChromeArgs({ profilePath: '/Users/x/.chrome-profiles/work' }),
    ).toEqual([
      '-na',
      'Google Chrome',
      '--args',
      '--user-data-dir=/Users/x/.chrome-profiles/work',
      '--remote-debugging-port=9222',
      '--remote-allow-origins=*',
    ]);
  });

  test('respects custom port', () => {
    const args = buildChromeArgs({
      profilePath: '/tmp/p',
      port: 9300,
    });
    expect(args).toContain('--remote-debugging-port=9300');
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/chrome-launcher.test.ts
```

- [ ] **Step 3: 實作 `src/lib/chrome-launcher.ts`**

```typescript
export interface ChromeLaunchOptions {
  profilePath: string;
  port?: number;
}

export function buildChromeArgs(opts: ChromeLaunchOptions): string[] {
  const port = opts.port ?? 9222;
  return [
    '-na',
    'Google Chrome',
    '--args',
    `--user-data-dir=${opts.profilePath}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
  ];
}

export function launchChrome(opts: ChromeLaunchOptions): void {
  Bun.spawn(['open', ...buildChromeArgs(opts)], {
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/chrome-launcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/chrome-launcher.ts tests/lib/chrome-launcher.test.ts
git commit -m "feat(lib): build chrome launch args and detached spawn"
```

---

## Task 10: `lib/remote-preflight.ts` — Remote preflight script

**Files:**
- Test: `tests/lib/remote-preflight.test.ts`
- Create: `src/lib/remote-preflight.ts`

職責：組 preflight bash script（檢查 socat、shim、啟動 socat）；runner 透過 ssh 執行並解析 socat PID。Runner 本身用 DI 讓測試可 mock。

- [ ] **Step 1: 寫測試**

檔案 `tests/lib/remote-preflight.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import {
  buildPreflightScript,
  runPreflightWith,
} from '../../src/lib/remote-preflight';

describe('buildPreflightScript', () => {
  test('checks socat, shim, starts socat, prints pid', () => {
    const script = buildPreflightScript({
      chromeSocket: '/tmp/mole-chrome.sock',
      chromePort: 9222,
    });
    expect(script).toContain('command -v socat');
    expect(script).toContain('$HOME/.local/bin/xclip');
    expect(script).toContain('pgrep -f');
    expect(script).toContain('socat TCP-LISTEN:9222');
    expect(script).toContain('UNIX-CONNECT:/tmp/mole-chrome.sock');
  });
});

describe('runPreflightWith', () => {
  test('returns ok with socat pid on success', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '12345\n',
      stderr: '',
      code: 0,
    }));
    expect(r.ok).toBe(true);
    expect(r.socatPid).toBe(12345);
  });

  test('returns not ok with errors on non-zero exit', async () => {
    const r = await runPreflightWith('host', async () => ({
      stdout: '',
      stderr: 'ERROR: socat not installed on remote\n',
      code: 1,
    }));
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(['ERROR: socat not installed on remote']);
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/remote-preflight.test.ts
```

- [ ] **Step 3: 實作 `src/lib/remote-preflight.ts`**

```typescript
export interface PreflightOptions {
  chromeSocket?: string;
  chromePort?: number;
}

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  socatPid?: number;
}

export function buildPreflightScript(opts: PreflightOptions = {}): string {
  const sock = opts.chromeSocket ?? '/tmp/mole-chrome.sock';
  const port = opts.chromePort ?? 9222;
  return `
set -eu
if ! command -v socat >/dev/null 2>&1; then
  echo "ERROR: socat not installed on remote" >&2
  exit 1
fi
if [ ! -x "$HOME/.local/bin/xclip" ]; then
  echo "ERROR: fake xclip not installed at ~/.local/bin/xclip; run remote/install.sh" >&2
  exit 2
fi
if ! pgrep -f 'socat.*mole-chrome' >/dev/null 2>&1; then
  nohup socat TCP-LISTEN:${port},bind=127.0.0.1,reuseaddr,fork UNIX-CONNECT:${sock} >/dev/null 2>&1 </dev/null &
  sleep 0.2
fi
pgrep -f 'socat.*mole-chrome' | head -1
`.trim();
}

export type SshRunner = (
  host: string,
  script: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export async function runPreflightWith(
  host: string,
  runner: SshRunner,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  const script = buildPreflightScript(opts);
  const { stdout, stderr, code } = await runner(host, script);
  if (code !== 0) {
    const errors = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
    return { ok: false, errors };
  }
  const pid = parseInt(stdout.trim(), 10);
  return {
    ok: true,
    errors: [],
    socatPid: Number.isFinite(pid) ? pid : undefined,
  };
}

export async function runPreflight(
  host: string,
  opts: PreflightOptions = {},
): Promise<PreflightResult> {
  return runPreflightWith(
    host,
    async (h, script) => {
      const proc = Bun.spawn(['ssh', h, 'bash', '-s'], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      proc.stdin.write(script);
      proc.stdin.end();
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const code = await proc.exited;
      return { stdout, stderr, code };
    },
    opts,
  );
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/remote-preflight.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/remote-preflight.ts tests/lib/remote-preflight.test.ts
git commit -m "feat(lib): build and run remote preflight script"
```

---

## Task 11: `lib/remote-cleanup.ts` — 結束時 kill remote socat

**Files:**
- Test: `tests/lib/remote-cleanup.test.ts`
- Create: `src/lib/remote-cleanup.ts`

職責：給定 host + socat PID，透過 ssh 發送 `kill` 關掉它。同樣以 DI 方式讓測試可 mock。

- [ ] **Step 1: 寫測試**

檔案 `tests/lib/remote-cleanup.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import { buildCleanupScript, runCleanupWith } from '../../src/lib/remote-cleanup';

describe('buildCleanupScript', () => {
  test('kills only the given pid if it still matches socat pattern', () => {
    const s = buildCleanupScript(12345);
    expect(s).toContain('12345');
    expect(s).toContain('socat.*mole-chrome');
  });
});

describe('runCleanupWith', () => {
  test('resolves ok on code 0', async () => {
    const r = await runCleanupWith('host', 42, async () => ({
      stdout: '',
      stderr: '',
      code: 0,
    }));
    expect(r.ok).toBe(true);
  });

  test('captures stderr on non-zero', async () => {
    const r = await runCleanupWith('host', 42, async () => ({
      stdout: '',
      stderr: 'No such process\n',
      code: 1,
    }));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('No such process');
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/remote-cleanup.test.ts
```

- [ ] **Step 3: 實作 `src/lib/remote-cleanup.ts`**

```typescript
export function buildCleanupScript(socatPid: number): string {
  return `
pid=${socatPid}
if ps -p "$pid" -o args= 2>/dev/null | grep -q 'socat.*mole-chrome'; then
  kill "$pid" 2>/dev/null || true
fi
`.trim();
}

export type SshRunner = (
  host: string,
  script: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export async function runCleanupWith(
  host: string,
  socatPid: number,
  runner: SshRunner,
): Promise<{ ok: boolean; error?: string }> {
  const { stderr, code } = await runner(host, buildCleanupScript(socatPid));
  if (code === 0) return { ok: true };
  return { ok: false, error: stderr.trim() };
}

export async function runCleanup(
  host: string,
  socatPid: number,
): Promise<{ ok: boolean; error?: string }> {
  return runCleanupWith(host, socatPid, async (h, script) => {
    const proc = Bun.spawn(['ssh', h, 'bash', '-s'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    proc.stdin.write(script);
    proc.stdin.end();
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    return { stdout, stderr, code };
  });
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/remote-cleanup.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/remote-cleanup.ts tests/lib/remote-cleanup.test.ts
git commit -m "feat(lib): remote cleanup to kill socat after ssh exits"
```

---

## Task 12: Ink 自訂 `SelectList` 元件

**Files:**
- Test: `tests/cli/select-list.test.tsx`
- Create: `src/cli/components/select-list.tsx`

職責：可鍵盤導覽、支援 `disabled` item 自動跳過、render 當前 highlight。用 `ink-testing-library` 做快照 + 輸入模擬。

- [ ] **Step 1: 寫測試**

檔案 `tests/cli/select-list.test.tsx`：

```tsx
import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { SelectList } from '../../src/cli/components/select-list';

describe('SelectList', () => {
  const items = [
    { key: 'a', label: 'Alpha', value: 'a' },
    { key: 'b', label: 'Beta', value: 'b', disabled: true },
    { key: 'c', label: 'Gamma', value: 'c' },
  ];

  test('renders all items and marks highlight', () => {
    const { lastFrame } = render(
      <SelectList items={items} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
    expect(out).toContain('Gamma');
    expect(out).toMatch(/›\s*Alpha/);
  });

  test('down arrow skips disabled items', () => {
    const { stdin, lastFrame } = render(
      <SelectList items={items} onSelect={() => {}} />,
    );
    stdin.write('[B'); // down arrow
    const out = lastFrame()!;
    expect(out).toMatch(/›\s*Gamma/);
    expect(out).not.toMatch(/›\s*Beta/);
  });

  test('enter calls onSelect with current value', async () => {
    let selected: string | null = null;
    const { stdin } = render(
      <SelectList
        items={items}
        onSelect={(v) => {
          selected = v;
        }}
      />,
    );
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(selected).toBe('a');
  });

  test('enter on disabled does nothing', async () => {
    const itemsAllDisabled = [
      { key: 'a', label: 'A', value: 'a', disabled: true },
    ];
    let selected: string | null = null;
    const { stdin } = render(
      <SelectList
        items={itemsAllDisabled}
        onSelect={(v) => {
          selected = v;
        }}
      />,
    );
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(selected).toBe(null);
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/cli/select-list.test.tsx
```

- [ ] **Step 3: 實作 `src/cli/components/select-list.tsx`**

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface SelectItem<T> {
  key: string;
  label: string;
  value: T;
  disabled?: boolean;
}

export interface SelectListProps<T> {
  items: SelectItem<T>[];
  onSelect: (value: T) => void;
}

function firstEnabledIndex<T>(items: SelectItem<T>[]): number {
  const idx = items.findIndex((i) => !i.disabled);
  return idx === -1 ? 0 : idx;
}

export function SelectList<T>({ items, onSelect }: SelectListProps<T>) {
  const [index, setIndex] = useState(() => firstEnabledIndex(items));

  useInput((_input, key) => {
    if (key.upArrow) {
      let i = index - 1;
      while (i >= 0 && items[i]?.disabled) i--;
      if (i >= 0) setIndex(i);
    } else if (key.downArrow) {
      let i = index + 1;
      while (i < items.length && items[i]?.disabled) i++;
      if (i < items.length) setIndex(i);
    } else if (key.return) {
      const current = items[index];
      if (current && !current.disabled) onSelect(current.value);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const isActive = i === index && !item.disabled;
        const marker = i === index ? '›' : ' ';
        return (
          <Text
            key={item.key}
            color={isActive ? 'cyan' : undefined}
            dimColor={item.disabled}
          >
            {marker} {item.label}
          </Text>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/cli/select-list.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/components/select-list.tsx tests/cli/select-list.test.tsx
git commit -m "feat(cli): keyboard-navigable select list with disabled-skip"
```

---

## Task 13: `cli/host-picker.tsx` — Host 選擇 TUI

**Files:**
- Test: `tests/cli/host-picker.test.tsx`
- Create: `src/cli/host-picker.tsx`

職責：拿 `SshHost[]`，顯示成 select list，`onSelect` 回傳選中的 host。

- [ ] **Step 1: 寫測試**

檔案 `tests/cli/host-picker.test.tsx`：

```tsx
import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { HostPicker } from '../../src/cli/host-picker';

describe('HostPicker', () => {
  const hosts = [
    { name: 'prod', hostname: 'prod.example.com' },
    { name: 'dev', hostname: 'dev.example.com' },
  ];

  test('renders both hosts with hostname', () => {
    const { lastFrame } = render(
      <HostPicker hosts={hosts} onSelect={() => {}} />,
    );
    const out = lastFrame()!;
    expect(out).toContain('prod');
    expect(out).toContain('prod.example.com');
    expect(out).toContain('dev');
  });

  test('enter selects first host', async () => {
    let selected: string | null = null;
    const { stdin } = render(
      <HostPicker
        hosts={hosts}
        onSelect={(h) => {
          selected = h.name;
        }}
      />,
    );
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(selected).toBe('prod');
  });

  test('shows empty message when no hosts', () => {
    const { lastFrame } = render(<HostPicker hosts={[]} onSelect={() => {}} />);
    expect(lastFrame()).toContain('No SSH hosts');
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/cli/host-picker.test.tsx
```

- [ ] **Step 3: 實作 `src/cli/host-picker.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './components/select-list';
import type { SshHost } from '../lib/ssh-config';

export interface HostPickerProps {
  hosts: SshHost[];
  onSelect: (host: SshHost) => void;
}

export const HostPicker: React.FC<HostPickerProps> = ({ hosts, onSelect }) => {
  if (hosts.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No SSH hosts found in ~/.ssh/config.</Text>
        <Text dimColor>Add a Host entry first, then re-run mole.</Text>
      </Box>
    );
  }

  const items = hosts.map((h) => ({
    key: h.name,
    label: h.hostname ? `${h.name}  ${h.hostname}` : h.name,
    value: h,
  }));

  return (
    <Box flexDirection="column">
      <Text bold>Select SSH host</Text>
      <SelectList items={items} onSelect={onSelect} />
    </Box>
  );
};
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/cli/host-picker.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/host-picker.tsx tests/cli/host-picker.test.tsx
git commit -m "feat(cli): host picker tui component"
```

---

## Task 14: `cli/hooks/use-profiles.ts` — 每秒 refresh hook

**Files:**
- Test: `tests/cli/use-profiles.test.tsx`
- Create: `src/cli/hooks/use-profiles.ts`

職責：在 ink component mount 時開始掃描 profiles，每秒更新 state，unmount 時清 interval。注入 scanner function 讓測試可 mock。

- [ ] **Step 1: 寫測試**

檔案 `tests/cli/use-profiles.test.tsx`：

```tsx
import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useProfiles } from '../../src/cli/hooks/use-profiles';
import type { ProfileInfo } from '../../src/lib/chrome-profile';

const Probe: React.FC<{
  scanner: () => Promise<ProfileInfo[]>;
  intervalMs: number;
}> = ({ scanner, intervalMs }) => {
  const profiles = useProfiles(scanner, intervalMs);
  return <Text>count={profiles.length}</Text>;
};

describe('useProfiles', () => {
  test('initial state empty, then populated after first scan', async () => {
    let calls = 0;
    const scanner = async (): Promise<ProfileInfo[]> => {
      calls++;
      return [{ name: 'work', path: '/tmp/work', status: 'free' }];
    };
    const { lastFrame } = render(<Probe scanner={scanner} intervalMs={50} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain('count=1');
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  test('re-scans periodically', async () => {
    let calls = 0;
    const scanner = async (): Promise<ProfileInfo[]> => {
      calls++;
      return [];
    };
    render(<Probe scanner={scanner} intervalMs={30} />);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/cli/use-profiles.test.tsx
```

- [ ] **Step 3: 實作 `src/cli/hooks/use-profiles.ts`**

```typescript
import { useEffect, useState } from 'react';
import type { ProfileInfo } from '../../lib/chrome-profile';
import { scanProfiles } from '../../lib/chrome-profile';

export type ProfileScanner = () => Promise<ProfileInfo[]>;

export function useProfiles(
  scanner: ProfileScanner = scanProfiles,
  intervalMs: number = 1000,
): ProfileInfo[] {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const p = await scanner();
        if (active) setProfiles(p);
      } catch {
        // swallow; keep previous state
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [scanner, intervalMs]);

  return profiles;
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/cli/use-profiles.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/hooks/use-profiles.ts tests/cli/use-profiles.test.tsx
git commit -m "feat(cli): useProfiles hook with periodic refresh"
```

---

## Task 15: `cli/profile-picker.tsx` — Chrome profile 選擇 TUI

**Files:**
- Test: `tests/cli/profile-picker.test.tsx`
- Create: `src/cli/profile-picker.tsx`

職責：讀 hook 拿 profiles，render 成 SelectList，busy profile disabled 顯示 grey，每 1s 自動 refresh。

- [ ] **Step 1: 寫測試**

檔案 `tests/cli/profile-picker.test.tsx`：

```tsx
import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { ProfilePicker } from '../../src/cli/profile-picker';
import type { ProfileInfo } from '../../src/lib/chrome-profile';

const makeScanner = (profiles: ProfileInfo[]) => async () => profiles;

describe('ProfilePicker', () => {
  test('renders status labels', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
      { name: 'heavy', path: '/p/heavy', status: 'busy', pid: 123 },
      { name: 'old', path: '/p/old', status: 'reusable', pid: 456 },
    ];
    const { lastFrame } = render(
      <ProfilePicker scanner={makeScanner(profiles)} intervalMs={20} onSelect={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 30));
    const out = lastFrame()!;
    expect(out).toContain('work');
    expect(out).toContain('free');
    expect(out).toContain('heavy');
    expect(out).toContain('busy');
    expect(out).toContain('old');
    expect(out).toContain('reusable');
  });

  test('enter on busy does not call onSelect', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'busy1', path: '/p/b1', status: 'busy', pid: 1 },
    ];
    let selected: string | null = null;
    const { stdin } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={(p) => {
          selected = p.name;
        }}
      />,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(selected).toBe(null);
  });

  test('enter on free profile calls onSelect', async () => {
    const profiles: ProfileInfo[] = [
      { name: 'work', path: '/p/work', status: 'free' },
    ];
    let selected: string | null = null;
    const { stdin } = render(
      <ProfilePicker
        scanner={makeScanner(profiles)}
        intervalMs={20}
        onSelect={(p) => {
          selected = p.name;
        }}
      />,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write('\r');
    await new Promise((r) => setTimeout(r, 10));
    expect(selected).toBe('work');
  });

  test('shows empty message when no profiles', () => {
    const { lastFrame } = render(
      <ProfilePicker scanner={makeScanner([])} intervalMs={20} onSelect={() => {}} />,
    );
    expect(lastFrame()).toContain('No Chrome profiles');
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/cli/profile-picker.test.tsx
```

- [ ] **Step 3: 實作 `src/cli/profile-picker.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './components/select-list';
import { useProfiles } from './hooks/use-profiles';
import type { ProfileInfo, ProfileStatus } from '../lib/chrome-profile';
import { scanProfiles } from '../lib/chrome-profile';

const statusLabel = (s: ProfileStatus): string => {
  switch (s) {
    case 'free':
      return 'free';
    case 'stale':
      return 'stale lock (safe)';
    case 'reusable':
      return 'reusable — will attach';
    case 'busy':
      return 'busy (close non-debug Chrome first)';
  }
};

export interface ProfilePickerProps {
  onSelect: (profile: ProfileInfo) => void;
  scanner?: () => Promise<ProfileInfo[]>;
  intervalMs?: number;
}

export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  onSelect,
  scanner = scanProfiles,
  intervalMs = 1000,
}) => {
  const profiles = useProfiles(scanner, intervalMs);

  if (profiles.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No Chrome profiles found in ~/.chrome-profiles/.</Text>
        <Text dimColor>Create a directory there, then re-run mole.</Text>
      </Box>
    );
  }

  const items = profiles.map((p) => ({
    key: p.name,
    label: `${p.name.padEnd(16)}  ${statusLabel(p.status)}`,
    value: p,
    disabled: p.status === 'busy',
  }));

  return (
    <Box flexDirection="column">
      <Text bold>Select Chrome profile</Text>
      <SelectList items={items} onSelect={onSelect} />
    </Box>
  );
};
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/cli/profile-picker.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/profile-picker.tsx tests/cli/profile-picker.test.tsx
git commit -m "feat(cli): chrome profile picker with live status refresh"
```

---

## Task 16: `cli/preflight.tsx` — Preflight 進度 UI

**Files:**
- Test: `tests/cli/preflight.test.tsx`
- Create: `src/cli/preflight.tsx`

職責：顯示各步驟（Chrome、Daemon、Remote preflight）狀態，每步完成打勾或顯示錯誤。以 props 接收 orchestrator 傳入的步驟狀態，保持 UI 無副作用、易測。

- [ ] **Step 1: 寫測試**

檔案 `tests/cli/preflight.test.tsx`：

```tsx
import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { PreflightView } from '../../src/cli/preflight';

describe('PreflightView', () => {
  test('renders steps with pending/running/ok/error states', () => {
    const { lastFrame } = render(
      <PreflightView
        steps={[
          { id: 'chrome', label: 'Chrome', state: 'ok' },
          { id: 'daemon', label: 'Daemon', state: 'running' },
          { id: 'remote', label: 'Remote preflight', state: 'pending' },
        ]}
      />,
    );
    const out = lastFrame()!;
    expect(out).toMatch(/✓\s*Chrome/);
    expect(out).toMatch(/…\s*Daemon/);
    expect(out).toMatch(/·\s*Remote preflight/);
  });

  test('error state shows error message', () => {
    const { lastFrame } = render(
      <PreflightView
        steps={[
          {
            id: 'remote',
            label: 'Remote preflight',
            state: 'error',
            error: 'socat not installed',
          },
        ]}
      />,
    );
    const out = lastFrame()!;
    expect(out).toMatch(/✗\s*Remote preflight/);
    expect(out).toContain('socat not installed');
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/cli/preflight.test.tsx
```

- [ ] **Step 3: 實作 `src/cli/preflight.tsx`**

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export type PreflightStepState = 'pending' | 'running' | 'ok' | 'error';

export interface PreflightStep {
  id: string;
  label: string;
  state: PreflightStepState;
  error?: string;
}

const marker = (s: PreflightStepState): string => {
  switch (s) {
    case 'pending':
      return '·';
    case 'running':
      return '…';
    case 'ok':
      return '✓';
    case 'error':
      return '✗';
  }
};

const color = (s: PreflightStepState): string | undefined => {
  switch (s) {
    case 'ok':
      return 'green';
    case 'error':
      return 'red';
    case 'running':
      return 'cyan';
    default:
      return undefined;
  }
};

export interface PreflightViewProps {
  steps: PreflightStep[];
}

export const PreflightView: React.FC<PreflightViewProps> = ({ steps }) => (
  <Box flexDirection="column">
    {steps.map((s) => (
      <Box key={s.id} flexDirection="column">
        <Text color={color(s.state)}>
          {marker(s.state)} {s.label}
        </Text>
        {s.error ? <Text color="red">    {s.error}</Text> : null}
      </Box>
    ))}
  </Box>
);
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/cli/preflight.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/preflight.tsx tests/cli/preflight.test.tsx
git commit -m "feat(cli): preflight progress view"
```

---

## Task 17: Daemon 健康檢查 + launchd helper

**Files:**
- Test: `tests/lib/daemon-health.test.ts`
- Create: `src/lib/daemon-health.ts`

職責：輕量 helper，給定 socket path，透過 `fetch` 打 `/type` 看 daemon 活沒活。用 DI fetch，方便測。不自己包 `launchctl kickstart`（那是 install script 的事）。

- [ ] **Step 1: 寫測試**

檔案 `tests/lib/daemon-health.test.ts`：

```typescript
import { test, expect, describe } from 'bun:test';
import { isDaemonHealthyWith } from '../../src/lib/daemon-health';

describe('isDaemonHealthyWith', () => {
  test('returns true when fetch ok', async () => {
    const r = await isDaemonHealthyWith('/tmp/x.sock', async () =>
      new Response('{}', { status: 200 }),
    );
    expect(r).toBe(true);
  });

  test('returns false when fetch throws', async () => {
    const r = await isDaemonHealthyWith('/tmp/x.sock', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(r).toBe(false);
  });

  test('returns false on non-200 status', async () => {
    const r = await isDaemonHealthyWith('/tmp/x.sock', async () =>
      new Response('boom', { status: 500 }),
    );
    expect(r).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試、確認 fail**

```bash
bun test tests/lib/daemon-health.test.ts
```

- [ ] **Step 3: 實作 `src/lib/daemon-health.ts`**

```typescript
export type FetchFn = (url: string, init?: any) => Promise<Response>;

export async function isDaemonHealthyWith(
  socketPath: string,
  fetcher: FetchFn,
): Promise<boolean> {
  try {
    const r = await fetcher(`http://x/type`, { unix: socketPath });
    return r.ok;
  } catch {
    return false;
  }
}

export async function isDaemonHealthy(socketPath: string): Promise<boolean> {
  return isDaemonHealthyWith(socketPath, fetch);
}
```

- [ ] **Step 4: 跑測試、確認 pass**

```bash
bun test tests/lib/daemon-health.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/daemon-health.ts tests/lib/daemon-health.test.ts
git commit -m "feat(lib): daemon health check via unix-socket fetch"
```

---

## Task 18: Main orchestrator (`src/cli/index.tsx`)

**Files:**
- Create: `src/cli/index.tsx`

職責：串起整條流程——渲染 HostPicker → ProfilePicker → PreflightView，preflight 結束後 unmount ink、spawn ssh（TTY 交給它）、等 ssh 結束、呼叫 remote cleanup、process exit。

- [ ] **Step 1: 實作主流程**

檔案 `src/cli/index.tsx`：

```tsx
#!/usr/bin/env bun
import React, { useEffect, useState } from 'react';
import { render, Box, Text } from 'ink';
import { HostPicker } from './host-picker';
import { ProfilePicker } from './profile-picker';
import { PreflightView, type PreflightStep } from './preflight';
import { loadSshHosts, type SshHost } from '../lib/ssh-config';
import type { ProfileInfo } from '../lib/chrome-profile';
import { launchChrome } from '../lib/chrome-launcher';
import { isDaemonHealthy } from '../lib/daemon-health';
import { runPreflight } from '../lib/remote-preflight';
import { runCleanup } from '../lib/remote-cleanup';
import { spawnSsh } from '../lib/ssh-session';

async function pickHost(): Promise<SshHost | null> {
  const hosts = loadSshHosts();
  return new Promise((resolve) => {
    let picked = false;
    const app = render(
      <HostPicker
        hosts={hosts}
        onSelect={(h) => {
          picked = true;
          app.unmount();
          resolve(h);
        }}
      />,
    );
    app.waitUntilExit().then(() => {
      if (!picked) resolve(null);
    });
  });
}

async function pickProfile(): Promise<ProfileInfo | null> {
  return new Promise((resolve) => {
    let picked = false;
    const app = render(
      <ProfilePicker
        onSelect={(p) => {
          picked = true;
          app.unmount();
          resolve(p);
        }}
      />,
    );
    app.waitUntilExit().then(() => {
      if (!picked) resolve(null);
    });
  });
}

interface PreflightRunResult {
  socatPid?: number;
  ok: boolean;
}

async function runPreflightWithUi(
  host: SshHost,
  profile: ProfileInfo,
): Promise<PreflightRunResult> {
  let updateSteps: (fn: (s: PreflightStep[]) => PreflightStep[]) => void = () => {};
  let unmountApp: () => void = () => {};

  const Container: React.FC = () => {
    const [steps, setSteps] = useState<PreflightStep[]>([
      { id: 'chrome', label: `Chrome (profile: ${profile.name})`, state: 'pending' },
      { id: 'daemon', label: 'Mac daemon', state: 'pending' },
      { id: 'remote', label: `Remote preflight (${host.name})`, state: 'pending' },
    ]);
    updateSteps = setSteps;
    return <PreflightView steps={steps} />;
  };

  const app = render(<Container />);
  unmountApp = () => app.unmount();

  const setStep = (id: string, patch: Partial<PreflightStep>) => {
    updateSteps((steps) =>
      steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  // Step 1: Chrome
  setStep('chrome', { state: 'running' });
  if (profile.status === 'reusable') {
    setStep('chrome', { state: 'ok', label: `Chrome (reusing pid ${profile.pid})` });
  } else {
    launchChrome({ profilePath: profile.path });
    // give Chrome a moment to open the debug port
    await new Promise((r) => setTimeout(r, 1500));
    setStep('chrome', { state: 'ok' });
  }

  // Step 2: Daemon
  setStep('daemon', { state: 'running' });
  const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
  const healthy = await isDaemonHealthy(socketPath);
  if (!healthy) {
    setStep('daemon', {
      state: 'error',
      error:
        'Daemon not responding. Run: launchctl kickstart -k gui/$UID/com.h3l1o5.mole-daemon',
    });
    await new Promise((r) => setTimeout(r, 300));
    unmountApp();
    return { ok: false };
  }
  setStep('daemon', { state: 'ok' });

  // Step 3: Remote preflight
  setStep('remote', { state: 'running' });
  const r = await runPreflight(host.name);
  if (!r.ok) {
    setStep('remote', { state: 'error', error: r.errors.join('; ') });
    await new Promise((x) => setTimeout(x, 300));
    unmountApp();
    return { ok: false };
  }
  setStep('remote', { state: 'ok' });

  // small pause so user sees all green
  await new Promise((x) => setTimeout(x, 200));
  unmountApp();
  return { ok: true, socatPid: r.socatPid };
}

async function main() {
  const host = await pickHost();
  if (!host) process.exit(1);
  const profile = await pickProfile();
  if (!profile) process.exit(1);

  const pre = await runPreflightWithUi(host, profile);
  if (!pre.ok) process.exit(1);

  // hand TTY to ssh
  const ssh = spawnSsh({ host: host.name });
  await ssh.exited;

  // cleanup (silent)
  if (pre.socatPid !== undefined) {
    await runCleanup(host.name, pre.socatPid).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 本機互動式 smoke test（需要真的 ssh host；可先用假的 hostname 測 early exit）**

```bash
# 先確認 typecheck 不爛
bun run typecheck
```

Expected: 0 errors。

- [ ] **Step 3: 手動執行（如果你有可用的 ssh host）**

```bash
bun run src/cli/index.tsx
```

Expected: TUI 出現，選 host、選 profile、preflight、進 ssh。在 ssh 裡輸入 `exit` 回到本機 shell。這步是手動驗證，不自動。

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.tsx
git commit -m "feat(cli): main orchestrator wiring pickers, preflight, ssh, cleanup"
```

---

## Task 19: Build script（`bun build --compile`）

**Files:**
- Create: `scripts/build.sh`

職責：編譯 `src/cli/index.tsx` 和 `src/daemon/main.ts` 成 standalone binary 到 `dist/`。

- [ ] **Step 1: 撰寫 build 腳本**

檔案 `scripts/build.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

mkdir -p dist

echo "Building mole CLI..."
bun build \
  --compile \
  --minify \
  --target=bun-darwin-arm64 \
  --outfile=dist/mole \
  src/cli/index.tsx

echo "Building mole-daemon..."
bun build \
  --compile \
  --minify \
  --target=bun-darwin-arm64 \
  --outfile=dist/mole-daemon \
  src/daemon/main.ts

echo "Done. Binaries in dist/"
ls -la dist/
```

- [ ] **Step 2: 加執行權限**

```bash
chmod +x scripts/build.sh
git update-index --chmod=+x scripts/build.sh 2>/dev/null || true
```

- [ ] **Step 3: 執行 build**

```bash
bun run build
```

Expected: `dist/mole` 和 `dist/mole-daemon` 產生，檔案執行權限是 `+x`。

- [ ] **Step 4: 驗證 daemon binary 能啟動**

```bash
MOLE_SOCKET=/tmp/mole-smoke.sock ./dist/mole-daemon &
DPID=$!
sleep 0.3
curl --unix-socket /tmp/mole-smoke.sock http://x/type
# Expected: {"type":"empty"} 或 image response
kill $DPID
rm -f /tmp/mole-smoke.sock
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build.sh
echo 'dist/' >> .gitignore
git add .gitignore
git commit -m "build: add bun --compile build script for cli + daemon"
```

---

## Task 20: launchd plist

**Files:**
- Create: `launchd/com.h3l1o5.mole-daemon.plist.template`

職責：template plist，install script 會把 `@BIN@` 替換成實際路徑後安裝到 `~/Library/LaunchAgents/`。

- [ ] **Step 1: 撰寫 plist template**

檔案 `launchd/com.h3l1o5.mole-daemon.plist.template`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.h3l1o5.mole-daemon</string>

    <key>ProgramArguments</key>
    <array>
        <string>@BIN@</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>MOLE_SOCKET</key>
        <string>/tmp/mole-clip.sock</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>StandardOutPath</key>
    <string>@LOG@/mole-daemon.out.log</string>

    <key>StandardErrorPath</key>
    <string>@LOG@/mole-daemon.err.log</string>

    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
```

- [ ] **Step 2: Commit**

```bash
git add launchd/
git commit -m "feat(launchd): add plist template for mole-daemon service"
```

---

## Task 21: Mac install script

**Files:**
- Create: `scripts/install.sh`

職責：使用者本機 setup 流程——檢查 `pngpaste`，把 `dist/mole` + `dist/mole-daemon` 複製到 `~/.local/bin/`，生成並載入 launchd plist。

- [ ] **Step 1: 撰寫安裝腳本**

檔案 `scripts/install.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/state/mole"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"

for cmd in pngpaste open launchctl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "ERROR: missing command: $cmd" >&2
    if [ "$cmd" = "pngpaste" ]; then
      echo "Install with: brew install pngpaste" >&2
    fi
    exit 1
  }
done

if [ ! -f "$ROOT/dist/mole" ] || [ ! -f "$ROOT/dist/mole-daemon" ]; then
  echo "Binaries missing; running build first..."
  "$ROOT/scripts/build.sh"
fi

mkdir -p "$BIN_DIR" "$LOG_DIR" "$LA_DIR"
cp "$ROOT/dist/mole" "$BIN_DIR/mole"
cp "$ROOT/dist/mole-daemon" "$BIN_DIR/mole-daemon"
chmod +x "$BIN_DIR/mole" "$BIN_DIR/mole-daemon"
echo "Installed: $BIN_DIR/mole, $BIN_DIR/mole-daemon"

# generate plist from template
sed \
  -e "s|@BIN@|$BIN_DIR/mole-daemon|g" \
  -e "s|@LOG@|$LOG_DIR|g" \
  "$ROOT/launchd/${LABEL}.plist.template" > "$PLIST"
echo "Installed plist: $PLIST"

# unload if already loaded, then load
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Loaded launchd service: $LABEL"

# quick health check
sleep 0.5
if curl -sf --unix-socket /tmp/mole-clip.sock http://x/type >/dev/null 2>&1; then
  echo "Daemon healthy. All set."
else
  echo "WARNING: daemon did not respond on /tmp/mole-clip.sock"
  echo "Check logs:"
  echo "  tail $LOG_DIR/mole-daemon.err.log"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo
    echo "Reminder: add $BIN_DIR to PATH in your shell rc:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    ;;
esac
```

- [ ] **Step 2: 加執行權限**

```bash
chmod +x scripts/install.sh
git update-index --chmod=+x scripts/install.sh 2>/dev/null || true
```

- [ ] **Step 3: 實際執行（在你自己的 Mac）**

```bash
./scripts/install.sh
```

Expected: plist 安裝、daemon 起來、`curl --unix-socket /tmp/mole-clip.sock http://x/type` 回 JSON。

- [ ] **Step 4: 驗證 mole CLI 可從 PATH 啟動**

```bash
which mole
mole --help 2>&1 || true  # mole 目前沒 --help，會直接進 TUI；Ctrl+C 退出
```

- [ ] **Step 5: Commit**

```bash
git add scripts/install.sh
git commit -m "build(install): add mac install script with launchd wiring"
```

---

## Task 22: Uninstall / daemon 控制腳本

**Files:**
- Create: `scripts/uninstall.sh`

職責：移除 launchd service、刪 binary、可選清 log。讓未來除錯或重新安裝乾淨。

- [ ] **Step 1: 撰寫 uninstall 腳本**

檔案 `scripts/uninstall.sh`：

```bash
#!/usr/bin/env bash
set -uo pipefail

BIN_DIR="$HOME/.local/bin"
LA_DIR="$HOME/Library/LaunchAgents"
LABEL="com.h3l1o5.mole-daemon"
PLIST="$LA_DIR/${LABEL}.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST" "$BIN_DIR/mole" "$BIN_DIR/mole-daemon"
rm -f /tmp/mole-clip.sock

echo "Uninstalled. Logs in ~/.local/state/mole/ preserved."
```

- [ ] **Step 2: 加執行權限**

```bash
chmod +x scripts/uninstall.sh
git update-index --chmod=+x scripts/uninstall.sh 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add scripts/uninstall.sh
git commit -m "build(uninstall): add mac uninstall script"
```

---

## Task 23: README

**Files:**
- Create: `README.md`

職責：使用者取向的最低可行文件——安裝、一次性部署 remote、日常使用、疑難排解骨幹。

- [ ] **Step 1: 撰寫 README**

檔案 `README.md`：

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install and usage"
```

---

## Task 24: End-to-end smoke test（手動）

職責：一個完整的 end-to-end 驗證清單，由人類跑。不是自動測，是 MVP 成功驗證。

- [ ] **Step 1: Mac 安裝 + daemon 健康**

```bash
./scripts/install.sh
curl -sf --unix-socket /tmp/mole-clip.sock http://x/type
# Expected: JSON
```

- [ ] **Step 2: 剪貼簿貼得進 daemon**

1. Cmd+Shift+Ctrl+4 截圖到剪貼簿
2. `curl -sf --unix-socket /tmp/mole-clip.sock http://x/type` → 期望 `{"type":"image","format":"png"}`
3. `curl -sf --unix-socket /tmp/mole-clip.sock http://x/image -o /tmp/t.png && file /tmp/t.png` → 期望 `PNG image data`

- [ ] **Step 3: Remote 部署**

```bash
scp remote/xclip remote/install.sh <HOST>:/tmp/
ssh <HOST> 'bash /tmp/install.sh'
ssh <HOST> 'which xclip'  # 期望 ~/.local/bin/xclip
```

- [ ] **Step 4: Chrome profile 建立**

```bash
mkdir -p ~/.chrome-profiles/work
```

- [ ] **Step 5: 第一次 mole 執行**

```bash
mole
```

- 選 `<HOST>`
- 選 `work`
- 觀察 preflight 三個步驟全綠
- 進 ssh，截圖 Mac 剪貼簿，ssh 裡 `xclip -selection clipboard -t TARGETS -o` 回 `image/png`
- `xclip -selection clipboard -t image/png -o > /tmp/test.png && file /tmp/test.png` 回 PNG

- [ ] **Step 6: Chrome 9222 連通**

Remote 執行：
```bash
curl -sf http://localhost:9222/json/version
# Expected: JSON 含 Browser、webSocketDebuggerUrl
```

- [ ] **Step 7: Multi-Mac 切換**

1. Mac A：`mole` → 進 ssh（留著）
2. Mac B：`mole` → 進 ssh
3. Mac A 的 ssh 裡再試 `xclip` → 應該不通或拿到 Mac B 的剪貼簿
4. Mac A：`mole`（在另一個 terminal tab）→ socket 搶回 A
5. Mac A 原本 ssh 裡 `xclip` → 恢復拿 Mac A 的剪貼簿

- [ ] **Step 8: 正常 exit 清理**

ssh `exit` → mole 安靜退出 → remote `pgrep -f 'socat.*mole-chrome'` 不該找到殘留

- [ ] **Step 9: 強退還能下次啟動**

1. Mac 執行 `mole`、進 ssh
2. 直接 Cmd+Q 關 terminal
3. 下次 `mole` 還能正常進 ssh（`StreamLocalBindUnlink=yes` 效果）

---

## Self-Review

### Spec coverage
| Spec section | 對應 task |
|---|---|
| §1.2 一站式 CLI | Task 18 |
| §2 架構三條路徑 | Task 5（clipboard daemon）、Task 10（preflight/socat）、Task 18（ssh spawn） |
| §3.1 Last-writer-wins | Task 8（`StreamLocalBindUnlink=yes` in `buildSshArgs`） |
| §3.2 Unix socket 優勢 | Task 5 unix socket server |
| §3.3 Fake xclip shim | Task 6 |
| §3.4 socat 橋接 | Task 10 preflight script |
| §3.5 完整 ssh 指令 | Task 8 |
| §4.1 mole CLI | Task 12–18 |
| §4.2 mole-daemon | Task 5 |
| §4.3 假 xclip | Task 6 |
| §4.4 socat 啟動/清理 | Task 10, Task 11 |
| §5.2 TUI 流程 | Task 13（host）、Task 15（profile）、Task 16（preflight） |
| §5.3 ink | Task 12, Task 14 |
| §6 profile 狀態機 | Task 3 |
| §7 專案結構 | Task 1 骨架，各 task 增量落實 |
| §8 部署/安裝 | Task 19（build）、Task 20（plist）、Task 21（install）、Task 22（uninstall） |
| §9 邊界情況 | Task 11（cleanup）、Task 17（daemon health）、Task 24（smoke test） |
| §11 convention 值 | 各 task 預設值一致（`/tmp/mole-clip.sock`、`/tmp/mole-chrome.sock`、9222、`~/.chrome-profiles`） |
| §13 成功標準 | Task 24 |

### Placeholder scan
- 無 TODO/TBD。所有步驟含可執行 code 或指令。
- `scripts/install.sh` 的 plist template substitution 明確列出 `@BIN@` / `@LOG@` 兩個 marker，沒有 `TODO`。

### Type consistency
- `SshHost` 在 Task 2 定義、Task 13、Task 18 使用，shape 一致。
- `ProfileInfo` 在 Task 3 定義、Task 14、Task 15、Task 18 使用，`status` union 拼寫一致（`free/stale/reusable/busy`）。
- `PreflightStep` 在 Task 16 定義，Task 18 使用。
- `SshRunner` 在 Task 10（preflight）和 Task 11（cleanup）各自定義但簽名完全一致（`(host, script) => Promise<{stdout,stderr,code}>`）。可重複但設計上各 module 自持較鬆耦合，接受此重複。
- Socket 預設路徑（`/tmp/mole-clip.sock`、`/tmp/mole-chrome.sock`）和 port（9222）在所有 task 一致。

### Scope check
- 24 tasks 聚焦 MVP，沒有包含未列入設計的功能（無 token 認證、無 `mole status` 子命令、無 history 記錄）。
- 最後一個 Task 24 是手動 smoke test 清單，不產出 code，但對驗證 MVP 成立與否必要。

---

## Execution Handoff

**Plan complete and saved to `docs/2026-04-24-mole-implementation-plan.md`. 兩種執行選項：**

**1. Subagent-Driven（建議）** — 每個 task 派發 fresh subagent、task 間 review、快速迭代

**2. Inline Execution** — 在當前 session 用 executing-plans skill 批次執行、設 checkpoint 審閱

**想用哪種？**
