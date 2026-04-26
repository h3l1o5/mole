import React from 'react';
import { Box } from 'ink';
import { Spinner } from './spinner';
import { arrowMarchFrames, colors } from './theme';

// arrowMarchFrames are designed at 3 cells each.
const FRAME_WIDTH = 3;

export interface ArrowMarchProps {
  color?: string;
  intervalMs?: number;
}

export const ArrowMarch: React.FC<ArrowMarchProps> = ({
  color = colors.primary,
  intervalMs = 250,
}) => (
  <Box width={FRAME_WIDTH}>
    <Spinner color={color} intervalMs={intervalMs} frames={arrowMarchFrames} />
  </Box>
);
