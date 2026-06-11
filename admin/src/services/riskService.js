/**
 * riskService.js
 * Client-side medical outbreak detection and health alert management.
 * Collections: health_alerts, health_advisories
 */

import {
    collection, query, where, orderBy,
    onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Smart Outbreak Detection Engine ─────────────────────────────────────────
// Clusters by: keywords + symptoms + location + time window
const OUTBREAK_KEYWORDS = [
    { keyword: 'typhoid', label: 'Typhoid Fever', threshold: 3, symptoms: ['fever', 'headache', 'stomach_pain', 'fatigue'] },
    { keyword: 'food poison', label: 'Food Poisoning', threshold: 3, symptoms: ['nausea', 'diarrhea', 'stomach_pain'] },
    { keyword: 'cholera', label: 'Cholera', threshold: 2, symptoms: ['diarrhea', 'nausea', 'dizziness'] },
    { keyword: 'malaria', label: 'Malaria', threshold: 4, symptoms: ['fever', 'headache', 'chills', 'body_aches'] },
    { keyword: 'flu', label: 'Influenza / Flu', threshold: 5, symptoms: ['fever', 'cough', 'body_aches', 'sore_throat'] },
    { keyword: 'vomit', label: 'Gastroenteritis', threshold: 4, symptoms: ['nausea', 'diarrhea', 'stomach_pain'] },
    { keyword: 'diarrhea', label: 'Gastroenteritis', threshold: 4, symptoms: ['diarrhea', 'nausea', 'stomach_pain'] },
    { keyword: 'covid', label: 'COVID-19', threshold: 3, symptoms: ['cough', 'fever', 'sore_throat', 'difficulty_breathing'] },
    { keyword: 'pneumonia', label: 'Pneumonia', threshold: 3, symptoms: ['cough', 'fever', 'difficulty_breathing', 'chest_pain'] },
    { keyword: 'meningitis', label: 'Meningitis', threshold: 2, symptoms: ['headache', 'stiff_neck', 'fever'] },
];

const WINDOW_DAYS = 3;

// ─── Detect outbreaks (symptom + location + time clustering) ──────────────────
export const detectOutbreaks = (reports) => {
    const now = Date.now();
    const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return OUTBREAK_KEYWORDS
        .map(({ keyword, label, threshold, symptoms }) => {
            const matches = reports.filter(r => {
                const text = `${r.description || ''} ${r.type || ''} ${(r.symptoms || []).join(' ')}`.toLowerCase();

                // Match by keyword OR by symptom overlap ≥ 2
                const keywordMatch = text.includes(keyword);
                const symptomOverlap = symptoms
                    ? symptoms.filter(s => (r.symptoms || []).includes(s) || text.includes(s)).length
                    : 0;
                if (!keywordMatch && symptomOverlap < 2) return false;

                // Time window filter
                if (!r.createdAt) return true;
                const ts = r.createdAt.seconds
                    ? r.createdAt.seconds * 1000
                    : new Date(r.createdAt).getTime();
                return now - ts <= windowMs;
            });

            if (matches.length >= threshold) {
                // Location clustering
                const locMap = {};
                matches.forEach(r => {
                    const loc = r.hostelName || r.location?.address || r.location || 'Unknown';
                    locMap[loc] = (locMap[loc] || 0) + 1;
                });
                const topLocations = Object.entries(locMap).sort((a, b) => b[1] - a[1]);
                const topLocation = topLocations[0]?.[0] || 'Campus-wide';
                const isLocalized = topLocations[0]?.[1] >= matches.length * 0.5;

                const severity =
                    matches.length >= threshold * 3 ? 'Critical' :
                        matches.length >= threshold * 2 ? 'High' : 'Medium';

                return {
                    keyword, label, count: matches.length, topLocation, severity,
                    isLocalized, locationBreakdown: topLocations.slice(0, 3),
                    affectedSymptoms: symptoms,
                    firstReported: matches.reduce((min, r) => {
                        const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : Date.now();
                        return ts < min ? ts : min;
                    }, Date.now()),
                };
            }
            return null;
        })
        .filter(Boolean)
        .sort((a, b) => {
            const sevOrder = { Critical: 0, High: 1, Medium: 2 };
            return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
        });
};

// ─── Generate auto-advisory text from an outbreak ────────────────────────────
export const generateOutbreakSuggestion = (outbreak) => {
    if (!outbreak) return '';
    const location = outbreak.isLocalized ? `near ${outbreak.topLocation}` : 'across campus';
    const sev = outbreak.severity === 'Critical' ? '🚨 CRITICAL' : '⚠️ WARNING';
    return `${sev}: ${outbreak.label} alert — ${outbreak.count} cases reported ${location} in the past ${WINDOW_DAYS} days. Visit the campus clinic if you experience symptoms. Wash hands frequently.`;
};

// ─── Heatmap data generator (CSS grid-based, no map library) ──────────────────
export const getHeatmapData = (reports) => {
    const zones = {};
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    reports.forEach(r => {
        const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : Date.now();
        if (now - ts > weekMs) return; // only last 7 days
        const zone = r.hostelName || r.location?.address || r.location || 'Unknown';
        if (!zones[zone]) zones[zone] = { count: 0, critical: 0, symptoms: {} };
        zones[zone].count++;
        if (r.priority === 'critical' || r.severity === 'critical') zones[zone].critical++;
        (r.symptoms || []).forEach(s => {
            zones[zone].symptoms[s] = (zones[zone].symptoms[s] || 0) + 1;
        });
    });

    return Object.entries(zones)
        .map(([zone, data]) => ({
            zone,
            ...data,
            topSymptom: Object.entries(data.symptoms).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general',
            intensity: Math.min(data.count / 10, 1), // 0–1 scale
        }))
        .sort((a, b) => b.count - a.count);
};

// ─── Write a new health alert to Firestore ────────────────────────────────────
export const createHealthAlert = async (alertData, adminUid) => {
    return addDoc(collection(db, 'health_alerts'), {
        ...alertData,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: adminUid || 'system',
    });
};

// ─── Listen to active health alerts ──────────────────────────────────────────
export const listenToHealthAlerts = (callback) => {
    const q = query(
        collection(db, 'health_alerts'),
        where('active', '==', true),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
        const alerts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(alerts);
    }, (err) => console.error('health_alerts listener:', err));
};

// ─── Resolve / dismiss an alert ───────────────────────────────────────────────
export const resolveAlert = async (alertId) => {
    await updateDoc(doc(db, 'health_alerts', alertId), {
        active: false,
        resolvedAt: serverTimestamp(),
    });
};

// ─── Group reports by day for chart (last N days) ────────────────────────────
export const groupByDay = (reports, days = 7) => {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const dayStart = new Date(d.setHours(0, 0, 0, 0)).getTime();
        const dayEnd = dayStart + 86400000;

        const count = reports.filter(r => {
            if (!r.createdAt) return false;
            const ts = r.createdAt.seconds ? r.createdAt.seconds * 1000 : new Date(r.createdAt).getTime();
            return ts >= dayStart && ts < dayEnd;
        }).length;

        const critical = reports.filter(r => {
            if (!r.createdAt || r.priority !== 'critical') return false;
            const ts = r.createdAt.seconds ? r.createdAt.seconds * 1000 : new Date(r.createdAt).getTime();
            return ts >= dayStart && ts < dayEnd;
        }).length;

        result.push({ label, count, critical });
    }
    return result;
};

// ─── Broadcast a health advisory (with targeting + expiry) ───────────────────
// Mobile app subscribes to health_advisories where active==true.
export const broadcastAdvisory = async (message, severity, adminUid, options = {}) => {
    console.log('📢 Creating health advisory document:', {
        message: message.substring(0, 50) + '...',
        severity,
        adminUid,
        targetAudience: options.targetAudience || 'all',
        targetLocation: options.targetLocation || null,
    });

    try {
        const docRef = await addDoc(collection(db, 'health_advisories'), {
            message,
            severity,        // 'info' | 'warning' | 'critical'
            createdBy: adminUid || 'system',
            createdAt: serverTimestamp(),
            active: true,
            target: 'students',
            targetAudience: options.targetAudience || 'all',
            targetLocation: options.targetLocation || null,
            expiresAt: options.expiresAt || null,
        });

        console.log('✅ Health advisory created with ID:', docRef.id);
        return docRef;
    } catch (error) {
        console.error('❌ Failed to create health advisory:', error);
        throw error;
    }
};

// ─── Listen to active advisories ─────────────────────────────────────────────
export const listenToAdvisories = (callback) => {
    const q = query(
        collection(db, 'health_advisories'),
        where('active', '==', true),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
        callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('health_advisories listener:', err));
};

// ─── Expire an advisory ───────────────────────────────────────────────────────
export const expireAdvisory = async (advisoryId) => {
    await updateDoc(doc(db, 'health_advisories', advisoryId), {
        active: false,
        expiredAt: serverTimestamp(),
    });
};

// ─── Dispatch ambulance — writes feedback the mobile app listens to ───────────
export const dispatchAmbulance = async (reportId, ambulanceId, estimatedArrival = '10–15 min') => {
    // Update the report status
    const reportRef = doc(db, 'medical_reports', reportId);
    await updateDoc(reportRef, {
        status: 'ambulance_dispatched',
        assignedAmbulanceId: ambulanceId || null,
        estimatedArrival,
        ambulanceDispatchedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    // Also try ambulance_requests collection (new flow)
    try {
        const { getDoc } = await import('firebase/firestore');
        // Try to get the report to find the student's userId
        let userId = null;
        let studentName = null;

        // Check medical_reports first
        try {
            const snap = await getDoc(reportRef);
            if (snap.exists()) {
                const d = snap.data();
                userId = d.userId || d.studentId || null;
                studentName = d.studentName || d.reporterName || 'Student';
            }
        } catch { /* ignore */ }

        // If not found, try ambulance_requests
        if (!userId) {
            const { doc: docFn, getDoc: getDocFn } = await import('firebase/firestore');
            try {
                const snap2 = await getDocFn(docFn(db, 'ambulance_requests', reportId));
                if (snap2.exists()) {
                    const d = snap2.data();
                    userId = d.userId || d.studentId || null;
                    studentName = d.studentName || 'Student';
                    // Also update ambulance_requests status
                    await updateDoc(docFn(db, 'ambulance_requests', reportId), {
                        status: 'ambulance_dispatched',
                        estimatedArrival,
                        ambulanceDispatchedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                }
            } catch { /* ignore */ }
        }

        // Write a notification to the student
        if (userId) {
            const { collection: col, addDoc } = await import('firebase/firestore');
            await addDoc(col(db, 'notifications'), {
                userId,
                title: '🚑 Ambulance Dispatched',
                message: `An ambulance is on the way to you. Estimated arrival: ${estimatedArrival}. Stay calm and remain at your location.`,
                type: 'ambulance_dispatched',
                read: false,
                severity: 'critical',
                createdAt: serverTimestamp(),
            });
        }
    } catch (e) {
        console.warn('[dispatchAmbulance] Could not write student notification:', e);
    }
};

