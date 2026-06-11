import { api } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_ROLES, UserRole } from '@/utils/roleUtils';
import { lookupCampusZone } from './placeIntelligenceService';
import * as Location from 'expo-location';
import { db, doc, getDoc } from '@/services/firebase';

export interface UserVerificationResult {
  isValid: boolean;
  user: {
    id: string;
    email: string;
    role: string;
    status: string;
    displayName: string;
    photoURL?: string;
    emailVerified: boolean;
    createdAt?: string;
    lastLogin?: string;
    regNumber?: string;
    phoneNumber?: string;
    campusArea?: string | null; // Added: Current campus area
  };
  accessRights: {
    canAccessHomeScreen: boolean;
    canAccessDashboard: boolean;
    canReportIncidents: boolean;
    canViewAlerts: boolean;
  };
  location?: {
    campusArea?: string | null;
    coordinates?: { latitude: number; longitude: number };
    detectedAt?: string;
  };
}

export interface AccessCheckResult {
  hasAccess: boolean;
  role: string;
  screen: string;
  accessDetails: {
    [key: string]: boolean;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  status: string;
  profile: {
    fullName: string;
    displayName: string;
    photoURL?: string | null;
    phoneNumber?: string | null;
    createdAt?: string | null;
    lastLogin?: string | null;
  };
  accessRights: {
    canAccessHomeScreen: boolean;
    canAccessDashboard: boolean;
    canReportIncidents: boolean;
    canViewAlerts: boolean;
    canViewReports: boolean;
    canCreateReports: boolean;
    canViewMaps: boolean;
    canSendMessage: boolean;
    canViewEmergencyContacts: boolean;
    canAccessSettings: boolean;
    canManageUsers: boolean;
    canViewSecurity: boolean;
    canViewMedical: boolean;
    canViewAdminPanel: boolean;
  };
  permissions: {
    isAdmin: boolean;
    isSecurity: boolean;
    isMedical: boolean;
    isStudent: boolean;
  };
}

class UserVerificationService {
  /**
   * Verify user credentials and check access rights to Home Screen
   */
  async verifyCredentials(): Promise<UserVerificationResult | null> {
    // Get the ID token from AsyncStorage
    const userDataString = await AsyncStorage.getItem('userData');
    
    if (!userDataString) {
      console.warn('⚠️ No user data found in storage - user may not be logged in yet');
      // Return a default student role for demo/testing purposes
      return {
        isValid: true,
        user: {
          id: '',
          email: 'demo@student.com',
          role: 'student',
          status: 'ACTIVE',
          displayName: 'Demo User',
          emailVerified: true,
        },
        accessRights: {
          canAccessHomeScreen: true,
          canAccessDashboard: false,
          canReportIncidents: true,
          canViewAlerts: true,
        }
      };
    }

    let userData;
    try {
      userData = JSON.parse(userDataString);
    } catch (error) {
      console.error('❌ Error parsing user data from storage:', error);
      return null;
    }
    
    const idToken = userData.idToken || userData.token;

    if (!idToken) {
      console.warn('⚠️ No ID token found in user data, using fallback');
      // Use fallback with available data
      return {
        isValid: true,
        user: {
          id: userData.id || userData.uid || '',
          email: userData.email || '',
          role: userData.role || 'student',
          status: userData.status || 'ACTIVE',
          displayName: userData.displayName || userData.fullName || userData.email || '',
          emailVerified: userData.emailVerified || true,
        },
        accessRights: {
          canAccessHomeScreen: true,
          canAccessDashboard: userData.role === 'admin' || userData.role === 'superadmin',
          canReportIncidents: true,
          canViewAlerts: true,
        }
      };
    }

    try {
      // Call the backend verification endpoint with retry logic
      const MAX_RETRIES = 2;
      let lastError: any = null;
      let response: any = null;
      
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`🔄 Verification attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
          response = await api.verifyUserCredentials(idToken);
          
          if (response.status >= 200 && response.status < 300) {
            const result = response.data;
            console.log('✅ User credentials verified successfully:', result.user.email);
            return result;
          } else {
            // Non-success status, don't retry
            console.error('❌ User verification failed with status:', response.status);
            break;
          }
        } catch (retryError: any) {
          lastError = retryError;
          console.warn(`⚠️ Attempt ${attempt + 1} failed:`, retryError.message);
          
          // Only retry on network/timeout errors
          const isRetryableError = retryError.message?.includes('timeout') || 
                                 retryError.message?.includes('Network') ||
                                 retryError.code === 'ERR_NETWORK' ||
                                 !retryError.response;
          
          if (!isRetryableError) {
            // Non-retryable error (401, 403, etc.)
            console.log('🚫 Non-retryable error, stopping retries');
            break;
          }
          
          // Wait before retry (exponential backoff)
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(1500 * Math.pow(2, attempt), 3000);
            console.log(`⏱️ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If we reach here, backend verification failed - use Firestore fallback
      console.log('⚠️ Backend verification failed, using Firestore fallback');
      return await this.verifyWithFirestoreFallback(userData);

    } catch (error: any) {
      console.error('❌ Error verifying user credentials:', error);
      
      // Check if this is a network error
      const isNetworkError = error.code === 'ERR_NETWORK' || 
                           error.message?.includes('Network Error') ||
                           error.message?.includes('ECONNREFUSED') ||
                           error.message?.includes('connect ECONNREFUSED');
      
      if (isNetworkError) {
        console.log('🌐 Network error detected, proceeding with fallback logic');
        
        // Return a fallback verification result with student role
        const fallbackResult: UserVerificationResult = {
          isValid: true,
          user: {
            id: userData.id || userData.uid || '',
            email: userData.email || '',
            role: userData.role || 'student',
            status: userData.status || 'ACTIVE',
            displayName: userData.displayName || userData.fullName || userData.email || '',
            emailVerified: userData.emailVerified || true,
          },
          accessRights: {
            canAccessHomeScreen: true,
            canAccessDashboard: userData.role === 'admin' || userData.role === 'superadmin',
            canReportIncidents: true,
            canViewAlerts: true,
          }
        };
        
        console.log('🔄 Returning fallback verification result for network error');
        return fallbackResult;
      }
      
      return null;
    }
  }

  /**
   * Get user's current campus area based on location
   */
  async getUserCampusArea(): Promise<{
    campusArea: string | null;
    coordinates?: { latitude: number; longitude: number };
    detectedAt: string;
  }> {
    try {
      console.log('📍 Fetching user campus area...');
      
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        console.log('⚠️ Location permission not granted');
        return {
          campusArea: null,
          detectedAt: new Date().toISOString(),
        };
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;

      // Determine campus zone
      const campusArea = lookupCampusZone(latitude, longitude);

      console.log('✅ Campus area detected:', campusArea);
      console.log(`   Coordinates: ${latitude}, ${longitude}`);

      return {
        campusArea,
        coordinates: { latitude, longitude },
        detectedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Error getting campus area:', error);
      return {
        campusArea: null,
        detectedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Verify credentials with area information
   * Enhanced version that includes user's current campus area
   */
  async verifyCredentialsWithArea(): Promise<UserVerificationResult | null> {
    try {
      // First get basic verification
      const baseResult = await this.verifyCredentials();
      
      if (!baseResult) {
        return null;
      }

      // Get user's current campus area
      const locationData = await this.getUserCampusArea();

      // Enhance result with location information
      const enhancedResult: UserVerificationResult = {
        ...baseResult,
        user: {
          ...baseResult.user,
          campusArea: locationData.campusArea,
        },
        location: {
          campusArea: locationData.campusArea,
          coordinates: locationData.coordinates,
          detectedAt: locationData.detectedAt,
        },
      };

      console.log('✅ Enhanced verification with area:', enhancedResult);
      return enhancedResult;
    } catch (error) {
      console.error('❌ Error in area-enhanced verification:', error);
      return null;
    }
  }

  /**
   * Check if user has access to a specific screen
   */
  async checkAccess(screen: string): Promise<AccessCheckResult | null> {
    try {
      // Get the ID token from AsyncStorage
      const userDataString = await AsyncStorage.getItem('userData');
      
      if (!userDataString) {
        console.error('No user data found in storage');
        return null;
      }

      let userData;
      try {
        userData = JSON.parse(userDataString);
      } catch (error) {
        console.error('Error parsing user data from storage:', error);
        return null;
      }
      
      const idToken = userData.idToken || userData.token;

      if (!idToken) {
        console.error('No ID token found in user data');
        return null;
      }

      // Call the backend access check endpoint
      const response = await api.checkUserAccess(idToken, screen);
      
      if (response.status >= 200 && response.status < 300) {
        const result = response.data;
        console.log(`✅ Access check for screen '${screen}' completed. Has access:`, result.hasAccess);
        return result;
      } else {
        console.error('❌ Access check failed with status:', response.status);
        return null;
      }
    } catch (error: any) {
      console.error('❌ Error checking user access:', error);
      
      // Check if this is a network error
      const isNetworkError = error.code === 'ERR_NETWORK' || 
                           error.message?.includes('Network Error') ||
                           error.message?.includes('ECONNREFUSED') ||
                           error.message?.includes('connect ECONNREFUSED');
      
      if (isNetworkError) {
        console.log('🌐 Network error detected for access check, returning fallback');
        
        // Get user data from storage to create a fallback result
        const userDataString = await AsyncStorage.getItem('userData');
        if (userDataString) {
          try {
            const userData = JSON.parse(userDataString);
            
            // Return a fallback access check result
            const fallbackResult: AccessCheckResult = {
              hasAccess: true, // Allow access by default in offline mode
              role: userData.role || 'student',
              screen,
              accessDetails: {
                canAccess: true,
                canView: true,
                canEdit: screen === 'dashboard' && (userData.role === 'admin' || userData.role === 'superadmin'),
              }
            };
            
            console.log('🔄 Returning fallback access check result for network error');
            return fallbackResult;
          } catch (parseError) {
            console.error('Error parsing user data for fallback access check:', parseError);
          }
        }
      }
      
      return null;
    }
  }

  /**
   * Get complete user profile with access rights
   */
  async getUserProfile(): Promise<UserProfile | null> {
    try {
      // Get the ID token from AsyncStorage
      const userDataString = await AsyncStorage.getItem('userData');
      
      if (!userDataString) {
        console.error('No user data found in storage');
        return null;
      }

      let userData;
      try {
        userData = JSON.parse(userDataString);
      } catch (error) {
        console.error('Error parsing user data from storage:', error);
        return null;
      }
      
      const idToken = userData.idToken || userData.token;

      if (!idToken) {
        console.error('No ID token found in user data');
        return null;
      }

      // Call the backend profile endpoint
      const response = await api.getUserProfile(idToken);
      
      if (response.status >= 200 && response.status < 300) {
        const result = response.data.user;
        console.log('✅ User profile retrieved successfully:', result.email);
        return result;
      } else {
        console.error('❌ Profile retrieval failed with status:', response.status);
        return null;
      }
    } catch (error: any) {
      console.error('❌ Error retrieving user profile:', error);
      
      // Check if this is a network error
      const isNetworkError = error.code === 'ERR_NETWORK' || 
                           error.message?.includes('Network Error') ||
                           error.message?.includes('ECONNREFUSED') ||
                           error.message?.includes('connect ECONNREFUSED');
      
      if (isNetworkError) {
        console.log('🌐 Network error detected for profile retrieval, returning fallback');
        
        // Get user data from storage to create a fallback profile
        const userDataString = await AsyncStorage.getItem('userData');
        if (userDataString) {
          try {
            const userData = JSON.parse(userDataString);
            
            // Return a fallback user profile
            const fallbackProfile: UserProfile = {
              id: userData.id || userData.uid || '',
              email: userData.email || '',
              role: userData.role || 'student',
              status: userData.status || 'ACTIVE',
              profile: {
                fullName: userData.fullName || userData.displayName || userData.email || '',
                displayName: userData.displayName || userData.fullName || userData.email || '',
                photoURL: userData.photoURL || null,
                phoneNumber: userData.phoneNumber || null,
                createdAt: userData.createdAt || null,
                lastLogin: userData.lastLogin || null,
              },
              accessRights: {
                canAccessHomeScreen: true,
                canAccessDashboard: userData.role === 'admin' || userData.role === 'superadmin',
                canReportIncidents: true,
                canViewAlerts: true,
                canViewReports: userData.role !== 'student',
                canCreateReports: userData.role !== 'student',
                canViewMaps: true,
                canSendMessage: userData.role !== 'student',
                canViewEmergencyContacts: true,
                canAccessSettings: true,
                canManageUsers: userData.role === 'admin' || userData.role === 'superadmin',
                canViewSecurity: userData.role === 'security' || userData.role === 'admin' || userData.role === 'superadmin',
                canViewMedical: userData.role === 'medical' || userData.role === 'admin' || userData.role === 'superadmin',
                canViewAdminPanel: userData.role === 'admin' || userData.role === 'superadmin',
              },
              permissions: {
                isAdmin: userData.role === 'admin',
                isSecurity: userData.role === 'security',
                isMedical: userData.role === 'medical',
                isStudent: userData.role === 'student',
              }
            };
            
            console.log('🔄 Returning fallback user profile for network error');
            return fallbackProfile;
          } catch (parseError) {
            console.error('Error parsing user data for fallback profile:', parseError);
          }
        }
      }
      
      return null;
    }
  }

  /**
   * Verify if user can access the Home Screen
   */
  async canAccessHomeScreen(): Promise<boolean> {
    try {
      const verificationResult = await this.verifyCredentials();
      return verificationResult?.accessRights.canAccessHomeScreen || false;
    } catch (error) {
      console.error('❌ Error checking home screen access:', error);
      return false;
    }
  }

  /**
   * Verify if user can access the Dashboard
   */
  async canAccessDashboard(): Promise<boolean> {
    try {
      const verificationResult = await this.verifyCredentials();
      return verificationResult?.accessRights.canAccessDashboard || false;
    } catch (error) {
      console.error('❌ Error checking dashboard access:', error);
      return false;
    }
  }

  /**
   * Get user role
   */
  async getUserRole(): Promise<UserRole | string> {
    try {
      const userDataString = await AsyncStorage.getItem('userData');
      
      if (!userDataString) {
        console.error('No user data found in storage');
        return USER_ROLES.STUDENT;
      }

      let userData;
      try {
        userData = JSON.parse(userDataString);
      } catch (error) {
        console.error('Error parsing user data from storage:', error);
        return USER_ROLES.STUDENT;
      }
      
      const idToken = userData.idToken || userData.token;

      if (!idToken) {
        console.error('No ID token found in user data');
        return USER_ROLES.STUDENT;
      }

      // Get profile to get the role
      const profile = await this.getUserProfile();
      return profile?.role || USER_ROLES.STUDENT;
    } catch (error) {
      console.error('❌ Error getting user role:', error);
      return USER_ROLES.STUDENT;
    }
  }

  /**
   * Refresh user data in storage after verification
   */
  async refreshUserData(): Promise<boolean> {
    try {
      const profile = await this.getUserProfile();
      
      if (profile) {
        // Update the stored user data with the latest information
        const userDataString = await AsyncStorage.getItem('userData');
        let existingUserData: any = {};
        if (userDataString) {
          try {
            existingUserData = JSON.parse(userDataString);
          } catch (error) {
            console.error('Error parsing existing user data from storage:', error);
          }
        }
        const updatedUserData = {
          ...profile,
          idToken: existingUserData.idToken || existingUserData.token, // Preserve the token
        };
        
        await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
        console.log('✅ User data refreshed successfully');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error refreshing user data:', error);
      return false;
    }
  }

  /**
   * Check if user account is active
   */
  async isUserActive(): Promise<boolean> {
    try {
      const profile = await this.getUserProfile();
      return profile?.status === 'ACTIVE';
    } catch (error) {
      console.error('❌ Error checking user status:', error);
      return false;
    }
  }

  /**
   * Verify user credentials using Firestore fallback
   */
  private async verifyWithFirestoreFallback(userData: any): Promise<UserVerificationResult | null> {
    try {
      const userDoc = doc(db, 'users', userData.id);
      const userSnapshot = await getDoc(userDoc);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.data();
        const result: UserVerificationResult = {
          isValid: true,
          user: {
            id: userData.id,
            email: userData.email,
            role: userData.role,
            status: userData.status,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            emailVerified: userData.emailVerified,
            createdAt: userData.createdAt,
            lastLogin: userData.lastLogin,
            regNumber: userData.regNumber,
            phoneNumber: userData.phoneNumber,
            campusArea: userData.campusArea,
          },
          accessRights: {
            canAccessHomeScreen: true,
            canAccessDashboard: userData.role === 'admin' || userData.role === 'superadmin',
            canReportIncidents: true,
            canViewAlerts: true,
          }
        };
        
        console.log('✅ Firestore fallback verification successful:', result.user.email);
        return result;
      } else {
        console.error('❌ Firestore fallback verification failed: User document not found');
        return null;
      }
    } catch (error) {
      console.error('❌ Error in Firestore fallback verification:', error);
      return null;
    }
  }
}

export default new UserVerificationService();