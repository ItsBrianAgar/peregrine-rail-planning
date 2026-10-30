# Anglia track map (pilot)

Interactive map of Anglia speed restrictions and planned tamping, placed on the network from
ELR + miles and chains. Vite + TypeScript + Leaflet (+ leaflet-polylineoffset). No framework.

## Run it

```sh
cd site
npm install      # first time only
npm run dev      # http://localhost:5173
```

`npm run build` type-checks and writes a static site to `dist/`.

## How it works

```
public/data/
  elr-geometry.json          ELR centre lines with mileage at every point (built by Data/scripts)
  stations-anglia.json       station names + positions
  speed-restrictions.csv     SMD speeds tracker rows   (Data/scripts/extract_speeds.py)
  top-speeds-2026-10-05.csv  Top 10 speeds report rows (Data/scripts/extract_top_speeds.py)
  tamping-ssv-wk26-34.csv    SSV tamping plan blocks (transcribed from the PDF, slide 1)

src/
  main.ts            loads the data, builds the layers, wires up the panel and filters
  config.ts          data file paths, data dates, start view
  geo/mileage.ts     ELR + mileage -> map position (the core "miles and chains" problem)
  geo/side.ts        draws Up / Down line features either side of the centre line
  data/csv.ts        CSV parsing (Papa Parse)
  data/speeds.ts     both speeds CSVs -> one SpeedRestriction shape; speed colour bands
  data/tamping.ts    tamping CSV -> TampingBlock; shift codes (HN = Thursday night)
  data/overlap.ts    which speed restrictions sit on the same stretch as a block of work
  layers/speeds.ts   draws sections / points, popups, works out what can't be placed
  layers/tamping.ts  tamping bands, week labels, popups listing speeds on that stretch
  layers/network.ts  rail lines (ELRs) and stations
  ui/panel.ts        side panel: toggles, key, line + week filters, site lists, "not on the map"
  types/             type declarations for leaflet-polylineoffset (it ships without any)
  style.css          all styling; colour tokens at the top
```

**Up and Down lines.** The geometry has one centre line per ELR, so anything on a specific line
(Up Main, Down Main) is drawn a few pixels to one side: Down on the left facing increasing mileage
(away from London), Up on the right. Offsets shrink when zoomed out. "Both" or blank stays central.

**Tamping.** Each block is a translucent band on its line, so a speed restriction on the same
stretch shows as a line running through it. The popup lists every speed restriction on that
stretch (same ELR, overlapping mileage, same line or unspecified line). Two Week 34 blocks have no
mileage on the plan; they're read off the diagram and drawn dashed.

**Mileage → position.** Each ELR in `elr-geometry.json` is a list of `[lng, lat, yards]`.
To place a mileage the site finds the two points either side and interpolates. A section
(from → to) is the stretch of line between the two mileages. 1 mile = 80 chains = 1760 yards.
Mileages up to a quarter mile past the end of a line are snapped to the end.

**What isn't drawn** shows under "Not on the map" with the reason: removed / not needed,
missing or unreadable mileage, or an ELR the geometry doesn't cover.

## Updating the data

- New speeds files: rerun the extract scripts in `Data/scripts`, copy the CSVs into
  `public/data`, and update `DATA_FILES` / `DATA_DATES` in `src/config.ts` if names changed.
  (The CSV upload feature will replace this step.)
- Geometry: `Data/scripts/build_elr_geometry.py` and `build_stations.py` rebuild the two JSON
  files from the open data sources below. Needs `pip install pyshp shapely pyproj`.
  `check_geocoding.py` prints how CSV mileages line up with station positions.

## Sources and licences

- Track geometry and mileposts: Network Rail GIS network model, Open Government Licence v3,
  via github.com/openraildata/network-rail-gis. That repo is archived; the current data is on
  the Rail Data Marketplace.
- Stations: github.com/davwheat/uk-railway-stations (ODbL).
- Base map: © OpenStreetMap contributors. OSM's own tile servers are only for light use.
  Before wider use, move to a paid or OS tile service.
- Positions are indicative. Not for safety-critical or operational use.

## Data corrections

`Data/scripts/extract_top_speeds.py` has a `CORRECTIONS` table for rows the report gets wrong,
filled from other documents and flagged in the `check` column. Currently one: TS-04
(AICC 152B.26) takes 21m 25ch – 23m 02ch and 30 mph from the SSV tamping plan.

## Still to do (pilot scope)

- CSV upload so the map refreshes from the weekly file
- Password protection and hosting
- Design pass
