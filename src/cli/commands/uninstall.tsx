import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, icons } from '../components/theme';
import {
  performUninstall,
  type UninstallDeps,
  type UninstallReport,
} from '../../lib/uninstall';

type Phase =
  | { kind: 'prompt' }
  | { kind: 'running' }
  | { kind: 'aborted' }
  | { kind: 'done'; report: UninstallReport };

interface Props {
  deps: UninstallDeps;
  paths: string[];
  yes: boolean;
  onExit: (code: number) => void;
}

export const UninstallApp: React.FC<Props> = ({ deps, paths, yes, onExit }) => {
  const [phase, setPhase] = useState<Phase>(
    yes ? { kind: 'running' } : { kind: 'prompt' },
  );

  useInput((input, key) => {
    if (phase.kind !== 'prompt') return;
    if (input === 'y' || input === 'Y') {
      setPhase({ kind: 'running' });
    } else if (input === 'n' || input === 'N' || key.return || key.escape) {
      setPhase({ kind: 'aborted' });
    }
  });

  useEffect(() => {
    if (phase.kind === 'running') {
      performUninstall(deps, paths).then((report) => {
        setPhase({ kind: 'done', report });
      });
    }
    if (phase.kind === 'aborted') {
      const t = setTimeout(() => onExit(0), 10);
      return () => clearTimeout(t);
    }
    if (phase.kind === 'done') {
      const t = setTimeout(() => onExit(0), 10);
      return () => clearTimeout(t);
    }
  }, [phase, deps, paths, onExit]);

  return (
    <Box flexDirection="column">
      <Text>mole uninstall will remove:</Text>
      {paths.map((p) => (
        <Text key={p}>  {p}</Text>
      ))}
      <Box marginTop={1}>
        {phase.kind === 'prompt' && <Text>Continue? [y/N] </Text>}
        {phase.kind === 'running' && (
          <Text color={colors.primary}>{icons.ellipsis} Removing...</Text>
        )}
        {phase.kind === 'aborted' && <Text color={colors.warning}>Aborted.</Text>}
        {phase.kind === 'done' && <Summary report={phase.report} />}
      </Box>
    </Box>
  );
};

const Summary: React.FC<{ report: UninstallReport }> = ({ report }) => (
  <Box flexDirection="column">
    <Text color={colors.success}>
      {icons.tick} Removed: {report.removed.length}
    </Text>
    {report.failed.length > 0 && (
      <>
        <Text color={colors.error}>
          {icons.warning} Failed: {report.failed.length}
        </Text>
        {report.failed.map((f) => (
          <Text key={f.path} color={colors.error}>
            {'  '}
            {f.path}: {f.error}
          </Text>
        ))}
      </>
    )}
    {report.daemonKilled && (
      <Text color={colors.warning}>
        {icons.warning} Daemon did not exit cleanly; SIGKILL'd.
      </Text>
    )}
    {report.activeSessions.length > 0 && (
      <>
        <Text color={colors.warning}>
          {icons.warning} {report.activeSessions.length} active mole CLI
          session(s) detected (PIDs: {report.activeSessions.join(', ')}).
        </Text>
        <Text color={colors.warning}>
          {'  '}Their ssh tunnels will keep running until you exit them.
        </Text>
      </>
    )}
  </Box>
);
