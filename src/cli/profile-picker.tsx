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
import { useExtraKeys } from './hooks/use-extra-keys';
import type { PickerUiState } from './wizard/reducer';

const PLACEHOLDER = 'Create new profile… (e.g. mole-profile1)';

export const statusLabel = (s: ProfileStatus): string => {
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

export const statusColor = (s: ProfileStatus): string | undefined => {
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
  selected?: ProfileInfo | 'skip' | null;
}

export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  profiles,
  ui,
  onUiChange,
  onPick,
  creator = createProfile,
  selected = null,
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
      // Initial focus: prefer selected row (back-nav from review),
      // else first non-busy profile, else input row.
      const firstEnabled = profiles.findIndex((p) => p.status !== 'busy');
      const fallback = firstEnabled === -1 ? inputRowIndex : firstEnabled;
      let idx = fallback;
      if (selected === 'skip') {
        idx = skipRowIndex;
      } else if (selected) {
        const found = profiles.findIndex((p) => p.name === selected.name);
        if (found >= 0) idx = found;
      }
      initialFocusSet.current = true;
      if (ui.index !== idx) onUiChange({ index: idx });
      return;
    }
    if (ui.index > skipRowIndex) onUiChange({ index: skipRowIndex });
  }, [
    profiles,
    inputRowIndex,
    skipRowIndex,
    ui.index,
    onUiChange,
    selected,
  ]);

  React.useEffect(() => {
    if (!onInput) setError(null);
  }, [onInput]);

  // Home / End: ink's useInput swallows these; pull them off the raw
  // event emitter ourselves.
  useExtraKeys(onInput, {
    onHome: () => onUiChange({ cursor: 0 }),
    onEnd: () => onUiChange({ cursor: ui.input.length }),
  });

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
          {profiles.length === 0
            ? 'No profiles yet — type a name below to create one.'
            : 'Live in ~/.chrome-profiles — or create / skip below'}
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
