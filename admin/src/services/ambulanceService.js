/**
 * ambulanceService.js
 * Firestore helpers for the ambulances collection.
 * Collection: ambulances (separate from users)
 */

import {
    collection, query, onSnapshot, doc,
    updateDoc, serverTimestamp, orderBy, limit
} from 'firebase/firestore';
import { db } from './firebase';


// ─── Real-time listener ───────────────────────────────────────────────────────
export const listenToAmbulances = (callback) => {
    const q = query(collection(db, 'ambulances'), orderBy('vehicleId'));
    return onSnapshot(q, (snapshot) => {
        const ambulances = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(ambulances);
    });
};

// ─── Dispatch ambulance to a case ─────────────────────────────────────────────
export const dispatchAmbulance = async (ambulanceId, reportId) => {
    await updateDoc(doc(db, 'ambulances', ambulanceId), {
        status: 'dispatched',
        assignedCase: reportId,
        lastUpdated: serverTimestamp(),
    });
    await updateDoc(doc(db, 'security_alerts', reportId), {
        status: 'ambulance_dispatched',
        ambulanceAssigned: ambulanceId,
    });
};

// ─── Release ambulance (make available again) ─────────────────────────────────
export const releaseAmbulance = async (ambulanceId) => {
    await updateDoc(doc(db, 'ambulances', ambulanceId), {
        status: 'available',
        assignedCase: null,
        lastUpdated: serverTimestamp(),
    });
};

// ─── Update ambulance location (called from ambulance driver app) ──────────────
export const updateAmbulanceLocation = async (ambulanceId, latitude, longitude) => {
    await updateDoc(doc(db, 'ambulances', ambulanceId), {
        latitude,
        longitude,
        lastUpdated: serverTimestamp(),
    });
};

// ─── Real-time single-ambulance GPS stream ─────────────────────────────────────
// Used by student tracking screen and admin detail view.
export const listenToAmbulanceLocation = (ambulanceId, callback) => {
    return onSnapshot(doc(db, 'ambulances', ambulanceId), (snap) => {
        if (snap.exists()) callback({ id: snap.id, ...snap.data() });
    });
};

// ─── Real-time location history trail (last 50 points) ───────────────────────
// Used to draw a breadcrumb path on the admin map.
export const listenToLocationHistory = (ambulanceId, callback) => {
    const q = query(
        collection(db, 'ambulances', ambulanceId, 'location_history'),
        orderBy('timestamp', 'desc'),
        limit(50)
    );
    return onSnapshot(q, (snap) => {
        const points = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .reverse(); // oldest first for drawing the trail
        callback(points);
    });
};
