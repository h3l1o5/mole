import { createServer } from './server';
import { readClipboard } from '../lib/clipboard';

const socketPath = process.env.MOLE_SOCKET ?? '/tmp/mole-clip.sock';
const server = await createServer(socketPath, readClipboard);
console.log(`mole-daemon listening on ${server.socketPath}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
