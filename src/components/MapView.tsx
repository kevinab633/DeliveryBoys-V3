import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import type * as LeafletType from 'leaflet';
import { useThemeStore } from '../stores/themeStore';
import { cn } from '../lib/utils';

// Leaflet's stylesheet is REQUIRED: it gives .leaflet-pane its absolute
// positioning. Without it tiles scatter/fail to place and the SVG overlay
// pane (routes) collapses — which looks like "tiles don't load and the
// route won't form".
import 'leaflet/dist/leaflet.css';

// ── Types (public interface unchanged — callers need no edits) ─────────
export interface MarkerData {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  popup?: string;
  icon?: 'pin' | 'rider' | 'bike' | 'pickup' | 'dropoff';
  /** Heading in degrees (0 = north), for markers that should rotate to
   *  face their direction of travel — e.g. the rider's own position
   *  while navigating, so it reads as a moving vehicle rather than a
   *  static "you are here" dot. */
  heading?: number;
}

export interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  route?: Array<[number, number]>;
  /** Secondary route (e.g. rider → pickup) drawn as a dashed neutral line */
  secondaryRoute?: Array<[number, number]>;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  interactive?: boolean;
  pinDropActive?: boolean;
  /** Overrides the app-wide dark/light theme for just this map instance.
   *  Used on the rider dashboard, which always shows the light map style
   *  regardless of the rider's own app theme — riders are typically
   *  outdoors in daylight, where a light map is far easier to read than
   *  a dark one, independent of whether they prefer a dark app UI. */
  forceLightMode?: boolean;
  /** Turn-by-turn follow mode: camera stays centered on and rotated to
   *  followPosition's heading, like Google Maps navigation, instead of
   *  the default fit-all-markers-in-view behavior. followHeading is in
   *  degrees (0 = north), typically computed from consecutive GPS fixes. */
  followPosition?: { lat: number; lng: number };
  followHeading?: number;
  /** Traffic-colored route segments (from fetchTurnByTurnRoute's
   *  congestionSegments) — drawn as multiple colored polyline pieces
   *  instead of route/secondaryRoute's single flat color. When present,
   *  this replaces the "route" prop's rendering for the main trip line;
   *  pass both if you also want a plain-colored fallback for legs where
   *  traffic data wasn't available. */
  congestionRoute?: CongestionSegment[];
}

// ── Mapbox style + token ───────────────────────────────────────────────
const MAPBOX_TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string) ||
  'pk.eyJ1Ijoia2VsazciLCJhIjoiY210M2h3bTBvMTBjajJ5c2s2dDhsNHJtbyJ9.ltCbsxU-tOFi2rVNMeGLuQ';

const STYLE_URL =
  `https://api.mapbox.com/styles/v1/kelk7/cmtavxnok004e01qq7f9vczox?access_token=${MAPBOX_TOKEN}`;

function transformRequest(url: string) {
  let u = url;
  if (u.startsWith('mapbox://')) {
    const rest = u.slice('mapbox://'.length);
    if (rest.startsWith('sprites/')) {
      const parts = rest.slice('sprites/'.length).split('/');
      const user = parts[0] || '';
      const style = parts[1] || '';
      const last = parts[parts.length - 1] || '';
      const suffixMatch = last.match(/(@2x)?\.(json|png)$/);
      const suffix = suffixMatch && suffixMatch[0] ? suffixMatch[0] : '.json';
      u = `https://api.mapbox.com/styles/v1/${user}/${style}/sprite${suffix}`;
    } else if (rest.startsWith('fonts/')) {
      u = `https://api.mapbox.com/fonts/v1/${rest.slice('fonts/'.length)}`;
    } else {
      u = `https://api.mapbox.com/v4/${rest}.json?secure`;
    }
  }
  if (u.includes('api.mapbox.com') && !u.includes('access_token')) {
    u += (u.includes('?') ? '&' : '?') + `access_token=${MAPBOX_TOKEN}`;
  }
  return { url: u };
}

// ── Style sanitizer ──────────────────────────────────────────────────
const KNOWN_LAYOUT_KEYS: Record<string, string[]> = {
  background: [],
  fill: ['fill-sort-key'],
  line: ['line-cap', 'line-join', 'line-miter-limit', 'line-round-limit', 'line-sort-key'],
  circle: ['circle-sort-key'],
  heatmap: [],
  hillshade: [],
  raster: [],
  symbol: [
    'symbol-placement', 'symbol-spacing', 'symbol-avoid-edges', 'symbol-sort-key',
    'symbol-z-order', 'symbol-z-elev',
    'icon-allow-overlap', 'icon-ignore-placement', 'icon-optional', 'icon-rotation-alignment',
    'icon-size', 'icon-text-fit', 'icon-text-fit-padding', 'icon-image', 'icon-rotate',
    'icon-padding', 'icon-keep-upright', 'icon-offset', 'icon-anchor', 'icon-pitch-alignment',
    'text-pitch-alignment', 'text-rotation-alignment', 'text-field', 'text-font', 'text-size',
    'text-max-width', 'text-line-height', 'text-letter-spacing', 'text-justify',
    'text-radial-offset', 'text-variable-anchor', 'text-variable-anchor-offset', 'text-anchor',
    'text-max-angle', 'text-writing-mode', 'text-rotate', 'text-padding', 'text-keep-upright',
    'text-transform', 'text-offset', 'text-allow-overlap', 'text-ignore-placement', 'text-optional',
  ],
};

const KNOWN_PAINT_KEYS: Record<string, string[]> = {
  background: ['background-color', 'background-pattern', 'background-opacity'],
  fill: [
    'fill-antialias', 'fill-opacity', 'fill-color', 'fill-outline-color',
    'fill-translate', 'fill-translate-anchor', 'fill-pattern',
  ],
  line: [
    'line-opacity', 'line-color', 'line-translate', 'line-translate-anchor',
    'line-width', 'line-gap-width', 'line-offset', 'line-blur', 'line-dasharray',
    'line-pattern', 'line-gradient',
  ],
  circle: [
    'circle-radius', 'circle-color', 'circle-blur', 'circle-opacity',
    'circle-translate', 'circle-translate-anchor', 'circle-pitch-scale',
    'circle-pitch-alignment', 'circle-stroke-width', 'circle-stroke-color',
    'circle-stroke-opacity',
  ],
  heatmap: [
    'heatmap-radius', 'heatmap-weight', 'heatmap-intensity',
    'heatmap-color', 'heatmap-opacity',
  ],
  hillshade: [
    'hillshade-illumination-direction', 'hillshade-illumination-anchor',
    'hillshade-exaggeration', 'hillshade-shadow-color', 'hillshade-highlight-color',
    'hillshade-accent-color',
  ],
  raster: [
    'raster-opacity', 'raster-hue-rotate', 'raster-brightness-min',
    'raster-brightness-max', 'raster-saturation', 'raster-contrast',
    'raster-resampling', 'raster-fade-duration',
  ],
  symbol: [
    'icon-opacity', 'icon-color', 'icon-halo-color', 'icon-halo-width',
    'icon-halo-blur', 'icon-translate', 'icon-translate-anchor',
    'text-opacity', 'text-color', 'text-halo-color', 'text-halo-width',
    'text-halo-blur', 'text-translate', 'text-translate-anchor',
  ],
};

function isLegacyFunctionValue(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return Array.isArray(obj.stops);
}

function convertLegacyZoomFunction(fn: Record<string, unknown>): unknown[] | null {
  const stops = fn.stops;
  if (!Array.isArray(stops) || stops.length === 0) return null;
  const flat: unknown[] = [];
  for (const stop of stops) {
    if (!Array.isArray(stop) || stop.length < 2 || typeof stop[0] !== 'number') return null;
    flat.push(stop[0], stop[1]);
  }
  return ['interpolate', ['linear'], ['zoom'], ...flat];
}

function sanitizeStyle(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const style = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  delete style.fog;
  if (style.projection && typeof style.projection === 'object') {
    const proj = style.projection as Record<string, unknown>;
    if (proj.name !== 'mercator') {
      delete style.projection;
    }
  }

  for (const layer of Array.isArray(style.layers) ? style.layers : []) {
    if (!layer || typeof layer !== 'object') continue;
    for (const bucket of ['layout', 'paint'] as const) {
      const obj = layer[bucket];
      if (!obj || typeof obj !== 'object') continue;
      const known = (bucket === 'layout' ? KNOWN_LAYOUT_KEYS : KNOWN_PAINT_KEYS)[layer.type];
      for (const [key, value] of Object.entries(obj)) {
        if (isLegacyFunctionValue(value)) {
          const fn = value as Record<string, unknown>;
          const referenced = typeof fn.property === 'string' ? fn.property : null;
          const zoomBased = referenced === null || referenced === '$zoom' || referenced === 'zoom';
          const expr = zoomBased ? convertLegacyZoomFunction(fn) : null;
          if (expr) {
            obj[key] = expr;
          } else {
            const stops = Array.isArray(fn.stops) ? fn.stops : [];
            const lastStop = stops.length > 0 ? stops[stops.length - 1] : undefined;
            const last = Array.isArray(lastStop) && lastStop.length >= 2 ? lastStop[1] : undefined;
            if (typeof last === 'number' || typeof last === 'string' || typeof last === 'boolean') {
              obj[key] = last;
            } else {
              delete obj[key];
            }
          }
          continue;
        }
        if (known && !known.includes(key)) {
          delete obj[key];
        }
      }
    }
  }
  return style;
}

// ── WebGL2 Check ───────────────────────────────────────────────────────
// MapLibre v5+ strictly requires WebGL2. If unavailable, we fall back to Leaflet.
function isWebGL2Supported(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl || typeof gl.getParameter !== 'function') return false;
    if (gl.isContextLost && gl.isContextLost()) return false;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return typeof maxTex === 'number' && maxTex > 0;
  } catch {
    return false;
  }
}

// Keep WebGL initialization failures from taking down the whole React tree.
// MapLibre can throw these asynchronously on browsers whose WebGL2 probe
// succeeds but whose real rendering context cannot be initialized.
export function isGpuInitFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === 'GPUInitializationError') return true;
  if (typeof e.message === 'string' && /webgl|gpu|graphics context/i.test(e.message)) return true;
  return e.name === 'TypeError' && typeof e.message === 'string' &&
    /reading '(resize|destroy|render|context)'/i.test(e.message);
}

// ── Directions API fetcher ─────────────────────────────────────────────
// ── Turn-by-turn directions (steps + geometry), used by the rider's
//    active-delivery navigation view. Separate from fetchDirectionsRoute
//    above because that one only needs the line shape — this needs the
//    actual maneuver list (turn left/right, street names, distances).
export interface DirectionStep {
  instruction: string;
  distanceMeters: number;
  maneuverType: string; // e.g. 'turn', 'depart', 'arrive', 'roundabout'
  maneuverModifier?: string; // e.g. 'left', 'right', 'straight'
  location: [number, number]; // [lat, lng] where this step begins
}

export interface CongestionSegment {
  coords: [number, number][];
  level: 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe';
}

export interface DirectionsResult {
  coords: [number, number][];
  steps: DirectionStep[];
  distanceMeters: number;
  durationSeconds: number;
  /** Route geometry split into contiguous same-congestion segments, using
   *  Mapbox's driving-traffic profile — mirrors Yango's real traffic-
   *  colored route (green/yellow/orange/red/black by congestion level,
   *  confirmed from their app's own mapkit_styling_automotive_jam_*
   *  color resources) rather than a single flat-colored line. Empty when
   *  traffic data isn't available for the requested area. */
  congestionSegments: CongestionSegment[];
}

export async function fetchTurnByTurnRoute(
  a: [number, number],
  b: [number, number],
): Promise<DirectionsResult | null> {
  try {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return null;
    const latA = a[0], lngA = a[1], latB = b[0], lngB = b[1];
    if (!Number.isFinite(latA) || !Number.isFinite(lngA) || !Number.isFinite(latB) || !Number.isFinite(lngB)) return null;

    // driving-traffic (not plain driving) is required for congestion
    // annotations — it's the only Mapbox profile that returns live
    // traffic-segment data alongside the route geometry.
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
      `${lngA},${latA};${lngB},${latB}` +
      `?geometries=geojson&overview=full&steps=true&banner_instructions=false` +
      `&annotations=congestion&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const route = json?.routes?.[0];
    const coordsRaw = route?.geometry?.coordinates;
    if (!Array.isArray(coordsRaw) || coordsRaw.length < 2) return null;

    const coords: [number, number][] = [];
    for (const c of coordsRaw) {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        coords.push([c[1], c[0]]);
      }
    }
    if (coords.length < 2) return null;

    const steps: DirectionStep[] = [];
    const legs = route?.legs || [];
    for (const leg of legs) {
      for (const s of leg?.steps || []) {
        const loc = s?.maneuver?.location;
        if (!Array.isArray(loc) || loc.length < 2) continue;
        steps.push({
          instruction: s?.maneuver?.instruction || s?.name || 'Continue',
          distanceMeters: Number(s?.distance) || 0,
          maneuverType: s?.maneuver?.type || 'continue',
          maneuverModifier: s?.maneuver?.modifier,
          location: [loc[1], loc[0]],
        });
      }
    }

    // congestion[] has one entry PER COORDINATE PAIR (i.e. length =
    // coords.length - 1), one level per segment between consecutive
    // points. Group consecutive same-level segments into runs so we
    // draw a handful of colored polylines instead of one per point pair.
    const congestionSegments: CongestionSegment[] = [];
    const congestionRaw: string[] = legs.flatMap((l: any) => l?.annotation?.congestion || []);
    if (congestionRaw.length === coords.length - 1) {
      let runStart = 0;
      let runLevel = congestionRaw[0] || 'unknown';
      for (let i = 1; i <= congestionRaw.length; i++) {
        const lvl = i < congestionRaw.length ? (congestionRaw[i] || 'unknown') : null;
        if (lvl !== runLevel) {
          congestionSegments.push({
            coords: coords.slice(runStart, i + 1),
            level: (['unknown', 'low', 'moderate', 'heavy', 'severe'].includes(runLevel) ? runLevel : 'unknown') as CongestionSegment['level'],
          });
          runStart = i;
          runLevel = lvl || 'unknown';
        }
      }
    }

    return {
      coords,
      steps,
      distanceMeters: Number(route?.distance) || 0,
      durationSeconds: Number(route?.duration) || 0,
      congestionSegments,
    };
  } catch {
    return null;
  }
}

async function fetchDirectionsRoute(
  a: [number, number],
  b: [number, number],
): Promise<[number, number][] | null> {
  try {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return null;
    const latA = a[0], lngA = a[1], latB = b[0], lngB = b[1];
    if (!Number.isFinite(latA) || !Number.isFinite(lngA) || !Number.isFinite(latB) || !Number.isFinite(lngB)) return null;

    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${lngA},${latA};${lngB},${latB}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const validCoords: [number, number][] = [];
    for (const c of coords) {
      if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        validCoords.push([c[1], c[0]]);
      }
    }
    return validCoords.length >= 2 ? validCoords : null;
  } catch {
    return null;
  }
}

// ── Fit camera to points helper ────────────────────────────────────────
function fitToMapLibre(map: MLMap, pts: [number, number][]) {
  if (!pts || pts.length < 2) return;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  pts.forEach(([lat, lng]) => {
    if (typeof lng === 'number' && Number.isFinite(lng) && typeof lat === 'number' && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  });
  if (Number.isFinite(minLng) && Number.isFinite(maxLng)) {
    try {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
        padding: 60, maxZoom: 16, duration: 800,
      });
    } catch {
      void 0;
    }
  }
}

// ── Marker HTML visuals ────────────────────────────────────────────────
function markerSpec(
  type: string,
  color: string,
): { html: string; w: number; h: number; anchor: 'center' | 'bottom' } {
  if (type === 'rider') {
    // Directional puck: a chevron/arrow pointing "up" inside the SVG's
    // own coordinate space, so a CSS rotation on the wrapping element
    // (driven by the marker's heading) turns the whole shape to face the
    // real direction of travel — this is what makes it read as a moving
    // vehicle rather than a static "you are here" dot.
    return {
      html: `<div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;inset:-2px;border-radius:50%;background:${color}35;animation:pulse-ring 2s ease-out infinite"></div>
        <div class="rider-heading-rotor" style="width:34px;height:34px;position:relative;z-index:2;transition:transform 0.4s linear">
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="15" fill="${color}" stroke="white" stroke-width="3"/>
            <path d="M17 6 L24 21 L17 17.5 L10 21 Z" fill="white"/>
          </svg>
        </div>
      </div>`,
      w: 44, h: 44, anchor: 'center',
    };
  }
  if (type === 'bike') {
    return {
      html: `<div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;inset:-5px;border-radius:50%;background:${color}30;animation:pulse-ring 2.4s ease-out infinite"></div>
        <div style="width:24px;height:24px;background:${color};border:2.5px solid white;border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,0.35);position:relative;z-index:2;display:flex;align-items:center;justify-content:center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
        </div>
      </div>`,
      w: 34, h: 34, anchor: 'center',
    };
  }
  if (type === 'pickup') {
    return {
      html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
        <div style="width:32px;height:32px;background:#10B981;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(16,185,129,0.4)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="transform:rotate(45deg)"><circle cx="12" cy="12" r="4"/></svg>
        </div>
        <div style="width:2px;height:8px;background:#10B981;margin-top:-2px"></div>
      </div>`,
      w: 32, h: 42, anchor: 'bottom',
    };
  }
  if (type === 'dropoff') {
    return {
      html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
        <div style="width:32px;height:32px;background:#C41E1E;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(196,30,30,0.4)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="transform:rotate(45deg)"><path d="M5 13l4 4L19 7" stroke="white" stroke-width="3" fill="none"/></svg>
        </div>
        <div style="width:2px;height:8px;background:#C41E1E;margin-top:-2px"></div>
      </div>`,
      w: 32, h: 42, anchor: 'bottom',
    };
  }
  return {
    html: `<div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;inset:-3px;border-radius:50%;background:${color}30;animation:pulse-ring 2s ease-out infinite"></div>
      <div style="width:16px;height:16px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.3);position:relative;z-index:1"></div>
    </div>`,
    w: 28, h: 28, anchor: 'center',
  };
}

// ── Dynamic module loaders ─────────────────────────────────────────────
type MapLibreNS = typeof import('maplibre-gl');
let maplibrePromise: Promise<MapLibreNS> | null = null;
function loadMapLibre(): Promise<MapLibreNS> {
  if (!maplibrePromise) {
    maplibrePromise = import('maplibre-gl');
  }
  return maplibrePromise;
}

// ── Main Map Component ─────────────────────────────────────────────────
export default function MapView({
  center = [5.6037, -0.187],
  zoom = 13,
  markers = [],
  route,
  secondaryRoute,
  onMapClick,
  className = 'h-[400px]',
  interactive = true,
  pinDropActive = false,
  forceLightMode = false,
  followPosition,
  followHeading,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<'maplibre' | 'leaflet'>(() =>
    isWebGL2Supported() ? 'maplibre' : 'leaflet',
  );

  // MapLibre state & refs
  const mapRef = useRef<MLMap | null>(null);
  const [ml, setMl] = useState<MapLibreNS | null>(null);
  const markerRefs = useRef<MLMarker[]>([]);
  const locateMarkerRef = useRef<MLMarker | null>(null);
  const riderPuckMarkerRef = useRef<MLMarker | null>(null);
  const [preparedStyle, setPreparedStyle] = useState<unknown>(null);

  // Leaflet state & refs
  const leafletMapRef = useRef<LeafletType.Map | null>(null);
  const leafletMarkersRef = useRef<LeafletType.Marker[]>([]);
  const leafletRouteLayerRef = useRef<LeafletType.FeatureGroup | null>(null);
  const leafletLocateMarkerRef = useRef<LeafletType.Marker | null>(null);

  const [styleReady, setStyleReady] = useState(false);

  // SVG route overlay refs (used in MapLibre mode)
  const mainPtsRef = useRef<[number, number][] | null>(null);
  const mainDrawnRef = useRef<[number, number][] | null>(null);
  const secondaryPtsRef = useRef<[number, number][] | null>(null);
  const pathCasingRef = useRef<SVGPathElement>(null);
  const pathMainRef = useRef<SVGPathElement>(null);
  const pathSecondaryRef = useRef<SVGPathElement>(null);
  const animRef = useRef(0);

  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  const pinDropActiveRef = useRef(pinDropActive);
  pinDropActiveRef.current = pinDropActive;

  const appIsDark = useThemeStore((s) => s.theme === 'dark');
  const dk = forceLightMode ? false : appIsDark;

  // Defensive center coordinate extraction
  const safeCenterLat =
    Array.isArray(center) && typeof center[0] === 'number' && Number.isFinite(center[0])
      ? center[0]
      : 5.6037;
  const safeCenterLng =
    Array.isArray(center) && typeof center[1] === 'number' && Number.isFinite(center[1])
      ? center[1]
      : -0.187;

  // Defensive route filtering
  const validRoute = route?.filter(
    (r) =>
      Array.isArray(r) &&
      r.length >= 2 &&
      typeof r[0] === 'number' &&
      typeof r[1] === 'number' &&
      Number.isFinite(r[0]) &&
      Number.isFinite(r[1]),
  );
  const routeKey = validRoute
    ? validRoute.map((r) => `${r[0].toFixed(5)},${r[1].toFixed(5)}`).join(';')
    : '';

  const validSecondaryRoute = secondaryRoute?.filter(
    (r) =>
      Array.isArray(r) &&
      r.length >= 2 &&
      typeof r[0] === 'number' &&
      typeof r[1] === 'number' &&
      Number.isFinite(r[0]) &&
      Number.isFinite(r[1]),
  );
  const secondaryRouteKey = validSecondaryRoute
    ? validSecondaryRoute.map((r) => `${r[0].toFixed(3)},${r[1].toFixed(3)}`).join(';')
    : '';

  // Defensive markers
  const validMarkers = (markers || []).filter(
    (m) =>
      m &&
      typeof m.lat === 'number' &&
      typeof m.lng === 'number' &&
      Number.isFinite(m.lat) &&
      Number.isFinite(m.lng),
  );
  const markersKey = validMarkers
    .map(
      (m) =>
        `${m.lat.toFixed(5)},${m.lng.toFixed(5)},${m.icon || 'pin'},${m.color || ''},${m.popup || ''}`,
    )
    .join('|');

  const focusKey = (() => {
    const focusable = validMarkers.filter((m) => m.icon !== 'bike');
    return focusable.length === 1 && focusable[0]
      ? `${focusable[0].lat},${focusable[0].lng}`
      : '';
  })();

  // ─────────────────────────────────────────────────────────────────────
  // MAPLIBRE INITIALIZATION & LOGIC
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (engine !== 'maplibre') return;
    let cancelled = false;

    if (!isWebGL2Supported()) {
      setEngine('leaflet');
      return;
    }

    loadMapLibre()
      .then((mod) => {
        if (cancelled) return;
        // MapLibre 6 resolves its module worker relative to the package URL.
        // That works in dev but can point at a missing/chunked asset after a
        // Vercel production build. The worker is deployed with its sibling
        // shared module in public/assets, so vector tiles can be parsed on
        // production browsers as well as locally.
        mod.setWorkerUrl('/assets/maplibre-gl-worker.mjs');
        setMl(mod);
      })
      .catch((err) => {
        console.warn('[MapView] MapLibre module load failed, falling back to Leaflet:', err);
        if (!cancelled) setEngine('leaflet');
      });

    return () => {
      cancelled = true;
    };
  }, [engine]);

  useEffect(() => {
    if (engine !== 'maplibre') return;
    let cancelled = false;

    fetch(STYLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Style fetch failed: HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => {
        if (cancelled) return;
        setPreparedStyle(sanitizeStyle(raw));
      })
      .catch((err) => {
        console.warn('[MapView] Vector style failed, falling back to Leaflet:', err);
        if (!cancelled) setEngine('leaflet');
      });

    return () => {
      cancelled = true;
    };
  }, [engine]);

  const redrawRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const toD = (pts: [number, number][] | null) => {
      if (!pts || !Array.isArray(pts) || pts.length < 2) return '';
      let d = '';
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (!Array.isArray(pt) || pt.length < 2) continue;
        try {
          const p = map.project([pt[1], pt[0]]);
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            d += `${d === '' ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          }
        } catch {
          void 0;
        }
      }
      return d;
    };
    if (pathCasingRef.current) pathCasingRef.current.setAttribute('d', toD(mainPtsRef.current));
    if (pathMainRef.current) pathMainRef.current.setAttribute('d', toD(mainDrawnRef.current));
    if (pathSecondaryRef.current) pathSecondaryRef.current.setAttribute('d', toD(secondaryPtsRef.current));
  }, []);
  const redrawRef = useRef(redrawRoutes);
  redrawRef.current = redrawRoutes;

  // Mount MapLibre
  useEffect(() => {
    if (engine !== 'maplibre' || !ml || !preparedStyle || !containerRef.current || mapRef.current) return;
    let disposed = false;

    let map: MLMap | null = null;
    try {
      map = new ml.Map({
        container: containerRef.current,
        center: [safeCenterLng, safeCenterLat],
        zoom,
        interactive,
        attributionControl: false,
        transformRequest,
      });
    } catch (err) {
      console.warn('[MapView] MapLibre creation threw, switching to Leaflet:', err);
      setEngine('leaflet');
      return;
    }

    mapRef.current = map;

    map.on('error', (e: any) => {
      const msg = String(e?.error?.message || '');
      if (msg.includes('WebGL') || msg.includes('GPU') || msg.includes('context')) {
        console.warn('[MapView] WebGL runtime error, switching to Leaflet:', msg);
        if (!disposed) setEngine('leaflet');
      } else {
        if (!disposed) setStyleReady(true);
      }
    });

    try {
      map.setStyle(preparedStyle as any, { validate: false });
    } catch (err) {
      console.warn('[MapView] setStyle error, switching to Leaflet:', err);
      setEngine('leaflet');
      return;
    }

    const ro = new ResizeObserver(() => {
      if (!disposed && map) {
        try { map.resize(); } catch { void 0; }
      }
    });
    ro.observe(containerRef.current);

    const onMoveEnd = () => {
      if (pinDropActiveRef.current && onClickRef.current && map) {
        try {
          const c = map.getCenter();
          onClickRef.current(c.lat, c.lng);
        } catch {
          void 0;
        }
      }
    };
    const onMove = () => redrawRef.current();

    map.on('moveend', onMoveEnd);
    map.on('move', onMove);
    map.on('load', () => { if (!disposed) setStyleReady(true); });

    return () => {
      disposed = true;
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      if (map) {
        try { map.off('moveend', onMoveEnd); } catch { void 0; }
        try { map.off('move', onMove); } catch { void 0; }
      }
      markerRefs.current.forEach((m) => {
        try { m.remove(); } catch { void 0; }
      });
      markerRefs.current = [];
      try { locateMarkerRef.current?.remove(); } catch { void 0; }
      locateMarkerRef.current = null;

      // Crucial: Only call map.remove() if painter exists to prevent "Cannot read properties of undefined (reading 'destroy')"
      try {
        if (map && (map as any).painter) {
          map.remove();
        } else if (map) {
          map.getContainer()?.replaceChildren();
        }
      } catch (err) {
        console.warn('[MapView] Safe MapLibre cleanup:', err);
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ml, preparedStyle]);

  // MapLibre Markers — excludes the 'rider' marker while followPosition
  // is active; that one is handled by its own effect below with smooth
  // in-place updates instead of destroy-and-recreate every GPS tick,
  // which is what made the old marker jump instead of glide.
  useEffect(() => {
    if (engine !== 'maplibre') return;
    const map = mapRef.current;
    if (!map || !ml) return;

    markerRefs.current.forEach((m) => {
      try { m.remove(); } catch { void 0; }
    });
    markerRefs.current = [];

    validMarkers.forEach((m) => {
      if (followPosition && m.icon === 'rider') return;
      try {
        const spec = markerSpec(m.icon || 'pin', m.color || '#C41E1E');
        const el = document.createElement('div');
        el.style.width = `${spec.w}px`;
        el.style.height = `${spec.h}px`;
        el.innerHTML = spec.html;
        const marker = new ml.Marker({ element: el, anchor: spec.anchor }).setLngLat([m.lng, m.lat]);
        if (m.popup) {
          marker.setPopup(
            new ml.Popup({ closeButton: true, maxWidth: '260px' }).setHTML(
              `<div style="font-size:13px;font-weight:600;padding:4px 2px">${m.popup}</div>`,
            ),
          );
        }
        marker.addTo(map);
        markerRefs.current.push(marker);
      } catch {
        void 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, markersKey, ml]);

  // Rider puck — smooth in-place position + rotation updates instead of
  // destroy-and-recreate, so it glides between real GPS fixes and turns
  // to face the heading like Google Maps' navigation arrow, rather than
  // jumping to a new static dot every ~4 seconds.
  useEffect(() => {
    if (engine !== 'maplibre' || !followPosition) {
      try { riderPuckMarkerRef.current?.remove(); } catch { void 0; }
      riderPuckMarkerRef.current = null;
      return;
    }
    const map = mapRef.current;
    if (!map || !ml) return;
    if (!Number.isFinite(followPosition.lat) || !Number.isFinite(followPosition.lng)) return;

    if (!riderPuckMarkerRef.current) {
      const spec = markerSpec('rider', '#C41E1E');
      const el = document.createElement('div');
      el.style.width = `${spec.w}px`;
      el.style.height = `${spec.h}px`;
      el.innerHTML = spec.html;
      riderPuckMarkerRef.current = new ml.Marker({ element: el, anchor: spec.anchor })
        .setLngLat([followPosition.lng, followPosition.lat])
        .addTo(map);
    } else {
      riderPuckMarkerRef.current.setLngLat([followPosition.lng, followPosition.lat]);
    }

    if (Number.isFinite(followHeading)) {
      const rotor = riderPuckMarkerRef.current.getElement()?.querySelector('.rider-heading-rotor') as HTMLElement | null;
      if (rotor) rotor.style.transform = `rotate(${followHeading}deg)`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ml, followPosition?.lat, followPosition?.lng, followHeading]);

  // MapLibre Single-marker auto-center
  useEffect(() => {
    if (engine !== 'maplibre') return;
    const map = mapRef.current;
    if (!map || !focusKey) return;
    if (!pinDropActiveRef.current && (!validRoute || validRoute.length < 2)) {
      const [lat, lng] = focusKey.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try { map.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 }); } catch { void 0; }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, focusKey, ml]);

  // MapLibre Route drawing
  useEffect(() => {
    if (engine !== 'maplibre') return;
    cancelAnimationFrame(animRef.current);
    mainPtsRef.current = null;
    mainDrawnRef.current = null;
    redrawRoutes();

    if (!validRoute || validRoute.length < 2 || !validRoute[0]) return;

    const start = validRoute[0];
    const end = validRoute[validRoute.length - 1];
    if (!start || !end) return;
    let cancelled = false;

    (async () => {
      const roadPts = await fetchDirectionsRoute(start, end);
      if (cancelled) return;

      const pts: [number, number][] = roadPts ?? [start, end];
      mainPtsRef.current = pts;

      const batchSize = Math.max(1, Math.ceil(pts.length / 40));
      let drawn = 0;
      const step = () => {
        if (cancelled) return;
        drawn = Math.min(drawn + batchSize, pts.length);
        mainDrawnRef.current = pts.slice(0, drawn);
        redrawRoutes();
        if (drawn < pts.length) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);

      if (!pinDropActiveRef.current && !followPosition && mapRef.current) {
        const all: [number, number][] = [
          ...validMarkers.map((m) => [m.lat, m.lng] as [number, number]),
          ...pts,
        ];
        fitToMapLibre(mapRef.current, all);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, routeKey]);

  // ── Turn-by-turn follow camera (MapLibre): keeps the view centered on
  //    and rotated to followPosition/followHeading, like Google Maps
  //    navigation — takes over from the normal fit-all-markers behavior
  //    whenever followPosition is provided. easeTo (not jumpTo) gives a
  //    smooth glide between GPS fixes instead of a jarring snap. ──────
  useEffect(() => {
    if (engine !== 'maplibre' || !mapRef.current || !followPosition) return;
    if (!Number.isFinite(followPosition.lat) || !Number.isFinite(followPosition.lng)) return;
    try {
      mapRef.current.easeTo({
        center: [followPosition.lng, followPosition.lat],
        bearing: Number.isFinite(followHeading) ? followHeading : mapRef.current.getBearing(),
        pitch: 55,
        zoom: 17.5,
        duration: 900,
        easing: (t) => t,
      });
    } catch {
      void 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, followPosition?.lat, followPosition?.lng, followHeading]);

  // MapLibre Secondary route
  useEffect(() => {
    if (engine !== 'maplibre') return;
    secondaryPtsRef.current = null;
    redrawRoutes();

    if (!validSecondaryRoute || validSecondaryRoute.length < 2 || !validSecondaryRoute[0]) return;

    const start = validSecondaryRoute[0];
    const end = validSecondaryRoute[validSecondaryRoute.length - 1];
    if (!start || !end) return;
    let cancelled = false;

    (async () => {
      const roadPts = await fetchDirectionsRoute(start, end);
      if (cancelled) return;
      secondaryPtsRef.current = roadPts ?? [start, end];
      redrawRoutes();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, secondaryRouteKey]);

  // ─────────────────────────────────────────────────────────────────────
  // LEAFLET FALLBACK INITIALIZATION & LOGIC
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (engine !== 'leaflet' || !containerRef.current) return;
    let disposed = false;
    let mapInstance: LeafletType.Map | null = null;

    import('leaflet').then((mod) => {
      if (disposed || !containerRef.current) return;
      const L = mod.default || mod;

      // Clean existing container if it has leaflet bindings
      if ((containerRef.current as any)._leaflet_id) {
        delete (containerRef.current as any)._leaflet_id;
        containerRef.current.innerHTML = '';
      }

      try {
        mapInstance = L.map(containerRef.current, {
          center: [safeCenterLat, safeCenterLng],
          zoom: typeof zoom === 'number' ? zoom : 13,
          zoomControl: false,
          attributionControl: false,
          dragging: interactive,
          scrollWheelZoom: interactive,
          doubleClickZoom: interactive,
          touchZoom: interactive,
        });
        leafletMapRef.current = mapInstance;
        setStyleReady(true);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors',
        }).addTo(mapInstance);

        const onMoveEnd = () => {
          if (pinDropActiveRef.current && onClickRef.current && mapInstance) {
            const c = mapInstance.getCenter();
            onClickRef.current(c.lat, c.lng);
          }
        };
        const onMapClickEvent = (e: LeafletType.LeafletMouseEvent) => {
          if (!pinDropActiveRef.current && onClickRef.current) {
            onClickRef.current(e.latlng.lat, e.latlng.lng);
          }
        };

        mapInstance.on('moveend', onMoveEnd);
        mapInstance.on('click', onMapClickEvent);

        const ro = new ResizeObserver(() => {
          if (!disposed && mapInstance) {
            try { mapInstance.invalidateSize(); } catch { void 0; }
          }
        });
        if (containerRef.current) ro.observe(containerRef.current);
      } catch (err) {
        console.warn('[MapView] Leaflet initialization error:', err);
      }
    });

    return () => {
      disposed = true;
      if (mapInstance) {
        try { mapInstance.remove(); } catch (err) { console.warn('[MapView] Safe Leaflet remove:', err); }
      }
      leafletMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, interactive]);

  // Leaflet Markers
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMapRef.current) return;
    const map = leafletMapRef.current;

    import('leaflet').then((mod) => {
      const L = mod.default || mod;
      leafletMarkersRef.current.forEach((m) => {
        try { m.remove(); } catch { void 0; }
      });
      leafletMarkersRef.current = [];

      validMarkers.forEach((m) => {
        try {
          const spec = markerSpec(m.icon || 'pin', m.color || '#C41E1E');
          const icon = L.divIcon({
            html: spec.html,
            className: 'db-leaflet-marker',
            iconSize: [spec.w, spec.h],
            iconAnchor: spec.anchor === 'bottom' ? [spec.w / 2, spec.h] : [spec.w / 2, spec.h / 2],
          });
          const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
          if (m.popup) {
            marker.bindPopup(`<div style="font-size:13px;font-weight:600;padding:4px 2px">${m.popup}</div>`);
          }
          leafletMarkersRef.current.push(marker);
        } catch {
          void 0;
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, markersKey, styleReady]);

  // Leaflet Route rendering
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMapRef.current) return;
    const map = leafletMapRef.current;

    import('leaflet').then(async (mod) => {
      const L = mod.default || mod;

      if (leafletRouteLayerRef.current) {
        try { leafletRouteLayerRef.current.remove(); } catch { void 0; }
        leafletRouteLayerRef.current = null;
      }

      if (!validRoute || validRoute.length < 2 || !validRoute[0]) return;

      const start = validRoute[0];
      const end = validRoute[validRoute.length - 1];
      if (!start || !end) return;

      const roadPts = await fetchDirectionsRoute(start, end);
      const pts: [number, number][] = roadPts ?? [start, end];

      const group = L.featureGroup();
      // White casing line
      L.polyline(pts, { color: '#ffffff', weight: 8, opacity: 0.75, lineCap: 'round', lineJoin: 'round' }).addTo(group);
      // Red brand line
      L.polyline(pts, { color: '#C41E1E', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(group);

      if (validSecondaryRoute && validSecondaryRoute.length >= 2 && validSecondaryRoute[0]) {
        const secStart = validSecondaryRoute[0];
        const secEnd = validSecondaryRoute[validSecondaryRoute.length - 1];
        if (secStart && secEnd) {
          const secRoadPts = await fetchDirectionsRoute(secStart, secEnd);
          const secPts: [number, number][] = secRoadPts ?? [secStart, secEnd];
          // Rider → pickup leg: solid, theme-aware (white on dark map,
          // deep grey on light map) rather than the old dashed grey —
          // distinct from the main red trip line without competing with it.
          L.polyline(secPts, { color: dk ? '#FFFFFF' : '#374151', weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(group);
        }
      }

      group.addTo(map);
      leafletRouteLayerRef.current = group;

      if (!pinDropActiveRef.current) {
        const allPts: [number, number][] = [
          ...validMarkers.map((m) => [m.lat, m.lng] as [number, number]),
          ...pts,
        ];
        if (allPts.length >= 2) {
          try {
            map.fitBounds(L.latLngBounds(allPts), { padding: [50, 50], maxZoom: 16 });
          } catch {
            void 0;
          }
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, routeKey, secondaryRouteKey, styleReady]);

  // Leaflet auto-center single marker
  useEffect(() => {
    if (engine !== 'leaflet' || !leafletMapRef.current || !focusKey) return;
    const map = leafletMapRef.current;
    if (!pinDropActiveRef.current && (!validRoute || validRoute.length < 2)) {
      const [lat, lng] = focusKey.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try { map.flyTo([lat, lng], 15); } catch { void 0; }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, focusKey]);

  // ─────────────────────────────────────────────────────────────────────
  // CONTROLS & HANDLERS (WORKS IN BOTH ENGINES)
  // ─────────────────────────────────────────────────────────────────────
  const handleZoomIn = () => {
    if (engine === 'maplibre' && mapRef.current) {
      try { mapRef.current.zoomIn(); } catch { void 0; }
    } else if (engine === 'leaflet' && leafletMapRef.current) {
      try { leafletMapRef.current.zoomIn(); } catch { void 0; }
    }
  };

  const handleZoomOut = () => {
    if (engine === 'maplibre' && mapRef.current) {
      try { mapRef.current.zoomOut(); } catch { void 0; }
    } else if (engine === 'leaflet' && leafletMapRef.current) {
      try { leafletMapRef.current.zoomOut(); } catch { void 0; }
    }
  };

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        if (engine === 'maplibre' && mapRef.current && ml) {
          try {
            mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 });
            if (locateMarkerRef.current) {
              locateMarkerRef.current.setLngLat([lng, lat]);
            } else {
              const el = document.createElement('div');
              el.style.width = '36px';
              el.style.height = '36px';
              el.innerHTML = `<div style="position:relative;width:36px;height:36px">
                <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.15)"></div>
                <div style="position:absolute;inset:11px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>
              </div>`;
              locateMarkerRef.current = new ml.Marker({ element: el, anchor: 'center' })
                .setLngLat([lng, lat])
                .addTo(mapRef.current);
            }
          } catch {
            void 0;
          }
        } else if (engine === 'leaflet' && leafletMapRef.current) {
          const map = leafletMapRef.current;
          try {
            map.flyTo([lat, lng], 15);
            import('leaflet').then((mod) => {
              const L = mod.default || mod;
              if (leafletLocateMarkerRef.current) {
                leafletLocateMarkerRef.current.setLatLng([lat, lng]);
              } else {
                const el = document.createElement('div');
                el.style.width = '36px';
                el.style.height = '36px';
                el.innerHTML = `<div style="position:relative;width:36px;height:36px">
                  <div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.15)"></div>
                  <div style="position:absolute;inset:11px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>
                </div>`;
                const icon = L.divIcon({ html: el.innerHTML, className: 'db-leaflet-marker', iconSize: [36, 36], iconAnchor: [18, 18] });
                leafletLocateMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
              }
            });
          } catch {
            void 0;
          }
        }
      },
      () => {
        void 0;
      },
      { enableHighAccuracy: true },
    );
  }, [engine, ml]);

  const hasPosition = /\b(absolute|fixed|relative|sticky)\b/.test(className);

  return (
    <div
      className={`${className} overflow-hidden ${hasPosition ? '' : 'relative'} ${dk ? 'map-dark-tiles' : ''}`}
    >
      {/* Container where the active map (MapLibre or Leaflet) renders */}
      <div ref={containerRef} className="h-full w-full" />

      {/* SVG route overlay (MapLibre vector mode only) */}
      {engine === 'maplibre' && (
        <svg className="absolute inset-0 z-[2] pointer-events-none" width="100%" height="100%">
          {/* Soft outer glow, bolder during turn-by-turn navigation
              (followPosition active) to match a real nav app's route
              weight — a plain thin line reads as a static map, not an
              active "follow this" indicator. */}
          <path ref={pathCasingRef} fill="none" stroke={followPosition ? '#C41E1E' : '#ffffff'}
            strokeWidth={followPosition ? 16 : 9} strokeOpacity={followPosition ? 0.25 : 0.7}
            strokeLinecap="round" strokeLinejoin="round" />
          {/* Rider → pickup leg: solid, theme-aware — white on a dark
              map, deep grey on a light map — distinct from the main red
              trip route without a dashed pattern competing for attention. */}
          <path ref={pathSecondaryRef} fill="none" stroke={dk ? '#FFFFFF' : '#374151'}
            strokeWidth={followPosition ? 6 : 4.5} strokeOpacity={0.95} strokeLinecap="round" strokeLinejoin="round" />
          <path ref={pathMainRef} fill="none" stroke="#C41E1E"
            strokeWidth={followPosition ? 8 : 5} strokeOpacity={0.95} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {/* Loading spinner until initial map style/tiles are ready */}
      {!styleReady && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none">
          <div
            className={cn(
              'w-10 h-10 rounded-full border-2 animate-spin',
              dk ? 'border-white/15 border-t-white/70' : 'border-gray-200 border-t-brand',
            )}
          />
        </div>
      )}

      {/* Zoom and geolocation buttons */}
      <div className="absolute bottom-4 right-3 z-[10] flex flex-col items-center">
        <div className="db-zoom-wrap">
          <button className="db-zoom-btn db-zoom-in" title="Zoom in" onClick={handleZoomIn}>
            +
          </button>
          <button className="db-zoom-btn db-zoom-out" title="Zoom out" onClick={handleZoomOut}>
            {'\u2212'}
          </button>
        </div>
        <button className="db-locate-btn" title="My location" onClick={handleLocate}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
        </button>
      </div>

      {/* Attribution credit */}
      <div
        className={cn(
          'absolute bottom-0 left-0 z-[10] px-2 py-0.5 text-[10px] leading-4 rounded-tr-md',
          dk ? 'bg-black/50 text-white/60' : 'bg-white/75 text-gray-500',
        )}
      >
        {engine === 'maplibre' ? (
          <>
            © <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" className="hover:underline">Mapbox</a>
            {' '}© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenStreetMap</a>
          </>
        ) : (
          <>
            © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline">OpenStreetMap</a> contributors
          </>
        )}
      </div>

      {/* Center pin when pin-drop mode is active */}
      {pinDropActive && (
        <div className="absolute inset-0 pointer-events-none z-[500] flex items-center justify-center">
          <div className="relative flex flex-col items-center" style={{ marginTop: '-20px' }}>
            <div
              style={{
                width: 32,
                height: 32,
                background: '#C41E1E',
                borderRadius: '50% 50% 50% 4px',
                transform: 'rotate(-45deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(196,30,30,0.45)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{ transform: 'rotate(45deg)' }}>
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <div style={{ width: 2, height: 10, background: '#C41E1E', marginTop: -2 }} />
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.2)',
                marginTop: 2,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
