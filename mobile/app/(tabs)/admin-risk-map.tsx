import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import campusLocationService, {
  CampusLocationDoc,
  RiskLevel,
} from '@/services/campusLocationService';
// Metro picks .native.tsx on iOS/Android and .tsx (null stubs) on web
import { MapView, Marker as MapMarker, Circle as MapCircle, PROVIDER_GOOGLE, type Region } from '@/components/RNMapView';

const isWeb = Platform.OS === 'web';

const RISK_LEVELS: { key: RiskLevel; label: string; color: string }[] = [
  { key: 'Low', label: 'Low', color: '#2E7D32' },
  { key: 'Medium', label: 'Moderate', color: '#FBC02D' },
  { key: 'High', label: 'High', color: '#FB8C00' },
  { key: 'Critical', label: 'Critical', color: '#D32F2F' },
];

const DEFAULT_REGION: Region = {
  latitude: -1.2921,
  longitude: 36.8219,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function AdminRiskMapScreen() {
  const [locations, setLocations] = useState<CampusLocationDoc[]>([]);
  const [filtered, setFiltered] = useState<CampusLocationDoc[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<CampusLocationDoc | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel>('Low');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = campusLocationService.subscribeToCampusLocations(
      (items) => {
        setLocations(items);
        setFiltered(items);
        if (!selectedLocation && items.length > 0) {
          setSelectedLocation(items[0]);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      setFiltered(locations);
    } else {
      setFiltered(
        locations.filter(
          (loc) =>
            loc.name.toLowerCase().includes(term) ||
            loc.category.toLowerCase().includes(term)
        )
      );
    }
  }, [search, locations]);

  const region = useMemo<Region>(() => {
    if (!selectedLocation) return DEFAULT_REGION;
    return {
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [selectedLocation]);

  const handleSave = async () => {
    if (!selectedLocation) return;
    try {
      setSaving(true);
      await campusLocationService.upsertRiskZoneForLocation({
        location: selectedLocation,
        riskLevel: selectedRisk,
        description: description || `${selectedRisk} risk at ${selectedLocation.name}`,
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Web fallback: return OSM iframe so react-native-maps is never rendered ──
  if (isWeb) {
    return (
      <View style={styles.mainContainer}>
        <StatusBar style="light" />
        <SafeAreaView edges={['top']} style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Security Risk Zones</Text>
            <Text style={styles.headerSubtitle}>Web view — open the mobile app to edit zones</Text>
          </View>
        </SafeAreaView>
        <View style={[styles.bodyContainer, { padding: 16, gap: 12 }]}>
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1e2347' }}>
            {/* @ts-ignore */}
            <iframe
              title="Campus Risk Map"
              src="https://www.openstreetmap.org/export/embed.html?bbox=36.7819%2C-1.3321%2C36.8619%2C-1.2521&layer=mapnik"
              style={{ width: '100%', height: '100%', border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </View>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => Linking.openURL('https://www.openstreetmap.org/#map=15/-1.2921/36.8219')}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>Open in OpenStreetMap ↗</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C156D" />
        <Text style={styles.loadingText}>Loading campus locations…</Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Security Risk Zones</Text>
          <Text style={styles.headerSubtitle}>Select a place, set risk, save</Text>
        </View>
      </SafeAreaView>

      <View style={styles.bodyContainer}>
        <View style={styles.topPanel}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search campus place (e.g. Ndoro Quarry, Hostel A)…"
              placeholderTextColor="#999"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <FlatList
            horizontal
            data={filtered}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => {
              const active = selectedLocation?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.locationChip, active && styles.locationChipActive]}
                  onPress={() => setSelectedLocation(item)}
                >
                  <Ionicons
                    name="location"
                    size={14}
                    color={active ? '#FFFFFF' : '#0C156D'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.locationChipText, active && styles.locationChipTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />

          <View style={styles.riskRow}>
            {RISK_LEVELS.map((level) => {
              const active = selectedRisk === level.key;
              return (
                <TouchableOpacity
                  key={level.key}
                  style={[
                    styles.riskButton,
                    { borderColor: level.color },
                    active && { backgroundColor: level.color },
                  ]}
                  onPress={() => setSelectedRisk(level.key)}
                >
                  <View style={[styles.riskDot, { backgroundColor: active ? '#FFF' : level.color }]} />
                  <Text style={[styles.riskLabel, active && { color: '#FFF' }]}>
                    {level.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={styles.descriptionInput}
            placeholder="Short description (e.g. Recent incident, avoid after 6PM)…"
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </View>

        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={region}
            region={region}
            customMapStyle={darkMapStyle}
          >
            {selectedLocation && (
              <>
                <MapMarker
                  coordinate={{
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                  }}
                  title={selectedLocation.name}
                  description={selectedLocation.category}
                  pinColor="#FFFFFF"
                />
                <MapCircle
                  center={{
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                  }}
                  radius={selectedLocation.defaultRadius}
                  strokeColor={getRiskColor(selectedRisk)}
                  fillColor={getRiskFill(selectedRisk)}
                />
              </>
            )}
          </MapView>

          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>Risk Legend</Text>
            {RISK_LEVELS.map((level) => (
              <View key={level.key} style={styles.legendRow}>
                <View style={[styles.legendSwatch, { backgroundColor: level.color }]} />
                <Text style={styles.legendText}>{level.label}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || !selectedLocation}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Risk Zone</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const getRiskColor = (level: RiskLevel) => {
  switch (level) {
    case 'Critical':
      return '#D32F2F';
    case 'High':
      return '#FB8C00';
    case 'Medium':
      return '#FBC02D';
    case 'Low':
    default:
      return '#2E7D32';
  }
};

const getRiskFill = (level: RiskLevel) => {
  switch (level) {
    case 'Critical':
      return 'rgba(211,47,47,0.25)';
    case 'High':
      return 'rgba(251,140,0,0.22)';
    case 'Medium':
      return 'rgba(251,192,45,0.20)';
    case 'Low':
    default:
      return 'rgba(46,125,50,0.18)';
  }
};

// Simple dark style; can be refined further
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#304a7d' }],
  },
];

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#0C156D',
  },
  headerContainer: {
    backgroundColor: '#0C156D',
    zIndex: 10,
  },
  headerContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 30 : 10,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  bodyContainer: {
    flex: 1,
    backgroundColor: '#050816',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  topPanel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(15,23,42,0.95)',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
  },
  searchInput: {
    flex: 1,
    color: '#E5E7EB',
    fontSize: 14,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    marginRight: 8,
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  locationChipActive: {
    backgroundColor: '#0C156D',
    borderColor: '#3B82F6',
  },
  locationChipText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
  locationChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  riskButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  riskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  riskLabel: {
    fontSize: 12,
    color: '#E5E7EB',
    fontWeight: '500',
  },
  descriptionInput: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    backgroundColor: 'rgba(15,23,42,0.9)',
    color: '#E5E7EB',
    fontSize: 13,
    minHeight: 44,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  legendCard: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#CBD5F5',
  },
  saveButton: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    backgroundColor: '#EF4444',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#4B5563',
  },
});

