import { existsSync, unlinkSync } from 'node:fs';
import type { ClipboardResult } from '../lib/clipboard';

export type ReadClipboardFn = () => Promise<ClipboardResult>;

export interface MoleServer {
  socketPath: string;
  stop: () => Promise<void>;
}

export async function createServer(
  socketPath: string,
  readClipboard: ReadClipboardFn,
): Promise<MoleServer> {
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
    } catch {
      // ignore
    }
  }

  const server = Bun.serve({
    unix: socketPath,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/type') {
        const result = await readClipboard();
        if (result.type === 'image') {
          return Response.json({ type: 'image', format: result.format });
        }
        return Response.json({ type: 'empty' });
      }
      if (url.pathname === '/image') {
        const result = await readClipboard();
        if (result.type !== 'image') {
          return new Response('no image', { status: 404 });
        }
        return new Response(result.data, {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return new Response('not found', { status: 404 });
    },
  });

  return {
    socketPath,
    stop: async () => {
      server.stop(true);
      if (existsSync(socketPath)) {
        try {
          unlinkSync(socketPath);
        } catch {
          // ignore
        }
      }
    },
  };
}
