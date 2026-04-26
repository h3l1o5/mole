import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../components/theme';
import { layoutBreadcrumb, type BreadcrumbSegment } from './breadcrumb-layout';
import type { WizardStep } from './reducer';

export interface BreadcrumbProps {
  step: WizardStep;
  hostName: string | null;
  profileName: string | 'skip' | null;
  innerWidth: number;
  frozen?: boolean;
}

// Use color="gray" not dimColor: chalk's dim and bold share the same
// SGR reset (\x1b[22m), so dim leaks into adjacent bold segments and
// mutes the current-step highlight. Explicit colour avoids the bleed.
const SUBTLE_COLOR = 'gray';

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
