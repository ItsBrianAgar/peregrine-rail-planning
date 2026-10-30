// Tamping plan blocks, from tamping-*.csv (transcribed from the SSV tamping plan PDF).

import type { CsvRow } from './csv.ts';
import { parseMileage } from '../geo/mileage.ts';

export interface TampingBlock {
  id: string;
  elr: string;
  /** "Down Main", "Up Main", or blank if the plan doesn't say. */
  line: string;
  trackId: string;
  /** Rail week number as printed, e.g. "27". */
  week: string;
  /** Shift code as printed, e.g. "HN". */
  shift: string;
  work: string;
  fromText: string;
  toText: string;
  fromYards: number | null;
  toYards: number | null;
  /** True when the plan doesn't print the mileage and it was read off the diagram. */
  inferred: boolean;
  status: string;
  esrOnPlan: string;
  notes: string;
  check: string;
  sourceRef: string;
}

// Shift codes are a day letter + N for night: TN = Tuesday night, HN = Thursday night.
const DAYS: Record<string, string> = {
  M: 'Monday', T: 'Tuesday', W: 'Wednesday', H: 'Thursday', F: 'Friday', S: 'Saturday', U: 'Sunday',
};

/** "HN" -> "Thursday night". Unknown codes are returned as they are. */
export function shiftLabel(code: string): string {
  const m = code.trim().match(/^([MTWHFSU])N$/i);
  return m ? `${DAYS[m[1].toUpperCase()]} night` : code;
}

export function fromTampingRows(rows: CsvRow[]): TampingBlock[] {
  return rows.map((r) => ({
    id: r.id,
    elr: r.elr,
    line: r.line ?? '',
    trackId: r.track_id ?? '',
    week: r.week ?? '',
    shift: r.shift ?? '',
    work: r.work ?? '',
    fromText: r.from_mileage ?? '',
    toText: r.to_mileage ?? '',
    fromYards: parseMileage(r.from_mileage),
    toYards: parseMileage(r.to_mileage),
    inferred: (r.mileage_basis ?? '').toLowerCase().startsWith('inferred'),
    status: r.status ?? '',
    esrOnPlan: r.esr_on_plan ?? '',
    notes: r.notes ?? '',
    check: r.check ?? '',
    sourceRef: r.source ?? '',
  }));
}
