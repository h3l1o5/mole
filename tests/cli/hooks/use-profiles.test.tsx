import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { useProfiles } from '../../../src/cli/hooks/use-profiles';
import type { ProfileInfo } from '../../../src/lib/chrome-profile';

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
