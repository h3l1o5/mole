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
import { PreflightView } from '../src/cli/preflight';
import { HostPicker } from '../src/cli/host-picker';
import { ProfilePicker } from '../src/cli/profile-picker';
import { ReviewStep } from '../src/cli/wizard/review';
import { Breadcrumb } from '../src/cli/wizard/breadcrumb';
import { WizardFrame } from '../src/cli/wizard/frame';
import type { SshHost } from '../src/lib/ssh-config';

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

const hostUi = { index: 0, input: '', cursor: 0 };
const noopUi = (_p: unknown) => {};

// Stateful wrapper for picker preview cases that need onUiChange to
// actually mutate ui (so initial-focus alignment is observable).
const StatefulProfilePicker: React.FC<
  Omit<React.ComponentProps<typeof ProfilePicker>, 'onUiChange'> & {
    initialUi: { index: number; input: string; cursor: number };
  }
> = ({ initialUi, ...rest }) => {
  const [ui, setUi] = React.useState(initialUi);
  return (
    <ProfilePicker
      {...rest}
      ui={ui}
      onUiChange={(p) => setUi((u) => ({ ...u, ...p }))}
    />
  );
};

const hostPickerCases: Case[] = [
  {
    view: 'host-picker',
    name: 'initial focus on first host',
    run: () =>
      snapshot(
        <HostPicker
          hosts={sampleHosts}
          ui={hostUi}
          onUiChange={noopUi}
          onPick={() => {}}
        />,
      ),
  },
  {
    view: 'host-picker',
    name: 'no ssh hosts',
    run: () =>
      snapshot(
        <HostPicker
          hosts={[]}
          ui={hostUi}
          onUiChange={noopUi}
          onPick={() => {}}
        />,
      ),
  },
  {
    view: 'host-picker',
    name: 'manual entry: cursor in middle of typed value',
    run: () =>
      snapshot(
        <HostPicker
          hosts={[]}
          ui={{ index: 0, input: 'root@example.com', cursor: 4 }}
          onUiChange={noopUi}
          onPick={() => {}}
        />,
      ),
  },
];

const profilePickerCases: Case[] = [
  {
    view: 'profile-picker',
    name: 'no profiles (only manual entry + skip row)',
    run: () =>
      snapshot(
        <ProfilePicker
          profiles={[]}
          ui={{ index: 0, input: '', cursor: 0 }}
          onUiChange={noopUi}
          onPick={() => {}}
        />,
      ),
  },
  {
    view: 'profile-picker',
    name: 'mixed statuses with cursor on Skip Chrome row',
    run: () =>
      snapshot(
        <ProfilePicker
          profiles={[
            { name: 'work', path: '/p/work', status: 'free' },
            { name: 'agent', path: '/p/agent', status: 'reusable', pid: 4242 },
          ]}
          ui={{ index: 3, input: '', cursor: 0 }} // index 0+1 profiles, 2 input, 3 skip
          onUiChange={noopUi}
          onPick={() => {}}
        />,
      ),
  },
  {
    view: 'profile-picker',
    name: 'back-nav: selected=test2 → cursor aligns to that row',
    run: () =>
      snapshot(
        <StatefulProfilePicker
          profiles={[
            { name: 'test', path: '/p/test', status: 'free' },
            { name: 'test2', path: '/p/test2', status: 'free' },
          ]}
          initialUi={{ index: 2, input: '', cursor: 0 }} // stale: was on input row
          onPick={() => {}}
          selected={{ name: 'test2', path: '/p/test2', status: 'free' }}
        />,
      ),
  },
  {
    view: 'profile-picker',
    name: 'back-nav: selected=skip → cursor on Skip row',
    run: () =>
      snapshot(
        <StatefulProfilePicker
          profiles={[{ name: 'work', path: '/p/work', status: 'free' }]}
          initialUi={{ index: 0, input: '', cursor: 0 }}
          onPick={() => {}}
          selected="skip"
        />,
      ),
  },
];

const wizardCases: Case[] = [
  {
    view: 'wizard',
    name: 'frame at default 80 cols',
    run: () =>
      snapshot(
        <WizardFrame>
          <Breadcrumb
            step="profile"
            hostName="vbm"
            profileName={null}
            innerWidth={74}
          />
        </WizardFrame>,
      ),
  },
  {
    view: 'wizard',
    name: 'breadcrumb truncation @ 64 inner cols',
    run: () =>
      snapshot(
        <Breadcrumb
          step="review"
          hostName="alice@verylonghost.example.com"
          profileName="work-account-test"
          innerWidth={64}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'breadcrumb fallback step counter',
    run: () =>
      snapshot(
        <Breadcrumb
          step="profile"
          hostName="vbm"
          profileName={null}
          innerWidth={20}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'breadcrumb back to host (host shown dim, profile hidden)',
    run: () =>
      snapshot(
        <Breadcrumb
          step="host"
          hostName="vbm"
          profileName="agent"
          innerWidth={74}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'breadcrumb back to profile from review (profile dim)',
    run: () =>
      snapshot(
        <Breadcrumb
          step="profile"
          hostName="vbm"
          profileName="agent"
          innerWidth={74}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'breadcrumb back to profile after skip review (skipped dim)',
    run: () =>
      snapshot(
        <Breadcrumb
          step="profile"
          hostName="vbm"
          profileName="skip"
          innerWidth={74}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'polished review wide @ 70 inner cols',
    run: () =>
      snapshot(
        <WizardFrame>
          <Breadcrumb
            step="review"
            hostName="vbm"
            profileName="agent"
            innerWidth={74}
          />
          <ReviewStep
            host={{ name: 'vbm', user: 'root', hostname: 'martyvbm.syno' }}
            profile={{
              name: 'agent',
              path: '/p/agent',
              status: 'reusable',
              pid: 4242,
            }}
            submitted={false}
            innerWidth={70}
          />
        </WizardFrame>,
      ),
  },
  {
    view: 'wizard',
    name: 'polished review skip Chrome wide @ 70 inner cols',
    run: () =>
      snapshot(
        <WizardFrame>
          <Breadcrumb
            step="review"
            hostName="vbm"
            profileName="skip"
            innerWidth={74}
          />
          <ReviewStep
            host={{ name: 'vbm', user: 'root', hostname: 'martyvbm.syno' }}
            profile="skip"
            submitted={false}
            innerWidth={70}
          />
        </WizardFrame>,
      ),
  },
  {
    view: 'wizard',
    name: 'polished review wide submitted (frozen)',
    run: () =>
      snapshot(
        <WizardFrame frozen>
          <Breadcrumb
            step="review"
            hostName="vbm"
            profileName="agent"
            innerWidth={74}
            frozen
          />
          <ReviewStep
            host={{ name: 'vbm', user: 'root', hostname: 'martyvbm.syno' }}
            profile={{
              name: 'agent',
              path: '/p/agent',
              status: 'reusable',
              pid: 4242,
            }}
            submitted
            innerWidth={74}
          />
        </WizardFrame>,
      ),
  },
  {
    view: 'wizard',
    name: 'polished review narrow @ 48 inner cols',
    run: () =>
      snapshot(
        <ReviewStep
          host={{ name: 'vbm', user: 'root', hostname: 'martyvbm.syno' }}
          profile={{
            name: 'agent',
            path: '/p/agent',
            status: 'reusable',
            pid: 4242,
          }}
          submitted={false}
          innerWidth={48}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'polished review narrow skip Chrome @ 48 inner cols',
    run: () =>
      snapshot(
        <ReviewStep
          host={{ name: 'vbm', user: 'root', hostname: 'martyvbm.syno' }}
          profile="skip"
          submitted={false}
          innerWidth={48}
        />,
      ),
  },
  {
    view: 'wizard',
    name: 'polished review narrow submitted (frozen)',
    run: () =>
      snapshot(
        <ReviewStep
          host={{ name: 'vbm', user: 'root', hostname: 'martyvbm.syno' }}
          profile={{
            name: 'agent',
            path: '/p/agent',
            status: 'reusable',
            pid: 4242,
          }}
          submitted
          innerWidth={48}
        />,
      ),
  },
];

const ALL: Case[] = [
  ...preflightCases,
  ...hostPickerCases,
  ...profilePickerCases,
  ...wizardCases,
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
