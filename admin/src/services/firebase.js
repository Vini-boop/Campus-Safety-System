import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const COLLECTIONS = {
  USERS: 'users',
  INCIDENTS: 'incidents',
  ALERTS: 'alerts',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications'
};

// Initialize Auth
export const auth = getAuth(app);
export const db = getFirestore(app);

// Wrapper function for sign in with email and password
export const signInWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await firebaseSignInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error };
  }
};

// Export auth functions
export { 
  getIdToken,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile
};

// Export firestore functions
export { doc, setDoc };

export default app;