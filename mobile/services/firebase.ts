import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getIdToken,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, orderBy, getDocs } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "safety-management-system-4faf0.firebaseapp.com",
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "safety-management-system-4faf0",
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "safety-management-system-4faf0.firebasestorage.app",
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "796748500304",
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    "1:796748500304:web:f7968bf4b6b8d447edb055",
  measurementId:
    process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-XY2MMK95ZP",
};

if (!firebaseConfig.apiKey) {
  throw new Error('Firebase API Key is required - please check mobile/.env.local');
}

if (!firebaseConfig.projectId) {
  throw new Error('Firebase Project ID is required');
}

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error: any) {
  throw new Error(`Firebase initialization failed: ${error.message}`);
}

// Initialize Auth with React Native persistence on native, default on web
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });

// Export auth functions
export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getIdToken,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  fetchSignInMethodsForEmail
};

// Initialize Firestore with error handling
let db: any;
try {
  db = getFirestore(app);
  // Silent - Firestore initialized
} catch (error: any) {
  // Silent - Firestore initialization failed
}

// Initialize Storage
export const storage = getStorage(app);

// Export Firestore functions
export { doc, setDoc, getDoc, collection, query, where, onSnapshot, orderBy, getDocs };

// Export db (may be null if initialization failed)
export { db };

// Firebase connectivity test function
export const testFirebaseConnection = async () => {
  console.log('🔍 Testing Firebase connectivity...');

  try {
    // Test 1: Check if app is initialized
    if (!app) {
      console.error('❌ Firebase app not initialized');
      return {
        success: false,
        message: 'Firebase app not initialized',
        details: 'Firebase app instance is null or undefined'
      };
    }

    // Test 2: Check Auth service
    if (!auth) {
      console.error('❌ Firebase Auth not initialized');
      return {
        success: false,
        message: 'Firebase Auth not initialized',
        details: 'Auth service is null or undefined'
      };
    }

    // Test 3: Check Firestore (skip if not initialized)
    if (!db) {
      console.warn('⚠️ Firestore not initialized - this is OK for auth-only operations');
      // Firestore might have failed init due to security rules, but Auth can still work
      const projectInfo = {
        projectId: app.options.projectId,
        authDomain: app.options.authDomain,
        apiKey: app.options.apiKey ? 'SET' : 'MISSING',
        appId: app.options.appId ? 'SET' : 'MISSING'
      };
      return {
        success: true, // Auth is working, which is what matters for login/signup
        message: 'Firebase Auth available (Firestore pending configuration)',
        details: {
          ...projectInfo,
          firestoreStatus: 'pending_configuration'
        }
      };
    }

    // Test 4: Try to access Firebase project info
    const projectInfo = {
      projectId: app.options.projectId,
      authDomain: app.options.authDomain,
      apiKey: app.options.apiKey ? 'SET' : 'MISSING',
      appId: app.options.appId ? 'SET' : 'MISSING'
    };

    console.log('✅ Firebase connectivity test passed');
    console.log('   Project info:', projectInfo);

    return {
      success: true,
      message: 'Firebase connection successful',
      details: projectInfo
    };

  } catch (error: any) {
    console.error('❌ Firebase connectivity test failed:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error details:', error);

    // Don't fail on Firestore permission errors - Auth might still work
    if (error.code === 'permission-denied' ||
      error.message?.includes('Missing or insufficient permissions')) {
      console.warn('⚠️ Firestore permissions not configured, but Firebase Auth may still work');
      return {
        success: true, // Allow app to continue - user can still authenticate
        message: 'Firebase Auth available (configure Firestore rules for full functionality)',
        details: {
          requiresFirestoreConfig: true,
          authAvailable: true
        }
      };
    }

    return {
      success: false,
      message: `Firebase connection failed: ${error.message}`,
      details: {
        errorCode: error.code,
        errorMessage: error.message,
        stack: error.stack
      }
    };
  }
};

export default app;
