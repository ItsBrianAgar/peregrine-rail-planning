// The side panel: layer switches, key, filters, site lists and the
// "not on the map" list. Plain DOM, no framework.
//
// Lists are generic (ListGroup / ListItem), so a new layer only needs main.ts to
// turn its placed items into list items.

import { SPEED_BANDS } from '../data/speeds.ts';
import { TOP10_COLOR } from '../layers/speeds.ts';
import { TAMPING_COLOR } from '../layers/tamping.ts';
import { DATA_DATES } from '../config.ts';
import { esc } from '../util.ts';

export type LayerKey = 'tracker' | 'top10' | 'tamping' | 'stations' | 'network';

export type SwatchStyle = 'line' | 'dashed' | 'band' | 'band-dashed';

export interface ListItem {
  id: string;
  elr: string;
  place: string;
  value: string;
  color: string;
  style: SwatchStyle;
  focus: () => void;
}

export interface ListGroup {
  title: string;
  items: ListItem[];
}

export interface UnplacedItem {
  id: string;
  elr: string;
  place: string;
  reason: string;
}

export interface PanelOptions {
  elrs: string[];
  weeks: string[];
  visible: Record<LayerKey, boolean>;
  geometryNote: string;
  onToggle: (key: LayerKey, on: boolean) => void;
  onElrFilter: (elr: string) => void;
  onWeekFilter: (week: string) => void;
}

export interface Panel {
  update: (groups: ListGroup[], unplaced: UnplacedItem[]) => void;
}

export function createPanel(root: HTMLElement, opts: PanelOptions): Panel {
  root.innerHTML = `
    <header class="panel-head">
      <p class="eyebrow">Pilot · not for operational use</p>
      <h1>Anglia track map</h1>
      <p class="lede">Speed restrictions and planned tamping, placed on the network from ELR and mileage.</p>
    </header>

    <section class="panel-section">
      <h2>Layers</h2>
      <ul class="toggles">
        ${toggle('tracker', 'Speed restrictions', DATA_DATES.speedRestrictions, opts.visible.tracker)}
        ${toggle('top10', 'Top 10 performance speeds', DATA_DATES.topSpeeds, opts.visible.top10)}
        ${toggle('tamping', 'Tamping plan', DATA_DATES.tamping, opts.visible.tamping)}
        ${toggle('stations', 'Stations', '', opts.visible.stations)}
        ${toggle('network', 'Rail lines (ELRs)', 'Hover a line for its ELR and mileage range', opts.visible.network)}
      </ul>
    </section>

    <section class="panel-section">
      <h2>Key</h2>
      <ul class="legend">
        ${SPEED_BANDS.map((b) => `<li><span class="swatch" style="--c:${b.color}"></span>${esc(b.label)}</li>`).join('')}
        <li><span class="swatch" style="--c:${TOP10_COLOR}"></span>Top 10 report site <span class="rank-badge rank-badge--inline">3</span></li>
        <li><span class="swatch swatch--dashed"></span>Planned, not yet imposed</li>
        <li><span class="swatch swatch--dot"></span>Only one end mileage known</li>
        <li><span class="swatch swatch--band" style="--c:${TAMPING_COLOR}"></span>Tamping block <span class="week-badge week-badge--inline">W27</span></li>
        <li><span class="swatch swatch--band swatch--band-dashed" style="--c:${TAMPING_COLOR}"></span>Tamping, mileage read off the diagram</li>
      </ul>
      <p class="hint">Up and Down line features sit either side of the grey centre line. Down is on the left facing away from London.</p>
    </section>

    <section class="panel-section">
      <div class="section-head">
        <h2>Sites</h2>
        <div class="filters">
          <label class="filter">
            <span class="visually-hidden">Filter by line</span>
            <select id="elr-filter">
              <option value="">All lines</option>
              ${opts.elrs.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}
            </select>
          </label>
          <label class="filter">
            <span class="visually-hidden">Filter tamping by week</span>
            <select id="week-filter">
              <option value="">All weeks</option>
              ${opts.weeks.map((w) => `<option value="${esc(w)}">Week ${esc(w)}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
      <div id="site-lists"></div>
    </section>

    <section class="panel-section">
      <details class="unplaced">
        <summary><h2>Not on the map <span id="unplaced-count" class="count"></span></h2></summary>
        <p class="hint">Rows from the source files that couldn't be placed, and why.</p>
        <ul id="unplaced-list" class="unplaced-list"></ul>
      </details>
    </section>

    <footer class="panel-foot">
      <p>Positions are indicative. ${esc(opts.geometryNote)}</p>
      <p>Track geometry: Network Rail, Open Government Licence v3. Stations: uk-railway-stations (ODbL). Base map © OpenStreetMap contributors.</p>
    </footer>
  `;

  root.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((input) => {
    input.addEventListener('change', () => opts.onToggle(input.dataset.layer as LayerKey, input.checked));
  });
  root.querySelector<HTMLSelectElement>('#elr-filter')!.addEventListener('change', (e) => {
    opts.onElrFilter((e.target as HTMLSelectElement).value);
  });
  root.querySelector<HTMLSelectElement>('#week-filter')!.addEventListener('change', (e) => {
    opts.onWeekFilter((e.target as HTMLSelectElement).value);
  });

  const lists = root.querySelector<HTMLElement>('#site-lists')!;
  const unplacedList = root.querySelector<HTMLElement>('#unplaced-list')!;
  const unplacedCount = root.querySelector<HTMLElement>('#unplaced-count')!;

  return {
    update(groups, unplaced) {
      lists.innerHTML = '';
      lists.append(...groups.map(siteList));
      unplacedCount.textContent = String(unplaced.length);
      unplacedList.innerHTML = unplaced
        .map((u) => `
          <li>
            <span class="site-id">${esc(u.id)}</span>
            <span class="site-elr">${esc(u.elr)}</span>
            <span class="site-place">${esc(u.place || '—')}</span>
            <span class="unplaced-reason">${esc(u.reason)}</span>
          </li>`)
        .join('');
    },
  };
}

function toggle(key: LayerKey, label: string, sub: string, on: boolean): string {
  return `
    <li>
      <label>
        <input type="checkbox" data-layer="${key}" ${on ? 'checked' : ''} />
        <span class="toggle-text">
          <span>${esc(label)}</span>
          ${sub ? `<small>${esc(sub)}</small>` : ''}
        </span>
      </label>
    </li>`;
}

const SWATCH_CLASS: Record<SwatchStyle, string> = {
  line: '',
  dashed: 'swatch--dashed',
  band: 'swatch--band',
  'band-dashed': 'swatch--band swatch--band-dashed',
};

function siteList(group: ListGroup): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'site-group';
  wrap.innerHTML = `<h3>${esc(group.title)} <span class="count">${group.items.length}</span></h3>`;
  if (!group.items.length) {
    wrap.insertAdjacentHTML('beforeend', '<p class="hint">None for this filter.</p>');
    return wrap;
  }
  const ul = document.createElement('ul');
  ul.className = 'site-list';
  for (const item of group.items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'site';
    btn.innerHTML = `
      <span class="swatch ${SWATCH_CLASS[item.style]}" style="--c:${item.color}"></span>
      <span class="site-id">${esc(item.id)}</span>
      <span class="site-elr">${esc(item.elr)}</span>
      <span class="site-place">${esc(item.place)}</span>
      <span class="site-speed">${esc(item.value || '–')}</span>`;
    btn.addEventListener('click', () => {
      item.focus();
      // On a phone the map is above the list: bring it back into view.
      if (window.matchMedia('(max-width: 720px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    li.append(btn);
    ul.append(li);
  }
  wrap.append(ul);
  return wrap;
}
