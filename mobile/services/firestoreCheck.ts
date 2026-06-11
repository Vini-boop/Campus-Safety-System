import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Check if Firestore is properly configured with security rules
 * Returns true if accessible, false if permissions error
 */
export const checkFirestoreAccess = async (): Promise<boolean> => {
  try {
    if (!db) {
      console.error('❌ Firestore not initialized');
      return false;
    }

    // Try to read a test document (this will fail if rules are not configured)
    const testDocRef = doc(db, 'system', 'config');
    await getDoc(testDocRef);
    
    console.log('✅ Firestore access verified');
    return true;
  } catch (error: any) {
    if (error.code === 'permission-denied' || error.message?.includes('Missing or insufficient permissions')) {
      console.error('❌ Firestore PERMISSION DENIED - Security rules not configured');
      console.error('📋 ACTION REQUIRED: Configure Firestore security rules in Firebase Console');
      console.error('🔗 Go to: https://console.firebase.google.com/project/YOUR_PROJECT_ID/firestore/rules');
      return false;
    }
    
    // Other errors (network, etc.)
    console.error('⚠️ Firestore access error:', error.message);
    return false;
  }
};

/**
 * Get user-friendly error message for Firestore issues
 */
export const getFirestoreErrorMessage = (error: any): string => {
  if (error.code === 'permission-denied') {
    return 'Firestore security rules are not configured. Please contact the administrator.';
  }
  
  if (error.message?.includes('network')) {
    return 'Network error. Please check your internet connection.';
  }
  
  return error.message || 'Firestore is currently unavailable.';
};
