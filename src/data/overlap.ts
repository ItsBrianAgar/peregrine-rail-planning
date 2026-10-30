// Which speed restrictions sit on the same stretch of track as a block of work.
// This is Kevin's core question: "when I'm doing one defect, I might as well do ten".

import type { SpeedRestriction } from './speeds.ts';
import { sideOf } from '../geo/side.ts';
import type { Side } from '../geo/side.ts';

export function speedsOnStretch(
  elr: string,
  side: Side,
  fromYards: number,
  toYards: number,
  speeds: SpeedRestriction[],
): SpeedRestriction[] {
  const lo = Math.min(fromYards, toYards);
  const hi = Math.max(fromYards, toYards);
  return speeds.filter((s) => {
    if (s.state === 'inactive' || s.elr.toUpperCase() !== elr.toUpperCase()) return false;
    const a = s.fromYards ?? s.toYards;
    const b = s.toYards ?? s.fromYards;
    if (a === null || b === null) return false;
    // Ranges must overlap, not just touch.
    if (Math.max(a, b) <= lo || Math.min(a, b) >= hi) return false;
    // A Down-line job doesn't help an Up-line restriction (and vice versa).
    const other = sideOf(s.line);
    return !(side && other && side !== other);
  });
}
