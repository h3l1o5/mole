import React from 'react';
import { Box, Text } from 'ink';
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
      return (
        <Box>
          <Text inverse> </Text>
          <Text dimColor>{placeholder}</Text>
        </Box>
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
