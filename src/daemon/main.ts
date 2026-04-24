import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from './server';
import { readClipboard, createCachedReader } from '../lib/clipboard';
import { getOrCreateClientId } from '../lib/client-id';

// Cache briefly so Claude Code's back-to-back `TARGETS` and `image/png`
// xclip calls only spawn one osascript (~700ms each) per paste.
const CLIPBOARD_CACHE_TTL_MS = 500;

const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
const clientIdPath =
  process.env.MOLE_CLIENT_ID_PATH ??
  join(homedir(), '.local/state/mole/client-id');
const clientId = getOrCreateClientId(clientIdPath);
const server = await createServer(
  socketPath,
  createCachedReader(readClipboard, CLIPBOARD_CACHE_TTL_MS),
  { clientId },
);
console.log(`mole-daemon listening on ${server.socketPath} (id=${clientId})`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
