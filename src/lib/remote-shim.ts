import shimContent from '../../remote/xclip' with { type: 'text' };

export const HEREDOC_TERMINATOR = 'MOLE_SHIM_EOF';

if (shimContent.includes(HEREDOC_TERMINATOR)) {
  throw new Error(
    `remote/xclip contains the reserved heredoc terminator '${HEREDOC_TERMINATOR}'. ` +
      `Pick a different terminator in src/lib/remote-shim.ts or remove the string from the shim.`,
  );
}

export const SHIM_CONTENT = shimContent;

export const SHIM_HASH = (() => {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(shimContent);
  return hasher.digest('hex').slice(0, 12);
})();
