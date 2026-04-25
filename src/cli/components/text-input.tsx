import React from 'react';
import { Text } from 'ink';
import { colors } from './theme';

export interface TextInputProps {
  value: string;
  cursor: number;
  isActive: boolean;
  placeholder?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  cursor,
  isActive,
  placeholder,
}) => {
  if (!isActive) {
    if (value.length === 0 && placeholder) {
      return <Text dimColor>{placeholder}</Text>;
    }
    return <Text>{value}</Text>;
  }

  if (value.length === 0) {
    if (placeholder) {
      // Use Text wrapper (not Box) so callers can embed <TextInput>
      // inside <Text> rows — Ink forbids <Box> inside <Text>.
      return (
        <Text>
          <Text inverse> </Text>
          <Text dimColor>{placeholder}</Text>
        </Text>
      );
    }
    return <Text inverse> </Text>;
  }

  const before = value.slice(0, cursor);
  const at = value[cursor] ?? ' ';
  const after = cursor < value.length ? value.slice(cursor + 1) : '';

  return (
    <Text color={colors.primary}>
      <Text>{before}</Text>
      <Text inverse>{at}</Text>
      <Text>{after}</Text>
    </Text>
  );
};
