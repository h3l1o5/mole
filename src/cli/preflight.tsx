import React from 'react';
import { Box, Text } from 'ink';

export type PreflightStepState = 'pending' | 'running' | 'ok' | 'error';

export interface PreflightStep {
  id: string;
  label: string;
  state: PreflightStepState;
  error?: string;
  warning?: string;
}

const marker = (s: PreflightStepState): string => {
  switch (s) {
    case 'pending':
      return '·';
    case 'running':
      return '…';
    case 'ok':
      return '✓';
    case 'error':
      return '✗';
  }
};

const color = (s: PreflightStepState): string | undefined => {
  switch (s) {
    case 'ok':
      return 'green';
    case 'error':
      return 'red';
    case 'running':
      return 'cyan';
    default:
      return undefined;
  }
};

export interface PreflightViewProps {
  steps: PreflightStep[];
}

export const PreflightView: React.FC<PreflightViewProps> = ({ steps }) => (
  <Box flexDirection="column">
    {steps.map((s) => (
      <Box key={s.id} flexDirection="column">
        <Text color={color(s.state)}>
          {marker(s.state)} {s.label}
        </Text>
        {s.error ? <Text color="red">    {s.error}</Text> : null}
        {s.warning ? <Text color="yellow">    ⚠ {s.warning}</Text> : null}
      </Box>
    ))}
  </Box>
);
