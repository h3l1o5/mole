import type { SshHost } from '../../lib/ssh-config';
import type { ProfileInfo } from '../../lib/chrome-profile';

export interface WillInput {
  host: SshHost;
  profile: ProfileInfo | 'skip';
}

const SOCKET_PATH = '/tmp/mole-clip.sock';

export function buildWillLines({ host, profile }: WillInput): string[] {
  const lines: string[] = [];
  if (profile !== 'skip') {
    lines.push(`launch Chrome with profile ${profile.name}`);
  }
  lines.push(`open SSH session to ${host.name}`);
  lines.push(`forward Mac clipboard via ${SOCKET_PATH}`);
  return lines;
}
