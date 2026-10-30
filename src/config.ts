// Everything the site loads lives in public/data. Swap a file there (same columns)
// and reload to update the map. The CSV upload feature will replace these later.
const base = import.meta.env.BASE_URL;

export const DATA_FILES = {
  geometry: `${base}data/elr-geometry.json`,
  stations: `${base}data/stations-anglia.json`,
  speedRestrictions: `${base}data/speed-restrictions.csv`,
  topSpeeds: `${base}data/top-speeds-2026-10-05.csv`,
  tamping: `${base}data/tamping-ssv-wk26-34.csv`,
};

// Shown in the panel so viewers know how fresh each source is.
export const DATA_DATES = {
  speedRestrictions: 'SMD Anglia Speeds V2.5 · latest updates ~20 Aug 2026',
  topSpeeds: 'Anglia Route Speeds report · 5 Oct 2026 (P7 Wk2)',
  tamping: 'SSV tamping plan · weeks 26–28 & 34 (sent 7 Oct 2026)',
};

// Initial view: roughly the Anglia route.
export const START_VIEW = {
  center: [52.05, 0.75] as [number, number],
  zoom: 8,
};
