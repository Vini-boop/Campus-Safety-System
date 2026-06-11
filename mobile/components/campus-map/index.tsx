import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
// Metro picks .native.tsx on iOS/Android and .tsx (null stubs) on web
import { MapView, Marker as MapMarker, PROVIDER_GOOGLE } from '../RNMapView';

const isWeb = Platform.OS === 'web';

interface CampusMapProps {
  locations?: {
    id: number;
    name: string;
    lat: number;
    lng: number;
  }[];
}

// Validate individual location objects
const isValidLocation = (location: any): location is { id: number, name: string, lat: number, lng: number } => {
  return location &&
    typeof location.id === 'number' &&
    typeof location.name === 'string' && location.name.trim() !== '' &&
    typeof location.lat === 'number' && !isNaN(location.lat) &&
    typeof location.lng === 'number' && !isNaN(location.lng);
};

// Sanitize and validate locations array
const useValidatedLocations = (locations: any[]) => {
  return useMemo(() => {
    if (!Array.isArray(locations)) {
      console.warn('⚠️ Invalid locations array provided, using defaults');
      return [];
    }

    const validLocations = locations.filter(isValidLocation);

    if (validLocations.length !== locations.length) {
      console.warn(`⚠️ Filtered out ${locations.length - validLocations.length} invalid locations`);
    }

    return validLocations;
  }, [locations]);
};

export default function CampusMap({ locations = [] }: CampusMapProps) {
  const validatedLocations = useValidatedLocations(locations);

  const defaultLocations = [
    { id: 1, name: 'Alexander Hostels', lat: -1.2921, lng: 36.8219 },
    { id: 2, name: 'Chenka junction', lat: -1.2930, lng: 36.8225 },
    { id: 3, name: 'Laikipia University', lat: -1.2915, lng: 36.8205 },
    { id: 4, name: 'TVET Institute', lat: -1.2940, lng: 36.8230 },
  ];

  const allLocations = validatedLocations.length > 0 ? validatedLocations : defaultLocations;

  const centerCoordinate = useMemo(() => {
    if (allLocations.length === 0) return { latitude: -1.2921, longitude: 36.8219 };
    const avgLat = allLocations.reduce((sum, loc) => sum + loc.lat, 0) / allLocations.length;
    const avgLng = allLocations.reduce((sum, loc) => sum + loc.lng, 0) / allLocations.length;
    return { latitude: avgLat, longitude: avgLng };
  }, [allLocations]);

  const handleMapReady = () => console.log('✅ Map is ready and loaded');

  // Web early-return: OSM iframe
  if (isWeb) {
    return (
      <View style={styles.container}>
        {/* @ts-ignore */}
        <iframe
          title="Campus Map"
          src="https://www.openstreetmap.org/export/embed.html?bbox=36.7819%2C-1.3321%2C36.8619%2C-1.2521&layer=mapnik"
          style={{ width: '100%', height: '100%', border: 0 }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        {allLocations.length > 0 && (
          <View style={styles.locationCounter}>
            <Text style={styles.counterText}>{allLocations.length} location{allLocations.length !== 1 ? 's' : ''} marked</Text>
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: centerCoordinate.latitude,
          longitude: centerCoordinate.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        mapType="satellite"
        zoomEnabled={true}
        scrollEnabled={true}
        rotateEnabled={true}
        pitchEnabled={true}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        showsIndoorLevelPicker={false}
        loadingEnabled={true}
        loadingBackgroundColor="#FFFFFF"
        loadingIndicatorColor="#0C156D"
        onMapReady={handleMapReady}
        accessibilityLabel="Campus Map"
      >
        {allLocations.map((location) => (
          <MapMarker
            key={`marker-${location.id}`}
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            title={location.name}
            description={`Location: ${location.name}`}
            tracksViewChanges={false}
            pinColor="#0C156D"
          />
        ))}
      </MapView>

      {/* Location counter overlay */}
      {allLocations.length > 0 && (
        <View style={styles.locationCounter}>
          <Text style={styles.counterText}>
            {allLocations.length} location{allLocations.length !== 1 ? 's' : ''} marked
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
  },
  map: {
    flex: 1,
  },
  locationCounter: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  counterText: {
    color: '#0C156D',
    fontWeight: 'bold',
    fontSize: 12,
  },
});