// leaflet-polylineoffset ships without types. It patches L.Polyline to accept an
// `offset` option (pixels) and adds setOffset(). `side` and `band` are our own
// options, read by geo/side.ts to set offsets for the current zoom.
import 'leaflet';

declare module 'leaflet' {
  interface PolylineOptions {
    offset?: number;
    side?: 'up' | 'down' | null;
    band?: boolean;
  }
  interface Polyline {
    setOffset(offset: number): this;
  }
}

declare module 'leaflet-polylineoffset';
