// The rail network itself, drawn from the same ELR centre lines used for mileage
// lookups. Hover a line to see its ELR code.

import L from 'leaflet';
import type { MileageLookup } from '../geo/mileage.ts';
import { formatMileage } from '../geo/mileage.ts';

export function buildNetworkLayer(lookup: MileageLookup): L.LayerGroup {
  const group = L.layerGroup();
  for (const { elr, latlngs } of lookup.allLines()) {
    const [from, to] = lookup.range(elr)!;
    L.polyline(latlngs, { color: '#52514e', weight: 2, opacity: 0.55, interactive: false }).addTo(group);
    // A wider invisible line on top makes the thin line easy to hover.
    L.polyline(latlngs, { color: '#000', weight: 14, opacity: 0 })
      .bindTooltip(`${elr} · ${formatMileage(from)} to ${formatMileage(to)}`, { sticky: true, className: 'elr-tip' })
      .addTo(group);
  }
  return group;
}

export interface Station {
  name: string;
  crs: string;
  lat: number;
  lng: number;
}

/** Station dots, with names shown once you zoom in (see .labels-on in style.css). */
export function buildStationLayer(stations: Station[]): L.FeatureGroup<L.CircleMarker> {
  const group = L.featureGroup<L.CircleMarker>();
  for (const s of stations) {
    L.circleMarker([s.lat, s.lng], {
      radius: 4, color: '#52514e', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1,
    })
      .bindTooltip(s.name, { permanent: true, direction: 'right', offset: [6, 0], className: 'station-label' })
      .addTo(group);
  }
  return group;
}

/** Smaller station dots when zoomed out, so they don't swamp the speed data. */
export function sizeStations(group: L.FeatureGroup<L.CircleMarker>, zoom: number): void {
  const style = zoom < 9 ? { radius: 2, weight: 1 } : zoom < 11 ? { radius: 3, weight: 1.25 } : { radius: 4.5, weight: 1.5 };
  group.eachLayer((layer) => {
    const m = layer as L.CircleMarker;
    m.setRadius(style.radius);
    m.setStyle({ weight: style.weight });
  });
}
