import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, icons } from './components/theme';
import { TextInput } from './components/text-input';
import {
  createProfile,
  validateProfileName,
  type ProfileInfo,
  type ProfileStatus,
} from '../lib/chrome-profile';
import { handleTextInputKey } from './wizard/text-input-keys';
import type { PickerUiState } from './wizard/reducer';

const PLACEHOLDER = 'Create new profile… (e.g. work-account)';

const statusLabel = (s: ProfileStatus): string => {
  switch (s) {
    case 'free':
      return 'free';
    case 'reusable':
      return 'reusable — will attach';
    case 'stale':
      return 'stale lock (safe)';
    case 'busy':
      return 'busy (close non-debug Chrome first)';
  }
};

const statusColor = (s: ProfileStatus): string | undefined => {
  switch (s) {
    case 'free':
      return undefined;
    case 'reusable':
      return colors.success;
    case 'stale':
      return colors.warning;
    case 'busy':
      return colors.error;
  }
};

// Sentinel for the "Skip Chrome" row. Position: always last (after manual entry).
type ListRow =
  | { kind: 'profile'; profile: ProfileInfo }
  | { kind: 'manualInput' }
  | { kind: 'skip' };

export interface ProfilePickerProps {
  profiles: ProfileInfo[];
  ui: PickerUiState;
  onUiChange: (patch: Partial<PickerUiState>) => void;
  onPick: (selection: ProfileInfo | 'skip') => void;
  creator?: (name: string) => ProfileInfo;
}

export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  profiles,
  ui,
  onUiChange,
  onPick,
  creator = createProfile,
}) => {
  const rows: ListRow[] = [
    ...profiles.map((p) => ({ kind: 'profile' as const, profile: p })),
    { kind: 'manualInput' as const },
    { kind: 'skip' as const },
  ];
  const inputRowIndex = profiles.length;
  const skipRowIndex = inputRowIndex + 1;
  const onInput = ui.index === inputRowIndex;
  const initialFocusSet = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDisabled = (i: number): boolean => {
    const r = rows[i];
    return r?.kind === 'profile' && r.profile.status === 'busy';
  };

  React.useEffect(() => {
    if (!initialFocusSet.current) {
      // Park cursor on first non-busy row so the user doesn't start on
      // a disabled item. After this we just clamp on out-of-range.
      const firstEnabled = profiles.findIndex((p) => p.status !== 'busy');
      const idx = firstEnabled === -1 ? inputRowIndex : firstEnabled;
      initialFocusSet.current = true;
      if (ui.index !== idx) onUiChange({ index: idx });
      return;
    }
    if (ui.index > skipRowIndex) onUiChange({ index: skipRowIndex });
  }, [profiles.length, inputRowIndex, skipRowIndex, ui.index, onUiChange]);

  React.useEffect(() => {
    if (!onInput) setError(null);
  }, [onInput]);

  useInput((input, key) => {
    if (onInput) {
      const next = handleTextInputKey(
        { value: ui.input, cursor: ui.cursor },
        input,
        key,
      );
      if (next) {
        onUiChange({ input: next.value, cursor: next.cursor });
        setError(null);
        return;
      }
    }

    if (key.upArrow || (key.ctrl && input === 'p')) {
      let i = ui.index - 1;
      while (i >= 0 && isDisabled(i)) i--;
      if (i >= 0) onUiChange({ index: i });
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      let i = ui.index + 1;
      while (i <= skipRowIndex && isDisabled(i)) i++;
      if (i <= skipRowIndex) onUiChange({ index: i });
      return;
    }
    if (key.return) {
      const row = rows[ui.index];
      if (!row) return;
      if (row.kind === 'manualInput') {
        const trimmed = ui.input.trim();
        if (trimmed.length === 0) return;
        const validationError = validateProfileName(trimmed);
        if (validationError) {
          setError(validationError);
          return;
        }
        try {
          const info = creator(trimmed);
          onPick(info);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        return;
      }
      if (row.kind === 'skip') {
        onPick('skip');
        return;
      }
      // profile
      if (row.profile.status !== 'busy') onPick(row.profile);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          Select a <Text color={colors.primary}>Chrome profile</Text> to launch.
        </Text>
        <Text dimColor>
          These live in ~/.chrome-profiles/. Or create / skip below.
        </Text>
      </Box>
      <Box flexDirection="column">
        {profiles.map((p, i) => {
          const isActive = i === ui.index;
          const marker = isActive ? icons.pointerSmall : ' ';
          const sColor = statusColor(p.status);
          return (
            <Text key={p.name} color={isActive ? colors.primary : undefined}>
              {marker}{' '}
              <Text dimColor={p.status === 'busy'}>{p.name}</Text>
              {p.status !== 'free' ? (
                <>
                  {'  '}
                  <Text color={sColor}>{statusLabel(p.status)}</Text>
                </>
              ) : null}
            </Text>
          );
        })}
        <ManualInputRow
          active={onInput}
          value={ui.input}
          cursor={ui.cursor}
        />
        <SkipRow active={ui.index === skipRowIndex} />
        {error ? (
          <Text color={colors.error}>  {icons.warning} {error}</Text>
        ) : null}
      </Box>
    </Box>
  );
};

const ManualInputRow: React.FC<{
  active: boolean;
  value: string;
  cursor: number;
}> = ({ active, value, cursor }) => {
  const marker = active ? icons.pointerSmall : ' ';
  if (!active && value.length === 0) {
    return <Text dimColor>{marker} + Create new profile…</Text>;
  }
  return (
    <Text color={active ? colors.primary : undefined}>
      {marker}{' '}
      <TextInput
        value={value}
        cursor={cursor}
        isActive={active}
        placeholder={PLACEHOLDER}
      />
    </Text>
  );
};

const SkipRow: React.FC<{ active: boolean }> = ({ active }) => {
  const marker = active ? icons.pointerSmall : ' ';
  return (
    <Text color={active ? colors.primary : undefined}>
      {marker} — Skip Chrome —
    </Text>
  );
};
