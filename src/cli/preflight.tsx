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

// Marker glyphs (✓ ✘ · △) and the Braille spinner frames don't share a
// uniform cell width across terminal fonts. Wrap each in a fixed 2-cell
// Box so the label/message column starts at the same offset regardless
// of which glyph is painted.
const MarkerCell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box width={2}>{children}</Box>
);

const Marker: React.FC<{ state: PreflightStepState }> = ({ state }) => {
  let inner: React.ReactNode;
  switch (state) {
    case 'running':
      inner = <Spinner color={colors.primary} />;
      break;
    case 'ok':
      inner = <Text color={colors.success}>{icons.tick}</Text>;
      break;
    case 'error':
      inner = <Text color={colors.error}>{icons.cross}</Text>;
      break;
    case 'pending':
    default:
      inner = <Text dimColor>·</Text>;
      break;
  }
  return <MarkerCell>{inner}</MarkerCell>;
};

const labelColor = (state: PreflightStepState): string | undefined => {
  if (state === 'running') return colors.primary;
  if (state === 'error') return colors.error;
  return undefined;
};

export interface PreflightViewProps {
  steps: PreflightStep[];
}

// Marker cell (2) + this gap (1) = label / error msg starts 3 cols
// after the marker column. error block paddingLeft below mirrors that.
const MARKER_GAP = ' ';

export const PreflightView: React.FC<PreflightViewProps> = ({ steps }) => (
  <Box flexDirection="column" paddingLeft={2}>
    {steps.map((s) => (
      <Box key={s.id} flexDirection="column">
        <Box>
          <Marker state={s.state} />
          <Text>{MARKER_GAP}</Text>
          <Text
            color={labelColor(s.state)}
            dimColor={s.state === 'pending'}
          >
            {s.label}
          </Text>
        </Box>
        {s.error ? (
          <Box paddingLeft={3}>
            <Text color={colors.error}>{s.error}</Text>
          </Box>
        ) : null}
        {s.warning ? (
          <Box paddingLeft={2}>
            <MarkerCell>
              <Text color={colors.warning}>{icons.warning}</Text>
            </MarkerCell>
            <Text>{MARKER_GAP}</Text>
            <Text color={colors.warning}>{s.warning}</Text>
          </Box>
        ) : null}
      </Box>
    ))}
  </Box>
);
