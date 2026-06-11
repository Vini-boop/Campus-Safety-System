import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import apiClient from './api';
import { auth } from './firebase';

/**
 * Check if the backend server is reachable
 * Returns true if server is online, false otherwise
 */
export const checkBackendConnectivity = async (): Promise<boolean> => {
  try {
    console.log('🔍 Checking backend connectivity...');
    const response = await apiClient.get('/health');
    return response.status === 200;
  } catch (error) {
    console.error('❌ Backend connectivity check failed:', error);
    return false;
  }
};

/**
 * Validate user session by checking both:
 * 1. Backend server is reachable
 * 2. User's Firebase token is still valid on the backend
 * 
 * Returns true if session is valid, false if user should be logged out
 */
export const validateUserSession = async (): Promise<boolean> => {
  try {
    // Step 1: Check if backend is reachable
    const isBackendReachable = await checkBackendConnectivity();

    if (!isBackendReachable) {
      console.warn('⚠️ Backend server is not reachable - forcing logout');
      await clearUserSession();
      return false;
    }

    console.log('✅ Backend is reachable');

    // Step 2: Check if user has stored session
    const userDataString = await AsyncStorage.getItem('userData');
    let userData = null;

    if (!userDataString) {
      console.log('ℹ️ No stored session found, but continuing validation with backend');
    } else {
      userData = JSON.parse(userDataString);
    }

    // Step 3: Verify Firebase user is still signed in
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log('ℹ️ No Firebase user signed in');
      await clearUserSession();
      return false;
    }

    // Step 4: Get fresh ID token
    const idToken = await currentUser.getIdToken();
    if (!idToken) {
      console.error('❌ Failed to get ID token');
      await clearUserSession();
      return false;
    }

    // Step 5: Verify token with backend
    try {
      const response = await api.verifyToken(idToken);

      if (response.status >= 200 && response.status < 300) {
        console.log('✅ Session validation successful');

        // Update stored token with fresh one
        let updatedUserData;
        if (userData) {
          updatedUserData = { ...userData, idToken: idToken };
        } else {
          // If we didn't have userData, get the basic fields from the backend response
          const backendData = response.data?.data?.user;
          updatedUserData = {
            uid: currentUser.uid,
            email: currentUser.email || backendData?.email || '',
            role: backendData?.role || 'student',
            displayName: backendData?.displayName || backendData?.fullName || currentUser.displayName || '',
            idToken: idToken
          };
        }
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));

        return true;
      } else {
        console.warn('⚠️ Backend token validation failed');
        await clearUserSession();
        return false;
      }
    } catch (verifyError) {
      console.error('❌ Token verification failed:', verifyError);

      // If backend returns 401/403, token is invalid - force logout
      if ((verifyError as any).response?.status === 401 ||
        (verifyError as any).response?.status === 403) {
        console.warn('⚠️ Token expired or invalid - forcing logout');
        await clearUserSession();
        return false;
      }

      // For other errors (network, timeout), consider session valid but warn user
      console.warn('⚠️ Verification error but keeping session active');
      return true;
    }
  } catch (error) {
    console.error('❌ Session validation error:', error);
    // On any error, assume session is invalid for security
    await clearUserSession();
    return false;
  }
};

/**
 * Clear user session data
 */
export const clearUserSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem('userData');
    console.log('✅ User session cleared');
  } catch (error) {
    console.error('❌ Error clearing user session:', error);
  }
};

/**
 * Force logout - clear session and sign out from Firebase
 */
export const forceLogout = async (): Promise<void> => {
  try {
    console.log('🚪 Forcing user logout...');

    // Clear local storage
    await clearUserSession();

    // Sign out from Firebase
    await auth.signOut();
    console.log('✅ User signed out from Firebase');

    console.log('✅ Logout complete');
  } catch (error) {
    console.error('❌ Error during force logout:', error);
  }
};
