/**
 * create-firestore-profiles.mjs
 * Creates Firestore user profiles for existing Firebase Auth demo users
 * Run this after setup-demo-users.mjs to ensure users exist in both Auth and Firestore
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

// Load environment variables
const envContent = readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
  envContent
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => {
      const [key, ...rest] = l.split('=');
      return [key.trim(), rest.join('=').trim()];
    })
);

// Firebase config
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Demo users with their roles and profile data
const DEMO_USERS = [
  {
    email: 'superadmin@campus.edu',
    password: 'SuperAdmin@2025',
    role: 'super_admin',
    fullName: 'Super Admin',
    displayName: 'Super Admin',
    accessLevel: 'full'
  },
  {
    email: 'security@campus.edu',
    password: 'Security@2025',
    role: 'security_admin',
    fullName: 'Security Admin',
    displayName: 'Security Admin',
    accessLevel: 'security'
  },
  {
    email: 'medical@campus.edu',
    password: 'Medical@2025',
    role: 'medical_admin',
    fullName: 'Medical Admin',
    displayName: 'Medical Admin',
    accessLevel: 'medical'
  }
];

async function createUserProfile(email, password, userData) {
  try {
    // Sign in to get the user's UID
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log(`\n📝 Creating Firestore profile for ${email}...`);
    console.log(`   UID: ${user.uid}`);
    
    // Check if profile already exists
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      console.log(`   ⚠️  Profile already exists in Firestore`);
      const existingData = userDocSnap.data();
      console.log(`   Current role: ${existingData.role}`);
      return true;
    }
    
    // Create comprehensive user profile
    const profileData = {
      uid: user.uid,
      email: email,
      role: userData.role,
      status: 'ACTIVE',
      fullName: userData.fullName,
      displayName: userData.displayName,
      emailVerified: user.emailVerified,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      accessRights: {
        canAccessHomeScreen: true,
        canAccessDashboard: true,
        canReportIncidents: true,
        canViewAlerts: true,
        canViewReports: true,
        canCreateReports: true,
        canViewMaps: true,
        canSendMessage: true,
        canViewEmergencyContacts: true,
        canAccessSettings: true,
        canManageUsers: userData.role === 'super_admin',
        canViewSecurity: userData.role === 'super_admin' || userData.role === 'security_admin',
        canViewMedical: userData.role === 'super_admin' || userData.role === 'medical_admin',
        canViewAdminPanel: userData.role === 'super_admin',
      },
      permissions: {
        isAdmin: userData.role === 'super_admin',
        isSecurity: userData.role === 'security_admin',
        isMedical: userData.role === 'medical_admin',
        isStudent: false,
      }
    };
    
    // Create the document with the user's UID as the document ID
    await setDoc(userDocRef, profileData);
    
    // Verify the document was created
    const verificationDoc = await getDoc(userDocRef);
    if (!verificationDoc.exists()) {
      throw new Error('Document creation reported success but document not found');
    }
    
    console.log(`   ✅ Firestore profile created successfully!`);
    console.log(`   - Role: ${userData.role}`);
    console.log(`   - Status: ACTIVE`);
    console.log(`   - Access Level: ${userData.accessLevel}`);
    
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to create profile for ${email}:`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('CAMPUS SAFETY - FIRESTORE PROFILE CREATOR');
  console.log('='.repeat(60));
  console.log('\n📋 This script creates Firestore user profiles for all demo users');
  console.log('   that already exist in Firebase Auth.\n');
  
  const results = [];
  
  for (const user of DEMO_USERS) {
    const success = await createUserProfile(
      user.email,
      user.password,
      {
        role: user.role,
        fullName: user.fullName,
        displayName: user.displayName,
        accessLevel: user.accessLevel
      }
    );
    results.push({ ...user, success });
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const created = results.filter(r => r.success).length;
  const failed = results.length - created;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.fullName.padEnd(16)} | ${result.email}`);
  });
  
  console.log('\nTotal:  ', results.length);
  console.log('Created:', created);
  console.log('Failed: ', failed);
  
  if (created === results.length) {
    console.log('\n✨ All Firestore profiles created successfully!');
    console.log('\n💡 Users now exist in both Firebase Auth AND Firestore');
  } else {
    console.log('\n⚠️ Some profiles failed to create. Check errors above.');
  }
  
  console.log('='.repeat(60));
}

main().catch(console.error);
