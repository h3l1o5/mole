import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, icons } from './components/theme';
import { TextInput } from './components/text-input';
import { describeHost, type SshHost } from '../lib/ssh-config';
import { handleTextInputKey } from './wizard/text-input-keys';
import { useExtraKeys } from './hooks/use-extra-keys';
import type { PickerUiState } from './wizard/reducer';

const PLACEHOLDER = 'Enter manually… (e.g. user@hostname)';
const VALIDATION_ERROR = 'Use format user@hostname (e.g. root@example.com)';
const USER_HOST_RE = /^[^@\s]+@[^@\s]+$/;

// Returns null when the trimmed input is a valid user@host. Returns a
// user-facing error message otherwise. Empty input returns null so the
// picker can quietly ignore Enter on a blank field.
export function validateUserHost(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (!USER_HOST_RE.test(trimmed)) return VALIDATION_ERROR;
  return null;
}

export interface HostPickerProps {
  hosts: SshHost[];
  ui: PickerUiState;
  onUiChange: (patch: Partial<PickerUiState>) => void;
  onPick: (host: SshHost) => void;
}

export const HostPicker: React.FC<HostPickerProps> = ({
  hosts,
  ui,
  onUiChange,
  onPick,
}) => {
  const inputRowIndex = hosts.length;
  const onInput = ui.index === inputRowIndex;
  const [error, setError] = React.useState<string | null>(null);

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
      if (ui.index > 0) onUiChange({ index: ui.index - 1 });
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      if (ui.index < inputRowIndex) onUiChange({ index: ui.index + 1 });
      return;
    }
    if (key.return) {
      if (onInput) {
        const trimmed = ui.input.trim();
        if (trimmed.length === 0) return;
        const err = validateUserHost(trimmed);
        if (err) {
          setError(err);
          return;
        }
        onPick({ name: trimmed });
      } else {
        const host = hosts[ui.index];
        if (host) onPick(host);
      }
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text>
          Select an <Text color={colors.primary}>SSH host</Text> to tunnel into.
        </Text>
        <Text dimColor>
          {hosts.length === 0
            ? 'No hosts in ~/.ssh/config — type one below'
            : 'Loaded from ~/.ssh/config — or type one below'}
        </Text>
      </Box>
      <Box flexDirection="column">
        {hosts.map((h, i) => {
          const isActive = i === ui.index;
          const marker = isActive ? icons.pointerSmall : ' ';
          const desc = describeHost(h);
          return (
            <Text key={h.name} color={isActive ? colors.primary : undefined}>
              {marker} {h.name}
              {desc ? <Text dimColor> · {desc}</Text> : null}
            </Text>
          );
        })}
        <InputRow active={onInput} value={ui.input} cursor={ui.cursor} />
        {error ? (
          <Text color={colors.error}>  {icons.warning} {error}</Text>
        ) : null}
      </Box>
    </Box>
  );
};

const InputRow: React.FC<{
  active: boolean;
  value: string;
  cursor: number;
}> = ({ active, value, cursor }) => {
  const marker = active ? icons.pointerSmall : ' ';
  if (!active && value.length === 0) {
    return <Text dimColor>{marker} + Enter manually…</Text>;
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
