import type { FetchFn } from './daemon-health';

// Asks the local daemon for its client id over the unix socket.
// Returns null if the daemon is unreachable, replies non-OK, or the
// JSON shape doesn't have a non-empty string `id`.
export async function fetchOurIdWith(
  socketPath: string,
  fetcher: FetchFn,
): Promise<string | null> {
  try {
    const r = await fetcher('http://x/id', { unix: socketPath });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: unknown };
    return typeof j.id === 'string' && j.id.length > 0 ? j.id : null;
  } catch {
    return null;
  }
}

export async function fetchOurId(socketPath: string): Promise<string | null> {
  return fetchOurIdWith(socketPath, fetch as FetchFn);
}
