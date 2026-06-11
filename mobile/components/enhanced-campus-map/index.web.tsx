/**
 * Web stub for components/enhanced-campus-map
 *
 * react-native-maps is native-only. This .web.tsx file is automatically
 * used by Expo Metro when bundling for the web platform, replacing the
 * native EnhancedCampusMap component that uses MapView.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';

const CAMPUS_OSM_EMBED =
    'https://www.openstreetmap.org/export/embed.html?bbox=36.7819%2C-1.3321%2C36.8619%2C-1.2521&layer=mapnik';
const CAMPUS_OSM_FULL = 'https://www.openstreetmap.org/#map=15/-1.2921/36.8219';

interface EnhancedCampusMapProps {
    locations?: any[];
    userRole?: string;
    showSecurityZones?: boolean;
    onZonePress?: (zone: any) => void;
    onLocationPress?: (location: any) => void;
}

export default function EnhancedCampusMap(_props: EnhancedCampusMapProps) {
    return (
        <View style={styles.container}>
            {/* OSM iframe */}
            <View style={styles.mapWrapper}>
                {/* @ts-ignore – iframe is valid on web */}
                <iframe
                    title="Campus Map"
                    src={CAMPUS_OSM_EMBED}
                    style={{ width: '100%', height: '100%', border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                />
            </View>

            {/* Open externally */}
            <TouchableOpacity
                style={styles.openButton}
                onPress={() => Linking.openURL(CAMPUS_OSM_FULL)}
                activeOpacity={0.8}
            >
                <Text style={styles.openButtonText}>🗺️ Open in OpenStreetMap</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
        borderRadius: 12,
        backgroundColor: '#1e2347',
    },
    mapWrapper: {
        flex: 1,
        minHeight: 240,
    },
    openButton: {
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: 'rgba(12,21,109,0.8)',
    },
    openButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
});
