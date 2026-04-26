import React from 'react';
import { Box } from 'ink';
import { Spinner } from './spinner';
import { arrowMarchFrames, colors } from './theme';

export interface ArrowMarchProps {
  color?: string;
  intervalMs?: number;
  width?: number;
}

export const ArrowMarch: React.FC<ArrowMarchProps> = ({
  color = colors.primary,
  intervalMs = 250,
  width = arrowMarchFrames[arrowMarchFrames.length - 1]!.length,
}) => (
  <Box width={width}>
    <Spinner color={color} intervalMs={intervalMs} frames={arrowMarchFrames} />
  </Box>
);
