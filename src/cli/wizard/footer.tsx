import React from 'react';
import { Text } from 'ink';
import type { WizardStep } from './reducer';

export interface WizardFooterProps {
  step: WizardStep;
  submitted: boolean;
}

const HINT_HOST = '↑↓ navigate · enter select · ctrl+c quit';
const HINT_PROFILE =
  '↑↓ navigate · ← back · enter select · ctrl+c quit';
const HINT_REVIEW = '← back · ctrl+c quit';

export const WizardFooter: React.FC<WizardFooterProps> = ({
  step,
  submitted,
}) => {
  if (submitted) {
    return <Text dimColor>submitted ✓</Text>;
  }
  if (step === 'host') return <Text dimColor>{HINT_HOST}</Text>;
  if (step === 'profile') return <Text dimColor>{HINT_PROFILE}</Text>;
  return <Text dimColor>{HINT_REVIEW}</Text>;
};
