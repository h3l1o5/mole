import React, { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';

const PROFILE_NAME_RE = /^[A-Za-z0-9._-]+$/;

function validateName(name: string): string | null {
  if (name.length === 0) return 'Name is required';
  if (name.length > 64) return 'Invalid: name too long (max 64 chars)';
  if (name === '.' || name === '..') return 'Invalid: reserved name';
  if (!PROFILE_NAME_RE.test(name)) {
    return 'Invalid: allowed chars are letters, digits, . _ -';
  }
  return null;
}

export interface ProfileNameInputProps {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export const ProfileNameInput: React.FC<ProfileNameInputProps> = ({
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef('');

  const update = (next: string) => {
    valueRef.current = next;
    setValue(next);
    setError(null);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const current = valueRef.current;
      const err = validateName(current);
      if (err) setError(err);
      else onSubmit(current);
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
      <Text>New profile name: <Text color="cyan">{value}</Text><Text dimColor>_</Text></Text>
      {error ? <Text color="red">{error}</Text> : (
        <Text dimColor>Enter to create · Esc to cancel</Text>
      )}
    </Box>
  );
};
