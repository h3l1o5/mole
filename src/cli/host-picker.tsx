import React from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './components/select-list';
import { StatusMessage } from './components/status-message';
import type { SshHost } from '../lib/ssh-config';

export interface HostPickerProps {
  hosts: SshHost[];
  onSelect: (host: SshHost) => void;
}

export const HostPicker: React.FC<HostPickerProps> = ({ hosts, onSelect }) => {
  if (hosts.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <StatusMessage variant="warning">
          No SSH hosts found in ~/.ssh/config.
        </StatusMessage>
        <Text dimColor>Add a Host entry first, then re-run mole.</Text>
      </Box>
    );
  }

  const items = hosts.map((h) => ({
    key: h.name,
    label: h.name,
    description: h.hostname,
    value: h,
  }));

  return (
    <Box flexDirection="column" gap={1}>
      <Text>
        Select SSH host <Text dimColor>(↑↓ to move, Enter to select)</Text>
      </Text>
      <SelectList items={items} onSelect={onSelect} />
    </Box>
  );
};
