// Renders every TUI page in a representative set of states and prints
// each as plain text. Useful for catching layout/spacing/copy issues
// without needing to manually drive the CLI to reach each state.
//
//   bun run preview              # all views
//   bun run preview preflight    # filter by view name
//
// Notes:
// - ANSI colors are stripped by ink-testing-library, so this surfaces
//   layout/structure/copy only. Use a real terminal for color review.
// - Spinner / scanner timers keep components alive; every case must
//   unmount to let the script exit.

import React from 'react';
import { render } from 'ink-testing-library';
import { PreflightView, type PreflightStep } from '../src/cli/preflight';
import { HostPicker } from '../src/cli/host-picker';
import { ProfilePicker } from '../src/cli/profile-picker';
import type { SshHost } from '../src/lib/ssh-config';
import type { ProfileInfo } from '../src/lib/chrome-profile';

interface Case {
  view: string;
  name: string;
  // Returns the rendered frame. Async so cases can drive stdin / wait
  // for scanners to settle before snapshotting.
  run: () => Promise<string>;
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const snapshot = async (
  el: React.ReactElement,
  drive?: (stdin: { write: (s: string) => void }) => Promise<void>,
): Promise<string> => {
  const inst = render(el);
  await settle();
  if (drive) await drive(inst.stdin);
  const frame = inst.lastFrame() ?? '';
  inst.unmount();
  return frame;
};

const preflightCases: Case[] = [
  {
    view: 'preflight',
    name: 'all pending',
    run: () =>
      snapshot(
        <PreflightView
          steps={[
            { id: 'daemon', label: 'Mac daemon', state: 'pending' },
            {
              id: 'remote',
              label: 'Remote preflight (synomac)',
              state: 'pending',
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
    name: 'mid-run (daemon ok, remote running)',
    run: () =>
      snapshot(
        <PreflightView
          steps={[
            { id: 'daemon', label: 'Mac daemon', state: 'ok' },
            {
              id: 'remote',
              label: 'Remote preflight (synomac)',
              state: 'running',
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
    name: 'all done',
    run: () =>
      snapshot(
        <PreflightView
          steps={[
            { id: 'daemon', label: 'Mac daemon', state: 'ok' },
            {
              id: 'remote',
              label: 'Remote preflight (synomac)',
              state: 'ok',
            },
            { id: 'chrome', label: 'Chrome (profile: work)', state: 'ok' },
          ]}
        />,
      ),
  },
  {
    view: 'preflight',
    name: 'remote error with fix hint',
    run: () =>
      snapshot(
        <PreflightView
          steps={[
            { id: 'daemon', label: 'Mac daemon', state: 'ok' },
            {
              id: 'remote',
              label: 'Remote preflight (synomac)',
              state: 'error',
              error:
                'socat not installed. Fix: ssh synomac sudo apt install socat',
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
    name: 'ok with sshd warning',
    run: () =>
      snapshot(
        <PreflightView
          steps={[
            { id: 'daemon', label: 'Mac daemon', state: 'ok' },
            {
              id: 'remote',
              label: 'Remote preflight (synomac)',
              state: 'ok',
              warning:
                'cannot verify sshd StreamLocalBindUnlink (config unreadable)',
            },
            { id: 'chrome', label: 'Chrome (profile: work)', state: 'ok' },
          ]}
        />,
      ),
  },
];

const sampleHosts: SshHost[] = [
  { name: 'synomac', hostname: 'synomac.local', user: 'kuanghung' },
  { name: 'devbox' },
  { name: 'odin', hostname: '%h.syno', user: 'root' },
  { name: 'thor', hostname: '%h.syno', user: 'root' },
];

const hostPickerCases: Case[] = [
  {
    view: 'host-picker',
    name: 'initial focus on first host',
    run: () => snapshot(<HostPicker hosts={sampleHosts} onSelect={() => {}} />),
  },
  {
    view: 'host-picker',
    name: 'no ssh hosts',
    run: () => snapshot(<HostPicker hosts={[]} onSelect={() => {}} />),
  },
  {
    view: 'host-picker',
    name: 'focus moved onto manual-entry row',
    run: () =>
      snapshot(<HostPicker hosts={sampleHosts} onSelect={() => {}} />, async (s) => {
        // 4 down arrows -> move past all 4 hosts onto input row.
        for (let i = 0; i < 4; i++) {
          s.write('\x1b[B');
          await settle(10);
        }
      }),
  },
  {
    view: 'host-picker',
    name: 'manual entry: typing valid input',
    run: () =>
      snapshot(<HostPicker hosts={[]} onSelect={() => {}} />, async (s) => {
        for (const ch of 'root@example.com') {
          s.write(ch);
          await settle(5);
        }
      }),
  },
  {
    view: 'host-picker',
    name: 'manual entry: invalid input + validation error',
    run: () =>
      snapshot(<HostPicker hosts={[]} onSelect={() => {}} />, async (s) => {
        for (const ch of 'not-a-host') {
          s.write(ch);
          await settle(5);
        }
        s.write('\r');
        await settle(20);
      }),
  },
];

const profileScanner = (profiles: ProfileInfo[]) => async () => profiles;

const profilePickerCases: Case[] = [
  {
    view: 'profile-picker',
    name: 'no profiles (only manual entry)',
    run: () =>
      snapshot(
        <ProfilePicker
          scanner={profileScanner([])}
          intervalMs={1000}
          onSelect={() => {}}
        />,
      ),
  },
  {
    view: 'profile-picker',
    name: 'mixed statuses (free / busy / reusable / stale)',
    run: () =>
      snapshot(
        <ProfilePicker
          scanner={profileScanner([
            { name: 'work', path: '/p/work', status: 'free' },
            { name: 'personal', path: '/p/personal', status: 'busy', pid: 123 },
            { name: 'shared', path: '/p/shared', status: 'reusable', pid: 456 },
            { name: 'leftover', path: '/p/leftover', status: 'stale', pid: 789 },
          ])}
          intervalMs={1000}
          onSelect={() => {}}
        />,
      ),
  },
  {
    view: 'profile-picker',
    name: 'all busy (initial focus jumps to manual entry)',
    run: () =>
      snapshot(
        <ProfilePicker
          scanner={profileScanner([
            { name: 'a', path: '/p/a', status: 'busy', pid: 1 },
            { name: 'b', path: '/p/b', status: 'busy', pid: 2 },
          ])}
          intervalMs={1000}
          onSelect={() => {}}
        />,
      ),
  },
  {
    view: 'profile-picker',
    name: 'manual entry: typing a new profile name',
    run: () =>
      snapshot(
        <ProfilePicker
          scanner={profileScanner([
            { name: 'work', path: '/p/work', status: 'free' },
          ])}
          intervalMs={1000}
          onSelect={() => {}}
        />,
        async (s) => {
          // Move to the input row (1 down past the single profile).
          s.write('\x1b[B');
          await settle(10);
          for (const ch of 'side-project') {
            s.write(ch);
            await settle(5);
          }
        },
      ),
  },
  {
    view: 'profile-picker',
    name: 'manual entry: invalid name + validation error',
    run: () =>
      snapshot(
        <ProfilePicker
          scanner={profileScanner([])}
          intervalMs={1000}
          onSelect={() => {}}
        />,
        async (s) => {
          for (const ch of 'has spaces') {
            s.write(ch);
            await settle(5);
          }
          s.write('\r');
          await settle(20);
        },
      ),
  },
  {
    view: 'profile-picker',
    name: 'manual entry: duplicate profile name (creator throws)',
    run: () =>
      snapshot(
        <ProfilePicker
          scanner={profileScanner([
            { name: 'work', path: '/p/work', status: 'free' },
          ])}
          intervalMs={1000}
          creator={() => {
            throw new Error('Profile "work" already exists');
          }}
          onSelect={() => {}}
        />,
        async (s) => {
          s.write('\x1b[B');
          await settle(10);
          for (const ch of 'work') {
            s.write(ch);
            await settle(5);
          }
          s.write('\r');
          await settle(20);
        },
      ),
  },
];

const ALL: Case[] = [
  ...preflightCases,
  ...hostPickerCases,
  ...profilePickerCases,
];

const filter = process.argv[2];
const cases = filter ? ALL.filter((c) => c.view === filter) : ALL;

if (cases.length === 0) {
  console.error(
    `No cases match "${filter}". Known views: ${[
      ...new Set(ALL.map((c) => c.view)),
    ].join(', ')}`,
  );
  process.exit(1);
}

const RULE = '─'.repeat(60);

for (const c of cases) {
  console.log(`\n${RULE}`);
  console.log(`${c.view}  ·  ${c.name}`);
  console.log(RULE);
  const frame = await c.run();
  console.log(frame);
}

console.log();
