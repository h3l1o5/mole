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

// Why color="gray" instead of dimColor: chalk's `dim` and `bold` modifiers
// share the same SGR reset code (\x1b[22m). When sibling Text segments are
// concatenated, the dim attribute leaks into the next segment until its
// own reset fires, dimming a cyan+bold+underline current step into a
// muted shade. Using an explicit foreground colour avoids that whole
// class of cross-segment ANSI interference.
const SUBTLE_COLOR = 'gray';

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
        <Text key={i} color={SUBTLE_COLOR}>
          {s.text}
        </Text>
      );
    }
    return (
      <Text key={i} color={colors.primary} bold underline>
        {s.text}
      </Text>
    );
  }
  if (s.kind === 'label') {
    return (
      <Text key={i} color={SUBTLE_COLOR}>
        {s.text}
      </Text>
    );
  }
  if (s.kind === 'separator') {
    return (
      <Text key={i} color={SUBTLE_COLOR}>
        {s.text}
      </Text>
    );
  }
  // value: prefix one space to separate from preceding label.
  if (s.tone === 'warning') {
    return (
      <Text key={i} color={frozen ? SUBTLE_COLOR : colors.warning}>
        {' '}
        {s.text}
      </Text>
    );
  }
  if (s.tone === 'dim' || frozen) {
    return (
      <Text key={i} color={SUBTLE_COLOR}>
        {' '}
        {s.text}
      </Text>
    );
  }
  return (
    <Text key={i}>
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
        <Text color={SUBTLE_COLOR}>{counter} · </Text>
        {frozen ? (
          <Text color={SUBTLE_COLOR}>{current}</Text>
        ) : (
          <Text color={colors.primary} bold underline>
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
