// Asks the local daemon for its client id over the unix socket.
// Returns null if the daemon is unreachable, replies non-OK, or the
// JSON shape doesn't have a string `id`.
export async function fetchOurId(socketPath: string): Promise<string | null> {
  try {
    const r = await fetch('http://x/id', { unix: socketPath });
    if (!r.ok) return null;
    const j = (await r.json()) as { id?: string };
    return typeof j.id === 'string' && j.id.length > 0 ? j.id : null;
  } catch {
    return null;
  }
}
