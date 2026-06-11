/**
 * Maps Service
 * Utilities for Google Maps integration and geolocation
 */

/**
 * Generate Google Maps link for coordinates
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string}
 */
export const generateMapsLink = (latitude, longitude) => {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

/**
 * Generate Google Maps search link for address
 * @param {string} address
 * @returns {string}
 */
export const generateMapsSearchLink = (address) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
};

/**
 * Reverse geocode coordinates to address
 * Uses Google Maps Geocoding API
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<string>}
 */
export const reverseGeocode = async (latitude, longitude) => {
    try {
        // Note: This requires Google Maps API key in environment
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        if (!apiKey) {
            console.warn('Google Maps API key not configured');
            return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        }

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
        );

        const data = await response.json();

        if (data.status === 'OK' && data.results.length > 0) {
            return data.results[0].formatted_address;
        }

        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
};

/**
 * Check if a point is within a geofence
 * @param {number} pointLat
 * @param {number} pointLon
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {number} radiusMeters
 * @returns {boolean}
 */
export const isWithinGeofence = (pointLat, pointLon, centerLat, centerLon, radiusMeters) => {
    const distance = calculateDistance(pointLat, pointLon, centerLat, centerLon);
    return distance <= radiusMeters;
};

/**
 * Format coordinates for display
 * @param {number} latitude
 * @param {number} longitude
 * @returns {string}
 */
export const formatCoordinates = (latitude, longitude) => {
    const latDir = latitude >= 0 ? 'N' : 'S';
    const lonDir = longitude >= 0 ? 'E' : 'W';
    return `${Math.abs(latitude).toFixed(6)}° ${latDir}, ${Math.abs(longitude).toFixed(6)}° ${lonDir}`;
};

/**
 * Prepare heatmap data for Google Maps
 * @param {Array} reports - Array of report objects with locationCoords
 * @returns {Array}
 */
export const prepareHeatmapData = (reports) => {
    return reports
        .filter(report => report.locationCoords?.latitude && report.locationCoords?.longitude)
        .map(report => ({
            location: new google.maps.LatLng(
                report.locationCoords.latitude,
                report.locationCoords.longitude
            ),
            weight: report.type === 'sos' || report.type === 'Emergency/SOS' ? 3 : 1,
        }));
};

/**
 * Default map configuration
 */
export const defaultMapConfig = {
    center: { lat: 0, lng: 0 }, // Will be set dynamically
    zoom: 15,
    mapTypeId: 'roadmap',
    styles: [
        {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
        },
    ],
};

export default {
    generateMapsLink,
    generateMapsSearchLink,
    reverseGeocode,
    calculateDistance,
    isWithinGeofence,
    formatCoordinates,
    prepareHeatmapData,
    defaultMapConfig,
};
