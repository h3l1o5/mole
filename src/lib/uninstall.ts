export interface UninstallDeps {
  bootout: () => Promise<{ code: number; stderr: string }>;
  socketGone: () => Promise<boolean>;
  killDaemon: () => Promise<void>;
  remove: (
    path: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  sleep: (ms: number) => Promise<void>;
  listActiveSessions: () => Promise<number[]>;
}

export interface UninstallReport {
  daemonStopped: boolean;
  daemonKilled: boolean;
  removed: string[];
  failed: { path: string; error: string }[];
  activeSessions: number[];
}

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 500;

export async function performUninstall(
  deps: UninstallDeps,
  paths: string[],
): Promise<UninstallReport> {
  // Sample CLI sessions before bootout so the report can warn the user that
  // their ssh tunnels are still alive after the daemon goes away.
  const activeSessions = await deps.listActiveSessions();

  await deps.bootout();

  let stopped = false;
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    if (await deps.socketGone()) {
      stopped = true;
      break;
    }
    await deps.sleep(POLL_INTERVAL_MS);
  }

  let daemonKilled = false;
  if (!stopped) {
    await deps.killDaemon();
    daemonKilled = true;
  }

  const removed: string[] = [];
  const failed: { path: string; error: string }[] = [];
  for (const p of paths) {
    const r = await deps.remove(p);
    if (r.ok) removed.push(p);
    else failed.push({ path: p, error: r.error });
  }

  return {
    daemonStopped: true,
    daemonKilled,
    removed,
    failed,
    activeSessions,
  };
}
