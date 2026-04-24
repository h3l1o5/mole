import React from 'react';
import { Text } from 'ink';

export interface BadgeProps {
  color: string;
  children: string;
}

export const Badge: React.FC<BadgeProps> = ({ color, children }) => (
  <Text color="black" backgroundColor={color}>
    {` ${children.toUpperCase()} `}
  </Text>
);
