import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Spinner } from './components/spinner';
import { colors, icons } from './components/theme';

export type PreflightStepState =
  | 'pending'
  | 'running'
  | 'prompt'
  | 'installing'
  | 'ok'
  | 'error';

export type PreflightStepId = 'daemon' | 'remote' | 'chrome';

export type PreflightPromptKind = 'install-shim' | 'update-shim';

export interface PreflightPrompt {
  kind: PreflightPromptKind;
  host: string;
  remoteHash?: string;
  expectedHash?: string;
  onAnswer: (yes: boolean) => void;
}

export interface PreflightStep {
  id: PreflightStepId;
  label: string;
  state: PreflightStepState;
  error?: string;
  warning?: string;
  prompt?: PreflightPrompt;
  installingMessage?: string;
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
    case 'installing':
      inner = <Spinner color={colors.primary} />;
      break;
    case 'ok':
      inner = <Text color={colors.success}>{icons.tick}</Text>;
      break;
    case 'error':
      inner = <Text color={colors.error}>{icons.cross}</Text>;
      break;
    case 'prompt':
      inner = <Text color={colors.info}>{icons.info}</Text>;
      break;
    case 'pending':
    default:
      inner = <Text dimColor>·</Text>;
      break;
  }
  return <MarkerCell>{inner}</MarkerCell>;
};

const labelColor = (state: PreflightStepState): string | undefined => {
  if (state === 'running' || state === 'installing') return colors.primary;
  if (state === 'error') return colors.error;
  if (state === 'prompt') return colors.info;
  return undefined;
};

const promptText = (p: PreflightPrompt): string => {
  if (p.kind === 'install-shim') {
    return `mole shim not installed on ${p.host}. Install now? [Y/n]`;
  }
  return `mole shim outdated on ${p.host} (${p.remoteHash ?? '?'} → ${p.expectedHash ?? '?'}). Update now? [Y/n]`;
};

const PromptInput: React.FC<{ prompt: PreflightPrompt; active: boolean }> = ({
  prompt,
  active,
}) => {
  useInput(
    (input, key) => {
      if (key.return || input === 'y' || input === 'Y') {
        prompt.onAnswer(true);
        return;
      }
      if (key.escape || input === 'n' || input === 'N') {
        prompt.onAnswer(false);
        return;
      }
    },
    { isActive: active },
  );
  return null;
};

export interface PreflightViewProps {
  steps: PreflightStep[];
}

// Marker cell (2) + this gap (1) = label / error msg starts 3 cols
// after the marker column. error block paddingLeft below mirrors that.
const MARKER_GAP = ' ';

export const PreflightView: React.FC<PreflightViewProps> = ({ steps }) => {
  const promptStep = steps.find((s) => s.state === 'prompt' && s.prompt);
  return (
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
              {s.state === 'installing' && s.installingMessage
                ? s.installingMessage
                : s.label}
            </Text>
          </Box>
          {s.state === 'prompt' && s.prompt ? (
            <Box paddingLeft={3}>
              <Text color={colors.info}>{promptText(s.prompt)}</Text>
            </Box>
          ) : null}
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
      {promptStep?.prompt ? (
        <PromptInput prompt={promptStep.prompt} active={true} />
      ) : null}
    </Box>
  );
};
