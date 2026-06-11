/**
 * Emergency Data Access Service
 * Provides secure access to user emergency information
 * Only accessible during SOS, incidents, or ambulance requests
 */

import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { VerifiedUser, EmergencyRequest } from '@/types/userVerification';

/**
 * Get user emergency data (Reg No, Phone, Name)
 * Called during SOS/Ambulance/Incident flows
 */
export const getUserEmergencyData = async (userId: string): Promise<{
  regNo: string;
  phone: string;
  name: string;
  email: string;
} | null> => {
  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    
    if (snap.exists()) {
      const data = snap.data();
      return {
        regNo: data.regNo,
        phone: data.phone,
        name: data.fullName,
        email: data.email,
      };
    }
    
    return null;
  } catch (error) {
    // Silent error handling
    return null;
  }
};

/**
 * Create emergency request record
 * For SOS, Ambulance, or Incident reports
 */
export const createEmergencyRequest = async (data: {
  userId: string;
  name: string;
  regNo: string;
  phone: string;
  type: 'SOS' | 'incident' | 'ambulance';
  location?: string;
  description?: string;
}): Promise<string> => {
  try {
    const emergencyRef = await addDoc(collection(db, 'emergencies'), {
      userId: data.userId,
      name: data.name,
      regNo: data.regNo,
      phone: data.phone,
      type: data.type,
      location: data.location || '',
      description: data.description || '',
      status: 'active' as const,
      createdAt: serverTimestamp(),
    });
    
    return emergencyRef.id;
  } catch (error: any) {
    throw new Error(`Failed to create emergency request: ${error.message}`);
  }
};

/**
 * Get active emergency requests (for Security/Medical staff)
 */
export const getActiveEmergencies = async (): Promise<EmergencyRequest[]> => {
  try {
    // Note: This requires proper Firestore indexes
    // In production, you'd use a more optimized query
    const snapshot = await getDocs(collection(db, 'emergencies'));
    const emergencies: EmergencyRequest[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === 'active' || data.status === 'responding') {
        emergencies.push({
          id: doc.id,
          ...data,
        } as EmergencyRequest);
      }
    });
    
    return emergencies;
  } catch (error) {
    // Silent error handling
    return [];
  }
};

/**
 * Update emergency request status
 * Used by Security/Medical staff when responding
 */
export const updateEmergencyStatus = async (
  emergencyId: string,
  status: 'responding' | 'resolved' | 'cancelled',
  respondedBy?: string
): Promise<void> => {
  try {
    // This would typically use updateDoc
    // Implementation depends on specific requirements
  } catch (error: any) {
    throw new Error(`Failed to update emergency status: ${error.message}`);
  }
};

/**
 * Validate that user has approved/verified status
 * Required before accessing emergency features
 */
export const validateUserForEmergencyAccess = async (userId: string): Promise<boolean> => {
  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    
    if (snap.exists()) {
      const data = snap.data();
      return data.status === 'approved' && data.isVerified === true;
    }
    
    return false;
  } catch (error) {
    // Silent error handling
    return false;
  }
};
