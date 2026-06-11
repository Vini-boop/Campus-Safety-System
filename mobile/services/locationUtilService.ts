/**
 * locationUtilService.ts
 * Handles reverse/forward geocoding via Google Geocoding API.
 */
import { reverseGeocode as googleReverseGeocode, forwardGeocode } from './googleMapsService';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationAddress {
  street?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  name?: string;
  formattedAddress: string;
}

class LocationUtilService {
  /**
   * Convert coordinates to human-readable address via Google Geocoding API.
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<LocationAddress> {
    try {
      const result = await googleReverseGeocode(latitude, longitude);
      return {
        street: result.street,
        city: result.city,
        region: result.region,
        country: result.country,
        postalCode: result.postalCode,
        formattedAddress: result.formattedAddress,
      };
    } catch (error: any) {
      console.error('❌ Reverse geocoding failed:', error?.message);
      return { formattedAddress: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` };
    }
  }

  /**
   * Get a short location name from coordinates.
   */
  async getLocationName(
    latitude: number,
    longitude: number,
    fallbackToCoordinates = true
  ): Promise<string> {
    try {
      const address = await this.reverseGeocode(latitude, longitude);
      return (
        address.street ||
        address.city ||
        address.region ||
        address.formattedAddress
      );
    } catch {
      return fallbackToCoordinates
        ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        : 'Unknown Location';
    }
  }

  /**
   * Batch reverse geocode multiple coordinates.
   */
  async batchReverseGeocode(
    coordinates: LocationCoordinates[]
  ): Promise<Map<string, LocationAddress>> {
    const results = new Map<string, LocationAddress>();
    for (const coord of coordinates) {
      const key = `${coord.latitude},${coord.longitude}`;
      try {
        results.set(key, await this.reverseGeocode(coord.latitude, coord.longitude));
        await new Promise(r => setTimeout(r, 100)); // avoid rate limiting
      } catch {
        results.set(key, {
          formattedAddress: `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`,
        });
      }
    }
    return results;
  }

  /**
   * Extract location info from an incident document.
   */
  async extractLocationFromIncident(incidentData: any): Promise<{
    coordinates: LocationCoordinates | null;
    locationName: string;
    fullAddress?: LocationAddress;
  }> {
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (incidentData.coordinates) {
      latitude = incidentData.coordinates.latitude;
      longitude = incidentData.coordinates.longitude;
    } else if (incidentData.latitude && incidentData.longitude) {
      latitude = incidentData.latitude;
      longitude = incidentData.longitude;
    } else if (incidentData.location) {
      const parts = String(incidentData.location).split(',');
      if (parts.length >= 2) {
        latitude = parseFloat(parts[0].trim());
        longitude = parseFloat(parts[1].trim());
      }
    }

    if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
      return { coordinates: null, locationName: 'Unknown Location' };
    }

    const coords = { latitude, longitude };
    try {
      const address = await this.reverseGeocode(latitude, longitude);
      return {
        coordinates: coords,
        locationName: address.street || address.city || address.formattedAddress,
        fullAddress: address,
      };
    } catch {
      return {
        coordinates: coords,
        locationName: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      };
    }
  }

  /** Haversine distance in metres */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  getEstimatedResponseTime(distanceInMeters: number): string {
    const timeInMinutes = Math.ceil(distanceInMeters / (30 * 1000 / 3600) / 60);
    if (timeInMinutes < 1) return '< 1 min';
    if (timeInMinutes < 60) return `${timeInMinutes} min`;
    return `${Math.floor(timeInMinutes / 60)}h ${timeInMinutes % 60}m`;
  }
}

export { forwardGeocode };
export default new LocationUtilService();
