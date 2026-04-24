import React from 'react';
import { Box, Text } from 'ink';
import { colors, icons } from './theme';

export type StatusVariant = 'info' | 'success' | 'warning' | 'error';

const VARIANT: Record<StatusVariant, { color: string; icon: string }> = {
  info: { color: colors.info, icon: icons.info },
  success: { color: colors.success, icon: icons.tick },
  warning: { color: colors.warning, icon: icons.warning },
  error: { color: colors.error, icon: icons.cross },
};

export interface StatusMessageProps {
  variant: StatusVariant;
  children: React.ReactNode;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  variant,
  children,
}) => {
  const { color, icon } = VARIANT[variant];
  return (
    <Box gap={1}>
      <Text color={color}>{icon}</Text>
      <Text>{children}</Text>
    </Box>
  );
};
