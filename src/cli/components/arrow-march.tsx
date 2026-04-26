import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme';

const FRAMES = ['▷', '▶', '▶▶', '▶▶▶'] as const;

export interface ArrowMarchProps {
  color?: string;
  intervalMs?: number;
  width?: number;
}

export const ArrowMarch: React.FC<ArrowMarchProps> = ({
  color = colors.primary,
  intervalMs = 250,
  width = 3,
}) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return (
    <Box width={width}>
      <Text color={color}>{FRAMES[frame]}</Text>
    </Box>
  );
};
