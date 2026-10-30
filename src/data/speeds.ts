// Speed restriction records, from either source CSV, in one shape the map can draw.
//
// Two sources today:
//   speed-restrictions.csv  - the SMD Anglia Speeds tracker ("2026 Latest Position")
//   top-speeds-*.csv        - the Top 10 performance-impacting speeds report
// Both were extracted by Data/scripts. Column names below must match those files.

import type { CsvRow } from './csv.ts';
import { parseMileage } from '../geo/mileage.ts';

export type SpeedSource = 'tracker' | 'top10';

/** active = on the ground now; planned = not imposed yet; inactive = removed or not needed. */
export type SpeedState = 'active' | 'planned' | 'inactive';

export interface SpeedRestriction {
  id: string;
  source: SpeedSource;
  elr: string;
  /** e.g. "Littleport to Downham Market", or the report's location text. */
  place: string;
  fromText: string;
  toText: string;
  fromYards: number | null;
  toYards: number | null;
  /** Lowest reduced speed in mph, for colouring. null if not given. */
  speedMph: number | null;
  /** Speed as written, e.g. "45/50". */
  speedText: string;
  linespeedText: string;
  /** Which line(s): "Up Main", "Both", "Up only"... */
  line: string;
  status: string;
  state: SpeedState;
  startDate: string;
  plannedRemoval: string;
  operators: string;
  notes: string;
  nextAction: string;
  rank: string;
  /** Data issues flagged when the CSV was extracted. */
  check: string;
  sourceRef: string;
}

function lowestSpeed(text: string): number | null {
  const nums = (text.match(/\d+/g) ?? []).map(Number);
  return nums.length ? Math.min(...nums) : null;
}

function stateOf(status: string): SpeedState {
  const s = status.toLowerCase();
  if (s.startsWith('removed') || s.includes('not needed')) return 'inactive';
  if (s.includes('planned') || s.includes('tbc')) return 'planned';
  return 'active';
}

/** The report has merged rank cells, e.g. "8\n9\n10". Show as "8–10". */
function tidyRank(rank: string): string {
  const nums = rank.split(/\s+/).filter(Boolean);
  if (nums.length <= 1) return nums[0] ?? '';
  return `${nums[0]}–${nums[nums.length - 1]}`;
}

export function fromTrackerRows(rows: CsvRow[]): SpeedRestriction[] {
  return rows.map((r) => {
    const place = [r.from_location, r.to_location].filter(Boolean).join(' to ');
    return {
      id: r.id,
      source: 'tracker',
      elr: r.elr,
      place,
      fromText: r.from_mileage ?? '',
      toText: r.to_mileage ?? '',
      fromYards: parseMileage(r.from_mileage),
      toYards: parseMileage(r.to_mileage),
      speedMph: lowestSpeed(r.reduced_speed_mph ?? ''),
      speedText: r.reduced_speed_mph ?? '',
      linespeedText: r.linespeed_mph ?? '',
      line: r.line_scope ?? '',
      status: r.status ?? '',
      state: stateOf(r.status ?? ''),
      startDate: r.start_date || r.start_date_text || '',
      plannedRemoval: '',
      operators: r.affected_operators ?? '',
      notes: r.notes ?? '',
      nextAction: '',
      rank: '',
      check: r.check ?? '',
      sourceRef: r.source ?? '',
    };
  });
}

export function fromTop10Rows(rows: CsvRow[]): SpeedRestriction[] {
  return rows.map((r) => ({
    id: r.id,
    source: 'top10',
    elr: r.elr,
    place: r.location ?? '',
    fromText: r.from_mileage ?? '',
    toText: r.to_mileage ?? '',
    fromYards: parseMileage(r.from_mileage),
    toYards: parseMileage(r.to_mileage),
    speedMph: lowestSpeed(r.reduced_speed_mph ?? ''),
    speedText: r.reduced_speed_mph ?? '',
    linespeedText: '',
    line: r.line ?? '',
    status: r.status ?? '',
    state: stateOf(r.status ?? ''),
    startDate: r.start_date ?? '',
    plannedRemoval: r.planned_removal_date ?? '',
    operators: '',
    notes: r.notes ?? '',
    nextAction: [r.next_action, r.who && `Who: ${r.who}`, r.when && `When: ${r.when}`].filter(Boolean).join(' · '),
    rank: tidyRank(r.rank ?? ''),
    check: r.check ?? '',
    sourceRef: [r.ref, r.source].filter(Boolean).join(' · '),
  }));
}

/** Speed bands for colour. Lower speed = bigger impact = darker. */
export const SPEED_BANDS = [
  { label: '≤ 30 mph', max: 30, color: '#0d366b' },
  { label: '35–45 mph', max: 45, color: '#1c5cab' },
  { label: '50–55 mph', max: 55, color: '#3987e5' },
  { label: '60 mph +', max: Infinity, color: '#86b6ef' },
] as const;

export const NO_SPEED_COLOR = '#898781';

export function speedColor(mph: number | null): string {
  if (mph === null) return NO_SPEED_COLOR;
  return SPEED_BANDS.find((b) => mph <= b.max)!.color;
}
