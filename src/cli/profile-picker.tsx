import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, icons } from './components/theme';
import { useProfiles } from './hooks/use-profiles';
import {
  scanProfiles,
  createProfile,
  validateProfileName,
  type ProfileInfo,
  type ProfileStatus,
} from '../lib/chrome-profile';

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
  const inputRowIndex = profiles.length;
  const [index, setIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputValueRef = useRef('');
  const initialFocusSet = useRef(false);

  const isDisabled = (i: number): boolean =>
    i < profiles.length && profiles[i]!.status === 'busy';

  // First time profiles arrive (or remain empty after a real scan), park
  // the cursor on the first non-busy row so the user doesn't start on a
  // disabled item. After that we just clamp on out-of-range changes so
  // we don't yank the cursor away from where the user put it.
  useEffect(() => {
    if (!initialFocusSet.current) {
      const firstEnabled = profiles.findIndex((p) => p.status !== 'busy');
      setIndex(firstEnabled === -1 ? profiles.length : firstEnabled);
      initialFocusSet.current = true;
      return;
    }
    if (index > inputRowIndex) setIndex(inputRowIndex);
  }, [profiles.length, inputRowIndex, index]);

  // Keep the validation error from re-surprising the user when they
  // wander away from the input row.
  useEffect(() => {
    if (index !== inputRowIndex) setError(null);
  }, [index, inputRowIndex]);

  const updateInput = (next: string) => {
    inputValueRef.current = next;
    setInputValue(next);
    setError(null);
  };

  useInput((input, key) => {
    const onInput = index === inputRowIndex;

    if (key.upArrow || (key.ctrl && input === 'p')) {
      let i = index - 1;
      while (i >= 0 && isDisabled(i)) i--;
      if (i >= 0) setIndex(i);
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      let i = index + 1;
      while (i <= inputRowIndex && isDisabled(i)) i++;
      if (i <= inputRowIndex) setIndex(i);
      return;
    }
    if (key.return) {
      if (onInput) {
        const trimmed = inputValueRef.current.trim();
        if (trimmed.length === 0) return;
        const validationError = validateProfileName(trimmed);
        if (validationError) {
          setError(validationError);
          return;
        }
        try {
          const info = creator(trimmed);
          onSelect(info);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } else {
        const profile = profiles[index];
        if (profile && profile.status !== 'busy') onSelect(profile);
      }
      return;
    }
    if (!onInput) return;

    if (key.backspace || key.delete) {
      updateInput(inputValueRef.current.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      updateInput(inputValueRef.current + input);
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          Select a <Text color={colors.primary}>Chrome profile</Text> to launch.
        </Text>
        <Text dimColor>
          These live in ~/.chrome-profiles/. Or create one below.
        </Text>
      </Box>
      <Box flexDirection="column">
        {profiles.map((p, i) => {
          const isActive = i === index;
          const marker = isActive ? icons.pointerSmall : ' ';
          const sColor = statusColor(p.status);
          return (
            <Text key={p.name} color={isActive ? colors.primary : undefined}>
              {marker}{' '}
              <Text dimColor={p.status === 'busy'}>{p.name}</Text>
              {'  '}
              {sColor ? (
                <Text color={sColor}>{statusLabel(p.status)}</Text>
              ) : (
                <Text dimColor>{statusLabel(p.status)}</Text>
              )}
            </Text>
          );
        })}
        <InputRow
          isActive={index === inputRowIndex}
          value={inputValue}
        />
        {error ? (
          <Text color={colors.error}>  {icons.warning} {error}</Text>
        ) : null}
      </Box>
    </Box>
  );
};

const InputRow: React.FC<{ isActive: boolean; value: string }> = ({
  isActive,
  value,
}) => {
  const marker = isActive ? icons.pointerSmall : ' ';
  if (!isActive) {
    if (value.length === 0) {
      return <Text dimColor>{marker} + Create new profile…</Text>;
    }
    return (
      <Text>
        {marker} {value}
      </Text>
    );
  }
  return (
    <Text color={colors.primary}>
      {marker}{' '}
      {value.length > 0 ? (
        <Text color={colors.primary}>{value}</Text>
      ) : (
        <Text dimColor>{PLACEHOLDER}</Text>
      )}
      <Text dimColor>_</Text>
    </Text>
  );
};
