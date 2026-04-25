import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './components/spinner';
import { colors, icons } from './components/theme';

export type PreflightStepState = 'pending' | 'running' | 'ok' | 'error';

export interface PreflightStep {
  id: string;
  label: string;
  state: PreflightStepState;
  error?: string;
  warning?: string;
}

const Marker: React.FC<{ state: PreflightStepState }> = ({ state }) => {
  switch (state) {
    case 'running':
      return <Spinner color={colors.primary} />;
    case 'ok':
      return <Text color={colors.success}>{icons.tick}</Text>;
    case 'error':
      return <Text color={colors.error}>{icons.cross}</Text>;
    case 'pending':
    default:
      return <Text dimColor>·</Text>;
  }
};

const labelColor = (state: PreflightStepState): string | undefined => {
  if (state === 'running') return colors.primary;
  if (state === 'error') return colors.error;
  return undefined;
};

export interface PreflightViewProps {
  steps: PreflightStep[];
}

export const PreflightView: React.FC<PreflightViewProps> = ({ steps }) => (
  <Box flexDirection="column" paddingLeft={2}>
    {steps.map((s) => (
      <Box key={s.id} flexDirection="column">
        <Box>
          <Marker state={s.state} />
          <Text> </Text>
          <Text
            color={labelColor(s.state)}
            dimColor={s.state === 'pending'}
          >
            {s.label}
          </Text>
        </Box>
        {s.error ? (
          <Box paddingLeft={2}>
            <Text color={colors.error}>{s.error}</Text>
          </Box>
        ) : null}
        {s.warning ? (
          <Box paddingLeft={2}>
            <Text color={colors.warning}>{icons.warning}</Text>
            <Text> </Text>
            <Text color={colors.warning}>{s.warning}</Text>
          </Box>
        ) : null}
      </Box>
    ))}
  </Box>
);
