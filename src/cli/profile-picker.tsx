import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SelectList } from './components/select-list';
import { useProfiles } from './hooks/use-profiles';
import type { ProfileInfo, ProfileStatus } from '../lib/chrome-profile';
import { scanProfiles, createProfile } from '../lib/chrome-profile';
import { ProfileNameInput } from './profile-name-input';

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

type PickValue =
  | { kind: 'profile'; profile: ProfileInfo }
  | { kind: 'create' };

export interface ProfilePickerProps {
  onSelect: (profile: ProfileInfo) => void;
  scanner?: () => Promise<ProfileInfo[]>;
  creator?: (name: string) => ProfileInfo;
  intervalMs?: number;
}

export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  onSelect,
  scanner = scanProfiles,
  creator = createProfile,
  intervalMs = 1000,
}) => {
  const profiles = useProfiles(scanner, intervalMs);
  const [mode, setMode] = useState<'list' | 'creating'>('list');
  const [createError, setCreateError] = useState<string | null>(null);

  if (mode === 'creating') {
    return (
      <Box flexDirection="column">
        <ProfileNameInput
          onSubmit={(name) => {
            try {
              const info = creator(name);
              onSelect(info);
            } catch (e) {
              setCreateError(e instanceof Error ? e.message : String(e));
              setMode('list');
            }
          }}
          onCancel={() => setMode('list')}
        />
      </Box>
    );
  }

  const items = [
    ...profiles.map((p) => ({
      key: p.name,
      label: `${p.name.padEnd(16)}  ${statusLabel(p.status)}`,
      value: { kind: 'profile', profile: p } as PickValue,
      disabled: p.status === 'busy',
    })),
    {
      key: '__create__',
      label: '+ Create new profile…',
      value: { kind: 'create' } as PickValue,
    },
  ];

  return (
    <Box flexDirection="column">
      <Text bold>Select Chrome profile</Text>
      <SelectList
        items={items}
        onSelect={(v) => {
          if (v.kind === 'create') {
            setCreateError(null);
            setMode('creating');
          } else {
            onSelect(v.profile);
          }
        }}
      />
      {createError ? <Text color="red">{createError}</Text> : null}
    </Box>
  );
};
