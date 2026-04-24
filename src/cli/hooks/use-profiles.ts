import { useEffect, useState } from 'react';
import type { ProfileInfo } from '../../lib/chrome-profile';
import { scanProfiles } from '../../lib/chrome-profile';

export type ProfileScanner = () => Promise<ProfileInfo[]>;

export function useProfiles(
  scanner: ProfileScanner = scanProfiles,
  intervalMs: number = 1000,
): ProfileInfo[] {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const p = await scanner();
        if (active) setProfiles(p);
      } catch {
        // swallow; keep previous state
      }
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [scanner, intervalMs]);

  return profiles;
}
