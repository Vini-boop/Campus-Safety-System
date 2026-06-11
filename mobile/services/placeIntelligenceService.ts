/**
 * placeIntelligenceService.ts
 *
 * Converts GPS coordinates → human-readable campus place names.
 * Fully offline — no external API calls.
 *
 * Resolution priority:
 *   1. Exact bounding-box match (with per-zone radius buffer)
 *   2. Nearest zone within 300 m → returns clean name (no distance suffix)
 *   3. Nearest zone beyond 300 m → returns name with distance hint
 *   4. Outside campus bounds entirely
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type ZoneCategory =
  | 'Residential Area'
  | 'Shopping Center'
  | 'Small Town'
  | 'Security'
  | 'Admin'
  | 'Medical'
  | 'Communication'
  | 'Landmark'
  | 'Hostel'
  | 'Academic'
  | 'Sports';

export interface CampusZone {
  name: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  category: ZoneCategory;
  /** Optional per-zone GPS snap radius in metres (overrides default BUFFER) */
  snapRadius?: number;
}

export interface LocationResult {
  name: string;
  category: ZoneCategory | null;
  type: 'EXACT_MATCH' | 'NEAREST_MATCH' | 'OUTSIDE_CAMPUS';
  distanceM?: number;
}

// ─── Tuning constants ─────────────────────────────────────────────────────────
/** Default bounding-box buffer in degrees (~55 m at equator) */
const BUFFER = 0.0005;

/**
 * Within this distance (metres) a nearest-zone match is treated as
 * "close enough" and returned without a distance suffix.
 */
const CLEAN_NAME_RADIUS_M = 300;

// ─── Campus bounding box ──────────────────────────────────────────────────────
const CAMPUS_BOUNDS = {
  latMin: 0.010,
  latMax: 0.048,
  lngMin: 36.260,
  lngMax: 36.320,
};

// ─── Full Campus Zone Database ────────────────────────────────────────────────
// snapRadius is only used for isolated point zones far from neighbours.
// Dense campus zones (hostels, academic) use exact bounding boxes + default BUFFER (~55m).
// Order matters: more specific/larger zones are checked before smaller overlapping ones.
export const CAMPUS_ZONES: CampusZone[] = [

  // ── External Residential & Surrounding Areas ──────────────────────────────
  { name: 'Table Land', latMin: 0.034319, latMax: 0.037913, lngMin: 36.265675, lngMax: 36.268546, category: 'Residential Area' },
  { name: 'Jaffa Hostels', latMin: 0.035692, latMax: 0.036692, lngMin: 36.271168, lngMax: 36.272168, category: 'Residential Area' },
  { name: 'Alexander Hostels', latMin: 0.036609, latMax: 0.037609, lngMin: 36.274486, lngMax: 36.275486, category: 'Residential Area' },
  { name: 'Shamenei', latMin: 0.041446, latMax: 0.044561, lngMin: 36.276880, lngMax: 36.280790, category: 'Residential Area' },
  { name: 'Ndoro A Hostels', latMin: 0.012293, latMax: 0.013293, lngMin: 36.272300, lngMax: 36.273300, category: 'Residential Area', snapRadius: 200 },
  // Nyumba Tatu before Cherika — larger area, checked first
  { name: 'Nyumba Tatu', latMin: 0.032963, latMax: 0.039000, lngMin: 36.285800, lngMax: 36.290500, category: 'Shopping Center' },
  { name: 'Cherika Junction', latMin: 0.028482, latMax: 0.034500, lngMin: 36.281500, lngMax: 36.285700, category: 'Shopping Center' },
  { name: 'Two Brothers', latMin: 0.032528, latMax: 0.036004, lngMin: 36.290368, lngMax: 36.292473, category: 'Residential Area' },
  { name: 'Comrades Hostels', latMin: 0.036159, latMax: 0.038191, lngMin: 36.289746, lngMax: 36.291700, category: 'Residential Area' },
  { name: 'Tairi Mbili', latMin: 0.037261, latMax: 0.042409, lngMin: 36.291585, lngMax: 36.294983, category: 'Residential Area' },
  { name: 'Karuga Town', latMin: 0.036319, latMax: 0.044240, lngMin: 36.296217, lngMax: 36.300139, category: 'Small Town' },
  { name: 'Gavana Hostels', latMin: 0.040806, latMax: 0.043945, lngMin: 36.305275, lngMax: 36.312738, category: 'Residential Area' },

  // ── Internal Campus: Administration & Safety ──────────────────────────────
  // These are isolated enough for snapRadius
  { name: 'Security Department', latMin: 0.027715, latMax: 0.028215, lngMin: 36.277044, lngMax: 36.277544, category: 'Security', snapRadius: 60 },
  { name: 'Farm Department', latMin: 0.027772, latMax: 0.028772, lngMin: 36.277355, lngMax: 36.278355, category: 'Landmark', snapRadius: 60 },
  { name: 'University Hospital', latMin: 0.027923, latMax: 0.028923, lngMin: 36.272789, lngMax: 36.273789, category: 'Medical', snapRadius: 60 },
  { name: 'LU Radio', latMin: 0.028298, latMax: 0.028798, lngMin: 36.272306, lngMax: 36.272806, category: 'Communication', snapRadius: 40 },
  { name: 'Dean of Students Office', latMin: 0.028213, latMax: 0.028713, lngMin: 36.272682, lngMax: 36.273182, category: 'Admin', snapRadius: 40 },
  { name: 'Registrar Office', latMin: 0.029200, latMax: 0.029700, lngMin: 36.274184, lngMax: 36.274684, category: 'Admin', snapRadius: 40 },

  // ── Internal Campus: Hostels (dense cluster — exact boxes, no snapRadius) ─
  { name: 'Mandela Hall', latMin: 0.031310, latMax: 0.032310, lngMin: 36.272446, lngMax: 36.273446, category: 'Hostel' },
  { name: 'Nyando Hostel', latMin: 0.028110, latMax: 0.029110, lngMin: 36.274623, lngMax: 36.275623, category: 'Hostel' },
  { name: 'Niger Hostel', latMin: 0.028645, latMax: 0.029645, lngMin: 36.274693, lngMax: 36.275693, category: 'Hostel' },
  { name: 'Malewa Hostel', latMin: 0.028667, latMax: 0.029667, lngMin: 36.274891, lngMax: 36.275891, category: 'Hostel' },
  { name: 'Sabaki Hostel', latMin: 0.028972, latMax: 0.029972, lngMin: 36.274611, lngMax: 36.275611, category: 'Hostel' },
  { name: 'Ngarenarok Hostel', latMin: 0.029073, latMax: 0.030073, lngMin: 36.274814, lngMax: 36.275814, category: 'Hostel' },
  { name: 'Chania Hostel', latMin: 0.028762, latMax: 0.029762, lngMin: 36.275053, lngMax: 36.276053, category: 'Hostel' },
  { name: 'Lake Chacha', latMin: 0.028134, latMax: 0.029134, lngMin: 36.276027, lngMax: 36.277027, category: 'Landmark' },

  // ── Internal Campus: Academic Blocks (dense — exact boxes) ───────────────
  { name: 'Computing & Informatics', latMin: 0.028096, latMax: 0.029096, lngMin: 36.273199, lngMax: 36.274199, category: 'Academic' },
  { name: 'Computer Lab', latMin: 0.028806, latMax: 0.029806, lngMin: 36.273306, lngMax: 36.274306, category: 'Academic' },
  { name: 'Pavilion', latMin: 0.029961, latMax: 0.030961, lngMin: 36.273941, lngMax: 36.274941, category: 'Landmark' },
  { name: 'New Library', latMin: 0.030104, latMax: 0.031104, lngMin: 36.272208, lngMax: 36.273208, category: 'Academic' },
  { name: 'Vision 2030 Block', latMin: 0.030494, latMax: 0.031494, lngMin: 36.272991, lngMax: 36.273991, category: 'Academic' },
  { name: 'Football Pitch A', latMin: 0.031294, latMax: 0.032294, lngMin: 36.274337, lngMax: 36.275337, category: 'Sports' },
];

// ─── Precomputed zone centres ─────────────────────────────────────────────────
const ZONE_CENTERS = CAMPUS_ZONES.map(z => ({
  zone: z,
  lat: (z.latMin + z.latMax) / 2,
  lng: (z.lngMin + z.lngMax) / 2,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function coordsAreUsable(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 1e-7 && Math.abs(lng) < 1e-7) return false;
  return true;
}

function isInsideCampusBounds(lat: number, lng: number): boolean {
  return (
    lat >= CAMPUS_BOUNDS.latMin && lat <= CAMPUS_BOUNDS.latMax &&
    lng >= CAMPUS_BOUNDS.lngMin && lng <= CAMPUS_BOUNDS.lngMax
  );
}

/** Haversine distance in metres */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convert metres to a degree delta (approximate, equator-safe) */
function mToDeg(metres: number): number {
  return metres / 111_320;
}

// ─── Core resolution ──────────────────────────────────────────────────────────

/**
 * Full structured location result. Never throws.
 * Uses best-fit matching: among all zones that contain the point,
 * picks the one with the smallest area (most specific).
 */
export function resolveLocationResult(lat: number, lng: number): LocationResult {
  if (!coordsAreUsable(lat, lng)) {
    return { name: 'Unknown Location', category: null, type: 'OUTSIDE_CAMPUS' };
  }

  // Collect ALL zones that contain this point
  const matches: Array<{ zone: CampusZone; area: number }> = [];

  for (const z of CAMPUS_ZONES) {
    const buf = z.snapRadius != null ? mToDeg(z.snapRadius) : BUFFER;
    if (
      lat >= z.latMin - buf && lat <= z.latMax + buf &&
      lng >= z.lngMin - buf && lng <= z.lngMax + buf
    ) {
      // Area in deg² — smaller = more specific
      const latSpan = (z.latMax - z.latMin) + 2 * buf;
      const lngSpan = (z.lngMax - z.lngMin) + 2 * buf;
      matches.push({ zone: z, area: latSpan * lngSpan });
    }
  }

  if (matches.length > 0) {
    // Pick the most specific (smallest area) match
    matches.sort((a, b) => a.area - b.area);
    const best = matches[0].zone;
    return { name: best.name, category: best.category, type: 'EXACT_MATCH' };
  }

  // No bounding-box match — find nearest zone
  let bestCenter = ZONE_CENTERS[0];
  let bestDist = haversineM(lat, lng, ZONE_CENTERS[0].lat, ZONE_CENTERS[0].lng);

  for (let i = 1; i < ZONE_CENTERS.length; i++) {
    const d = haversineM(lat, lng, ZONE_CENTERS[i].lat, ZONE_CENTERS[i].lng);
    if (d < bestDist) { bestDist = d; bestCenter = ZONE_CENTERS[i]; }
  }

  const isOutside = !isInsideCampusBounds(lat, lng);

  return {
    name: bestCenter.zone.name,
    category: bestCenter.zone.category,
    type: isOutside ? 'OUTSIDE_CAMPUS' : 'NEAREST_MATCH',
    distanceM: Math.round(bestDist),
  };
}

/**
 * Returns a clean place name string.
 * - Exact match → zone name
 * - Nearest within CLEAN_NAME_RADIUS_M → zone name (no suffix)
 * - Nearest beyond that → "Zone Name (~Xm away)"
 * - Outside campus → "Outside Laikipia University"
 */
export async function resolveLocation(lat: number, lng: number): Promise<string> {
  if (!coordsAreUsable(lat, lng)) return 'Unknown Location';
  return _resolveToString(lat, lng);
}

export function resolveLocationSync(lat: number, lng: number): string | null {
  if (!coordsAreUsable(lat, lng)) return null;
  return _resolveToString(lat, lng);
}

function _resolveToString(lat: number, lng: number): string {
  const r = resolveLocationResult(lat, lng);

  if (r.type === 'EXACT_MATCH') return r.name;

  if (r.type === 'OUTSIDE_CAMPUS') {
    // Still return nearest name so the user gets something useful
    const dist = r.distanceM ?? 0;
    if (dist <= CLEAN_NAME_RADIUS_M) return r.name;
    const distLabel = dist >= 1000
      ? `~${(dist / 1000).toFixed(1)} km away`
      : `~${dist} m away`;
    return `${r.name} (${distLabel})`;
  }

  // NEAREST_MATCH — inside campus bounds
  const dist = r.distanceM ?? 0;
  if (dist <= CLEAN_NAME_RADIUS_M) return r.name;
  const distLabel = dist >= 1000
    ? `~${(dist / 1000).toFixed(1)} km away`
    : `~${dist} m away`;
  return `${r.name} (${distLabel})`;
}

/**
 * Exact bounding-box match only — returns zone name or null.
 */
export function lookupCampusZone(lat: number, lng: number): string | null {
  if (!coordsAreUsable(lat, lng)) return null;
  for (const z of CAMPUS_ZONES) {
    const buf = z.snapRadius != null ? mToDeg(z.snapRadius) : BUFFER;
    if (
      lat >= z.latMin - buf && lat <= z.latMax + buf &&
      lng >= z.lngMin - buf && lng <= z.lngMax + buf
    ) {
      return z.name;
    }
  }
  return null;
}

/**
 * Nearest zone with distance in metres.
 */
export function findNearestZone(
  lat: number,
  lng: number
): { name: string; distance: number; category: ZoneCategory } | null {
  if (!coordsAreUsable(lat, lng)) return null;

  let best: { name: string; distance: number; category: ZoneCategory } | null = null;

  for (const c of ZONE_CENTERS) {
    const d = haversineM(lat, lng, c.lat, c.lng);
    if (!best || d < best.distance) {
      best = { name: c.zone.name, distance: d, category: c.zone.category };
    }
  }

  return best;
}

// ─── Dashboard helper ─────────────────────────────────────────────────────────
export interface ReportLocationForDashboard {
  displayName: string;
  campusZone: string | null;
  campusZoneCategory: ZoneCategory | null;
  matchedBy: 'campus_zone' | 'nearest_zone' | 'outside' | 'typed_only';
}

export async function getReportLocationForDashboard(
  lat: number | null | undefined,
  lng: number | null | undefined,
  typedAddress: string
): Promise<ReportLocationForDashboard> {
  const latN = lat ?? NaN;
  const lngN = lng ?? NaN;

  if (coordsAreUsable(latN, lngN)) {
    const result = resolveLocationResult(latN, lngN);

    if (result.type === 'EXACT_MATCH') {
      return {
        displayName: result.name,
        campusZone: result.name,
        campusZoneCategory: result.category,
        matchedBy: 'campus_zone',
      };
    }

    if (result.type === 'NEAREST_MATCH') {
      const dist = result.distanceM ?? 0;
      // Within 300 m → use clean name; beyond → add distance hint
      const displayName = dist <= CLEAN_NAME_RADIUS_M
        ? result.name
        : `${result.name} (~${dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m'})`;
      return {
        displayName,
        campusZone: result.name,
        campusZoneCategory: result.category,
        matchedBy: 'nearest_zone',
      };
    }

    // OUTSIDE_CAMPUS — still surface nearest name for context
    const dist = result.distanceM ?? 0;
    const displayName = dist <= CLEAN_NAME_RADIUS_M
      ? result.name
      : `Outside Laikipia University`;
    return {
      displayName,
      campusZone: dist <= CLEAN_NAME_RADIUS_M ? result.name : null,
      campusZoneCategory: dist <= CLEAN_NAME_RADIUS_M ? result.category : null,
      matchedBy: dist <= CLEAN_NAME_RADIUS_M ? 'nearest_zone' : 'outside',
    };
  }

  const typed = (typedAddress || '').trim();
  return {
    displayName: typed || 'Location not specified',
    campusZone: null,
    campusZoneCategory: null,
    matchedBy: 'typed_only',
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────
export function formatZoneDisplayName(text: string): string {
  return (text || '').replace(/^📍\s*/u, '').trim();
}

export function getAllZoneNames(): string[] {
  return CAMPUS_ZONES.map(z => z.name);
}

export function getZonesByCategory(): Record<ZoneCategory, string[]> {
  const result = {} as Record<ZoneCategory, string[]>;
  for (const z of CAMPUS_ZONES) {
    if (!result[z.category]) result[z.category] = [];
    result[z.category].push(z.name);
  }
  return result;
}

export default {
  resolveLocation,
  resolveLocationSync,
  resolveLocationResult,
  lookupCampusZone,
  findNearestZone,
  getAllZoneNames,
  getZonesByCategory,
  getReportLocationForDashboard,
  formatZoneDisplayName,
  coordsAreUsable,
  CAMPUS_ZONES,
};
