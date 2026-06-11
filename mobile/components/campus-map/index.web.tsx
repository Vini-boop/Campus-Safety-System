/**
 * Web stub for components/campus-map
 *
 * react-native-maps is native-only. This .web.tsx file is automatically
 * used by Expo Metro when bundling for the web platform.
 */
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Linking } from 'react-native';

const CAMPUS_OSM_EMBED =
  'https://www.openstreetmap.org/export/embed.html?bbox=36.7819%2C-1.3321%2C36.8619%2C-1.2521&layer=mapnik';
const CAMPUS_OSM_FULL = 'https://www.openstreetmap.org/#map=15/-1.2921/36.8219';

export default function CampusMap({ locations }: { locations?: any[] }) {
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

      {/* Location badge */}
      {locations && locations.length > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{locations.length} location{locations.length !== 1 ? 's' : ''} marked</Text>
        </View>
      )}

      {/* Open externally */}
      <TouchableOpacity style={styles.openButton} onPress={() => Linking.openURL(CAMPUS_OSM_FULL)} activeOpacity={0.8}>
        <Text style={styles.openButtonText}>Open in OpenStreetMap ↗</Text>
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
  badge: {
    position: 'absolute',
    bottom: 44,
    right: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#0C156D',
    fontWeight: 'bold',
    fontSize: 12,
  },
  openButton: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: 'rgba(12,21,109,0.85)',
  },
  openButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
