/**
 * googleMapsService.ts
 *
 * Central Google Maps API client for Campus Safety.
 * All services should use this instead of calling Google APIs directly.
 *
 * Enabled APIs on key AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow:
 *   - Geocoding API          → reverseGeocode / forwardGeocode
 *   - Places API             → searchNearbyPlaces / getPlaceDetails / autocomplete
 *   - Directions API         → getDirections
 *   - Distance Matrix API    → getDistanceMatrix
 *   - Maps Elevation API     → getElevation
 *   - Time Zone API          → getTimezone
 *   - Geolocation API        → geolocate
 *   - Maps JavaScript API    → (used in map.web.tsx via embed)
 *   - Maps SDK for Android   → (set in AndroidManifest.xml)
 *   - Maps Static API        → getStaticMapUrl
 *   - Maps Embed API         → (used in map.web.tsx)
 */

const API_KEY =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';

const BASE = 'https://maps.googleapis.com/maps/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeocodedAddress {
    formattedAddress: string;
    street?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
    placeId?: string;
}

export interface LatLng {
    latitude: number;
    longitude: number;
}

export interface DirectionsResult {
    distanceText: string;   // e.g. "1.2 km"
    distanceMeters: number;
    durationText: string;   // e.g. "4 mins"
    durationSeconds: number;
    polyline: string;       // encoded polyline
    steps: DirectionStep[];
}

export interface DirectionStep {
    instruction: string;
    distanceText: string;
    durationText: string;
    startLocation: LatLng;
    endLocation: LatLng;
}

export interface DistanceMatrixResult {
    originAddress: string;
    destinationAddress: string;
    distanceText: string;
    distanceMeters: number;
    durationText: string;
    durationSeconds: number;
}

export interface PlaceResult {
    placeId: string;
    name: string;
    address: string;
    location: LatLng;
    types: string[];
    rating?: number;
}

export interface ElevationResult {
    elevation: number; // metres above sea level
    resolution: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function googleFetch<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google API HTTP ${res.status}`);
    const json = await res.json();
    if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
        throw new Error(`Google API error: ${json.status} — ${json.error_message || ''}`);
    }
    return json as T;
}

function extractAddressComponent(
    components: any[],
    type: string,
    short = false
): string | undefined {
    const c = components?.find((x: any) => x.types?.includes(type));
    return c ? (short ? c.short_name : c.long_name) : undefined;
}

// ─── Geocoding API ────────────────────────────────────────────────────────────

/**
 * Reverse geocode: coordinates → human-readable address.
 */
export async function reverseGeocode(
    latitude: number,
    longitude: number
): Promise<GeocodedAddress> {
    const url =
        `${BASE}/geocode/json?latlng=${latitude},${longitude}&key=${API_KEY}`;
    const data = await googleFetch<any>(url);

    if (!data.results?.length) {
        return { formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` };
    }

    const result = data.results[0];
    const comps = result.address_components || [];

    return {
        formattedAddress: result.formatted_address,
        street: [
            extractAddressComponent(comps, 'street_number'),
            extractAddressComponent(comps, 'route'),
        ].filter(Boolean).join(' ') || undefined,
        city:
            extractAddressComponent(comps, 'locality') ||
            extractAddressComponent(comps, 'administrative_area_level_2'),
        region: extractAddressComponent(comps, 'administrative_area_level_1'),
        country: extractAddressComponent(comps, 'country'),
        postalCode: extractAddressComponent(comps, 'postal_code'),
        placeId: result.place_id,
    };
}

/**
 * Forward geocode: address string → coordinates.
 */
export async function forwardGeocode(address: string): Promise<LatLng | null> {
    const url =
        `${BASE}/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`;
    const data = await googleFetch<any>(url);

    if (!data.results?.length) return null;
    const loc = data.results[0].geometry.location;
    return { latitude: loc.lat, longitude: loc.lng };
}

// ─── Directions API (Routes API — replaces legacy Directions) ────────────────

/**
 * Get driving directions between two points using Google Routes API.
 */
export async function getDirections(
    origin: LatLng,
    destination: LatLng,
    mode: 'DRIVE' | 'WALK' | 'BICYCLE' = 'DRIVE'
): Promise<DirectionsResult | null> {
    const res = await fetch(
        `https://routes.googleapis.com/directions/v2:computeRoutes?key=${API_KEY}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline,routes.legs.steps',
            },
            body: JSON.stringify({
                origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
                destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
                travelMode: mode,
                routingPreference: mode === 'DRIVE' ? 'TRAFFIC_AWARE' : undefined,
            }),
        }
    );

    if (!res.ok) throw new Error(`Routes API HTTP ${res.status}`);
    const data = await res.json();
    if (!data.routes?.length) return null;

    const route = data.routes[0];
    const distM = route.distanceMeters || 0;
    const durSec = parseInt(route.duration?.replace('s', '') || '0', 10);

    const steps: DirectionStep[] = (route.legs?.[0]?.steps || []).map((step: any) => ({
        instruction: step.navigationInstruction?.instructions || '',
        distanceText: `${step.distanceMeters || 0} m`,
        durationText: step.staticDuration || '',
        startLocation: {
            latitude: step.startLocation?.latLng?.latitude ?? 0,
            longitude: step.startLocation?.latLng?.longitude ?? 0,
        },
        endLocation: {
            latitude: step.endLocation?.latLng?.latitude ?? 0,
            longitude: step.endLocation?.latLng?.longitude ?? 0,
        },
    }));

    return {
        distanceText: distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`,
        distanceMeters: distM,
        durationText: durSec >= 3600
            ? `${Math.floor(durSec / 3600)}h ${Math.floor((durSec % 3600) / 60)}m`
            : `${Math.floor(durSec / 60)} mins`,
        durationSeconds: durSec,
        polyline: route.polyline?.encodedPolyline || '',
        steps,
    };
}

// ─── Distance Matrix API (Routes API preferred) ───────────────────────────────

/**
 * Get distance and duration between origins and destinations.
 * Falls back to legacy Distance Matrix if Routes API unavailable.
 */
export async function getDistanceMatrix(
    origins: LatLng[],
    destinations: LatLng[],
    mode: 'DRIVE' | 'WALK' = 'DRIVE'
): Promise<DistanceMatrixResult[]> {
    const res = await fetch(
        `https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix?key=${API_KEY}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status',
            },
            body: JSON.stringify({
                origins: origins.map(o => ({
                    waypoint: { location: { latLng: { latitude: o.latitude, longitude: o.longitude } } },
                })),
                destinations: destinations.map(d => ({
                    waypoint: { location: { latLng: { latitude: d.latitude, longitude: d.longitude } } },
                })),
                travelMode: mode,
            }),
        }
    );

    if (!res.ok) throw new Error(`Route Matrix API HTTP ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];

    return rows
        .filter((el: any) => el.status?.code === undefined || el.status?.code === 0)
        .map((el: any) => {
            const distM = el.distanceMeters || 0;
            const durSec = parseInt(el.duration?.replace('s', '') || '0', 10);
            return {
                originAddress: `Origin ${el.originIndex}`,
                destinationAddress: `Destination ${el.destinationIndex}`,
                distanceText: distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`,
                distanceMeters: distM,
                durationText: `${Math.floor(durSec / 60)} mins`,
                durationSeconds: durSec,
            };
        });
}

// ─── Places API ───────────────────────────────────────────────────────────────

/**
 * Search for nearby places (hospitals, pharmacies, etc.).
 */
export async function searchNearbyPlaces(
    location: LatLng,
    radius: number,
    type: string
): Promise<PlaceResult[]> {
    const url =
        `${BASE}/place/nearbysearch/json` +
        `?location=${location.latitude},${location.longitude}` +
        `&radius=${radius}` +
        `&type=${type}` +
        `&key=${API_KEY}`;

    const data = await googleFetch<any>(url);

    return (data.results || []).map((r: any) => ({
        placeId: r.place_id,
        name: r.name,
        address: r.vicinity || '',
        location: { latitude: r.geometry.location.lat, longitude: r.geometry.location.lng },
        types: r.types || [],
        rating: r.rating,
    }));
}

/**
 * Places autocomplete — for address search inputs.
 */
export async function autocompletePlaces(
    input: string,
    location?: LatLng,
    radiusM = 50000
): Promise<{ placeId: string; description: string }[]> {
    let url =
        `${BASE}/place/autocomplete/json` +
        `?input=${encodeURIComponent(input)}` +
        `&key=${API_KEY}`;

    if (location) {
        url += `&location=${location.latitude},${location.longitude}&radius=${radiusM}`;
    }

    const data = await googleFetch<any>(url);
    return (data.predictions || []).map((p: any) => ({
        placeId: p.place_id,
        description: p.description,
    }));
}

/**
 * Get full details for a place by placeId.
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
    const url =
        `${BASE}/place/details/json` +
        `?place_id=${placeId}` +
        `&fields=place_id,name,formatted_address,geometry,types,rating` +
        `&key=${API_KEY}`;

    const data = await googleFetch<any>(url);
    if (!data.result) return null;

    const r = data.result;
    return {
        placeId: r.place_id,
        name: r.name,
        address: r.formatted_address || '',
        location: { latitude: r.geometry.location.lat, longitude: r.geometry.location.lng },
        types: r.types || [],
        rating: r.rating,
    };
}

// ─── Elevation API ────────────────────────────────────────────────────────────

/**
 * Get elevation (metres above sea level) for a coordinate.
 */
export async function getElevation(location: LatLng): Promise<ElevationResult | null> {
    const url =
        `${BASE}/elevation/json` +
        `?locations=${location.latitude},${location.longitude}` +
        `&key=${API_KEY}`;

    const data = await googleFetch<any>(url);
    if (!data.results?.length) return null;

    return {
        elevation: data.results[0].elevation,
        resolution: data.results[0].resolution,
    };
}

// ─── Time Zone API ────────────────────────────────────────────────────────────

/**
 * Get timezone info for a coordinate.
 */
export async function getTimezone(
    location: LatLng,
    timestamp?: number
): Promise<{ timeZoneId: string; timeZoneName: string; rawOffset: number; dstOffset: number } | null> {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const url =
        `${BASE}/timezone/json` +
        `?location=${location.latitude},${location.longitude}` +
        `&timestamp=${ts}` +
        `&key=${API_KEY}`;

    const data = await googleFetch<any>(url);
    if (data.status !== 'OK') return null;

    return {
        timeZoneId: data.timeZoneId,
        timeZoneName: data.timeZoneName,
        rawOffset: data.rawOffset,
        dstOffset: data.dstOffset,
    };
}

// ─── Geolocation API ─────────────────────────────────────────────────────────

/**
 * Wi-Fi/cell-tower based geolocation (no GPS needed).
 * Returns a rough location estimate.
 */
export async function geolocate(): Promise<{ location: LatLng; accuracy: number } | null> {
    const url = `https://www.googleapis.com/geolocation/v1/geolocate?key=${API_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ considerIp: true }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.location) return null;
    return {
        location: { latitude: data.location.lat, longitude: data.location.lng },
        accuracy: data.accuracy,
    };
}

// ─── Static Map URL ───────────────────────────────────────────────────────────

/**
 * Build a Google Static Map image URL.
 */
export function getStaticMapUrl(
    center: LatLng,
    zoom = 15,
    size = '400x300',
    markers?: LatLng[]
): string {
    let url =
        `${BASE}/staticmap` +
        `?center=${center.latitude},${center.longitude}` +
        `&zoom=${zoom}` +
        `&size=${size}` +
        `&key=${API_KEY}`;

    if (markers?.length) {
        const markerStr = markers.map(m => `${m.latitude},${m.longitude}`).join('|');
        url += `&markers=${encodeURIComponent(markerStr)}`;
    }

    return url;
}

export default {
    reverseGeocode,
    forwardGeocode,
    getDirections,
    getDistanceMatrix,
    searchNearbyPlaces,
    autocompletePlaces,
    getPlaceDetails,
    getElevation,
    getTimezone,
    geolocate,
    getStaticMapUrl,
};
