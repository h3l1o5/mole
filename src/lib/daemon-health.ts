export type FetchFn = (url: string, init?: RequestInit & { unix?: string }) => Promise<Response>;

export async function isDaemonHealthyWith(
  socketPath: string,
  fetcher: FetchFn,
): Promise<boolean> {
  try {
    const r = await fetcher(`http://x/type`, { unix: socketPath });
    return r.ok;
  } catch {
    return false;
  }
}

export async function isDaemonHealthy(socketPath: string): Promise<boolean> {
  return isDaemonHealthyWith(socketPath, fetch as FetchFn);
}
