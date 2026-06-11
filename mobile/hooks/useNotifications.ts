/**
 * useNotifications.ts
 *
 * React hook that:
 *  - Initialises FCM on first mount after authentication
 *  - Subscribes to foreground notifications
 *  - Handles notification taps (deep-link navigation)
 *  - Subscribes to Firestore health_advisories for real-time in-app alerts
 *
 * Usage:
 *   const { advisories, lastNotification } = useNotifications(userId);
 */
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
    initNotifications,
    addForegroundNotificationListener,
    addNotificationResponseHandler,
} from '../services/notificationService';

export interface Advisory {
    id: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    createdAt: any;
    createdBy: string;
    active: boolean;
}

export function useNotifications(userId: string | null) {
    const router = useRouter();
    const [advisories, setAdvisories] = useState<Advisory[]>([]);
    const [lastNotification, setLast] = useState<Notifications.Notification | null>(null);
    const initialized = useRef(false);

    // ── Initialise FCM once after login ──────────────────────────────────────
    useEffect(() => {
        if (!userId || initialized.current || Platform.OS === 'web') return;
        initialized.current = true;
        initNotifications(userId).then(token => {
            if (token) console.log('[FCM] Token registered:', token.slice(0, 16) + '…');
        });
    }, [userId]);

    // ── Foreground notification listener ─────────────────────────────────────
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const unsub = addForegroundNotificationListener(notification => {
            setLast(notification);
        });
        return unsub;
    }, []);

    // ── Notification tap → deep-link navigation ───────────────────────────────
    useEffect(() => {
        if (Platform.OS === 'web') return;
        const unsub = addNotificationResponseHandler((screen, params) => {
            if (params && Object.keys(params).length) {
                router.push({ pathname: screen as any, params });
            } else {
                router.push(screen as any);
            }
        });
        return unsub;
    }, [router]);

    // ── Subscribe to Firestore health_advisories (real-time in-app) ───────────
    // Even without a push notification, new advisories appear immediately in-app.
    useEffect(() => {
        if (!userId) return;
        const q = query(
            collection(db, 'health_advisories'),
            where('active', '==', true),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setAdvisories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Advisory)));
        }, err => console.error('[FCM] Advisory listener:', err));
        return unsub;
    }, [userId]);

    return { advisories, lastNotification };
}
