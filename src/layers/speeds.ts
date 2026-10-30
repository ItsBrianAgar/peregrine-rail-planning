// Draws speed restrictions on the map as stretches of track (or a point when
// only one end is known), and reports anything it could not place.

import L from 'leaflet';
import type { MileageLookup } from '../geo/mileage.ts';
import { formatMileage } from '../geo/mileage.ts';
import type { SpeedRestriction } from '../data/speeds.ts';
import { speedColor } from '../data/speeds.ts';
import { sideOf } from '../geo/side.ts';
import { esc, niceDate } from '../util.ts';

export const TOP10_COLOR = '#eb6834';
const CASING_COLOR = '#ffffff';

export interface PlacedSite {
  item: SpeedRestriction;
  bounds: L.LatLngBounds;
  /** Pan to the site and open its popup. */
  focus: (map: L.Map) => void;
}

export interface UnplacedSite {
  item: SpeedRestriction;
  reason: string;
}

export interface SpeedLayer {
  group: L.LayerGroup;
  placed: PlacedSite[];
  unplaced: UnplacedSite[];
}

export function buildSpeedLayer(items: SpeedRestriction[], lookup: MileageLookup): SpeedLayer {
  const group = L.layerGroup();
  const placed: PlacedSite[] = [];
  const unplaced: UnplacedSite[] = [];

  for (const item of items) {
    if (item.state === 'inactive') {
      unplaced.push({ item, reason: `${item.status || 'Inactive'}, so not drawn` });
      continue;
    }

    const color = item.source === 'top10' ? TOP10_COLOR : speedColor(item.speedMph);
    const dash = item.state === 'planned' ? '6 7' : undefined;
    const { fromYards: a, toYards: b } = item;
    let note = '';

    // Work out the geometry: a section if both ends are known, otherwise a point.
    let latlngs: L.LatLngTuple[] | null = null;
    let point: L.LatLngTuple | null = null;

    if (a !== null && b !== null && a !== b) {
      const res = lookup.section(item.elr, a, b);
      if (!res.ok) { unplaced.push({ item, reason: res.reason }); continue; }
      latlngs = res.latlngs;
      if (res.snapped) note = 'One end is just past the end of the line data, so it is drawn to the line end.';
    } else if (a !== null || b !== null) {
      const res = lookup.point(item.elr, (a ?? b)!);
      if (!res.ok) { unplaced.push({ item, reason: res.reason }); continue; }
      point = res.latlng;
      if (a !== b) note = `Only one end mileage is known (${a === null ? 'from' : 'to'} is "${item[a === null ? 'fromText' : 'toText'] || 'blank'}"), so it is shown as a point.`;
    } else {
      const given = [item.fromText, item.toText].filter(Boolean).join(' → ');
      unplaced.push({ item, reason: given ? `Mileage not readable: ${given}` : 'No mileage given' });
      continue;
    }

    const popup = popupHtml(item, note);
    const tip = tooltipText(item);
    let target: L.Layer;
    let bounds: L.LatLngBounds;

    if (latlngs) {
      // Up/Down line restrictions sit to one side of the centre line (see geo/side.ts).
      const side = sideOf(item.line);
      // White casing underneath keeps the line readable over the base map.
      L.polyline(latlngs, { color: CASING_COLOR, weight: 9, opacity: 0.9, interactive: false, side }).addTo(group);
      L.polyline(latlngs, { color, weight: 5, opacity: 1, dashArray: dash, lineCap: 'round', interactive: false, side }).addTo(group);
      // A wide invisible line on top makes the thin line easy to hover and click.
      const hit = L.polyline(latlngs, { color: '#000', weight: 22, opacity: 0, side })
        .bindPopup(popup, { maxWidth: 360 })
        .bindTooltip(tip, { sticky: true, direction: 'top', offset: [0, -8] })
        .addTo(group);
      target = hit;
      bounds = L.latLngBounds(latlngs);

      if (item.source === 'top10' && item.rank) {
        const mid = latlngs[Math.floor(latlngs.length / 2)];
        L.marker(mid, {
          icon: L.divIcon({ className: 'rank-badge', html: esc(item.rank), iconSize: [26, 26] }),
          interactive: false,
          keyboard: false,
        }).addTo(group);
      }
    } else {
      const marker = L.circleMarker(point!, {
        radius: 8, color: CASING_COLOR, weight: 2.5, fillColor: color, fillOpacity: 1, dashArray: dash,
      })
        .bindPopup(popup, { maxWidth: 360 })
        .bindTooltip(tip, { direction: 'top', offset: [0, -10] })
        .addTo(group);
      target = marker;
      bounds = L.latLngBounds([point!, point!]);
    }

    placed.push({
      item,
      bounds,
      focus: (map) => {
        map.flyToBounds(bounds, { maxZoom: 13, padding: [60, 60], duration: 0.6 });
        map.once('moveend', () => target.openPopup());
      },
    });
  }

  return { group, placed, unplaced };
}

function tooltipText(item: SpeedRestriction): string {
  const speed = item.speedText ? `${item.speedText} mph` : 'speed not given';
  const rank = item.rank ? ` · rank ${item.rank}` : '';
  return `${item.id} · ${item.elr} · ${speed}${rank}`;
}

function row(label: string, value: string): string {
  return value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '';
}

function popupHtml(item: SpeedRestriction, note: string): string {
  const mileage = [item.fromText, item.toText].filter(Boolean).join(' → ');
  const sourceName = item.source === 'top10' ? 'Top 10 speeds report' : 'SMD speeds tracker';
  const fmtYards = (y: number | null) => (y === null ? '' : formatMileage(y));
  const length =
    item.fromYards !== null && item.toYards !== null
      ? `${(Math.abs(item.toYards - item.fromYards) / 1760).toFixed(2)} miles`
      : '';
  return `
    <div class="popup">
      <p class="popup-kicker">${esc(sourceName)} · ${esc(item.id)}${item.rank ? ` · rank ${esc(item.rank)}` : ''}</p>
      <h3>${esc(item.place || item.elr)}</h3>
      <table>
        ${row('ELR', item.elr)}
        ${row('Line', item.line)}
        ${row('Mileage', mileage || `${fmtYards(item.fromYards)} ${fmtYards(item.toYards)}`)}
        ${row('Length', length)}
        ${row('Reduced speed', item.speedText ? `${item.speedText} mph` : 'Not given')}
        ${row('Linespeed', item.linespeedText ? `${item.linespeedText} mph` : '')}
        ${row('Status', item.status)}
        ${row('Since', niceDate(item.startDate))}
        ${row('Planned removal', niceDate(item.plannedRemoval))}
        ${row('Operators', item.operators)}
      </table>
      ${item.notes ? `<p class="popup-notes">${esc(item.notes)}</p>` : ''}
      ${item.nextAction ? `<p class="popup-notes"><strong>Next:</strong> ${esc(item.nextAction)}</p>` : ''}
      ${note ? `<p class="popup-flag">${esc(note)}</p>` : ''}
      ${item.check ? `<p class="popup-flag">Data check: ${esc(item.check)}</p>` : ''}
      <p class="popup-source">${esc(item.sourceRef)}</p>
    </div>`;
}
