/**
 * Auth API Service Layer
 * Centralized authentication API calls with proper token handling
 * 
 * Benefits:
 * - No direct API calls in components
 * - Automatic token attachment via interceptors
 * - Clean separation of concerns
 * - Easy to test and debug
 */

import apiClient from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, signInWithEmailAndPassword, getIdToken as getFirebaseIdToken } from '@/services/firebase';

// ─── Token Management ──────────────────────────────────────────────────────

export const saveAuthToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem('authToken', token);
    console.log('✅ Auth token saved to AsyncStorage');
  } catch (error) {
    console.error('❌ Error saving auth token:', error);
    throw new Error('Failed to save authentication token');
  }
};

export const getAuthToken = async (): Promise<string | null> => {
  try {
    const token = await AsyncStorage.getItem('authToken');
    return token;
  } catch (error) {
    console.error('❌ Error getting auth token:', error);
    return null;
  }
};

export const clearAuthToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem('authToken');
    console.log('✅ Auth token cleared');
  } catch (error) {
    console.error('❌ Error clearing auth token:', error);
  }
};

export const getUserData = async (): Promise<any | null> => {
  try {
    const userData = await AsyncStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('❌ Error getting user data:', error);
    return null;
  }
};

// ─── Authentication API Calls ──────────────────────────────────────────────

/**
 * Login with email and password
 * Returns user data and token
 */
export const loginUser = async (email: string, password: string) => {
  try {
    console.log('🔐 Attempting login for:', email);
    
    // Step 1: Firebase Authentication
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Firebase auth successful, UID:', userCredential.user.uid);
    
    // Step 2: Get ID token from Firebase
    const idToken = await getFirebaseIdToken(userCredential.user);
    if (!idToken) {
      throw new Error('Failed to get ID token from Firebase');
    }
    console.log('🎫 Got Firebase ID token');
    
    // Step 3: Verify token with backend
    const response = await apiClient.post('/admin/auth/verify', { idToken });
    console.log('✅ Backend verification successful');
    
    if (response.status >= 200 && response.status < 300) {
      const data = response.data.data;
      
      // Step 4: Save user data to AsyncStorage
      const userDataToStore = {
        uid: userCredential.user.uid,
        email: userCredential.user.email || '',
        role: data.user.role || 'student',
        displayName: data.user.displayName || userCredential.user.displayName || userCredential.user.email || '',
        photoURL: data.user.photoURL || userCredential.user.photoURL || '',
        idToken: idToken,
      };
      
      await AsyncStorage.setItem('userData', JSON.stringify(userDataToStore));
      console.log('✅ User data saved to AsyncStorage');
      
      return {
        success: true,
        user: userDataToStore,
        backendData: data,
      };
    } else {
      throw new Error(`Backend returned status ${response.status}`);
    }
  } catch (error: any) {
    console.warn('❌ Login failed:', error.message);
    throw error;
  }
};

/**
 * Get current user profile from backend
 * Uses auto-attached token from interceptor
 */
export const getUserProfile = async () => {
  try {
    const response = await apiClient.post('/admin/auth/profile');
    
    if (response.status >= 200 && response.status < 300) {
      const data = response.data.data;
      console.log('✅ User profile fetched:', data.user.email);
      return data.user;
    } else {
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }
  } catch (error: any) {
    console.warn('❌ Error fetching user profile:', error.message);
    throw error;
  }
};

/**
 * Verify user credentials with backend
 * Returns verification result with access rights
 */
export const verifyCredentials = async () => {
  try {
    const userData = await getUserData();
    if (!userData?.idToken) {
      throw new Error('No ID token found in user data');
    }
    
    const response = await apiClient.post('/admin/auth/verify-credentials', {
      idToken: userData.idToken
    });
    
    if (response.status >= 200 && response.status < 300) {
      const result = response.data;
      console.log('✅ Credentials verified successfully');
      return result;
    } else {
      throw new Error(`Verification failed: ${response.status}`);
    }
  } catch (error: any) {
    console.warn('❌ Credential verification failed:', error.message);
    throw error;
  }
};

/**
 * Check user access to specific screens/features
 */
export const checkUserAccess = async (screen: string) => {
  try {
    const userData = await getUserData();
    if (!userData?.idToken) {
      throw new Error('No ID token found');
    }
    
    const response = await apiClient.post('/admin/auth/check-access', {
      idToken: userData.idToken,
      screen
    });
    
    if (response.status >= 200 && response.status < 300) {
      const result = response.data;
      console.log(`✅ Access check for ${screen}:`, result.hasAccess);
      return result;
    } else {
      throw new Error(`Access check failed: ${response.status}`);
    }
  } catch (error: any) {
    console.warn('❌ Access check failed:', error.message);
    throw error;
  }
};

/**
 * Logout - Clear all auth data
 */
export const logoutUser = async (): Promise<void> => {
  try {
    console.log('🚪 Logging out user...');
    
    // Clear all auth-related storage
    await AsyncStorage.multiRemove([
      'userData',
      'userRole',
      'authToken',
      'hasOpenedApp'
    ]);
    
    console.log('✅ All auth data cleared');
  } catch (error) {
    console.warn('❌ Error during logout:', error);
    throw error;
  }
};

// ─── Session Hydration (App Start) ─────────────────────────────────────────

/**
 * Initialize auth state from stored session
 * Call this on app start to hydrate auth context
 */
export const hydrateAuthState = async () => {
  try {
    console.log('💧 Hydrating auth state from storage...');
    
    const userData = await getUserData();
    
    if (!userData) {
      console.log('⚠️ No stored user data found');
      return { isAuthenticated: false, user: null };
    }
    
    // Verify token is still valid by calling backend
    try {
      const profile = await getUserProfile();
      console.log('✅ Session hydrated successfully for:', profile.email);
      
      return {
        isAuthenticated: true,
        user: {
          ...userData,
          ...profile
        }
      };
    } catch (error: any) {
      // Token expired or invalid
      if (error.response?.status === 401) {
        console.log('⚠️ Stored token expired, clearing session');
        await clearAuthToken();
        await AsyncStorage.removeItem('userData');
        return { isAuthenticated: false, user: null };
      }
      
      // Network error - allow offline mode
      if (error.code === 'ERR_NETWORK' || error.message?.includes('Network')) {
        console.log('🌐 Network error - using cached user data');
        return {
          isAuthenticated: true,
          user: userData
        };
      }
      
      throw error;
    }
  } catch (error: any) {
    console.warn('❌ Error hydrating auth state:', error.message);
    return { isAuthenticated: false, user: null };
  }
};

// Export for use in components
export default {
  loginUser,
  getUserProfile,
  verifyCredentials,
  checkUserAccess,
  logoutUser,
  hydrateAuthState,
  saveAuthToken,
  getAuthToken,
  clearAuthToken,
  getUserData
};
