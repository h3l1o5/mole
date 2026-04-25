import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../components/theme';
import { layoutBreadcrumb, type BreadcrumbSegment } from './layout';
import type { WizardStep } from './reducer';

export interface BreadcrumbProps {
  step: WizardStep;
  hostName: string | null;
  profileName: string | 'skip' | null;
  innerWidth: number;
  frozen?: boolean;
}

// Render contract (see layout.ts): a single space is inserted between a
// label/currentLabel and its following value segment. All other adjacent
// segments are concatenated as-is — separator already carries its own
// padding inside its text.
const renderSegment = (
  s: BreadcrumbSegment,
  i: number,
  frozen: boolean,
): React.ReactNode => {
  if (s.kind === 'currentLabel') {
    if (frozen) {
      return (
        <Text key={i} dimColor>
          {s.text}
        </Text>
      );
    }
    return (
      <Text key={i} color={colors.primary} bold>
        {s.text}
      </Text>
    );
  }
  if (s.kind === 'label') {
    return (
      <Text key={i} dimColor>
        {s.text}
      </Text>
    );
  }
  if (s.kind === 'separator') {
    return (
      <Text key={i} dimColor>
        {s.text}
      </Text>
    );
  }
  // value: prefix one space to separate from preceding label.
  const color = s.tone === 'warning' ? colors.warning : undefined;
  const dim = frozen || s.tone === 'dim';
  return (
    <Text key={i} color={color} dimColor={dim}>
      {' '}
      {s.text}
    </Text>
  );
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  step,
  hostName,
  profileName,
  innerWidth,
  frozen = false,
}) => {
  const layout = layoutBreadcrumb(
    { step, hostName, profileName },
    innerWidth,
  );

  if (layout.mode === 'fallback') {
    const [counter, current] = layout.text.split(' · ');
    return (
      <Text>
        <Text dimColor>{counter} · </Text>
        {frozen ? (
          <Text dimColor>{current}</Text>
        ) : (
          <Text color={colors.primary} bold>
            {current}
          </Text>
        )}
      </Text>
    );
  }

  return (
    <Box flexDirection="row">
      {layout.segments.map((s, i) => renderSegment(s, i, frozen))}
    </Box>
  );
};
