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
