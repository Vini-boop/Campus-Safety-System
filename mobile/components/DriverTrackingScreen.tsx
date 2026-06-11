/**
 * DriverTrackingScreen.tsx
 *
 * Shown to ambulance DRIVERS once they are dispatched.
 * - Large "Start Tracking" button → begins publishing GPS to Firestore every 4 s
 * - Live speed + heading display
 * - "I've Arrived" button → sets status to 'arrived' and closes the dispatch
 */
import React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, Platform,
    ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useDriverTracking } from '../../services/driverLocationService';

interface Props {
    ambulanceId: string;
    reportId?: string;
    studentName?: string;
    location?: string;
    onClose?: () => void;
}

export default function DriverTrackingScreen({
    ambulanceId,
    reportId,
    studentName = 'Student',
    location = 'Campus',
    onClose,
}: Props) {
    const { startTracking, stopTracking, handleArrived, isTracking, error, currentLocation } =
        useDriverTracking(ambulanceId, reportId);

    return (
        <SafeAreaView style={styles.safe}>
            <LinearGradient colors={['#0C1A3A', '#0D1130']} style={styles.bg}>
                <ScrollView contentContainerStyle={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.vehicleLabel}>🚑 {ambulanceId}</Text>
                        <View style={[styles.statusBadge, isTracking ? styles.badgeLive : styles.badgeIdle]}>
                            {isTracking && <View style={styles.liveDot} />}
                            <Text style={styles.statusText}>{isTracking ? 'LIVE' : 'IDLE'}</Text>
                        </View>
                    </View>

                    {/* Case card */}
                    <View style={styles.caseCard}>
                        <Text style={styles.caseLabel}>ACTIVE DISPATCH</Text>
                        <Text style={styles.caseName}>{studentName}</Text>
                        <Text style={styles.caseLocation}>📍 {location}</Text>
                        {reportId && <Text style={styles.caseId}>Case {reportId.slice(0, 8)}…</Text>}
                    </View>

                    {/* GPS data */}
                    {currentLocation ? (
                        <View style={styles.gpsCard}>
                            <Text style={styles.gpsTitle}>Current GPS</Text>
                            <View style={styles.gpsRow}>
                                <View style={styles.gpsItem}>
                                    <Text style={styles.gpsValue}>{currentLocation.lat.toFixed(5)}</Text>
                                    <Text style={styles.gpsKey}>Latitude</Text>
                                </View>
                                <View style={styles.gpsItem}>
                                    <Text style={styles.gpsValue}>{currentLocation.lng.toFixed(5)}</Text>
                                    <Text style={styles.gpsKey}>Longitude</Text>
                                </View>
                            </View>
                            <Text style={styles.gpsHint}>Publishing every 4 seconds · HIGH accuracy</Text>
                        </View>
                    ) : (
                        <View style={styles.gpsCard}>
                            <Text style={styles.gpsTitle}>GPS</Text>
                            <Text style={styles.gpsHint}>{isTracking ? 'Acquiring signal…' : 'Not started'}</Text>
                        </View>
                    )}

                    {/* Error */}
                    {error && (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    )}

                    {/* Primary action */}
                    {!isTracking ? (
                        <TouchableOpacity style={styles.startBtn} onPress={startTracking} activeOpacity={0.8}>
                            <LinearGradient colors={['#E65100', '#D84315']} style={styles.btnGradient}>
                                <Text style={styles.startBtnText}>▶  Start GPS Tracking</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.arrivedBtn} onPress={handleArrived} activeOpacity={0.8}>
                                <Text style={styles.arrivedBtnText}>✅  I've Arrived at Scene</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.stopBtn} onPress={stopTracking} activeOpacity={0.8}>
                                <Text style={styles.stopBtnText}>■  Pause Tracking</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {onClose && (
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                            <Text style={styles.closeBtnText}>← Back</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#0C1A3A' },
    bg: { flex: 1 },
    container: { padding: 20, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    vehicleLabel: { color: '#fff', fontSize: 18, fontWeight: '800' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
    badgeLive: { backgroundColor: 'rgba(220,38,38,.25)', borderWidth: 1, borderColor: 'rgba(220,38,38,.5)' },
    badgeIdle: { backgroundColor: 'rgba(75,85,99,.3)', borderWidth: 1, borderColor: 'rgba(75,85,99,.5)' },
    statusText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },

    caseCard: { backgroundColor: 'rgba(30,35,71,.8)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,80,0,.2)' },
    caseLabel: { color: '#fb923c', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
    caseName: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
    caseLocation: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
    caseId: { color: '#4b5563', fontSize: 10, marginTop: 6 },

    gpsCard: { backgroundColor: 'rgba(17,24,39,.6)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e2347' },
    gpsTitle: { color: '#94a3b8', fontSize: 11, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
    gpsRow: { flexDirection: 'row', gap: 20 },
    gpsItem: { flex: 1 },
    gpsValue: { color: '#60a5fa', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
    gpsKey: { color: '#6b7280', fontSize: 10, marginTop: 2 },
    gpsHint: { color: '#374151', fontSize: 10, marginTop: 10, textAlign: 'center' },

    errorBox: { backgroundColor: 'rgba(220,38,38,.1)', borderWidth: 1, borderColor: 'rgba(220,38,38,.3)', borderRadius: 12, padding: 12 },
    errorText: { color: '#f87171', fontSize: 13 },

    startBtn: { borderRadius: 16, overflow: 'hidden' },
    btnGradient: { paddingVertical: 16, alignItems: 'center' },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

    arrivedBtn: { backgroundColor: '#15803d', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
    arrivedBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    stopBtn: { backgroundColor: 'rgba(75,85,99,.3)', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
    stopBtnText: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },

    closeBtn: { alignItems: 'center', padding: 12 },
    closeBtnText: { color: '#6b7280', fontSize: 14 },
});
