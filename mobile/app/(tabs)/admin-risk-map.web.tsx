/**
 * Web-safe stub for the Admin Risk Map screen.
 *
 * react-native-maps is native-only and cannot run in a web browser.
 * Expo Metro automatically resolves `.web.tsx` over `.tsx` on the web
 * platform, so this file is loaded instead of admin-risk-map.tsx when
 * running `expo start --web` or building for web output.
 *
 * The screen embeds an OpenStreetMap iframe so admins can still view the
 * campus map on web; full risk-zone editing requires the mobile app.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const CAMPUS_OSM_URL =
    'https://www.openstreetmap.org/export/embed.html?bbox=36.7819%2C-1.3321%2C36.8619%2C-1.2521&layer=mapnik';

const CAMPUS_OSM_FULL =
    'https://www.openstreetmap.org/#map=15/-1.2921/36.8219';

export default function AdminRiskMapScreen() {
    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <SafeAreaView edges={['top']} style={styles.header}>
                <View style={styles.headerContent}>
                    <Text style={styles.title}>Security Risk Zones</Text>
                    <Text style={styles.subtitle}>Campus overview — web view</Text>
                </View>
            </SafeAreaView>

            <View style={styles.body}>
                {/* Info banner */}
                <View style={styles.infoBanner}>
                    <Ionicons name="information-circle-outline" size={18} color="#60A5FA" style={{ marginRight: 8 }} />
                    <Text style={styles.infoText}>
                        Risk-zone editing is only available on the mobile app. This view shows a live map
                        of the campus for reference.
                    </Text>
                </View>

                {/* OpenStreetMap iframe (web only) */}
                <View style={styles.mapWrapper}>
                    {/* @ts-ignore – iframe is valid HTML on web */}
                    <iframe
                        title="Campus Risk Map"
                        src={CAMPUS_OSM_URL}
                        style={{ width: '100%', height: '100%', border: 0, borderRadius: 16 }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                    />
                </View>

                {/* Open full map */}
                <TouchableOpacity
                    style={styles.openButton}
                    onPress={() => Linking.openURL(CAMPUS_OSM_FULL)}
                    activeOpacity={0.8}
                >
                    <Ionicons name="open-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.openButtonText}>Open in OpenStreetMap</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0C156D',
    },
    header: {
        backgroundColor: '#0C156D',
        zIndex: 10,
    },
    headerContent: {
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 30 : 10,
        paddingBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
    },
    body: {
        flex: 1,
        backgroundColor: '#050816',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        padding: 16,
        gap: 12,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: 'rgba(59,130,246,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.3)',
        borderRadius: 12,
        padding: 12,
    },
    infoText: {
        flex: 1,
        color: '#CBD5E1',
        fontSize: 13,
        lineHeight: 18,
    },
    mapWrapper: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#1e2347',
        minHeight: 300,
    },
    openButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2563EB',
        borderRadius: 999,
        paddingVertical: 13,
        paddingHorizontal: 24,
    },
    openButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
});
