import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface CampusLocationDoc {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  defaultRadius: number;
  category: string;
  isActive: boolean;
}

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface RiskZoneDoc {
  id: string;
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  radius: number;
  riskLevel: RiskLevel;
  description: string;
  isActive: boolean;
  updatedBy: string;
  updatedByName?: string;
  updatedAt: any;
}

class CampusLocationService {
  async getCampusLocations(): Promise<CampusLocationDoc[]> {
    const snap = await getDocs(collection(db, 'campusLocations'));
    return snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: data.name || '',
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        defaultRadius: data.defaultRadius || 100,
        category: data.category || '',
        isActive: data.isActive ?? true,
      };
    });
  }

  subscribeToCampusLocations(
    callback: (locations: CampusLocationDoc[]) => void,
    onError?: (error: Error) => void
  ) {
    const q = query(collection(db, 'campusLocations'));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: CampusLocationDoc[] = snapshot.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || '',
            latitude: data.latitude || 0,
            longitude: data.longitude || 0,
            defaultRadius: data.defaultRadius || 100,
            category: data.category || '',
            isActive: data.isActive ?? true,
          };
        });
        callback(items);
      },
      (err) => {
        console.error('Error subscribing to campusLocations', err);
        onError?.(err as Error);
      }
    );
  }

  async upsertRiskZoneForLocation(params: {
    location: CampusLocationDoc;
    riskLevel: RiskLevel;
    description: string;
    radiusOverride?: number;
    zoneId?: string;
  }): Promise<void> {
    const { location, riskLevel, description, radiusOverride, zoneId } = params;
    const currentUser = auth.currentUser;

    const zoneRef = zoneId
      ? doc(db, 'risk_zones', zoneId)
      : doc(collection(db, 'risk_zones'));

    const radius = radiusOverride ?? location.defaultRadius;

    const payload = {
      locationId: location.id,
      locationName: location.name,
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      radius,
      riskLevel,
      description,
      isActive: true,
      updatedBy: currentUser?.uid ?? 'system',
      updatedByName: currentUser?.email ?? 'Security Admin',
      updatedAt: serverTimestamp(),
    };

    await setDoc(zoneRef, payload, { merge: true });
  }
}

export default new CampusLocationService();

