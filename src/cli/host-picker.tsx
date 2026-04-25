import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, icons } from './components/theme';
import type { SshHost } from '../lib/ssh-config';

export interface HostPickerProps {
  hosts: SshHost[];
  onSelect: (host: SshHost) => void;
}

const PLACEHOLDER = 'user@hostname  or  ssh-config-entry';

function describeHost(h: SshHost): string | undefined {
  if (h.user && h.hostname) return `${h.user}@${h.hostname}`;
  if (h.user) return `${h.user}@${h.name}`;
  if (h.hostname) return h.hostname;
  return undefined;
}

export const HostPicker: React.FC<HostPickerProps> = ({ hosts, onSelect }) => {
  const inputRowIndex = hosts.length;
  const [index, setIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const inputValueRef = useRef('');

  const updateInput = (next: string) => {
    inputValueRef.current = next;
    setInputValue(next);
  };

  useInput((input, key) => {
    const onInput = index === inputRowIndex;

    if (key.upArrow || (key.ctrl && input === 'p')) {
      if (index > 0) setIndex(index - 1);
      return;
    }
    if (key.downArrow || (key.ctrl && input === 'n')) {
      if (index < inputRowIndex) setIndex(index + 1);
      return;
    }
    if (key.return) {
      if (onInput) {
        const trimmed = inputValueRef.current.trim();
        if (trimmed.length > 0) onSelect({ name: trimmed });
      } else {
        const host = hosts[index];
        if (host) onSelect(host);
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
          Select an <Text color={colors.primary}>SSH host</Text> to tunnel into.
        </Text>
        <Text dimColor>
          These are loaded from ~/.ssh/config. Or type one below.
        </Text>
      </Box>
      <Box flexDirection="column">
        {hosts.map((h, i) => {
          const isActive = i === index;
          const marker = isActive ? icons.pointerSmall : ' ';
          const desc = describeHost(h);
          return (
            <Text key={h.name} color={isActive ? colors.primary : undefined}>
              {marker} {h.name}
              {desc ? <Text dimColor>  {desc}</Text> : null}
            </Text>
          );
        })}
        <InputRow
          isActive={index === inputRowIndex}
          value={inputValue}
        />
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
      return <Text dimColor>{marker} + Enter manually…</Text>;
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
