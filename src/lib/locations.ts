export interface SearchResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: 'landmark' | 'area' | 'street' | 'business';
}

// Read from VITE_MAPBOX_TOKEN (see .env.local). The literal fallback keeps
// geocoding working in deployments where the env file isn't picked up.
const TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string) ||
  'pk.eyJ1Ijoia2VsazciLCJhIjoiY210M2h3bTBvMTBjajJ5c2s2dDhsNHJtbyJ9.ltCbsxU-tOFi2rVNMeGLuQ';

// ── Ghana relevance check for Mapbox features ─────────────────────
// This is a Ghana-only delivery app: if Mapbox's best answer to a query
// is a place in another country (e.g. "umat" → Umatilla, Oregon), we'd
// rather consult the OSM fallback, which knows local POIs Mapbox misses
// (e.g. University of Mines and Technology, Tarkwa).
function isGhanaFeature(f: any): boolean {
  if (f?.short_code === 'gh') return true;
  const ctx: any[] = Array.isArray(f?.context) ? f.context : [];
  if (ctx.some(c => c?.short_code === 'gh' || /^ghana$/i.test(String(c?.text || '')))) return true;
  return /,\s*Ghana$/i.test(String(f?.place_name || ''));
}

// ── PRIMARY: Mapbox Geocoding API (autocomplete) ──────────────────
// Tried first whenever the token is present. `autocomplete=true` makes
// partial words return suggestions as you type.
async function searchMapbox(
  query: string,
  proximity?: { lng: number; lat: number },
): Promise<{ results: SearchResult[]; ghanaMatch: boolean }> {
  if (!TOKEN) return { results: [], ghanaMatch: false };
  try {
    // The query is passed through UNMODIFIED — abbreviations like "UMAT"
    // are sent exactly as typed (no casing/spacing transforms).
    let url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${encodeURIComponent(query)}.json` +
      `?access_token=${TOKEN}` +
      // Wider type net so named places (universities, campuses,
      // landmarks, businesses) come back alongside plain addresses.
      `&types=poi,address,place,locality,neighborhood` +
      // Partial-word suggestions while typing.
      `&autocomplete=true` +
      `&limit=8&language=en`;
    // Strict country filter only for very short queries — longer, more
    // specific queries (e.g. full institution names) aren't overly
    // restricted.
    if (query.length < 4) {
      url += `&country=gh`;
    }
    if (proximity) {
      url += `&proximity=${proximity.lng},${proximity.lat}`;
    }
    const res = await fetch(url);
    if (!res.ok) return { results: [], ghanaMatch: false };
    const json = await res.json();
    const features: any[] = json?.features ?? [];
    const results = features.map((f: any) => {
      const [lng, lat] = f.center as [number, number];
      const placeType: string = f.place_type?.[0] ?? 'area';
      let type: SearchResult['type'] = 'area';
      if (placeType === 'poi') type = 'business';
      else if (placeType === 'address' || placeType === 'street') type = 'street';
      else if (placeType === 'place' || placeType === 'locality' || placeType === 'neighborhood') type = 'landmark';
      return {
        id: f.id as string,
        name: f.text as string,
        address: f.place_name as string,
        lat,
        lng,
        type,
      };
    });
    return { results, ghanaMatch: features.some(isGhanaFeature) };
  } catch {
    return { results: [], ghanaMatch: false };
  }
}

// ── FALLBACK: OpenStreetMap Nominatim ─────────────────────────────
// Useful redundancy for when Mapbox is unavailable (no token, request
// failure) or has no Ghana-relevant answer for the query — OSM often
// knows local POIs that Mapbox doesn't, e.g. "University of Mines and
// Technology, Tarkwa" / "UMAT".
async function searchNominatim(
  query: string,
  proximity?: { lng: number; lat: number },
): Promise<SearchResult[]> {
  try {
    let url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2&limit=8&q=${encodeURIComponent(query)}`;
    // Same rule as Mapbox: strict country filter only for short queries.
    if (query.length < 4) {
      url += `&countrycodes=gh`;
    }
    if (proximity) {
      // Bias (not hard-limit) results toward the given point.
      const d = 0.75;
      url +=
        `&viewbox=${proximity.lng - d},${proximity.lat + d},` +
        `${proximity.lng + d},${proximity.lat - d}&bounded=0`;
    }
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const json = await res.json();
    const rows: any[] = Array.isArray(json) ? json : [];
    return rows.map((f: any) => {
      const cls: string = f.class || '';
      let type: SearchResult['type'] = 'area';
      if (cls === 'amenity' || cls === 'shop' || cls === 'office' || cls === 'tourism') type = 'business';
      else if (cls === 'building' || cls === 'highway') type = 'street';
      else if (cls === 'place' || cls === 'boundary' || cls === 'landuse') type = 'landmark';
      const displayName: string = f.display_name || '';
      const name: string = f.name || displayName.split(',')[0] || 'Unknown location';
      return {
        id: `${f.osm_type || 'node'}-${f.osm_id ?? Math.random().toString(36).slice(2)}`,
        name,
        address: displayName || name,
        lat: parseFloat(f.lat),
        lng: parseFloat(f.lon),
        type,
      };
    });
  } catch {
    return [];
  }
}

// ── Forward geocode: Mapbox first, Nominatim as fallback ──────────
export async function searchLocations(
  query: string,
  proximity?: { lng: number; lat: number },
): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  // 1) Mapbox is the primary source whenever the token is present.
  const mapbox = await searchMapbox(query, proximity);
  if (mapbox.results.length > 0 && mapbox.ghanaMatch) return mapbox.results;

  // 2) Fall back to OpenStreetMap Nominatim when Mapbox is unavailable,
  //    errored, returned nothing, or only returned non-Ghana matches.
  const osm = await searchNominatim(query, proximity);
  if (osm.length > 0) return osm;

  // 3) Nothing from OSM either — return whatever Mapbox had (may be
  //    empty, or non-Ghana results for very unusual queries).
  return mapbox.results;
}

// ── Reverse geocode via Mapbox ────────────────────────────────────
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string> {
  if (!TOKEN) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${lng},${lat}.json?access_token=${TOKEN}&limit=1&language=en`;
    const res = await fetch(url);
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const json = await res.json();
    const name: string | undefined = json?.features?.[0]?.place_name;
    return name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
