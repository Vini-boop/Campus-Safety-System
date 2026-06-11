/**
 * driverLocationService.ts
 *
 * Runs on the DRIVER'S device. Publishes live GPS coordinates to Firestore
 * every 4 seconds while a dispatch is active. When the driver arrives,
 * sets status → 'arrived' so the student's tracking screen gets notified.
 *
 * Usage:
 *   const { startTracking, stopTracking, isTracking, error } = useDriverTracking();
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// How often to push location updates (milliseconds)
const PUBLISH_INTERVAL_MS = 4000;

// ─── Write a single location snapshot to Firestore ────────────────────────────
export async function publishLocation(
    ambulanceId: string,
    latitude: number,
    longitude: number,
    speed: number | null,
    heading: number | null
): Promise<void> {
    const ref = doc(db, 'ambulances', ambulanceId);
    await updateDoc(ref, {
        latitude,
        longitude,
        speed: speed ?? 0,
        heading: heading ?? 0,
        lastUpdated: serverTimestamp(),
        isTracking: true,
    });
    // Also write to history subcollection (admin trail view)
    await addDoc(collection(db, 'ambulances', ambulanceId, 'location_history'), {
        latitude,
        longitude,
        speed: speed ?? 0,
        heading: heading ?? 0,
        timestamp: serverTimestamp(),
    });
}

// ─── Mark ambulance as arrived ────────────────────────────────────────────────
export async function markArrived(ambulanceId: string, reportId?: string): Promise<void> {
    await updateDoc(doc(db, 'ambulances', ambulanceId), {
        status: 'arrived',
        isTracking: false,
        arrivedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
    });
    if (reportId) {
        await updateDoc(doc(db, 'medical_reports', reportId), {
            status: 'resolved',
            resolvedAt: serverTimestamp(),
        });
    }
}

// ─── Stop tracking (no status change) ────────────────────────────────────────
export async function stopLocationTracking(ambulanceId: string): Promise<void> {
    await updateDoc(doc(db, 'ambulances', ambulanceId), {
        isTracking: false,
        lastUpdated: serverTimestamp(),
    });
}

// ─── React hook for the driver screen ─────────────────────────────────────────
export function useDriverTracking(ambulanceId: string, reportId?: string) {
    const [isTracking, setIsTracking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentLocation, setCurrent] = useState<{ lat: number; lng: number } | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const watchRef = useRef<Location.LocationSubscription | null>(null);

    const startTracking = useCallback(async () => {
        setError(null);

        // Request permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            setError('Location permission denied. Please enable location to track your ambulance.');
            return;
        }

        // Also request background (for when app is minimised during a dispatch)
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
            console.warn('[GPS] Background permission not granted — tracking pauses when app is minimised');
        }

        setIsTracking(true);

        // Mark tracking started in Firestore immediately
        try {
            await updateDoc(doc(db, 'ambulances', ambulanceId), {
                isTracking: true,
                lastUpdated: serverTimestamp(),
            });
        } catch (e) { console.warn('[GPS] Could not set isTracking flag:', e); }

        // High-accuracy watch
        watchRef.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: PUBLISH_INTERVAL_MS,
                distanceInterval: 5, // metres
            },
            async (loc) => {
                const { latitude, longitude, speed, heading } = loc.coords;
                setCurrent({ lat: latitude, lng: longitude });
                try {
                    await publishLocation(ambulanceId, latitude, longitude, speed, heading);
                } catch (e) {
                    console.error('[GPS] Publish failed:', e);
                }
            }
        );
    }, [ambulanceId]);

    const stopTracking = useCallback(async () => {
        watchRef.current?.remove();
        watchRef.current = null;
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setIsTracking(false);
        await stopLocationTracking(ambulanceId).catch(console.warn);
    }, [ambulanceId]);

    const handleArrived = useCallback(async () => {
        await stopTracking();
        await markArrived(ambulanceId, reportId);
    }, [ambulanceId, reportId, stopTracking]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            watchRef.current?.remove();
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    return { startTracking, stopTracking, handleArrived, isTracking, error, currentLocation };
}
