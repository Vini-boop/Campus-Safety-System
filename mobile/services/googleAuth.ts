import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_ROLES } from '@/utils/roleUtils';
import { api } from '@/services/api';
import { auth, db } from '@/services/firebase';

// Configure WebBrowser for redirect
WebBrowser.maybeCompleteAuthSession();

interface GoogleUserInfo {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
  isActive?: boolean;
}

// Get Google OAuth configuration based on platform
export const getGoogleConfig = () => {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  if (!webClientId) {
    console.warn("Warning: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in environment variables");
  }

  return {
    androidClientId: process.env.EXPO_PUBLIC_FIREBASE_ANDROID_CLIENT_ID || '500892681156-tsl8up0eeblefoicdgvjfub5fo239klt.apps.googleusercontent.com',
    iosClientId: process.env.EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID || '500892681156-tsl8up0eeblefoicdgvjfub5fo239klt.apps.googleusercontent.com',
    webClientId: webClientId || '500892681156-tsl8up0eeblefoicdgvjfub5fo239klt.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
    // Disable PKCE to prevent "state mismatch" errors on Android with Expo Go
    usePKCE: false,
    // Use implicit flow to get id_token directly without code exchange
    responseType: 'id_token',
  };
};

// Create or update user profile in Firestore
export const createUserProfile = async (userInfo: GoogleUserInfo): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userInfo.uid);
    const userDoc = await getDoc(userRef);

    const userProfile: UserProfile = {
      uid: userInfo.uid,
      fullName: userInfo.displayName,
      email: userInfo.email,
      role: USER_ROLES.STUDENT, // Default role for new users
      displayName: userInfo.displayName,
      photoURL: userInfo.photoURL,
      createdAt: userDoc.exists() ? userDoc.data().createdAt : new Date().toISOString(),
      isActive: true
    };

    // Create or update the user document
    await setDoc(userRef, userProfile, { merge: true });

    console.log('✅ User profile created/updated in Firestore:', userProfile.uid);
  } catch (error) {
    console.error('❌ Error creating/updating user profile:', error);
    throw error;
  }
};

// Store user session data locally
export const storeUserSession = async (user: any): Promise<void> => {
  try {
    // Get fresh ID token
    const idToken = await user.getIdToken();

    // Get user profile from Firestore
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    let userProfile: UserProfile;
    if (userDoc.exists()) {
      const data = userDoc.data();
      userProfile = {
        uid: user.uid,
        fullName: data.fullName || user.displayName || '',
        email: user.email || '',
        role: data.role || USER_ROLES.STUDENT,
        displayName: data.displayName || user.displayName || user.email || '',
        photoURL: data.photoURL || user.photoURL || undefined,
        createdAt: data.createdAt || new Date().toISOString(),
        isActive: data.isActive
      };
    } else {
      // Fallback profile if Firestore document doesn't exist
      userProfile = {
        uid: user.uid,
        fullName: user.displayName || user.email || '',
        email: user.email || '',
        role: USER_ROLES.STUDENT,
        displayName: user.displayName || user.email || '',
        photoURL: user.photoURL || undefined,
        createdAt: new Date().toISOString(),
        isActive: true
      };
    }

    // Store in AsyncStorage
    const userData = {
      ...userProfile,
      idToken: idToken
    };

    await AsyncStorage.setItem('userData', JSON.stringify(userData));
    console.log('✅ User session stored locally');
  } catch (error) {
    console.error('❌ Error storing user session:', error);
    throw error;
  }
};

// Verify user session with backend
export const verifyUserSession = async (): Promise<boolean> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    const idToken = await currentUser.getIdToken();
    const response = await api.verifyToken(idToken);

    console.log('✅ Google auth session verification response:', response.status);

    // Check if response has the expected structure
    if (response.status >= 200 && response.status < 300) {
      if (response.data && response.data.data && response.data.data.user) {
        console.log('✅ Backend verification successful, user data:', response.data.data.user);
        return true;
      } else {
        console.error('❌ Backend verification failed: invalid response structure', response.data);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('❌ Session verification failed:', error);
    return false;
  }
};

// Authenticate with backend using Google ID token
export const authenticateWithGoogle = async (idToken: string): Promise<any> => {
  try {
    const response = await api.googleAuthCallback(idToken);
    return response.data;
  } catch (error) {
    console.error('❌ Google authentication with backend failed:', error);
    throw error;
  }
};

// Get stored user data
export const getStoredUser = async (): Promise<UserProfile | null> => {
  try {
    const userDataStr = await AsyncStorage.getItem('userData');
    return userDataStr ? JSON.parse(userDataStr) : null;
  } catch (error) {
    console.error('❌ Error getting stored user:', error);
    return null;
  }
};

// Clear user session
export const clearUserSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem('userData');
    console.log('✅ User session cleared');
  } catch (error) {
    console.error('❌ Error clearing user session:', error);
  }
};

// This function will be called from the component with the hook
export const handleGoogleSignIn = async (
  request: any,
  promptAsync: any
): Promise<{ success: boolean; user?: any; error?: string }> => {
  try {
    // Trigger the sign-in flow
    if (!request) {
      return {
        success: false,
        error: 'Google authentication is not initialized. Please check your configuration.'
      };
    }

    // Verify environment variables are set
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId || webClientId === 'your_web_client_id_here') {
      console.error('❌ Google Web Client ID not configured in .env.local');
      return {
        success: false,
        error: 'Google Sign-In is not configured. Please contact the administrator.'
      };
    }

    const result = await promptAsync();

    if (result?.type === 'success') {
      // id_token can be in params (implicit flow) or in authentication (code flow)
      const id_token = result.params?.id_token || result.authentication?.idToken;

      if (!id_token) {
        return { success: false, error: 'No ID token received from Google' };
      }

      // Create Google credential
      const credential = GoogleAuthProvider.credential(id_token);

      // Sign in with Firebase
      const userCredential = await signInWithCredential(auth, credential);

      // Get user info
      const user = userCredential.user;
      console.log('Firebase user authenticated:', user.uid);

      // Authenticate with backend using Google ID token
      try {
        const backendResponse = await authenticateWithGoogle(id_token);
        console.log('✅ Backend Google authentication successful:', backendResponse);

        // Store the backend response data
        if (backendResponse.data && backendResponse.data.user) {
          const userData = {
            ...backendResponse.data.user,
            idToken: backendResponse.data.accessToken,
            refreshToken: backendResponse.data.refreshToken,
          };
          await AsyncStorage.setItem('userData', JSON.stringify(userData));
          console.log('✅ User session stored with backend tokens');
        }
      } catch (backendError) {
        console.error('❌ Backend Google authentication failed:', backendError);
        // Fall back to Firebase-only authentication
        await storeUserSession(user);
      }

      // Create/update user profile in Firestore
      await createUserProfile({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || undefined
      });

      return { success: true, user: user };
    } else if (result?.type === 'dismiss') {
      return { success: false, error: 'Sign-in cancelled by user' };
    } else if (result?.type === 'error') {
      const errMsg = result.error?.message || JSON.stringify(result);
      // "Cross-Site request verification failed" = stale OAuth state — safe to retry
      if (errMsg.includes('Cross-Site') || errMsg.includes('state') || errMsg.includes('Cached state')) {
        return {
          success: false,
          error: 'Sign-in session expired. Please tap "Sign in with Google" again.',
        };
      }
      if (errMsg.includes('invalid_request') || errMsg.includes('access_denied')) {
        return {
          success: false,
          error: 'Google Sign-In configuration error. Please ensure OAuth consent screen is set up.',
        };
      }
      return { success: false, error: `Google authentication error: ${result.error?.message || 'Unknown error'}` };
    } else {
      return { success: false, error: 'Google sign-in failed' };
    }
  } catch (error: any) {
    console.error('Google sign-in error:', error);

    // Handle specific errors
    if (error.code === 'auth/account-exists-with-different-credential') {
      return { success: false, error: 'An account already exists with this email address but different sign-in method.' };
    } else if (error.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in cancelled by user' };
    } else if (error.code === 'auth/invalid-credential') {
      return { success: false, error: 'Invalid Google authentication credentials. Please check your Google configuration in Firebase Console.' };
    } else if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network connection failed. Please check your internet connection.' };
    } else if (error.message?.includes('network')) {
      return { success: false, error: 'Network connection failed. Please check your internet connection.' };
    } else if (error.message?.includes('invalid-credential') || error.message?.includes('invalid-oauth-response')) {
      return { success: false, error: 'Invalid Google authentication credentials. Please check your Google configuration.' };
    } else if (error.message?.includes('oauth') || error.message?.includes('consent')) {
      return {
        success: false,
        error: 'Google OAuth configuration incomplete. Please set up OAuth consent screen in Google Cloud Console.'
      };
    }

    return { success: false, error: error.message || 'Google sign-in failed' };
  }
};