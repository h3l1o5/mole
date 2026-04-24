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
