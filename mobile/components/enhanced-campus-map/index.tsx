import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, View, Text, Platform, Alert, TouchableOpacity, Linking } from 'react-native';
import MapService, { SecurityZone, CampusLocation } from '../../services/mapService';
// Metro picks .native.tsx on iOS/Android and .tsx (null stubs) on web
import { MapView, Marker as MapMarker, Circle as MapCircle, PROVIDER_GOOGLE, type Region } from '../RNMapView';

const isWeb = Platform.OS === 'web';

interface EnhancedCampusMapProps {
  locations?: CampusLocation[];
  userRole?: 'student' | 'security' | 'admin';
  showSecurityZones?: boolean;
  onZonePress?: (zone: SecurityZone) => void;
  onLocationPress?: (location: CampusLocation) => void;
}

export default function EnhancedCampusMap({
  locations = [],
  userRole = 'student',
  showSecurityZones = true,
  onZonePress,
  onLocationPress,
}: EnhancedCampusMapProps) {
  const [securityZones, setSecurityZones] = useState<SecurityZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<SecurityZone | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to security zones in real-time
  useEffect(() => {
    if (!showSecurityZones) return;

    const unsubscribe = MapService.subscribeToSecurityZones(
      (zones) => {
        setSecurityZones(zones);
        setIsLoading(false);
      },
      (error) => {
        console.error('Security zones subscription error:', error);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [showSecurityZones]);

  // Calculate initial region based on locations
  const initialRegion = useMemo(() => {
    if (locations.length === 0) {
      return {
        latitude: -1.2921,
        longitude: 36.8219,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    const avgLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;

    return {
      latitude: avgLat,
      longitude: avgLng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [locations]);

  // Handle zone press
  const handleZonePress = useCallback((zone: SecurityZone) => {
    setSelectedZone(zone);
    onZonePress?.(zone);

    // Show alert with zone details
    Alert.alert(
      `🚨 ${zone.title}`,
      `Area: ${zone.area}\nSeverity: ${zone.severity.toUpperCase()}\n\n${zone.description}`,
      [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'View Details', onPress: () => onZonePress?.(zone) },
      ]
    );
  }, [onZonePress]);

  // Handle location press
  const handleLocationPress = useCallback((location: CampusLocation) => {
    onLocationPress?.(location);
  }, [onLocationPress]);

  // Get marker color based on type and severity
  const getMarkerColor = useCallback((location: CampusLocation) => {
    if (location.type === 'security_zone') {
      const zone = securityZones.find(z => z.title === location.name);
      return zone ? MapService.getSeverityColor(zone.severity) : '#FF0000';
    }
    return '#0C156D'; // Default blue for campus locations
  }, [securityZones]);

  // Get zone opacity based on user role
  const getZoneOpacity = useCallback((severity: string) => {
    if (userRole === 'security' || userRole === 'admin') {
      return 0.3; // More visible for security personnel
    }
    return 0.2; // Less visible for students
  }, [userRole]);

  // Web fallback: render OSM iframe
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        mapType="hybrid" // Better than satellite for showing roads
        zoomEnabled={true}
        scrollEnabled={true}
        rotateEnabled={true}
        pitchEnabled={true}
        toolbarEnabled={false}
        showsUserLocation={true}
        showsMyLocationButton={true}
        showsPointsOfInterest={true}
        showsBuildings={true}
        showsTraffic={userRole === 'security' || userRole === 'admin'} // Show traffic for security
        loadingEnabled={true}
        loadingBackgroundColor="#FFFFFF"
        loadingIndicatorColor="#0C156D"
        onRegionChangeComplete={setMapRegion}
      >
        {/* Campus Location Markers */}
        {locations.map((location) => (
          <MapMarker
            key={`campus-location-${location.id}-${location.type}`}
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            title={location.name}
            description={`Type: ${location.type}`}
            pinColor={getMarkerColor(location)}
            onPress={() => handleLocationPress(location)}
            tracksViewChanges={false}
          />
        ))}

        {/* Security Zone Circles */}
        {showSecurityZones && securityZones.map((zone) => (
          <React.Fragment key={`security-zone-${zone.id}`}>
            {/* Danger Zone Circle */}
            <MapCircle
              center={{
                latitude: zone.latitude,
                longitude: zone.longitude,
              }}
              radius={zone.radius}
              fillColor={MapService.getSeverityColor(zone.severity) + '33'} // Add transparency
              strokeColor={MapService.getSeverityColor(zone.severity)}
              strokeWidth={2}
            />

            {/* Zone Center Marker */}
            <MapMarker
              coordinate={{
                latitude: zone.latitude,
                longitude: zone.longitude,
              }}
              title={`🚨 ${zone.title}`}
              description={`Severity: ${zone.severity.toUpperCase()}\nArea: ${zone.area}`}
              pinColor={MapService.getSeverityColor(zone.severity)}
              onPress={() => handleZonePress(zone)}
              tracksViewChanges={false}
            />
          </React.Fragment>
        ))}
      </MapView>

      {/* Map Controls Overlay */}
      <View style={styles.controlsContainer}>
        {/* Security Zones Toggle (for students) */}
        {(userRole === 'student') && (
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => {/* Toggle security zones visibility */ }}
          >
            <Text style={styles.toggleText}>
              {showSecurityZones ? 'Hide' : 'Show'} Security Zones
            </Text>
          </TouchableOpacity>
        )}

        {/* Zone Counter */}
        {showSecurityZones && securityZones.length > 0 && (
          <View style={styles.zoneCounter}>
            <Text style={styles.counterText}>
              {securityZones.length} Active Zone{securityZones.length !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading security zones...</Text>
          </View>
        )}
      </View>

      {/* Selected Zone Details */}
      {selectedZone && (
        <View style={styles.zoneDetails}>
          <View style={styles.zoneDetailsHeader}>
            <Text style={styles.zoneDetailsTitle}>{selectedZone.title}</Text>
            <TouchableOpacity onPress={() => setSelectedZone(null)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.zoneDetailsText}>Area: {selectedZone.area}</Text>
          <Text style={styles.zoneDetailsText}>Severity: {selectedZone.severity.toUpperCase()}</Text>
          <Text style={styles.zoneDetailsDescription}>{selectedZone.description}</Text>
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
  controlsContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    gap: 10,
  },
  toggleButton: {
    backgroundColor: '#0C156D',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  zoneCounter: {
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
  loadingContainer: {
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
  loadingText: {
    color: '#666666',
    fontWeight: 'bold',
    fontSize: 12,
  },
  zoneDetails: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  zoneDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  zoneDetailsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C156D',
  },
  closeButton: {
    fontSize: 18,
    color: '#666666',
    fontWeight: 'bold',
  },
  zoneDetailsText: {
    fontSize: 14,
    color: '#333333',
    marginBottom: 5,
  },
  zoneDetailsDescription: {
    fontSize: 14,
    color: '#666666',
    marginTop: 5,
  },
});
