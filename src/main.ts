import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';

import { DATA_FILES, START_VIEW } from './config.ts';
import { fetchJson, fetchText, parseCsv } from './data/csv.ts';
import { fromTop10Rows, fromTrackerRows, speedColor } from './data/speeds.ts';
import { fromTampingRows, shiftLabel } from './data/tamping.ts';
import type { TampingBlock } from './data/tamping.ts';
import { MileageLookup } from './geo/mileage.ts';
import type { ElrGeometry } from './geo/mileage.ts';
import { restyleSided, sideOf } from './geo/side.ts';
import { buildNetworkLayer, buildStationLayer, sizeStations } from './layers/network.ts';
import type { Station } from './layers/network.ts';
import { buildSpeedLayer, TOP10_COLOR } from './layers/speeds.ts';
import type { SpeedLayer } from './layers/speeds.ts';
import { buildTampingLayer, TAMPING_COLOR } from './layers/tamping.ts';
import type { TampingLayer } from './layers/tamping.ts';
import { createPanel } from './ui/panel.ts';
import type { LayerKey, ListGroup, ListItem, UnplacedItem } from './ui/panel.ts';
import { esc } from './util.ts';

const STATION_LABEL_ZOOM = 11;
const WEEK_LABEL_ZOOM = 13;

async function start() {
  const map = L.map('map', { zoomControl: false, preferCanvas: false }).setView(START_VIEW.center, START_VIEW.zoom);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ position: 'bottomright', imperial: true, metric: true }).addTo(map);

  // OpenStreetMap's own tiles: fine for a small pilot. Swap for a paid or OS tile
  // service before wider use (see README).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'basemap',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const [geometry, stations, trackerCsv, top10Csv, tampingCsv] = await Promise.all([
    fetchJson<ElrGeometry>(DATA_FILES.geometry),
    fetchJson<Station[]>(DATA_FILES.stations),
    fetchText(DATA_FILES.speedRestrictions),
    fetchText(DATA_FILES.topSpeeds),
    fetchText(DATA_FILES.tamping),
  ]);

  const lookup = new MileageLookup(geometry);
  const tracker = fromTrackerRows(parseCsv(trackerCsv));
  const top10 = fromTop10Rows(parseCsv(top10Csv));
  const tamping = fromTampingRows(parseCsv(tampingCsv));
  const allSpeeds = [...tracker, ...top10];

  const visible: Record<LayerKey, boolean> = { network: true, stations: true, tamping: true, tracker: true, top10: true };
  const stationLayer = buildStationLayer(stations);
  const layers: Record<LayerKey, L.LayerGroup> = {
    network: buildNetworkLayer(lookup),
    stations: stationLayer,
    tamping: L.layerGroup(),
    tracker: L.layerGroup(),
    top10: L.layerGroup(),
  };
  // Draw order: network at the bottom, tamping bands, then speeds, stations on top.
  const order: LayerKey[] = ['network', 'tamping', 'top10', 'tracker', 'stations'];

  let elrFilter = '';
  let weekFilter = '';
  let built: { tracker: SpeedLayer; top10: SpeedLayer; tamping: TampingLayer };

  const elrs = [...new Set([...allSpeeds, ...tamping].map((r) => r.elr))].sort();
  const weeks = [...new Set(tamping.map((t) => t.week))].sort((a, b) => Number(a) - Number(b));
  const panel = createPanel(document.getElementById('panel')!, {
    elrs,
    weeks,
    visible,
    geometryNote: `Mileages converted using Network Rail open GIS centre lines, calibrated to quarter-mile posts (built ${geometry.generated}).`,
    onToggle: (key, on) => { visible[key] = on; redraw(); },
    onElrFilter: (elr) => { elrFilter = elr; rebuild(); fitToSites(); },
    onWeekFilter: (week) => { weekFilter = week; rebuild(); fitToSites(true, week ? 'tamping' : 'all'); },
  });

  function byElr<T extends { elr: string }>(items: T[]): T[] {
    return elrFilter ? items.filter((r) => r.elr === elrFilter) : items;
  }

  function rebuild() {
    // Take the old groups off the map before replacing them, or they stay drawn.
    layers.tracker.remove();
    layers.top10.remove();
    layers.tamping.remove();
    const tampingShown = byElr(tamping).filter((t) => !weekFilter || t.week === weekFilter);
    built = {
      tracker: buildSpeedLayer(byElr(tracker), lookup),
      top10: buildSpeedLayer(byElr(top10), lookup),
      // Overlaps are checked against every speed restriction, whatever the filter.
      tamping: buildTampingLayer(tampingShown, lookup, allSpeeds),
    };
    layers.tracker = built.tracker.group;
    layers.top10 = built.top10.group;
    layers.tamping = built.tamping.group;
    panel.update(listGroups(), unplacedItems());
    redraw();
  }

  function speedItems(layer: SpeedLayer): ListItem[] {
    return layer.placed.map(({ item, focus }) => ({
      id: item.id,
      elr: item.elr,
      place: item.place,
      value: item.speedText,
      color: item.source === 'top10' ? TOP10_COLOR : speedColor(item.speedMph),
      style: item.state === 'planned' ? 'dashed' : 'line',
      focus: () => focus(map),
    }));
  }

  function tampingItems(layer: TampingLayer): ListItem[] {
    return layer.placed.map(({ item, focus }) => ({
      id: item.id,
      elr: item.elr,
      place: `Week ${item.week} · ${shiftLabel(item.shift)}`,
      value: sideLabel(item.line),
      color: TAMPING_COLOR,
      style: item.inferred ? 'band-dashed' : 'band',
      focus: () => focus(map),
    }));
  }

  function listGroups(): ListGroup[] {
    return [
      { title: 'Speed restrictions', items: speedItems(built.tracker) },
      { title: 'Top 10 performance speeds', items: speedItems(built.top10) },
      { title: 'Tamping plan', items: tampingItems(built.tamping) },
    ];
  }

  function unplacedItems(): UnplacedItem[] {
    const speeds = [...built.tracker.unplaced, ...built.top10.unplaced].map(({ item, reason }) => ({
      id: item.id, elr: item.elr, place: item.place, reason,
    }));
    const blocks = built.tamping.unplaced.map(({ item, reason }: { item: TampingBlock; reason: string }) => ({
      id: item.id, elr: item.elr, place: `Week ${item.week} · ${shiftLabel(item.shift)}`, reason,
    }));
    return [...speeds, ...blocks];
  }

  function redraw() {
    for (const key of order) {
      layers[key].remove();
      if (visible[key]) layers[key].addTo(map);
    }
    restyleSided(map, [layers.tamping, layers.tracker, layers.top10]);
  }

  function fitToSites(animate = true, which: 'all' | 'tamping' = 'all') {
    const sites = which === 'tamping'
      ? built.tamping.placed
      : [...built.tracker.placed, ...built.top10.placed, ...built.tamping.placed];
    if (!sites.length) return;
    const bounds = L.latLngBounds([]);
    for (const s of sites) bounds.extend(s.bounds);
    const opts = { padding: [40, 40] as L.PointTuple, maxZoom: 13 };
    if (animate) map.flyToBounds(bounds, { ...opts, duration: 0.6 });
    else map.fitBounds(bounds, opts);
  }

  // Labels only once zoomed in, and smaller station dots when zoomed out.
  const syncZoomStyles = () => {
    const z = map.getZoom();
    map.getContainer().classList.toggle('labels-on', z >= STATION_LABEL_ZOOM);
    map.getContainer().classList.toggle('week-labels-on', z >= WEEK_LABEL_ZOOM);
    sizeStations(stationLayer, z);
    restyleSided(map, [layers.tamping, layers.tracker, layers.top10]);
  };
  map.on('zoomend', syncZoomStyles);

  rebuild();
  fitToSites(false);
  syncZoomStyles();
}

function sideLabel(line: string): string {
  const side = sideOf(line);
  return side === 'down' ? 'Down' : side === 'up' ? 'Up' : '';
}

start().catch((err) => {
  console.error(err);
  document.getElementById('panel')!.innerHTML = `<p class="error">Couldn't load the map data: ${esc(err?.message ?? err)}</p>`;
});
