import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from './components/theme';

export interface HostInputProps {
  onSubmit: (host: string) => void;
  onCancel: () => void;
}

const PLACEHOLDER = 'user@hostname  or  ssh-config-entry';

export const HostInput: React.FC<HostInputProps> = ({
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const valueRef = useRef('');

  const update = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const trimmed = valueRef.current.trim();
      if (trimmed.length > 0) onSubmit(trimmed);
      return;
    }
    if (key.backspace || key.delete) {
      update(valueRef.current.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      update(valueRef.current + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        Host:{' '}
        {value.length > 0 ? (
          <Text color={colors.primary}>{value}</Text>
        ) : (
          <Text dimColor>{PLACEHOLDER}</Text>
        )}
        <Text dimColor>_</Text>
      </Text>
      <Text dimColor>Enter to connect · Esc to go back</Text>
    </Box>
  );
};
