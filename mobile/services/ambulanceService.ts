/**
 * ambulanceService.ts
 * 
 * Comprehensive ambulance request and tracking service.
 * Handles Firestore operations for ambulance requests, real-time updates,
 * and location tracking.
 */

import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import { reverseGeocode, getDirections, type DirectionsResult } from './googleMapsService';

export interface AmbulanceRequest {
  id?: string;
  studentId: string;
  name: string;
  phone: string;
  hostelName: string;
  roomNumber: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  status: 'pending' | 'accepted' | 'dispatched' | 'arrived' | 'resolved' | 'cancelled';
  createdAt: any; // Timestamp | Date
  updatedAt?: any; // Timestamp | Date
  chatId?: string;
  medicalCondition: string;
  notes?: string;
  priority: 'normal' | 'urgent' | 'critical';
  assignedDriverId?: string;
  assignedDriverName?: string;
  estimatedArrival?: string;
  cancellationReason?: string;
  cancelledAt?: any;
  resolutionNotes?: string;
  resolvedAt?: any;
}

export interface AmbulanceLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: any; // Timestamp | Date
  status: 'en_route' | 'arrived' | 'available';
}

class AmbulanceService {
  private COLLECTION_NAME = 'ambulance_requests';

  /**
   * Create a new ambulance request
   */
  async createAmbulanceRequest(
    data: {
      studentId: string;
      name: string;
      phone: string;
      hostelName: string;
      roomNumber: string;
      location: { lat: number; lng: number; address?: string };
      medicalCondition: string;
      notes?: string;
      priority?: 'normal' | 'urgent' | 'critical';
    }
  ): Promise<string> {
    try {
      const requestData: AmbulanceRequest = {
        studentId: data.studentId,
        name: data.name,
        phone: data.phone,
        hostelName: data.hostelName,
        roomNumber: data.roomNumber,
        location: data.location,
        medicalCondition: data.medicalCondition,
        notes: data.notes,
        status: 'pending',
        priority: data.priority || 'critical',
        createdAt: serverTimestamp() as any,
      };

      const docRef = await addDoc(
        collection(db, this.COLLECTION_NAME),
        requestData
      );

      console.log('✅ Ambulance request created:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error creating ambulance request:', error);
      throw new Error('Failed to create ambulance request');
    }
  }

  /**
   * Update ambulance request status
   */
  async updateRequestStatus(
    requestId: string,
    status: AmbulanceRequest['status'],
    additionalData?: Partial<AmbulanceRequest>
  ): Promise<void> {
    try {
      const requestRef = doc(db, this.COLLECTION_NAME, requestId);
      const updateData: any = {
        status,
        updatedAt: serverTimestamp(),
        ...additionalData,
      };

      await updateDoc(requestRef, updateData);
      console.log(`✅ Request ${requestId} status updated to: ${status}`);
    } catch (error) {
      console.error('❌ Error updating request status:', error);
      throw new Error('Failed to update request status');
    }
  }

  /**
   * Assign driver to ambulance request
   */
  async assignDriver(
    requestId: string,
    driverId: string,
    driverName: string,
    estimatedArrival?: string
  ): Promise<void> {
    try {
      await this.updateRequestStatus(requestId, 'dispatched', {
        assignedDriverId: driverId,
        assignedDriverName: driverName,
        estimatedArrival,
      });
      console.log(`✅ Driver ${driverName} assigned to request ${requestId}`);
    } catch (error) {
      console.error('❌ Error assigning driver:', error);
      throw new Error('Failed to assign driver');
    }
  }

  /**
   * Listen to ambulance request changes in real-time
   */
  listenToRequest(
    requestId: string,
    callback: (request: AmbulanceRequest) => void
  ): () => void {
    const requestRef = doc(db, this.COLLECTION_NAME, requestId);

    const unsubscribe = onSnapshot(requestRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as AmbulanceRequest;
        callback(data);
      } else {
        console.warn('⚠️ Ambulance request not found:', requestId);
      }
    });

    return unsubscribe;
  }

  /**
   * Get all ambulance requests for a student
   */
  async getStudentRequests(studentId: string): Promise<AmbulanceRequest[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('studentId', '==', studentId)
        // Removed `orderBy` to prevent index masking missing as permissions. Will sort locally.
      );

      const snapshot = await onSnapshot(q, (querySnapshot) => {
        const requests: AmbulanceRequest[] = [];
        querySnapshot.forEach((doc) => {
          requests.push({ id: doc.id, ...doc.data() } as AmbulanceRequest);
        });

        // ✅ Local sort
        requests.sort((a, b) => {
          const timeA = new Date(a.createdAt?.toDate?.() || a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt?.toDate?.() || b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        return requests;
      });

      return [];
    } catch (error) {
      console.error('❌ Error getting student requests:', error);
      return [];
    }
  }

  /**
   * Update ambulance GPS location
   */
  async updateAmbulanceLocation(
    ambulanceId: string,
    location: AmbulanceLocation
  ): Promise<void> {
    try {
      const locationRef = doc(db, 'ambulance_locations', ambulanceId);
      await updateDoc(locationRef, {
        ...location,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('❌ Error updating ambulance location:', error);
      // Create if doesn't exist
      await addDoc(collection(db, 'ambulance_locations'), {
        ambulanceId,
        ...location,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  /**
   * Listen to ambulance GPS location in real-time
   */
  listenToAmbulanceLocation(
    ambulanceId: string,
    callback: (location: AmbulanceLocation & { id?: string }) => void
  ): () => void {
    const q = query(
      collection(db, 'ambulance_locations'),
      where('ambulanceId', '==', ambulanceId)
      // Removed `orderBy` to prevent index masking. 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Find latest manually
        let latestDoc = snapshot.docs[0];
        let maxTime = new Date(latestDoc.data().updatedAt?.toDate?.() || 0).getTime();

        snapshot.docs.forEach(doc => {
          const time = new Date(doc.data().updatedAt?.toDate?.() || 0).getTime();
          if (time > maxTime) {
            maxTime = time;
            latestDoc = doc;
          }
        });

        callback({ id: latestDoc.id, ...latestDoc.data() } as any);
      } else {
        console.warn('⚠️ No location data for ambulance:', ambulanceId);
      }
    });

    return unsubscribe;
  }

  /**
   * Get current GPS location with high accuracy
   */
  async getCurrentLocation(): Promise<{
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  }> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied');
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      return {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        accuracy: currentLocation.coords.accuracy || undefined,
      };
    } catch (error) {
      console.error('❌ Error getting location:', error);
      throw new Error('Failed to get current location');
    }
  }

  /**
   * Reverse geocode coordinates to address via Google Geocoding API.
   */
  async getAddressFromCoordinates(latitude: number, longitude: number): Promise<string> {
    try {
      const result = await reverseGeocode(latitude, longitude);
      return result.formattedAddress;
    } catch (error) {
      console.error('❌ Error reverse geocoding:', error);
      return '';
    }
  }

  /**
   * Get driving directions between two points via Google Directions API.
   */
  async getDirectionsToPatient(
    ambulanceLat: number,
    ambulanceLng: number,
    patientLat: number,
    patientLng: number
  ): Promise<DirectionsResult | null> {
    try {
      return await getDirections(
        { latitude: ambulanceLat, longitude: ambulanceLng },
        { latitude: patientLat, longitude: patientLng },
        'driving'
      );
    } catch (error) {
      console.error('❌ Error getting directions:', error);
      return null;
    }
  }

  /**
   * Cancel ambulance request
   */
  async cancelRequest(requestId: string, reason?: string): Promise<void> {
    try {
      await this.updateRequestStatus(requestId, 'cancelled', {
        cancellationReason: reason,
        cancelledAt: serverTimestamp(),
      });
      console.log(`✅ Request ${requestId} cancelled`);
    } catch (error) {
      console.error('❌ Error cancelling request:', error);
      throw new Error('Failed to cancel request');
    }
  }

  /**
   * Mark request as resolved/completed
   */
  async resolveRequest(
    requestId: string,
    resolutionNotes?: string
  ): Promise<void> {
    try {
      await this.updateRequestStatus(requestId, 'resolved', {
        resolutionNotes,
        resolvedAt: serverTimestamp(),
      });
      console.log(`✅ Request ${requestId} marked as resolved`);
    } catch (error) {
      console.error('❌ Error resolving request:', error);
      throw new Error('Failed to resolve request');
    }
  }
}

export default new AmbulanceService();
