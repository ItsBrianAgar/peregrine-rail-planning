// Tamping blocks drawn as wide translucent bands on their line (Up or Down side),
// so a speed restriction on the same stretch shows as a line running through the band.

import L from 'leaflet';
import type { MileageLookup } from '../geo/mileage.ts';
import { formatMileage } from '../geo/mileage.ts';
import { bandWeight, sideOf } from '../geo/side.ts';
import type { TampingBlock } from '../data/tamping.ts';
import { shiftLabel } from '../data/tamping.ts';
import type { SpeedRestriction } from '../data/speeds.ts';
import { speedsOnStretch } from '../data/overlap.ts';
import { esc } from '../util.ts';

export const TAMPING_COLOR = '#1baf7a';

export interface PlacedBlock {
  item: TampingBlock;
  bounds: L.LatLngBounds;
  focus: (map: L.Map) => void;
}

export interface TampingLayer {
  group: L.LayerGroup;
  placed: PlacedBlock[];
  unplaced: { item: TampingBlock; reason: string }[];
}

export function buildTampingLayer(
  items: TampingBlock[],
  lookup: MileageLookup,
  speeds: SpeedRestriction[],
): TampingLayer {
  const group = L.layerGroup();
  const placed: PlacedBlock[] = [];
  const unplaced: TampingLayer['unplaced'] = [];

  for (const item of items) {
    const { fromYards: a, toYards: b } = item;
    if (a === null || b === null) {
      const given = [item.fromText, item.toText].filter(Boolean).join(' → ');
      unplaced.push({ item, reason: item.check || (given ? `Mileage not readable: ${given}` : 'No mileage given') });
      continue;
    }
    const res = lookup.section(item.elr, a, b);
    if (!res.ok) { unplaced.push({ item, reason: res.reason }); continue; }

    const side = sideOf(item.line);
    const onStretch = speedsOnStretch(item.elr, side, a, b, speeds);
    // Width and offset are set for the current zoom by restyleSided() in main.ts.
    const band = L.polyline(res.latlngs, {
      color: TAMPING_COLOR,
      weight: bandWeight(13),
      opacity: item.inferred ? 0.35 : 0.5,
      lineCap: 'butt',
      dashArray: item.inferred ? '6 4' : undefined,
      side,
      band: true,
    })
      .bindPopup(popupHtml(item, a, b, onStretch), { maxWidth: 360 })
      .bindTooltip(`${item.id} · Week ${item.week} ${item.shift} · ${item.elr} ${item.line || ''}`.trim(), {
        sticky: true, direction: 'top', offset: [0, -8],
      })
      .addTo(group);

    // Week label clear of the band: above for Down, below for Up (shown when zoomed in).
    // "Above" matches the Down side on east-running lines like SSV, not everywhere.
    const mid = res.latlngs[Math.floor(res.latlngs.length / 2)];
    L.marker(mid, {
      icon: L.divIcon({
        className: 'week-badge',
        html: `W${esc(item.week)}`,
        iconSize: [34, 18],
        iconAnchor: side === 'up' ? [17, -24] : [17, 42],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(group);

    const bounds = L.latLngBounds(res.latlngs);
    placed.push({
      item,
      bounds,
      focus: (map) => {
        map.flyToBounds(bounds, { maxZoom: 14, padding: [60, 60], duration: 0.6 });
        map.once('moveend', () => band.openPopup());
      },
    });
  }

  return { group, placed, unplaced };
}

function row(label: string, value: string): string {
  return value ? `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>` : '';
}

function speedLine(s: SpeedRestriction): string {
  const speed = s.speedText ? `${s.speedText} mph` : 'speed not given';
  const from = s.source === 'top10' ? `Top 10${s.rank ? ` (rank ${s.rank})` : ''}` : 'SMD tracker';
  return `<li><strong>${esc(s.id)}</strong> · ${esc(speed)} · ${esc(s.line || 'line not given')} · ${esc(from)}</li>`;
}

function popupHtml(item: TampingBlock, a: number, b: number, onStretch: SpeedRestriction[]): string {
  const line = [item.line, item.trackId && `track ${item.trackId}`].filter(Boolean).join(', ');
  const length = `${(Math.abs(b - a) / 1760).toFixed(2)} miles`;
  return `
    <div class="popup">
      <p class="popup-kicker">Tamping plan · ${esc(item.id)}</p>
      <h3>Week ${esc(item.week)} · ${esc(shiftLabel(item.shift))} (${esc(item.shift)})</h3>
      <table>
        ${row('ELR', item.elr)}
        ${row('Line', line)}
        ${row('Mileage', `${formatMileage(Math.min(a, b))} → ${formatMileage(Math.max(a, b))}`)}
        ${row('Length', length)}
        ${row('Work', item.work)}
        ${row('Status', item.status)}
        ${row('ESR on the plan', item.esrOnPlan)}
      </table>
      <p class="popup-subhead">Speed restrictions on this stretch</p>
      ${onStretch.length
        ? `<ul class="popup-list">${onStretch.map(speedLine).join('')}</ul>`
        : '<p class="popup-notes">None in the speeds files.</p>'}
      ${item.notes ? `<p class="popup-notes">${esc(item.notes)}</p>` : ''}
      ${item.inferred ? '<p class="popup-flag">Mileage isn\'t printed on the plan. It\'s read off the diagram, so treat it as approximate.</p>' : ''}
      ${item.check && !item.inferred ? `<p class="popup-flag">Data check: ${esc(item.check)}</p>` : ''}
      <p class="popup-source">${esc(item.sourceRef)}</p>
    </div>`;
}
