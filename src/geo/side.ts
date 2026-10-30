// Up and Down lines share one ELR centre line in our geometry, so features on a
// specific line are drawn a few pixels to one side of it.
//
// Mileage increases in the Down direction (away from London), and trains run on
// the left, so the Down line is on the left when you face increasing mileage.
// Sections are drawn in increasing-mileage order, and leaflet-polylineoffset puts
// positive offsets on the right of the drawing direction. So: Down = -, Up = +.
// (Checked on screen: east of Billericay, Down features sit north of the centre line.)

import L from 'leaflet';
import 'leaflet-polylineoffset';

export type Side = 'up' | 'down' | null;

/** "Up Main", "Down only", "Both", "Bi-di Main"... -> which side, or null for the centre. */
export function sideOf(line: string): Side {
  const s = line.toLowerCase();
  if (/\bboth\b|bi-?di/.test(s)) return null;
  if (/\bdown\b/.test(s)) return 'down';
  if (/\bup\b/.test(s)) return 'up';
  return null;
}

/** Distance from the centre line, in pixels. Smaller when zoomed out. */
export function offsetPx(zoom: number): number {
  return zoom >= 13 ? 10 : zoom >= 11 ? 7 : 4;
}

/** Width of a tamping band at this zoom: fills its side without crossing the centre much. */
export function bandWeight(zoom: number): number {
  return offsetPx(zoom) * 2 + 2;
}

/**
 * How far apart (in pixels) points on an offset line must be. Closer points make
 * the offset line fold back on itself and draw little loops, so they're thinned out.
 */
const THIN_TOLERANCE_PX = 2;

// Each line's full-detail points, kept so we can re-thin them at every zoom.
const fullDetail = new WeakMap<L.Polyline, L.LatLng[]>();

/** Drop points that are closer together than the tolerance at this zoom. */
function thinForZoom(map: L.Map, latlngs: L.LatLng[], zoom: number): L.LatLng[] {
  const points = latlngs.map((ll) => map.project(ll, zoom));
  return L.LineUtil.simplify(points, THIN_TOLERANCE_PX).map((p) => map.unproject(p, zoom));
}

/**
 * Re-apply offsets (and band widths) for the current zoom. Polylines opt in by
 * setting `side` in their options; bands also set `band: true`.
 */
export function restyleSided(map: L.Map, groups: L.LayerGroup[]): void {
  const zoom = map.getZoom();
  const px = offsetPx(zoom);
  for (const group of groups) {
    group.eachLayer((layer) => {
      if (!(layer instanceof L.Polyline)) return;
      const { side, band } = layer.options;
      if (!side) return;
      if (!fullDetail.has(layer)) fullDetail.set(layer, layer.getLatLngs() as L.LatLng[]);
      layer.setLatLngs(thinForZoom(map, fullDetail.get(layer)!, zoom));
      layer.setOffset(side === 'down' ? -px : px);
      if (band) layer.setStyle({ weight: bandWeight(zoom) });
    });
  }
}
