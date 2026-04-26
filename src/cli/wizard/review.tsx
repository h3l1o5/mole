import React from 'react';
import { Box, Text } from 'ink';
import { colorPhase, colors, decoration, icons } from '../components/theme';
import { useBreathingColor } from '../components/breathing-text';
import { describeHost, type SshHost } from '../../lib/ssh-config';
import type { ProfileInfo, ProfileStatus } from '../../lib/chrome-profile';
import { buildWillLines } from './will';

export interface ReviewStepProps {
  host: SshHost;
  profile: ProfileInfo | 'skip';
  submitted: boolean;
  innerWidth?: number;
}

const profileStatusBlurb = (s: ProfileStatus): string | null => {
  switch (s) {
    case 'reusable':
      return 'reusable — will attach';
    case 'stale':
      return 'stale lock (safe)';
    case 'busy':
      return 'busy';
    case 'free':
    default:
      return null;
  }
};

const profileStatusKeyword = (s: ProfileStatus): string | null => {
  switch (s) {
    case 'reusable':
      return '(reusable)';
    case 'stale':
      return '(stale)';
    case 'busy':
      return '(busy)';
    case 'free':
    default:
      return null;
  }
};

const profileStatusColor = (s: ProfileStatus): string | undefined => {
  if (s === 'reusable') return colors.success;
  if (s === 'stale') return colors.warning;
  if (s === 'busy') return colors.error;
  return undefined;
};

const LABEL_WIDTH = 'Profile'.length + 2;
// Below this width the column-aligned wide layout starts to wrap.
const NARROW_THRESHOLD = 56;

const ICON_CELL_WIDTH = 2;

const TITLE_TEXT = 'READY TO TUNNEL';

const ReviewTitle: React.FC<{ submitted: boolean }> = ({ submitted }) => (
  <Text color={submitted ? undefined : colors.primary} dimColor={submitted}>
    {submitted
      ? TITLE_TEXT
      : `${decoration.titleBarLeft} ${TITLE_TEXT} ${decoration.titleBarRight}`}
  </Text>
);

const StatusIcon: React.FC<{ glyph: string; submitted?: boolean }> = ({
  glyph,
  submitted,
}) => (
  <Box width={ICON_CELL_WIDTH}>
    <Text color={submitted ? undefined : colors.primary} dimColor={submitted}>
      {glyph}
    </Text>
  </Box>
);

const StatusIconSpacer: React.FC = () => <Box width={ICON_CELL_WIDTH} />;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box width={LABEL_WIDTH}>
    <Text dimColor>{children}</Text>
  </Box>
);

const CTA_TEXT = 'press ENTER to tunnel';

const CtaBlock: React.FC<{ bordered: boolean }> = ({ bordered }) => {
  const color =
    useBreathingColor({
      baseColor: colorPhase.primary.base,
      peakColor: colorPhase.primary.peak,
      periodMs: 8000,
    }) ?? colors.primary;
  if (bordered) {
    return (
      <Box
        borderStyle="round"
        borderColor={color}
        paddingX={1}
        alignSelf="flex-start"
      >
        <Text color={color}>{CTA_TEXT}</Text>
      </Box>
    );
  }
  return <Text color={color}>{CTA_TEXT}</Text>;
};

const WideReview: React.FC<ReviewStepProps> = ({
  host,
  profile,
  submitted,
}) => {
  const desc = describeHost(host);
  const willLines = buildWillLines({ host, profile });
  const blurb =
    profile !== 'skip' ? profileStatusBlurb(profile.status) : null;
  const blurbColor =
    profile !== 'skip' ? profileStatusColor(profile.status) : undefined;
  return (
    <Box flexDirection="column" gap={1}>
      <ReviewTitle submitted={submitted} />

      <Box flexDirection="column">
        <Box flexDirection="row">
          <StatusIcon glyph={icons.tick} submitted={submitted} />
          <Label>Host</Label>
          <Text bold dimColor={submitted}>
            {host.name}
          </Text>
        </Box>
        {desc ? (
          <Box flexDirection="row">
            <StatusIconSpacer />
            <Label>{' '}</Label>
            <Text dimColor>{desc}</Text>
          </Box>
        ) : null}
      </Box>

      <Box flexDirection="row">
        <StatusIcon glyph={icons.tick} submitted={submitted} />
        <Label>Profile</Label>
        {profile === 'skip' ? (
          <Text dimColor>skipped · Chrome will not launch</Text>
        ) : (
          <Box flexDirection="row" gap={2}>
            <Text bold dimColor={submitted}>
              {profile.name}
            </Text>
            {blurb ? (
              <Text color={blurbColor} dimColor={submitted}>
                {blurb}
              </Text>
            ) : null}
          </Box>
        )}
      </Box>

      <Box flexDirection="column">
        {willLines.map((line, i) => (
          <Box key={i} flexDirection="row">
            {i === 0 ? (
              <StatusIcon glyph={icons.arrowRight} submitted={submitted} />
            ) : (
              <StatusIconSpacer />
            )}
            <Label>{i === 0 ? 'Will' : ' '}</Label>
            <Text dimColor={submitted}>{`· ${line}`}</Text>
          </Box>
        ))}
      </Box>

      {!submitted ? <CtaBlock bordered /> : null}
    </Box>
  );
};

const NarrowReview: React.FC<ReviewStepProps> = ({
  host,
  profile,
  submitted,
}) => {
  const desc = describeHost(host);
  const willLines = buildWillLines({ host, profile });
  const statusKw =
    profile !== 'skip' ? profileStatusKeyword(profile.status) : null;
  const statusColr =
    profile !== 'skip' ? profileStatusColor(profile.status) : undefined;
  const iconColor = submitted ? undefined : colors.primary;
  return (
    <Box flexDirection="column" gap={1}>
      <ReviewTitle submitted={submitted} />

      <Box flexDirection="column">
        <Text color={iconColor} dimColor={submitted}>
          {`${icons.tick} Host`}
        </Text>
        <Text bold dimColor={submitted}>
          {host.name}
        </Text>
        {desc ? <Text dimColor>{desc}</Text> : null}
      </Box>

      <Box flexDirection="column">
        <Text color={iconColor} dimColor={submitted}>
          {`${icons.tick} Profile`}
        </Text>
        {profile === 'skip' ? (
          <Text dimColor>skipped</Text>
        ) : (
          <Text>
            <Text bold dimColor={submitted}>
              {profile.name}
            </Text>
            {statusKw ? (
              <>
                {' '}
                <Text color={statusColr} dimColor={submitted}>
                  {statusKw}
                </Text>
              </>
            ) : null}
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        <Text color={iconColor} dimColor={submitted}>
          {`${icons.arrowRight} Will`}
        </Text>
        {willLines.map((line, i) => (
          <Text key={i} dimColor={submitted}>{`· ${line}`}</Text>
        ))}
      </Box>

      {!submitted ? <CtaBlock bordered={false} /> : null}
    </Box>
  );
};

export const ReviewStep: React.FC<ReviewStepProps> = (props) => {
  const isNarrow =
    props.innerWidth !== undefined && props.innerWidth < NARROW_THRESHOLD;
  return isNarrow ? <NarrowReview {...props} /> : <WideReview {...props} />;
};
