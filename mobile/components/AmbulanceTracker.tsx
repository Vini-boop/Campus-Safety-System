/**
 * AmbulanceTracker.tsx
 *
 * Shown to the STUDENT when their report has status === 'ambulance_dispatched'.
 * Real-time GPS tracking of the incoming ambulance using Firestore onSnapshot.
 *
 * On web → OpenStreetMap iframe with auto-refreshing marker URL.
 * On native → Google Maps / Apple Maps deep-link + live coords display.
 */
import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, Platform, Linking,
    TouchableOpacity, ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { listenToAmbulanceLocation } from '../services/ambulanceService';

interface AmbulanceData {
    id: string;
    latitude?: number;
    longitude?: number;
    status?: string;
    isTracking?: boolean;
    driverName?: string;
    vehicleId?: string;
    speed?: number;
    heading?: number;
    lastUpdated?: any;
}

interface Props {
    ambulanceId: string;
    estimatedArrival?: string;
    reportLocation?: { latitude: number; longitude: number };
}

export default function AmbulanceTracker({ ambulanceId, estimatedArrival, reportLocation }: Props) {
    const [ambulance, setAmbulance] = useState<AmbulanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [pulse] = useState(new Animated.Value(1));

    // Pulse animation for the LIVE badge
    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, []);

    // Subscribe to Firestore ambulance doc
    useEffect(() => {
        if (!ambulanceId) return;
        const unsub = listenToAmbulanceLocation(ambulanceId, (data: AmbulanceData) => {
            setAmbulance(data);
            setLoading(false);
        });
        return () => unsub();
    }, [ambulanceId]);

    const openInMaps = () => {
        if (!ambulance?.latitude || !ambulance?.longitude) return;
        const { latitude: lat, longitude: lng } = ambulance;
        const url = Platform.OS === 'ios'
            ? `maps://app?saddr=${lat},${lng}&daddr=current+location`
            : `geo:${lat},${lng}?q=${lat},${lng}(Ambulance)`;
        Linking.openURL(url).catch(() => {
            // Fallback to Google Maps web
            Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}`);
        });
    };

    // Build live OSM embed (updates as lat/lng changes)
    const buildOSMUrl = (lat: number, lng: number) => {
        const delta = 0.008;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - delta},${lat - delta},${lng + delta},${lat + delta}&layer=mapnik&marker=${lat},${lng}`;
    };

    if (loading) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator color="#f97316" />
                <Text style={styles.loadingText}>Connecting to ambulance GPS…</Text>
            </View>
        );
    }

    const arrived = ambulance?.status === 'arrived' || ambulance?.status === 'resolved';
    const hasGPS = !!(ambulance?.latitude && ambulance?.longitude);
    const speed = ambulance?.speed ? `${Math.round(ambulance.speed * 3.6)} km/h` : '—';

    return (
        <View style={styles.container}>
            {/* Header */}
            <LinearGradient colors={['#1e1b4b', '#0f0c29']} style={styles.header}>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.headerLabel}>🚑 AMBULANCE RESPONDING</Text>
                        <Text style={styles.vehicleId}>{ambulance?.vehicleId || ambulanceId}</Text>
                        {ambulance?.driverName && <Text style={styles.driverName}>Driver: {ambulance.driverName}</Text>}
                    </View>
                    {!arrived && (
                        <Animated.View style={[styles.liveBadge, { transform: [{ scale: pulse }] }]}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>LIVE</Text>
                        </Animated.View>
                    )}
                    {arrived && (
                        <View style={styles.arrivedBadge}>
                            <Text style={styles.arrivedBadgeText}>✅ ARRIVED</Text>
                        </View>
                    )}
                </View>

                {/* ETA strip */}
                {estimatedArrival && !arrived && (
                    <View style={styles.etaStrip}>
                        <Text style={styles.etaLabel}>⏱ Estimated Arrival</Text>
                        <Text style={styles.etaValue}>{estimatedArrival}</Text>
                    </View>
                )}
            </LinearGradient>

            {/* Map area */}
            {hasGPS && Platform.OS === 'web' ? (
                // Web: embed OSM iframe
                <View style={styles.mapContainer}>
                    <iframe
                        title="Ambulance live location"
                        src={buildOSMUrl(ambulance!.latitude!, ambulance!.longitude!)}
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                    />
                    <View style={styles.mapBadge}>
                        <Text style={styles.mapBadgeText}>🚑 Live Position</Text>
                    </View>
                </View>
            ) : hasGPS ? (
                // Native: show coords card + open-in-maps button
                <View style={styles.nativeMapCard}>
                    <Text style={styles.coordsTitle}>Current Ambulance Position</Text>
                    <View style={styles.coordsRow}>
                        <Text style={styles.coord}>{ambulance!.latitude!.toFixed(5)}</Text>
                        <Text style={styles.coordSep}>,</Text>
                        <Text style={styles.coord}>{ambulance!.longitude!.toFixed(5)}</Text>
                    </View>
                    <Text style={styles.speedText}>Speed: {speed}</Text>
                    <TouchableOpacity style={styles.mapsBtn} onPress={openInMaps}>
                        <Text style={styles.mapsBtnText}>Open in Maps →</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.noGPS}>
                    <Text style={styles.noGPSText}>
                        {ambulance?.isTracking
                            ? '📡 Acquiring GPS signal…'
                            : '📍 GPS not yet started'}
                    </Text>
                    <Text style={styles.noGPSSubText}>
                        The driver will start tracking shortly.
                    </Text>
                </View>
            )}

            {/* Status message for arrived */}
            {arrived && (
                <View style={styles.arrivedCard}>
                    <Text style={styles.arrivedTitle}>🏥 Ambulance Has Arrived!</Text>
                    <Text style={styles.arrivedSub}>Help is on the scene. Please stay calm.</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#0D1130' },
    loading: { padding: 32, alignItems: 'center', gap: 8, backgroundColor: '#0D1130', borderRadius: 16 },
    loadingText: { color: '#6b7280', fontSize: 13 },

    header: { padding: 16 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerLabel: { color: '#f97316', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
    vehicleId: { color: '#fff', fontSize: 16, fontWeight: '800' },
    driverName: { color: '#94a3b8', fontSize: 12, marginTop: 2 },

    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(239,68,68,.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,.4)' },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
    liveText: { color: '#ef4444', fontSize: 10, fontWeight: '800' },

    arrivedBadge: { backgroundColor: 'rgba(21,128,61,.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(21,128,61,.5)' },
    arrivedBadgeText: { color: '#4ade80', fontSize: 10, fontWeight: '800' },

    etaStrip: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    etaLabel: { color: '#94a3b8', fontSize: 12 },
    etaValue: { color: '#fff', fontSize: 14, fontWeight: '800' },

    mapContainer: { height: 200, position: 'relative' },
    mapBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    mapBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

    nativeMapCard: { padding: 16, alignItems: 'center', gap: 8 },
    coordsTitle: { color: '#6b7280', fontSize: 11, letterSpacing: 0.5 },
    coordsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    coord: { color: '#60a5fa', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
    coordSep: { color: '#374151', fontSize: 18 },
    speedText: { color: '#4b5563', fontSize: 12 },
    mapsBtn: { marginTop: 4, backgroundColor: '#1d4ed8', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 },
    mapsBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    noGPS: { padding: 24, alignItems: 'center', gap: 6 },
    noGPSText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
    noGPSSubText: { color: '#4b5563', fontSize: 12, textAlign: 'center' },

    arrivedCard: { margin: 12, backgroundColor: 'rgba(21,128,61,.15)', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(21,128,61,.3)' },
    arrivedTitle: { color: '#4ade80', fontSize: 16, fontWeight: '800' },
    arrivedSub: { color: '#86efac', fontSize: 12, marginTop: 4, textAlign: 'center' },
});
