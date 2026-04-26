import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { colors, spinnerFrames } from './theme';

export interface SpinnerProps {
  color?: string;
  intervalMs?: number;
  frames?: readonly string[];
}

export const Spinner: React.FC<SpinnerProps> = ({
  color = colors.primary,
  intervalMs = 80,
  frames = spinnerFrames,
}) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % frames.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs, frames.length]);
  return <Text color={color}>{frames[frame]}</Text>;
};
