import React from 'react';
import { Box, useStdout } from 'ink';
import { computeWizardWidth, isFallbackMode } from './width';

export interface WizardFrameProps {
  frozen?: boolean;
  children: React.ReactNode;
}

// Reads stdout columns from ink and listens for resize events. We
// don't import a third-party hook — this is the entire dependency.
function useTerminalWidth(): number {
  const { stdout } = useStdout();
  const [cols, setCols] = React.useState<number>(stdout.columns ?? 80);
  React.useEffect(() => {
    const onResize = () => setCols(stdout.columns ?? 80);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);
  return cols;
}

export const WizardFrame: React.FC<WizardFrameProps> = ({
  frozen,
  children,
}) => {
  const cols = useTerminalWidth();

  if (isFallbackMode(cols)) {
    return <Box flexDirection="column">{children}</Box>;
  }

  const width = computeWizardWidth(cols);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={frozen ? 'gray' : undefined}
      paddingX={2}
      paddingY={1}
      width={width}
    >
      {children}
    </Box>
  );
};

export function useWizardInnerWidth(): number {
  const cols = useTerminalWidth();
  if (isFallbackMode(cols)) return cols;
  // outer width − 2 borders − 2*paddingX
  return computeWizardWidth(cols) - 2 - 2 * 2;
}
