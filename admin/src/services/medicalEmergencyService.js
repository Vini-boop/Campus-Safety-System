/**
 * medicalEmergencyService.js
 * Real-time listener for student ambulance/emergency requests.
 * Reads from: incident_reports (legacy collection)
 * Primary collections (ambulance_requests, medical_reports) are listened to
 * directly in MedicalDashboard.jsx for merged real-time updates.
 */
import { collection, query, onSnapshot, where, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { resolveLocationSync } from './geocodingService';

/**
 * Listen to legacy incident_reports ambulance requests.
 * MedicalDashboard also listens to ambulance_requests + medical_reports directly.
 */
export const listenToMedicalEmergencies = (callback) => {
    // Try with compound query first; fall back to simple query if index missing
    const q = query(
        collection(db, 'incident_reports'),
        where('type', '==', 'medical'),
        orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const emergencies = snapshot.docs
            .map(d => ({ id: d.id, _src: 'incident_reports', ...d.data() }))
            .filter(e => e.medicalSubType === 'ambulance' || e.subType === 'ambulance');
        callback(emergencies);
    }, (error) => {
        console.warn('incident_reports listener error (may be missing index):', error.message);
        callback([]);
    });
};

/**
 * Update emergency status in the correct collection.
 * @param {string} collection - 'ambulance_requests' | 'medical_reports' | 'incident_reports'
 * @param {string} id - document ID
 * @param {string} status - new status
 * @param {object} extra - additional fields to update
 */
export const updateEmergencyStatus = async (collectionName, id, status, extra = {}) => {
    try {
        await updateDoc(doc(db, collectionName, id), {
            status,
            updatedAt: serverTimestamp(),
            ...extra,
        });
    } catch (error) {
        console.error('Error updating emergency status:', error);
        throw error;
    }
};

/**
 * Resolve a location name from coordinates using the campus zone database.
 * Falls back to manual address if provided.
 */
export const getLocationName = (latitude, longitude, manualAddress) => {
    if (manualAddress) return manualAddress;
    if (!latitude || !longitude) return 'Location not provided';
    return resolveLocationSync(latitude, longitude) || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
};
