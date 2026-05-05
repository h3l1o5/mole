import { test, expect, describe } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { UninstallApp } from '../../src/cli/commands/uninstall';
import type { UninstallDeps } from '../../src/lib/uninstall';

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const idleDeps: UninstallDeps = {
  bootout: async () => ({ code: 0, stderr: '' }),
  socketGone: async () => true,
  killDaemon: async () => {},
  remove: async () => ({ ok: true }),
  sleep: async () => {},
};

describe('UninstallApp', () => {
  test('initial frame lists paths and prompts y/N', async () => {
    const inst = render(
      <UninstallApp deps={idleDeps} paths={['/a', '/b']} yes={false} onExit={() => {}} />,
    );
    await settle();
    const frame = inst.lastFrame() ?? '';
    expect(frame).toContain('mole uninstall will remove');
    expect(frame).toContain('/a');
    expect(frame).toContain('/b');
    expect(frame).toContain('[y/N]');
    inst.unmount();
  });

  test('pressing N exits with code 0 and prints aborted', async () => {
    let exitCode = null as number | null;
    const inst = render(
      <UninstallApp
        deps={idleDeps}
        paths={['/a']}
        yes={false}
        onExit={(c) => {
          exitCode = c;
        }}
      />,
    );
    await settle();
    inst.stdin.write('n');
    await settle(50);
    expect(exitCode).toBe(0);
    expect(inst.lastFrame() ?? '').toContain('Aborted');
    inst.unmount();
  });

  test('pressing y runs uninstall and prints summary', async () => {
    let exitCode = null as number | null;
    const inst = render(
      <UninstallApp
        deps={idleDeps}
        paths={['/a', '/b']}
        yes={false}
        onExit={(c) => {
          exitCode = c;
        }}
      />,
    );
    await settle();
    inst.stdin.write('y');
    await settle(80);
    expect(exitCode).toBe(0);
    const out = inst.lastFrame() ?? '';
    expect(out).toContain('Removed: 2');
    inst.unmount();
  });

  test('--yes skips prompt and runs immediately', async () => {
    let exitCode = null as number | null;
    const inst = render(
      <UninstallApp
        deps={idleDeps}
        paths={['/a']}
        yes={true}
        onExit={(c) => {
          exitCode = c;
        }}
      />,
    );
    await settle(80);
    expect(exitCode).toBe(0);
    expect(inst.lastFrame() ?? '').toContain('Removed: 1');
    inst.unmount();
  });

  test('failed paths shown in summary', async () => {
    let exitCode = null as number | null;
    const failingDeps: UninstallDeps = {
      ...idleDeps,
      remove: async (p) =>
        p === '/b' ? { ok: false, error: 'EACCES' } : { ok: true },
    };
    const inst = render(
      <UninstallApp
        deps={failingDeps}
        paths={['/a', '/b']}
        yes={true}
        onExit={(c) => {
          exitCode = c;
        }}
      />,
    );
    await settle(80);
    expect(exitCode).toBe(0);
    const out = inst.lastFrame() ?? '';
    expect(out).toContain('Removed: 1');
    expect(out).toContain('Failed: 1');
    expect(out).toContain('/b');
    expect(out).toContain('EACCES');
    inst.unmount();
  });
});
