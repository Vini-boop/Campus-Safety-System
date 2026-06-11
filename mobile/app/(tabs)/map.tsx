/**
 * map.tsx — Campus Safety Map (Native Android/iOS)
 *
 * react-native-maps@1.27.2 + React Native 0.83.6 (new arch disabled)
 * Requires a custom dev build: npx expo run:android
 * API key is set in AndroidManifest.xml via withGoogleMapsKey.js
 *
 * Fix notes:
 *  1. Static import (no try/catch require) — PROVIDER_GOOGLE is always resolved
 *  2. providerReady gate — MapView only mounts after first paint (rAF)
 *  3. StyleSheet.absoluteFill wrapper + absoluteFillObject on MapView
 *  4. customMapStyle={[]} forces Google tile pipeline init
 *  5. onMapLoadError surfaces API key / provider failures
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, StyleSheet, Alert, Text,
  TouchableOpacity, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Fix 1 — static import, no dynamic require
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import MapService, {
  SecurityZone, AmbulanceLocation, SecurityAlert, CAMPUS_LOCATIONS,
} from '@/services/mapService';
import { RISK_ZONES } from '@/services/geofencing';
import { getAccurateLocation } from '@/utils/getAccurateLocation';
import { resolveLocationSync, resolveLocation } from '@/services/placeIntelligenceService';

const CAMPUS_REGION = {
  latitude: 0.035611,
  longitude: 36.284968,
  latitudeDelta: 0.014,
  longitudeDelta: 0.014,
};

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── Detail sheet ─────────────────────────────────────────────────────────────
type SheetData = {
  title: string; sub?: string; badge?: string;
  color?: string; desc?: string;
};

function DetailSheet({ data, onClose }: { data: SheetData | null; onClose: () => void }) {
  if (!data) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={s.sheet}>
        {data.color && <View style={[s.sheetBar, { backgroundColor: data.color }]} />}
        <View style={s.sheetBody}>
          <Text style={s.sheetTitle}>{data.title}</Text>
          {data.badge && data.color && (
            <View style={[s.badge, { backgroundColor: data.color }]}>
              <Text style={s.badgeText}>{data.badge}</Text>
            </View>
          )}
          {data.sub ? <Text style={s.sheetSub}>{data.sub}</Text> : null}
          {data.desc ? <Text style={s.sheetDesc}>{data.desc}</Text> : null}
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Map load error screen ────────────────────────────────────────────────────
function MapLoadError() {
  return (
    <View style={s.unavailable}>
      <Ionicons name="map-outline" size={56} color="#C7D2FE" />
      <Text style={s.unavailTitle}>Map Failed to Load</Text>
      <Text style={s.unavailSub}>
        Google Maps could not initialise.{'\n'}
        Check your API key and network connection.
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);

  const [zones, setZones] = useState<SecurityZone[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceLocation[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [userCoord, setUserCoord] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locatedName, setLocatedName] = useState<string | null>(null);

  // Fix 2 — defer MapView mount by one frame so PROVIDER_GOOGLE is fully resolved
  const [providerReady, setProviderReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setProviderReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Force-hide loading overlay after 6s; if map still hasn't fired onMapReady
  // by then it's likely an API key / provider failure — show error screen.
  useEffect(() => {
    const t = setTimeout(() => {
      setMapReady((prev) => {
        if (!prev) setMapError(true); // tiles never loaded
        return true;
      });
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const u1 = MapService.subscribeToSecurityZones(setZones, (e) => console.warn('Zones:', e));
    const u2 = MapService.subscribeToAmbulances(setAmbulances, (e) => console.warn('Ambs:', e));
    const u3 = MapService.subscribeToSecurityAlerts(setAlerts, (e) => console.warn('Alerts:', e));
    return () => { u1(); u2(); u3(); };
  }, []);

  const goToCampus = useCallback(() => {
    mapRef.current?.animateToRegion(CAMPUS_REGION, 600);
  }, []);

  const locateMe = useCallback(async () => {
    setLocating(true);
    setLocatedName(null);
    try {
      const loc = await getAccurateLocation({ targetAccuracyM: 25, timeoutMs: 18_000 });
      if (loc.latitude === 0 && loc.longitude === 0) {
        Alert.alert('Location Error', 'Could not get an accurate fix. Please try again.');
        return;
      }
      const { latitude, longitude, accuracy, sampleCount } = loc;
      setUserCoord({ latitude, longitude });
      const name = resolveLocationSync(latitude, longitude)
        ?? await resolveLocation(latitude, longitude);
      setLocatedName(name);
      console.log(`📍 Map: ±${Math.round(accuracy)}m, ${sampleCount} samples → ${name}`);
      mapRef.current?.animateToRegion(
        { latitude, longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 700,
      );
    } catch (err: any) {
      if (err?.message?.includes('permission')) {
        Alert.alert('Permission Denied', 'Location access is needed to show your position.');
      } else {
        Alert.alert('Error', 'Could not get your location. Please try again.');
      }
    } finally {
      setLocating(false);
    }
  }, []);

  if (mapError) return <MapLoadError />;

  // Diagnostic — should print "google" in Metro logs. If null/undefined → import failed.
  console.log('🗺️ PROVIDER_GOOGLE:', PROVIDER_GOOGLE);

  const chipBarH = zones.length > 0 ? 82 + insets.bottom : 0;

  return (
    // Fix 3 — root has explicit dimensions; map fills via absoluteFill
    <View style={s.root}>
      {(!mapReady || !providerReady) && (
        <View style={s.loadOverlay}>
          <ActivityIndicator size="large" color="#0C156D" />
          <Text style={s.loadText}>Loading map…</Text>
        </View>
      )}

      {/* Fix 3 — explicit absoluteFill wrapper so the map has a measured parent */}
      {providerReady && (
        <View style={StyleSheet.absoluteFill}>
          {/* Fix 3, 4, 5 — absoluteFillObject style, customMapStyle, onMapLoadError */}
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_GOOGLE}
            initialRegion={CAMPUS_REGION}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass
            mapType="standard"
            liteMode={false}
            onMapReady={() => setMapReady(true)}
            onMapLoaded={() => setMapReady(true)}
          >
            {/* ── Static campus locations ── */}
            {CAMPUS_LOCATIONS.map((loc) => {
              const emoji: Record<string, string> = {
                university: '🏛️', hostel: '🏠', junction: '🔀',
                institute: '🏫', security_zone: '🛡️',
              };
              return (
                <Marker
                  key={`campus-${loc.id}`}
                  coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                  title={loc.name}
                  description={cap(loc.type.replace('_', ' '))}
                  tracksViewChanges={false}
                  onPress={() => setSheet({
                    title: (emoji[loc.type] ?? '📍') + ' ' + loc.name,
                    sub: cap(loc.type.replace('_', ' ')),
                    color: '#0C156D',
                    badge: loc.type.replace('_', ' ').toUpperCase(),
                  })}
                >
                  <View style={s.campusPin}>
                    <Text style={s.campusPinEmoji}>{emoji[loc.type] ?? '📍'}</Text>
                  </View>
                </Marker>
              );
            })}

            {/* ── Geofencing risk zones ── */}
            {RISK_ZONES.map((rz) => {
              const color = rz.riskLevel === 'High' ? '#FF0000'
                : rz.riskLevel === 'Medium' ? '#FFA500' : '#FFD700';
              return (
                <React.Fragment key={`risk-${rz.id}`}>
                  <Circle
                    center={{ latitude: rz.latitude, longitude: rz.longitude }}
                    radius={rz.radius}
                    strokeColor={color}
                    strokeWidth={2}
                    fillColor={color + '20'}
                  />
                  {rz.warnRadius ? (
                    <Circle
                      center={{ latitude: rz.latitude, longitude: rz.longitude }}
                      radius={rz.warnRadius}
                      strokeColor={color + '60'}
                      strokeWidth={1}
                      fillColor="transparent"
                    />
                  ) : null}
                  <Marker
                    coordinate={{ latitude: rz.latitude, longitude: rz.longitude }}
                    tracksViewChanges={false}
                    onPress={() => setSheet({
                      title: '⚠️ ' + rz.name,
                      sub: rz.riskLevel + ' Risk Zone',
                      desc: rz.description,
                      badge: rz.riskLevel.toUpperCase(),
                      color,
                    })}
                  >
                    <View style={[s.riskPin, { borderColor: color }]}>
                      <Text style={s.pinEmoji}>⚠️</Text>
                    </View>
                  </Marker>
                </React.Fragment>
              );
            })}

            {/* ── Active security zones (Firestore) ── */}
            {zones.map((zone) => {
              const color = MapService.getSeverityColor(zone.severity);
              return (
                <React.Fragment key={`zone-${zone.id}`}>
                  <Circle
                    center={{ latitude: zone.latitude, longitude: zone.longitude }}
                    radius={zone.radius}
                    strokeColor={color}
                    strokeWidth={2.5}
                    fillColor={color + '28'}
                  />
                  <Marker
                    coordinate={{ latitude: zone.latitude, longitude: zone.longitude }}
                    tracksViewChanges={false}
                    onPress={() => setSheet({
                      title: zone.title,
                      sub: '📍 ' + zone.area,
                      desc: zone.description,
                      badge: zone.severity.toUpperCase(),
                      color,
                    })}
                  >
                    <View style={[s.zonePin, { backgroundColor: color }]}>
                      <Ionicons name="warning-outline" size={14} color="#fff" />
                    </View>
                  </Marker>
                </React.Fragment>
              );
            })}

            {/* ── Live ambulances ── */}
            {ambulances.map((amb) => {
              const color = MapService.getAmbulanceStatusColor(amb.status);
              return (
                <Marker
                  key={`amb-${amb.id}`}
                  coordinate={{ latitude: amb.latitude, longitude: amb.longitude }}
                  tracksViewChanges={false}
                  onPress={() => setSheet({
                    title: '� ' + amb.name,
                    sub: amb.plateNumber ? 'Plate: ' + amb.plateNumber : undefined,
                    badge: amb.status.toUpperCase(),
                    color,
                  })}
                >
                  <View style={[s.ambPin, { backgroundColor: color }]}>
                    <Text style={s.pinEmoji}>🚑</Text>
                  </View>
                </Marker>
              );
            })}

            {/* ── Security alerts ── */}
            {alerts.map((alert) => {
              const color = MapService.getSeverityColor(alert.severity);
              return (
                <Marker
                  key={`alert-${alert.id}`}
                  coordinate={{ latitude: alert.latitude, longitude: alert.longitude }}
                  tracksViewChanges={false}
                  onPress={() => setSheet({
                    title: '🚨 ' + alert.title,
                    desc: alert.description,
                    badge: alert.severity.toUpperCase(),
                    color,
                  })}
                >
                  <View style={[s.alertPin, { backgroundColor: color }]}>
                    <Ionicons name="alert-circle" size={16} color="#fff" />
                  </View>
                </Marker>
              );
            })}

            {/* ── User location ── */}
            {userCoord && (
              <Marker
                coordinate={userCoord}
                title="You are here"
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={s.userDot}>
                  <View style={s.userDotCore} />
                </View>
              </Marker>
            )}
          </MapView>
        </View>
      )}

      {/* Location badge */}
      {locatedName && (
        <View style={[s.locBadge, { top: 12 + insets.top }]}>
          <Ionicons name="location" size={13} color="#0C156D" />
          <Text style={s.locBadgeText} numberOfLines={1}>{locatedName}</Text>
        </View>
      )}

      {/* FABs */}
      <View style={[s.fabs, { bottom: chipBarH + 16 }]}>
        <TouchableOpacity style={s.fab} onPress={goToCampus} activeOpacity={0.8}>
          <Ionicons name="school-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[s.fab, s.fabBlue]} onPress={locateMe}
          disabled={locating} activeOpacity={0.8}>
          {locating
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="locate" size={22} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Zone chips */}
      {zones.length > 0 && (
        <View style={[s.chipBar, { paddingBottom: 8 + insets.bottom }]}>
          <Text style={s.chipBarLabel}>ACTIVE SECURITY ZONES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {zones.map((z) => {
              const color = MapService.getSeverityColor(z.severity);
              return (
                <TouchableOpacity key={z.id}
                  style={[s.chip, { borderColor: color }]}
                  onPress={() => {
                    mapRef.current?.animateToRegion({
                      latitude: z.latitude, longitude: z.longitude,
                      latitudeDelta: 0.006, longitudeDelta: 0.006,
                    }, 500);
                    setSheet({ title: z.title, sub: '📍 ' + z.area, badge: z.severity.toUpperCase(), color, desc: z.description });
                  }}>
                  <View style={[s.chipDot, { backgroundColor: color }]} />
                  <Text style={s.chipText} numberOfLines={1}>{z.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <DetailSheet data={sheet} onClose={() => setSheet(null)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Fix 3 — explicit dimensions on root; map uses absoluteFillObject
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },

  loadOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#f0f4ff',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  loadText: { marginTop: 12, color: '#0C156D', fontSize: 14, fontWeight: '600' },

  // Marker styles
  campusPin: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#0C156D',
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  campusPinEmoji: { fontSize: 16 },
  riskPin: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  zonePin: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
  },
  ambPin: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
  },
  alertPin: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', elevation: 5,
  },
  pinEmoji: { fontSize: 16 },
  userDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(33,150,243,0.22)',
    borderWidth: 2.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', elevation: 6,
  },
  userDotCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2196F3' },

  // FABs
  fabs: { position: 'absolute', right: 16, gap: 10 },
  fab: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 4, elevation: 6,
  },
  fabBlue: { backgroundColor: '#0C156D' },

  // Location badge
  locBadge: {
    position: 'absolute', left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 4, maxWidth: 220,
  },
  locBadgeText: { fontSize: 13, fontWeight: '700', color: '#0C156D', flexShrink: 1 },

  // Zone chips
  chipBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.97)',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  chipBarLabel: {
    fontSize: 10, fontWeight: '700', color: '#9ca3af',
    paddingHorizontal: 16, marginBottom: 6, letterSpacing: 0.8,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, backgroundColor: '#f9fafb',
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, color: '#1f2937', fontWeight: '600', maxWidth: 130 },

  // Detail sheet
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden',
  },
  sheetBar: { height: 5 },
  sheetBody: { padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1f2937', marginBottom: 8 },
  badge: {
    alignSelf: 'flex-start', paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: 12, marginBottom: 8,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sheetSub: { fontSize: 14, color: '#6b7280', marginBottom: 6 },
  sheetDesc: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 16 },
  closeBtn: { backgroundColor: '#0C156D', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Error / unavailable screen
  unavailable: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFF', padding: 32,
  },
  unavailTitle: { fontSize: 20, fontWeight: '800', color: '#0C156D', marginTop: 16, marginBottom: 8 },
  unavailSub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
});
