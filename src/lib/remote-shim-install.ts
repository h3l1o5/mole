import { realSshRunner, type SshRunner } from './ssh-exec';
import { SHIM_CONTENT, HEREDOC_TERMINATOR } from './remote-shim';

export type InstallOutcome =
  | { ok: true }
  | { ok: false; error: string };

export function buildInstallScript(shimContent: string): string {
  // Heredoc terminates each line with \n; strip a trailing newline from
  // shimContent so the written file matches the source byte-for-byte
  // (otherwise sha256sum disagrees with SHIM_HASH and reinstall loops).
  const body = shimContent.endsWith('\n') ? shimContent.slice(0, -1) : shimContent;
  return `set -eu
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/xclip" <<'${HEREDOC_TERMINATOR}'
${body}
${HEREDOC_TERMINATOR}
chmod +x "$HOME/.local/bin/xclip"

path_line='export PATH="$HOME/.local/bin:$PATH"'
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    if ! grep -qF "$path_line" "$HOME/.bashrc" 2>/dev/null; then
      printf '\\n# Added by mole installer\\n%s\\n' "$path_line" >> "$HOME/.bashrc"
    fi
    ;;
esac
`;
}

export async function installShimWith(
  host: string,
  shimContent: string,
  runner: SshRunner,
): Promise<InstallOutcome> {
  const script = buildInstallScript(shimContent);
  const { stderr, code } = await runner(host, script);
  if (code === 0) return { ok: true };
  const trimmed = stderr.trim();
  return {
    ok: false,
    error: trimmed.length > 0 ? trimmed : `ssh install failed with exit code ${code}`,
  };
}

export async function installShim(host: string): Promise<InstallOutcome> {
  return installShimWith(host, SHIM_CONTENT, realSshRunner);
}
