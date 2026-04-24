import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { colors, spinnerFrames } from './theme';

export interface SpinnerProps {
  color?: string;
  intervalMs?: number;
}

export const Spinner: React.FC<SpinnerProps> = ({
  color = colors.primary,
  intervalMs = 80,
}) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % spinnerFrames.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);
  return <Text color={color}>{spinnerFrames[frame]}</Text>;
};
