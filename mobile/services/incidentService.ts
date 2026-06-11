import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  GeoPoint
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import * as Location from 'expo-location';
import { reverseGeocode as googleReverseGeocode } from './googleMapsService';

// Types for incident reporting
export type IncidentType = 'security' | 'medical';
export type IncidentStatus = 'pending' | 'investigating' | 'resolved' | 'false_report';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';

export type SecurityCategory =
  | 'harassment'
  | 'assault'
  | 'theft'
  | 'suspicious_activity'
  | 'unsafe_environment';

export type MedicalSubType = 'ambulance' | 'doctor_chat';

export interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  accuracy?: number;
}

export interface ReporterInfo {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'security' | 'medical';
}

export interface EvidenceFile {
  url: string;
  type: 'image' | 'video';
  name: string;
  size: number;
  uploadedAt: Timestamp;
}

export interface IncidentReport {
  id?: string;
  type: IncidentType;
  category?: SecurityCategory;
  medicalSubType?: MedicalSubType;
  description: string;
  location: LocationData;
  placeName?: string;
  hostelName: string;
  roomNumber: string;
  reporter: ReporterInfo;
  evidence: {
    files: EvidenceFile[];
    count: number;
  };
  status: IncidentStatus;
  priority: IncidentPriority;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  assignedTo?: string;
  responseTime?: Timestamp;
  resolvedAt?: Timestamp;
}

// Constants
export const MAX_MEDIA_FILES = 5;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

class IncidentService {
  private incidentCollection = collection(db, 'incident_reports');

  // Get current user location
  async getCurrentLocation(): Promise<LocationData> {
    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude, accuracy } = location.coords;

      // Reverse geocode to get address via Google Geocoding API
      let address = 'Unknown Location';
      try {
        const geocoded = await googleReverseGeocode(latitude, longitude);
        address = geocoded.formattedAddress;
      } catch {
        address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }

      return {
        latitude,
        longitude,
        address: address.trim(),
        accuracy,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      throw new Error('Failed to get location. Please enable location services.');
    }
  }

  // Upload evidence file to Firebase Storage
  async uploadEvidence(
    file: any,
    incidentId: string,
    reporterId: string
  ): Promise<EvidenceFile> {
    try {
      // Validate file
      if (!file || !file.uri) {
        throw new Error('Invalid file');
      }

      // Check file size
      if (file.fileSize && file.fileSize > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 10MB limit');
      }

      // Determine file type
      const fileType = file.type?.startsWith('image/') ? 'image' : 'video';

      // Create storage reference
      const storagePath = `incident-evidence/${incidentId}/${Date.now()}_${file.fileName || 'file'}`;
      const storageRef = ref(storage, storagePath);

      // Upload file
      const response = await fetch(file.uri);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob);

      // Get download URL
      const downloadUrl = await getDownloadURL(storageRef);

      return {
        url: downloadUrl,
        type: fileType,
        name: file.fileName || 'unnamed',
        size: file.fileSize || 0,
        uploadedAt: Timestamp.now(),
      };
    } catch (error) {
      console.error('Error uploading evidence:', error);
      throw new Error('Failed to upload evidence file');
    }
  }

  // Create new incident report
  async createIncident(incidentData: Omit<IncidentReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      if (!auth.currentUser) {
        throw new Error('User not authenticated');
      }

      // Validate required fields
      if (!incidentData.description || !incidentData.location) {
        throw new Error('Description and location are required');
      }

      // Create incident document
      const incidentDoc = doc(this.incidentCollection);
      const incidentId = incidentDoc.id;

      // Prepare incident data
      const incident: IncidentReport = {
        ...incidentData,
        id: incidentId,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };

      // Save to Firestore
      await setDoc(incidentDoc, incident);

      console.log('✅ Incident created successfully:', incidentId);
      return incidentId;
    } catch (error) {
      console.error('Error creating incident:', error);
      throw new Error('Failed to create incident report');
    }
  }

  // Update incident status (for security dashboard)
  async updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus,
    assignedTo?: string
  ): Promise<void> {
    try {
      const incidentRef = doc(this.incidentCollection, incidentId);
      const updateData: any = {
        status,
        updatedAt: serverTimestamp(),
      };

      if (assignedTo) {
        updateData.assignedTo = assignedTo;
      }

      if (status === 'investigating') {
        updateData.responseTime = serverTimestamp();
      }

      if (status === 'resolved') {
        updateData.resolvedAt = serverTimestamp();
      }

      await updateDoc(incidentRef, updateData);
      console.log('✅ Incident status updated:', incidentId, status);
    } catch (error) {
      console.error('Error updating incident status:', error);
      throw new Error('Failed to update incident status');
    }
  }

  // Get all incidents (for dashboard)
  async getAllIncidents(): Promise<IncidentReport[]> {
    try {
      const q = query(
        this.incidentCollection,
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IncidentReport[];
    } catch (error) {
      console.error('Error fetching incidents:', error);
      throw new Error('Failed to fetch incidents');
    }
  }

  // Get incidents by type
  async getIncidentsByType(type: IncidentType): Promise<IncidentReport[]> {
    try {
      const q = query(
        this.incidentCollection,
        where('type', '==', type),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IncidentReport[];
    } catch (error) {
      console.error('Error fetching incidents by type:', error);
      throw new Error('Failed to fetch incidents');
    }
  }

  // Get incidents by status
  async getIncidentsByStatus(status: IncidentStatus): Promise<IncidentReport[]> {
    try {
      const q = query(
        this.incidentCollection,
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IncidentReport[];
    } catch (error) {
      console.error('Error fetching incidents by status:', error);
      throw new Error('Failed to fetch incidents');
    }
  }

  // Real-time listener for new incidents
  onIncidentsUpdate(callback: (incidents: IncidentReport[]) => void): () => void {
    const q = query(
      this.incidentCollection,
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const incidents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as IncidentReport[];
      callback(incidents);
    }, (error) => {
      console.error('Error in incidents listener:', error);
    });

    return unsubscribe;
  }

  // Get incident statistics for dashboard
  async getIncidentStats(): Promise<{
    total: number;
    pending: number;
    investigating: number;
    resolved: number;
    security: number;
    medical: number;
    highPriority: number;
    criticalPriority: number;
  }> {
    try {
      const allIncidents = await this.getAllIncidents();

      return {
        total: allIncidents.length,
        pending: allIncidents.filter(i => i.status === 'pending').length,
        investigating: allIncidents.filter(i => i.status === 'investigating').length,
        resolved: allIncidents.filter(i => i.status === 'resolved').length,
        security: allIncidents.filter(i => i.type === 'security').length,
        medical: allIncidents.filter(i => i.type === 'medical').length,
        highPriority: allIncidents.filter(i => i.priority === 'high').length,
        criticalPriority: allIncidents.filter(i => i.priority === 'critical').length,
      };
    } catch (error) {
      console.error('Error getting incident stats:', error);
      throw new Error('Failed to get incident statistics');
    }
  }

  // Get security incidents by category
  async getSecurityStats(): Promise<Record<SecurityCategory, number>> {
    try {
      const securityIncidents = await this.getIncidentsByType('security');
      const stats: Record<SecurityCategory, number> = {
        harassment: 0,
        assault: 0,
        theft: 0,
        suspicious_activity: 0,
        unsafe_environment: 0,
      };

      securityIncidents.forEach(incident => {
        if (incident.category) {
          stats[incident.category] = (stats[incident.category] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error getting security stats:', error);
      throw new Error('Failed to get security statistics');
    }
  }

  // Get medical incidents by type
  async getMedicalStats(): Promise<Record<MedicalSubType, number>> {
    try {
      const medicalIncidents = await this.getIncidentsByType('medical');
      const stats: Record<MedicalSubType, number> = {
        ambulance: 0,
        doctor_chat: 0,
      };

      medicalIncidents.forEach(incident => {
        if (incident.medicalSubType) {
          stats[incident.medicalSubType] = (stats[incident.medicalSubType] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error getting medical stats:', error);
      throw new Error('Failed to get medical statistics');
    }
  }
}

export default new IncidentService();
