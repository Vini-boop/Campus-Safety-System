/**
 * geocodingService.js
 * Hybrid coordinate → place name resolution system.
 * 1. Campus zone lookup (instant, works offline) — with buffer tolerance
 * 2. Nearest zone fallback (within 500m)
 * 3. LRU cache for API results
 * 4. Nominatim API fallback
 * 5. Formatted coordinates as last resort
 */

// ─── Buffer Tolerance ────────────────────────────────────────────────────────
const BUFFER = 0.0002; // ~22m tolerance for GPS inaccuracy

// ─── Expanded Campus Zone Database ───────────────────────────────────────────
// Based on Laikipia University campus layout — kept in sync with mobile/services/placeIntelligenceService.ts
export const CAMPUS_ZONES = [
    // ── External Residential & Surrounding Areas ──────────────────────────────
    { name: 'Table Land', latMin: 0.034319, latMax: 0.037913, lngMin: 36.265675, lngMax: 36.268546, category: 'Residential Area' },
    { name: 'Jaffa', latMin: 0.036192, latMax: 0.036192, lngMin: 36.271668, lngMax: 36.271668, category: 'Residential Area' },
    { name: 'Alexander Hostels', latMin: 0.037109, latMax: 0.037109, lngMin: 36.274986, lngMax: 36.274986, category: 'Residential Area' },
    { name: 'Shamenei', latMin: 0.041446, latMax: 0.044561, lngMin: 36.276880, lngMax: 36.280790, category: 'Residential Area' },
    { name: 'Ndoro A Hostels', latMin: 0.012793, latMax: 0.012793, lngMin: 36.272800, lngMax: 36.272800, category: 'Residential Area' },
    { name: 'Cherika Junction', latMin: 0.028482, latMax: 0.036334, lngMin: 36.282547, lngMax: 36.285384, category: 'Shopping Center' },
    { name: 'Nyumba Tatu', latMin: 0.032963, latMax: 0.038585, lngMin: 36.285705, lngMax: 36.289573, category: 'Shopping Center' },
    { name: 'Two Brothers', latMin: 0.032528, latMax: 0.036004, lngMin: 36.290368, lngMax: 36.292473, category: 'Residential Area' },
    { name: 'Comrades', latMin: 0.036659, latMax: 0.037691, lngMin: 36.290246, lngMax: 36.291200, category: 'Residential Area' },
    { name: 'Tairi Mbili', latMin: 0.037261, latMax: 0.042409, lngMin: 36.291585, lngMax: 36.294983, category: 'Residential Area' },
    { name: 'Karuga', latMin: 0.036319, latMax: 0.044240, lngMin: 36.296217, lngMax: 36.300139, category: 'Small Town' },
    { name: 'Gavana', latMin: 0.040806, latMax: 0.043945, lngMin: 36.305275, lngMax: 36.312738, category: 'Residential Area' },
    // ── Internal Campus: Administration & Safety ──────────────────────────────
    { name: 'Security Department', latMin: 0.027965, latMax: 0.027965, lngMin: 36.277294, lngMax: 36.277294, category: 'Security' },
    { name: 'Dean of Students Office', latMin: 0.028463, latMax: 0.028463, lngMin: 36.272932, lngMax: 36.272932, category: 'Admin' },
    { name: 'Registrar Office', latMin: 0.029450, latMax: 0.029450, lngMin: 36.274434, lngMax: 36.274434, category: 'Admin' },
    { name: 'University Hospital', latMin: 0.028423, latMax: 0.028423, lngMin: 36.273289, lngMax: 36.273289, category: 'Medical' },
    { name: 'LU Radio', latMin: 0.028548, latMax: 0.028548, lngMin: 36.272556, lngMax: 36.272556, category: 'Communication' },
    { name: 'Farm Department', latMin: 0.028272, latMax: 0.028272, lngMin: 36.277855, lngMax: 36.277855, category: 'Landmark' },
    // ── Internal Campus: Hostels ──────────────────────────────────────────────
    { name: 'Mandela Hall', latMin: 0.031810, latMax: 0.031810, lngMin: 36.272946, lngMax: 36.272946, category: 'Hostel' },
    { name: 'Sabaki Hostel', latMin: 0.029472, latMax: 0.029472, lngMin: 36.275111, lngMax: 36.275111, category: 'Hostel' },
    { name: 'Ngarenarok Hostel', latMin: 0.029573, latMax: 0.029573, lngMin: 36.275314, lngMax: 36.275314, category: 'Hostel' },
    { name: 'Malewa Hostel', latMin: 0.029167, latMax: 0.029167, lngMin: 36.275391, lngMax: 36.275391, category: 'Hostel' },
    { name: 'Chania Hostel', latMin: 0.029262, latMax: 0.029262, lngMin: 36.275553, lngMax: 36.275553, category: 'Hostel' },
    { name: 'Nyando Hostel', latMin: 0.028610, latMax: 0.028610, lngMin: 36.275123, lngMax: 36.275123, category: 'Hostel' },
    { name: 'Niger Hostel', latMin: 0.029145, latMax: 0.029145, lngMin: 36.275193, lngMax: 36.275193, category: 'Hostel' },
    { name: 'Lake Chacha', latMin: 0.028634, latMax: 0.028634, lngMin: 36.276527, lngMax: 36.276527, category: 'Landmark' },
    // ── Internal Campus: Academic Blocks ─────────────────────────────────────
    { name: 'New Library', latMin: 0.030604, latMax: 0.030604, lngMin: 36.272708, lngMax: 36.272708, category: 'Academic' },
    { name: 'Vision 2030', latMin: 0.030994, latMax: 0.030994, lngMin: 36.273491, lngMax: 36.273491, category: 'Academic' },
    { name: 'Computing & Informatics', latMin: 0.028596, latMax: 0.028596, lngMin: 36.273699, lngMax: 36.273699, category: 'Academic' },
    { name: 'Comp Lab', latMin: 0.029306, latMax: 0.029306, lngMin: 36.273806, lngMax: 36.273806, category: 'Academic' },
    { name: 'Pavilion', latMin: 0.030461, latMax: 0.030461, lngMin: 36.274441, lngMax: 36.274441, category: 'Landmark' },
    { name: 'Football Pitch A', latMin: 0.031794, latMax: 0.031794, lngMin: 36.274837, lngMax: 36.274837, category: 'Sports' },
];

// ─── LRU Cache ───────────────────────────────────────────────────────────────
class LRUCache {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) this.cache.delete(key);
        this.cache.set(key, value);
        // Evict least recently used
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }
}

const geocodeCache = new LRUCache(100);

// ─── Haversine Distance ─────────────────────────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Zone Center ─────────────────────────────────────────────────────────────
function zoneCenter(zone) {
    return {
        lat: (zone.latMin + zone.latMax) / 2,
        lng: (zone.lngMin + zone.lngMax) / 2,
    };
}

// ─── Campus Zone Lookup (with buffer tolerance) ──────────────────────────────
/**
 * Check if coordinates fall within any known campus zone (with ~22m buffer).
 * Returns zone name or null.
 */
export function lookupCampusZone(lat, lng) {
    if (!lat || !lng) return null;

    for (const zone of CAMPUS_ZONES) {
        if (lat >= zone.latMin - BUFFER && lat <= zone.latMax + BUFFER &&
            lng >= zone.lngMin - BUFFER && lng <= zone.lngMax + BUFFER) {
            return zone.name;
        }
    }
    return null;
}

// ─── Nearest Zone Fallback ───────────────────────────────────────────────────
/**
 * Find the nearest campus zone by distance.
 * Always returns the closest zone — no distance cutoff.
 */
export function findNearestZone(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;

    let nearest = null;

    for (const zone of CAMPUS_ZONES) {
        const center = zoneCenter(zone);
        const dist = haversineDistance(lat, lng, center.lat, center.lng);
        if (!nearest || dist < nearest.distance) {
            nearest = { name: zone.name, distance: dist, category: zone.category };
        }
    }

    return nearest;
}

// ─── Nominatim Reverse Geocoding ─────────────────────────────────────────────
/**
 * Reverse geocode using OpenStreetMap Nominatim (free, no API key needed).
 * Rate limited to 1 req/sec by OSM policy.
 */
async function nominatimReverse(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: { 'User-Agent': 'CampusSafety/1.0' },
            }
        );

        if (!response.ok) return null;

        const data = await response.json();
        if (!data.display_name) return null;

        // Extract a short, useful name
        const addr = data.address || {};
        const parts = [
            addr.building || addr.amenity || addr.shop || '',
            addr.road || addr.street || '',
            addr.suburb || addr.neighbourhood || '',
        ].filter(Boolean);

        return parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 2).join(',');
    } catch (e) {
        console.warn('Nominatim reverse geocoding failed:', e);
        return null;
    }
}

// ─── Main Resolve Function ───────────────────────────────────────────────────
/**
 * Resolve coordinates to a human-readable place name.
 * Strategy: Campus zone → Cache → Nominatim API → Nearest zone → Formatted coords
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} [manualAddress] - If provided, return this first
 * @returns {Promise<string>} Place name
 */
// ─── Campus Bounds ────────────────────────────────────────────────────────────
const CAMPUS_BOUNDS = { latMin: 0.010, latMax: 0.048, lngMin: 36.260, lngMax: 36.320 };

function isInsideCampusBounds(lat, lng) {
    return lat >= CAMPUS_BOUNDS.latMin && lat <= CAMPUS_BOUNDS.latMax &&
        lng >= CAMPUS_BOUNDS.lngMin && lng <= CAMPUS_BOUNDS.lngMax;
}

export async function resolveLocation(lat, lng, manualAddress) {
    // 1. If manual address provided, use it
    if (manualAddress) return manualAddress;

    // 2. Validate coordinates
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return 'Unknown Location';

    // 3. Campus zone exact match (instant, offline)
    const campusZone = lookupCampusZone(lat, lng);
    if (campusZone) return campusZone;

    // 4. Check cache
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached;

    // 5. Nearest zone fallback (always returns something)
    const nearest = findNearestZone(lat, lng);
    if (nearest) {
        const isOutside = !isInsideCampusBounds(lat, lng);
        const label = isOutside ? 'Outside Laikipia University' : nearest.name;
        geocodeCache.set(cacheKey, label);
        return label;
    }

    return 'Outside Laikipia University';
}

/**
 * Synchronous campus-only lookup (for renders that can't await).
 */
export function resolveLocationSync(lat, lng, manualAddress) {
    if (manualAddress) return manualAddress;
    if (!lat || !lng) return 'Unknown Location';

    const zone = lookupCampusZone(lat, lng);
    if (zone) return zone;

    // Check cache synchronously
    const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached;

    // Nearest zone sync fallback
    const nearest = findNearestZone(lat, lng);
    if (nearest) {
        const isOutside = !isInsideCampusBounds(lat, lng);
        return isOutside ? 'Outside Laikipia University' : nearest.name;
    }

    return 'Outside Laikipia University';
}

/**
 * Batch resolve multiple locations (with rate limiting for API calls).
 */
export async function batchResolve(locations) {
    const results = [];
    for (const loc of locations) {
        const name = await resolveLocation(loc.lat || loc.latitude, loc.lng || loc.longitude, loc.address);
        results.push({ ...loc, resolvedName: name });
        // Nominatim rate limit: 1 req/sec
        if (!lookupCampusZone(loc.lat || loc.latitude, loc.lng || loc.longitude)) {
            await new Promise(r => setTimeout(r, 1100));
        }
    }
    return results;
}

// ─── Location Analytics ──────────────────────────────────────────────────────
/**
 * Group reports by resolved location and return frequency counts.
 * Used for "Hot Zones" / heatmap-ready data.
 *
 * @param {Array} reports — array of report objects with coordinate fields
 * @returns {{ zoneName: string, count: number, category: string }[]}
 */
export function getLocationAnalytics(reports) {
    const counts = {};

    for (const report of reports) {
        const lat = report.coordinates?.latitude || report.coordinates?.lat || report.latitude;
        const lng = report.coordinates?.longitude || report.coordinates?.lng || report.longitude;

        // Use stored placeName first, then try zone lookup
        let zoneName = report.placeName;
        if (!zoneName && lat && lng) {
            zoneName = lookupCampusZone(lat, lng);
        }
        if (!zoneName) {
            const nearest = findNearestZone(lat, lng);
            zoneName = nearest ? nearest.name : 'Unknown';
        }

        if (!counts[zoneName]) {
            const zone = CAMPUS_ZONES.find(z => z.name === zoneName);
            counts[zoneName] = { zoneName, count: 0, category: zone?.category || 'unknown' };
        }
        counts[zoneName].count++;
    }

    return Object.values(counts).sort((a, b) => b.count - a.count);
}

/**
 * Get all zone names for filter dropdowns.
 */
export function getAllZoneNames() {
    return CAMPUS_ZONES.map(z => z.name);
}

/**
 * Auto-resolve and update a Firestore document's placeName field.
 * Called when a dashboard reads a document that has coordinates but no placeName.
 */
export async function autoResolvePlaceName(docRef, data) {
    const lat = data.coordinates?.latitude || data.coordinates?.lat || data.latitude;
    const lng = data.coordinates?.longitude || data.coordinates?.lng || data.longitude;

    if (!lat || !lng) return null;

    const placeName = await resolveLocation(lat, lng);
    if (placeName && placeName !== 'Unknown Location') {
        try {
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(docRef, { placeName });
            return placeName;
        } catch (e) {
            console.warn('Failed to auto-update placeName:', e);
            return placeName;
        }
    }
    return placeName;
}
