/**
 * Web stub for app/(tabs)/map.tsx
 *
 * react-native-maps is native-only. This .web.tsx file is automatically
 * used by Expo Metro when bundling for the web platform.
 *
 * Uses Google Maps Embed API with a valid key sourced from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.
 * Laikipia University, Nyahururu, Kenya: -0.3031, 36.3617
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// ─── API Key ──────────────────────────────────────────────────────────────────
// Expo exposes EXPO_PUBLIC_* vars to the JS bundle on all platforms including web.
const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow'; // fallback (hardcoded in app.json too)

// ─── Laikipia University coordinates ─────────────────────────────────────────
// Center calculated from CAMPUS_ZONES in placeIntelligenceService.ts
const CAMPUS_LAT = 0.035611;
const CAMPUS_LNG = 36.284968;
const ZOOM = 15; // Slightly zoomed out to show all zones

// Google Maps Embed v1 – Place query (most reliable for named locations)
const EMBED_URL =
  `https://www.google.com/maps/embed/v1/view` +
  `?key=${GOOGLE_MAPS_API_KEY}` +
  `&center=${CAMPUS_LAT},${CAMPUS_LNG}` +
  `&zoom=${ZOOM}` +
  `&maptype=roadmap`;

// Fallback: open full Google Maps at the campus pin
const OPEN_MAPS_URL = `https://www.google.com/maps?q=${CAMPUS_LAT},${CAMPUS_LNG}&z=${ZOOM}`;

export default function MapScreen() {
  const [iframeError, setIframeError] = React.useState(false);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* ── Map iframe ─────────────────────────────────────────────────────── */}
      <View style={styles.mapWrapper}>
        {!iframeError ? (
          // @ts-ignore – <iframe> is valid HTML on web
          <iframe
            key={EMBED_URL}
            title="Campus Safety Map – Laikipia University"
            src={EMBED_URL}
            style={{ width: '100%', height: '100%', border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            onError={() => setIframeError(true)}
          />
        ) : (
          /* Fallback when iframe fails (e.g. API key restriction) */
          <View style={styles.errorContainer}>
            <Text style={styles.errorEmoji}>🗺️</Text>
            <Text style={styles.errorTitle}>Map unavailable</Text>
            <Text style={styles.errorSubtitle}>
              The embedded map could not load.{'\n'}
              Open Google Maps to view the campus.
            </Text>
          </View>
        )}
      </View>

      {/* ── Info banner ───────────────────────────────────────────────────── */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoEmoji}>📍</Text>
        <Text style={styles.infoText}>
          Laikipia University, Nyahururu, Kenya
          {'\n'}Interactive features are available on the mobile app.
        </Text>
      </View>

      {/* ── Open in Google Maps button ────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.openButton}
        onPress={() => Linking.openURL(OPEN_MAPS_URL)}
        activeOpacity={0.85}
      >
        <Text style={styles.openButtonText}>Open in Google Maps ↗</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e2347',
  },

  // ── Map ───────────────────────────────────────────────────────────────────
  mapWrapper: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },

  // ── Error fallback ────────────────────────────────────────────────────────
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#1e2347',
  },
  errorEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Info banner ───────────────────────────────────────────────────────────
  infoBanner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(12,21,109,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    borderRadius: 12,
    padding: 12,
    zIndex: 10,
  },
  infoEmoji: {
    fontSize: 18,
  },
  infoText: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Open button ───────────────────────────────────────────────────────────
  openButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#0C156D',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.4)',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  openButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
