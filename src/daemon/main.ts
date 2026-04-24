import { createServer } from './server';
import { readClipboard, createCachedReader } from '../lib/clipboard';

// Cache briefly so Claude Code's back-to-back `TARGETS` and `image/png`
// xclip calls only spawn one osascript (~700ms each) per paste.
const CLIPBOARD_CACHE_TTL_MS = 500;

const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
const server = await createServer(
  socketPath,
  createCachedReader(readClipboard, CLIPBOARD_CACHE_TTL_MS),
);
console.log(`mole-daemon listening on ${server.socketPath}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
