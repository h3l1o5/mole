import React from 'react';
import { Box, Text } from 'ink';
import { colors, icons } from '../components/theme';
import { BreathingText } from '../components/breathing-text';
import { ArrowMarch } from '../components/arrow-march';
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

const ICON_CELL_WIDTH = 2;

const StatusIcon: React.FC<{ glyph: string; dim?: boolean }> = ({
  glyph,
  dim,
}) => (
  <Box width={ICON_CELL_WIDTH}>
    <Text color={dim ? undefined : colors.primary} dimColor={dim}>
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

const WideReview: React.FC<ReviewStepProps> = ({
  host,
  profile,
  submitted,
}) => {
  const desc = describeHost(host);
  const willLines = buildWillLines({ host, profile });
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <BreathingText frozen={submitted}>
          {submitted ? 'READY TO TUNNEL' : '▌ READY TO TUNNEL ▐'}
        </BreathingText>
      </Box>

      <Box flexDirection="column">
        <Box flexDirection="row">
          <StatusIcon glyph={icons.tick} dim={submitted} />
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
        <StatusIcon glyph={icons.tick} dim={submitted} />
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
            {i === 0 ? (
              <StatusIcon glyph="→" dim={submitted} />
            ) : (
              <StatusIconSpacer />
            )}
            <Label>{i === 0 ? 'Will' : ' '}</Label>
            <Text dimColor={submitted}>{`· ${line}`}</Text>
          </Box>
        ))}
      </Box>

      {!submitted ? (
        <Box flexDirection="column">
          <Box
            borderStyle="round"
            borderColor={colors.primary}
            paddingX={1}
            alignSelf="flex-start"
          >
            <ArrowMarch />
            <Text> </Text>
            <Text color={colors.primary}>press ENTER</Text>
          </Box>
          <Text dimColor>← back</Text>
        </Box>
      ) : null}
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
      <Box flexDirection="column">
        <BreathingText frozen={submitted}>
          {submitted ? 'READY TO TUNNEL' : '▌ READY TO TUNNEL ▐'}
        </BreathingText>
      </Box>

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
          → Will
        </Text>
        {willLines.map((line, i) => (
          <Text key={i} dimColor={submitted}>{`· ${line}`}</Text>
        ))}
      </Box>

      {!submitted ? (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <ArrowMarch />
            <Text> </Text>
            <Text color={colors.primary}>press ENTER</Text>
          </Box>
          <Text dimColor>← back</Text>
        </Box>
      ) : null}
    </Box>
  );
};

export const ReviewStep: React.FC<ReviewStepProps> = (props) => {
  const isNarrow =
    props.innerWidth !== undefined && props.innerWidth < NARROW_THRESHOLD;
  return isNarrow ? <NarrowReview {...props} /> : <WideReview {...props} />;
};
