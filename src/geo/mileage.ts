// Turns an ELR + mileage (miles and chains) into a position on the map.
//
// Rail locations are given as distance along a specific line (the ELR, e.g. "BGK")
// from that line's own zero point. public/data/elr-geometry.json holds each ELR's
// centre line as a list of points, and the mileage at each point. To place a
// mileage we find the two points either side of it and interpolate between them.
//
// Units: 1 mile = 80 chains = 1760 yards, 1 chain = 22 yards.
// Internally everything is in total yards so maths stays simple.

import type { LatLngTuple } from 'leaflet';

export const YARDS_PER_MILE = 1760;
export const YARDS_PER_CHAIN = 22;

/** How far past either end of a line we still accept (and snap to the end). */
const END_TOLERANCE_YARDS = 440; // a quarter mile

/** One point on an ELR centre line: [longitude, latitude, mileage in yards]. */
type Vertex = [number, number, number];

export interface ElrLine {
  from_yards: number;
  to_yards: number;
  length_m: number;
  waymarks_used: number;
  coords: Vertex[];
}

export interface ElrGeometry {
  about: string;
  source: string;
  generated: string;
  elrs: Record<string, ElrLine>;
}

export type PointResult =
  | { ok: true; latlng: LatLngTuple; snapped: boolean }
  | { ok: false; reason: string };

export type SectionResult =
  | { ok: true; latlngs: LatLngTuple[]; snapped: boolean }
  | { ok: false; reason: string };

/**
 * Parse "76m40ch", "76m 40ch" or "76m 40c" into total yards.
 * Anything else (blank, "TBC", "70m nullch (as given)") returns null.
 */
export function parseMileage(text: string | undefined): number | null {
  const m = (text ?? '').trim().match(/^(\d+)\s*m\s*(\d{1,2})\s*ch?$/i);
  if (!m) return null;
  const miles = Number(m[1]);
  const chains = Number(m[2]);
  if (chains >= 80) return null;
  return miles * YARDS_PER_MILE + chains * YARDS_PER_CHAIN;
}

/** Total yards back to "76m 40ch" for display. */
export function formatMileage(yards: number): string {
  const miles = Math.floor(yards / YARDS_PER_MILE);
  const chains = Math.round((yards - miles * YARDS_PER_MILE) / YARDS_PER_CHAIN);
  return `${miles}m ${String(chains).padStart(2, '0')}ch`;
}

export class MileageLookup {
  private lines = new Map<string, Vertex[]>();

  constructor(geometry: ElrGeometry) {
    for (const [elr, line] of Object.entries(geometry.elrs)) {
      // Store every line with mileage increasing, so lookups only handle one direction.
      const coords = line.coords;
      const increasing = coords[0][2] <= coords[coords.length - 1][2];
      this.lines.set(elr.toUpperCase(), increasing ? coords : [...coords].reverse());
    }
  }

  has(elr: string): boolean {
    return this.lines.has(elr.toUpperCase());
  }

  /** All ELR centre lines, for drawing the network. */
  allLines(): { elr: string; latlngs: LatLngTuple[] }[] {
    return [...this.lines].map(([elr, coords]) => ({
      elr,
      latlngs: coords.map(([lng, lat]) => [lat, lng] as LatLngTuple),
    }));
  }

  /** Mileage range covered by an ELR, in yards. */
  range(elr: string): [number, number] | null {
    const c = this.lines.get(elr.toUpperCase());
    return c ? [c[0][2], c[c.length - 1][2]] : null;
  }

  point(elr: string, yards: number): PointResult {
    const c = this.lines.get(elr.toUpperCase());
    if (!c) return { ok: false, reason: `ELR ${elr} not in the map data` };
    const fit = this.fitToLine(c, yards);
    if (fit === null) return { ok: false, reason: this.outOfRange(elr, c, yards) };
    return { ok: true, latlng: this.interpolate(c, fit), snapped: fit !== yards };
  }

  /** The stretch of track between two mileages, as a polyline. */
  section(elr: string, fromYards: number, toYards: number): SectionResult {
    const c = this.lines.get(elr.toUpperCase());
    if (!c) return { ok: false, reason: `ELR ${elr} not in the map data` };
    const lo = this.fitToLine(c, Math.min(fromYards, toYards));
    const hi = this.fitToLine(c, Math.max(fromYards, toYards));
    if (lo === null) return { ok: false, reason: this.outOfRange(elr, c, Math.min(fromYards, toYards)) };
    if (hi === null) return { ok: false, reason: this.outOfRange(elr, c, Math.max(fromYards, toYards)) };

    const latlngs: LatLngTuple[] = [this.interpolate(c, lo)];
    for (const [lng, lat, y] of c) {
      if (y > lo && y < hi) latlngs.push([lat, lng]);
    }
    latlngs.push(this.interpolate(c, hi));
    const snapped = lo !== Math.min(fromYards, toYards) || hi !== Math.max(fromYards, toYards);
    return { ok: true, latlngs, snapped };
  }

  /** Keep a mileage inside the line, allowing a little slack at the ends. */
  private fitToLine(c: Vertex[], yards: number): number | null {
    const start = c[0][2];
    const end = c[c.length - 1][2];
    if (yards < start - END_TOLERANCE_YARDS || yards > end + END_TOLERANCE_YARDS) return null;
    return Math.min(Math.max(yards, start), end);
  }

  private interpolate(c: Vertex[], yards: number): LatLngTuple {
    // Binary search for the first vertex at or beyond this mileage.
    let lo = 0;
    let hi = c.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (c[mid][2] < yards) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return [c[0][1], c[0][0]];
    const [lng0, lat0, y0] = c[lo - 1];
    const [lng1, lat1, y1] = c[lo];
    const t = y1 === y0 ? 0 : (yards - y0) / (y1 - y0);
    return [lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t];
  }

  private outOfRange(elr: string, c: Vertex[], yards: number): string {
    return `${formatMileage(yards)} is outside ${elr} (${formatMileage(c[0][2])} to ${formatMileage(c[c.length - 1][2])})`;
  }
}
