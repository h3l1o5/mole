import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../components/theme';
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
// Below this inner width the column-aligned layout starts to wrap and
// ink's em-dash / Box gap measurements drift. Switch to a plain
// linebreak-per-field layout at or below the threshold.
const NARROW_THRESHOLD = 56;

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box width={LABEL_WIDTH}>
    <Text dimColor>{children}</Text>
  </Box>
);

const Header: React.FC<Pick<ReviewStepProps, 'submitted'>> = ({ submitted }) => (
  <Box flexDirection="column">
    <Text dimColor={submitted}>
      Ready to{' '}
      <Text color={submitted ? undefined : colors.primary}>tunnel</Text>
    </Text>
    {!submitted ? (
      <Text dimColor>
        <Text color={colors.primary}>enter</Text> start · ← back
      </Text>
    ) : null}
  </Box>
);

const WideReview: React.FC<ReviewStepProps> = ({ host, profile, submitted }) => {
  const desc = describeHost(host);
  const willLines = buildWillLines({ host, profile });
  return (
    <Box flexDirection="column" gap={1}>
      <Header submitted={submitted} />

      <Box flexDirection="column">
        <Box flexDirection="row">
          <Label>Host</Label>
          <Text bold dimColor={submitted}>
            {host.name}
          </Text>
        </Box>
        {desc ? (
          <Box flexDirection="row">
            <Label>{' '}</Label>
            <Text dimColor>{desc}</Text>
          </Box>
        ) : null}
      </Box>

      <Box flexDirection="row">
        <Label>Profile</Label>
        {profile === 'skip' ? (
          <Text dimColor>skipped · Chrome will not launch</Text>
        ) : (
          <Box flexDirection="row" gap={2}>
            <Text bold dimColor={submitted}>
              {profile.name}
            </Text>
            {profileStatusBlurb(profile.status) ? (
              <Text
                color={profileStatusColor(profile.status)}
                dimColor={submitted}
              >
                {profileStatusBlurb(profile.status)}
              </Text>
            ) : null}
          </Box>
        )}
      </Box>

      <Box flexDirection="column">
        {willLines.map((line, i) => (
          <Box key={i} flexDirection="row">
            <Label>{i === 0 ? 'Will' : ' '}</Label>
            <Text dimColor={submitted}>{`· ${line}`}</Text>
          </Box>
        ))}
      </Box>
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
  return (
    <Box flexDirection="column" gap={1}>
      <Header submitted={submitted} />

      <Box flexDirection="column">
        <Text dimColor>Host</Text>
        <Text bold dimColor={submitted}>
          {host.name}
        </Text>
        {desc ? <Text dimColor>{desc}</Text> : null}
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Profile</Text>
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
        <Text dimColor>Will</Text>
        {willLines.map((line, i) => (
          <Text key={i} dimColor={submitted}>{`· ${line}`}</Text>
        ))}
      </Box>
    </Box>
  );
};

export const ReviewStep: React.FC<ReviewStepProps> = (props) => {
  const isNarrow =
    props.innerWidth !== undefined && props.innerWidth < NARROW_THRESHOLD;
  return isNarrow ? <NarrowReview {...props} /> : <WideReview {...props} />;
};
