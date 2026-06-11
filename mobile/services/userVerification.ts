/**
 * User Verification Service
 * Handles student/staff verification workflow
 */

import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { VerifiedUser, PendingVerification, UserRole } from '@/types/userVerification';

/**
 * Check if user document exists in Firestore
 */
export const checkUserExists = async (userId: string): Promise<boolean> => {
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    return snap.exists();
  } catch (error) {
    // Silent error handling
    return false;
  }
};

/**
 * Get complete user profile from Firestore
 */
export const getUserProfile = async (userId: string): Promise<VerifiedUser | null> => {
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      return snap.data() as VerifiedUser;
    }
    
    return null;
  } catch (error) {
    // Silent error handling
    return null;
  }
};

/**
 * Submit verification details (Reg No + Phone)
 * Creates pending verification record
 */
export const submitVerification = async (
  uid: string,
  email: string,
  fullName: string,
  regNo: string,
  phone: string
): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    
    await setDoc(userDocRef, {
      uid,
      email,
      fullName,
      regNo: regNo.trim().toUpperCase(),
      phone: phone.trim(),
      role: 'student' as UserRole,
      status: 'pending' as const,
      isVerified: false,
      createdAt: serverTimestamp(),
    });
  } catch (error: any) {
    throw new Error(`Failed to submit verification: ${error.message}`);
  }
};

/**
 * Get all pending verifications (for Admin)
 */
export const getPendingVerifications = async (): Promise<PendingVerification[]> => {
  try {
    const q = query(
      collection(db, 'users'),
      where('status', '==', 'pending')
    );
    
    const querySnapshot = await getDocs(q);
    const pendingUsers: PendingVerification[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      pendingUsers.push({
        uid: data.uid,
        email: data.email,
        fullName: data.fullName,
        regNo: data.regNo,
        phone: data.phone,
        role: data.role,
        submittedAt: data.createdAt,
      });
    });
    
    return pendingUsers;
  } catch (error) {
    // Silent error handling
    return [];
  }
};

/**
 * Approve user verification (Admin only)
 */
export const approveUser = async (userId: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', userId);
    
    await updateDoc(userDocRef, {
      status: 'approved' as const,
      isVerified: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    throw new Error(`Failed to approve user: ${error.message}`);
  }
};

/**
 * Reject user verification (Admin only)
 */
export const rejectUser = async (userId: string, reason?: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', userId);
    
    await updateDoc(userDocRef, {
      status: 'rejected' as const,
      isVerified: false,
      rejectionReason: reason || 'Not specified',
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    throw new Error(`Failed to reject user: ${error.message}`);
  }
};

/**
 * Validate Kenyan phone number format
 */
export const validateKenyanPhone = (phone: string): boolean => {
  const phoneRegex = /^\+254\d{9}$/;
  return phoneRegex.test(phone.trim());
};

/**
 * Validate registration number format
 */
export const validateRegNo = (regNo: string): boolean => {
  // Example: COMP/0001/24 or similar format
  const regNoRegex = /^[A-Z]{2,6}\/\d{3,4}\/\d{2,4}$/i;
  return regNoRegex.test(regNo.trim().toUpperCase());
};
