import { collection, query, where, onSnapshot, getDocs } from '@/services/firebase';
import { db } from '@/services/firebase';

export interface SecurityZone {
  id: string;
  title: string;
  area: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  latitude: number;
  longitude: number;
  radius: number;
  status: 'active' | 'resolved';
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  createdByName: string;
}

export interface AmbulanceLocation {
  id: string;
  name: string;
  plateNumber: string;
  status: 'available' | 'dispatched' | 'busy' | 'offline';
  latitude: number;
  longitude: number;
  lastUpdated: string;
}

export interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
  createdAt: string;
}

export interface CampusLocation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  type: 'hostel' | 'junction' | 'university' | 'institute' | 'security_zone';
}

// Static campus locations — Laikipia University, Nyahururu, Kenya
export const CAMPUS_LOCATIONS: CampusLocation[] = [
  { id: 1, name: 'Main Campus Center', lat: 0.035611, lng: 36.284968, type: 'university' },
  { id: 2, name: 'Table Land', lat: 0.036116, lng: 36.267111, type: 'university' },
  { id: 3, name: 'Jaffa Hostels', lat: 0.036192, lng: 36.271668, type: 'hostel' },
  { id: 4, name: 'Alexander Hostels', lat: 0.037109, lng: 36.274986, type: 'hostel' },
  { id: 5, name: 'Cherika Junction', lat: 0.032408, lng: 36.283966, type: 'junction' },
  { id: 6, name: 'Security Office', lat: 0.036000, lng: 36.285500, type: 'security_zone' },
  { id: 7, name: 'Emergency Assembly', lat: 0.035200, lng: 36.284400, type: 'security_zone' },
  { id: 8, name: 'Ndoro A Hostels', lat: 0.012793, lng: 36.272800, type: 'hostel' },
  { id: 9, name: 'Shamenei', lat: 0.043004, lng: 36.278835, type: 'institute' },
  { id: 10, name: 'Ndoro Quarry', lat: 0.014609, lng: 36.275738, type: 'security_zone' },
];

class MapService {

  // ── Active security zones (area_alerts) ─────────────────────────────────────
  subscribeToSecurityZones(
    callback: (zones: SecurityZone[]) => void,
    onError?: (error: Error) => void,
  ) {
    const q = query(collection(db, 'area_alerts'), where('status', '==', 'active'));
    return onSnapshot(q, (snapshot: any) => {
      const zones: SecurityZone[] = [];
      snapshot.forEach((doc: any) => {
        const d = doc.data();
        if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number' ||
          Number.isNaN(d.latitude) || Number.isNaN(d.longitude)) return;
        zones.push({
          id: doc.id,
          title: d.title || '',
          area: d.area || '',
          description: d.description || '',
          severity: d.severity || 'medium',
          latitude: d.latitude,
          longitude: d.longitude,
          radius: d.radius || 100,
          status: d.status || 'active',
          createdAt: d.createdAt || '',
          expiresAt: d.expiresAt || '',
          createdBy: d.createdBy || '',
          createdByName: d.createdByName || 'Security',
        });
      });
      zones.sort((a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      callback(zones);
    }, (e: Error) => onError?.(e));
  }

  // ── Live ambulance locations ─────────────────────────────────────────────────
  subscribeToAmbulances(
    callback: (ambulances: AmbulanceLocation[]) => void,
    onError?: (error: Error) => void,
  ) {
    const q = query(
      collection(db, 'ambulances'),
      where('status', 'in', ['available', 'dispatched', 'busy']),
    );
    return onSnapshot(q, (snapshot: any) => {
      const list: AmbulanceLocation[] = [];
      snapshot.forEach((doc: any) => {
        const d = doc.data();
        const lat = d.latitude ?? d.location?.latitude ?? d.currentLocation?.latitude;
        const lng = d.longitude ?? d.location?.longitude ?? d.currentLocation?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number' ||
          Number.isNaN(lat) || Number.isNaN(lng)) return;
        list.push({
          id: doc.id,
          name: d.name || d.vehicleName || 'Ambulance',
          plateNumber: d.plateNumber || d.plate || '',
          status: d.status || 'available',
          latitude: lat,
          longitude: lng,
          lastUpdated: d.updatedAt || d.lastUpdated || '',
        });
      });
      callback(list);
    }, (e: Error) => onError?.(e));
  }

  // ── Active security alerts ───────────────────────────────────────────────────
  subscribeToSecurityAlerts(
    callback: (alerts: SecurityAlert[]) => void,
    onError?: (error: Error) => void,
  ) {
    const q = query(
      collection(db, 'security_alerts'),
      where('status', 'in', ['active', 'pending', 'open']),
    );
    return onSnapshot(q, (snapshot: any) => {
      const list: SecurityAlert[] = [];
      snapshot.forEach((doc: any) => {
        const d = doc.data();
        const lat = d.latitude ?? d.location?.latitude;
        const lng = d.longitude ?? d.location?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number' ||
          Number.isNaN(lat) || Number.isNaN(lng)) return;
        list.push({
          id: doc.id,
          title: d.title || d.type || 'Security Alert',
          description: d.description || d.message || '',
          latitude: lat,
          longitude: lng,
          severity: d.severity || d.priority || 'medium',
          status: d.status || 'active',
          createdAt: d.createdAt || '',
        });
      });
      callback(list);
    }, (e: Error) => onError?.(e));
  }

  getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#FF0000';
      case 'high': return '#FF6B6B';
      case 'medium': return '#FFA500';
      case 'low': return '#FFD700';
      default: return '#0C156D';
    }
  }

  getAmbulanceStatusColor(status: string): string {
    switch (status) {
      case 'available': return '#16A34A';
      case 'dispatched': return '#DC2626';
      case 'busy': return '#D97706';
      default: return '#6B7280';
    }
  }

  isPointInSecurityZone(
    pointLat: number, pointLng: number,
    zoneLat: number, zoneLng: number,
    radius: number,
  ): boolean {
    const R = 6_371_000;
    const dLat = (zoneLat - pointLat) * Math.PI / 180;
    const dLon = (zoneLng - pointLng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(pointLat * Math.PI / 180) * Math.cos(zoneLat * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= radius;
  }

  // Legacy — kept for compatibility
  async getCampusLocations(): Promise<CampusLocation[]> {
    try {
      const q = query(collection(db, 'area_alerts'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      const extra: CampusLocation[] = snap.docs
        .map((doc: any, i: number) => {
          const d = doc.data();
          if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return null;
          return { id: 1000 + i, name: d.title || 'Zone', lat: d.latitude, lng: d.longitude, type: 'security_zone' as const };
        })
        .filter(Boolean) as CampusLocation[];
      return [...CAMPUS_LOCATIONS, ...extra];
    } catch {
      return CAMPUS_LOCATIONS;
    }
  }
}

export default new MapService();
