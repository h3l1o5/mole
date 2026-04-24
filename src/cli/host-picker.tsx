import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './components/select-list';
import { HostInput } from './host-input';
import { colors } from './components/theme';
import type { SshHost } from '../lib/ssh-config';

export interface HostPickerProps {
  hosts: SshHost[];
  onSelect: (host: SshHost) => void;
}

type PickValue =
  | { kind: 'host'; host: SshHost }
  | { kind: 'manual' };

function describeHost(h: SshHost): string | undefined {
  if (h.user && h.hostname) return `${h.user}@${h.hostname}`;
  if (h.user) return `${h.user}@${h.name}`;
  if (h.hostname) return h.hostname;
  return undefined;
}

export const HostPicker: React.FC<HostPickerProps> = ({ hosts, onSelect }) => {
  const [mode, setMode] = useState<'picking' | 'typing'>('picking');

  if (mode === 'typing') {
    return (
      <HostInput
        onSubmit={(name) => onSelect({ name })}
        onCancel={() => setMode('picking')}
      />
    );
  }

  const items: Array<{
    key: string;
    label: string;
    description?: string;
    value: PickValue;
  }> = [
    ...hosts.map((h) => ({
      key: h.name,
      label: h.name,
      description: describeHost(h),
      value: { kind: 'host' as const, host: h },
    })),
    {
      key: '__manual__',
      label: '+ Enter manually…',
      value: { kind: 'manual' as const },
    },
  ];

  const onPick = (v: PickValue) => {
    if (v.kind === 'manual') setMode('typing');
    else onSelect(v.host);
  };

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          Select an <Text color={colors.primary}>SSH host</Text> to tunnel into.
        </Text>
        <Text dimColor>
          These are loaded from ~/.ssh/config. Not listed? Choose "Enter
          manually" below.
        </Text>
      </Box>
      <SelectList items={items} onSelect={onPick} />
    </Box>
  );
};
