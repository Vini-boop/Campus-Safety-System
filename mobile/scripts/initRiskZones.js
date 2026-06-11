// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: "safety-management-system-4faf0.firebaseapp.com",
  projectId: "safety-management-system-4faf0",
  storageBucket: "safety-management-system-4faf0.firebasestorage.app",
  messagingSenderId: "796748500304",
  appId: "1:796748500304:web:f7968bf4b6b8d447edb055",
  measurementId: "G-XY2MMK95ZP"
};

// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const riskZones = [
  {
    name: "Library Back Gate",
    latitude: -1.2921,
    longitude: 36.8219,
    radius: 150, // meters
    riskLevel: "High",
    description: "Recent robbery reported - Avoid walking alone after dark",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  },
  {
    name: "Student Parking Lot",
    latitude: -1.2900,
    longitude: 36.8200,
    radius: 200,
    riskLevel: "Medium",
    description: "Increased security patrols recommended",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  },
  {
    name: "Campus Perimeter - North Gate",
    latitude: -1.2880,
    longitude: 36.8250,
    radius: 300,
    riskLevel: "High",
    description: "Flood-prone area during heavy rains",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  },
  {
    name: "Science Building",
    latitude: -1.2910,
    longitude: 36.8230,
    radius: 100,
    riskLevel: "Low",
    description: "Well-lit area with security cameras",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  },
  {
    name: "Dormitory Area",
    latitude: -1.2930,
    longitude: 36.8180,
    radius: 250,
    riskLevel: "Medium",
    description: "Curfew enforced after 10 PM",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }
];

async function initializeRiskZones() {
  try {
    console.log('Initializing risk zones...');

    for (const zone of riskZones) {
      const docRef = await addDoc(collection(db, 'risk_zones'), zone);
      console.log('Added risk zone:', zone.name, 'with ID:', docRef.id);
    }

    console.log('✅ Risk zones initialization complete!');
    console.log('Added', riskZones.length, 'risk zones to Firestore');
  } catch (error) {
    console.error('Error initializing risk zones:', error);
  }
}

// Run the initialization
initializeRiskZones();