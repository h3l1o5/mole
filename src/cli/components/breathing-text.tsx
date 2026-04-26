import { useEffect, useState, useMemo } from 'react';
import { breathing } from './theme';

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => Math.round(c).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function buildKeyframes(
  base: string,
  peak: string,
  steps: number,
): string[] {
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(peak);
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    return rgbToHex(
      r1 + (r2 - r1) * t,
      g1 + (g2 - g1) * t,
      b1 + (b2 - b1) * t,
    );
  });
}

export function buildTriangle(steps: number): number[] {
  const forward = Array.from({ length: steps }, (_, i) => i);
  const backward = Array.from({ length: steps - 2 }, (_, i) => steps - 2 - i);
  return [...forward, ...backward];
}

export interface BreathingOptions {
  baseColor?: string;
  peakColor?: string;
  periodMs?: number;
  steps?: number;
  frozen?: boolean;
}

// Returns the current frame's hex color, or undefined when frozen so
// the caller can render its own static fallback (e.g. dim text, plain
// border color).
export function useBreathingColor({
  baseColor = breathing.primary.base,
  peakColor = breathing.primary.peak,
  periodMs = 3000,
  steps = 8,
  frozen = false,
}: BreathingOptions = {}): string | undefined {
  const keyframes = useMemo(
    () => buildKeyframes(baseColor, peakColor, steps),
    [baseColor, peakColor, steps],
  );
  const triangle = useMemo(() => buildTriangle(steps), [steps]);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (frozen) return;
    const intervalMs = Math.max(1, Math.round(periodMs / triangle.length));
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % triangle.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [periodMs, triangle.length, frozen]);

  if (frozen) return undefined;
  return keyframes[triangle[frame]!];
}

