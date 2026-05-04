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

  test('heredoc writes shim byte-for-byte (preserves single trailing newline)', () => {
    const s = buildInstallScript(SHIM);
    const m = s.match(/<<'MOLE_SHIM_EOF'\n([\s\S]*?)\nMOLE_SHIM_EOF\n/);
    expect(m).not.toBeNull();
    const written = m![1] + '\n';
    expect(written).toBe(SHIM);
  });

  test('handles shim without trailing newline', () => {
    const noNl = '#!/usr/bin/env bash\necho hi';
    const s = buildInstallScript(noNl);
    const m = s.match(/<<'MOLE_SHIM_EOF'\n([\s\S]*?)\nMOLE_SHIM_EOF\n/);
    const written = m![1] + '\n';
    expect(written).toBe(noNl + '\n');
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
    if (!r.ok) {
      expect(r.error).toMatch(/exit code 255/);
    }
  });
});
