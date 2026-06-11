import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IncidentService, { IncidentReport } from '@/services/incidentService';
import LocationUtilService from '@/services/locationUtilService';
import MapView, { Marker, Circle } from 'react-native-maps';

interface DashboardStats {
  total: number;
  pending: number;
  investigating: number;
  resolved: number;
  security: number;
  medical: number;
  highPriority: number;
  criticalPriority: number;
}

export default function SecurityDashboardWithMap() {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    pending: 0,
    investigating: 0,
    resolved: 0,
    security: 0,
    medical: 0,
    highPriority: 0,
    criticalPriority: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Map and location state
  const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);
  const [incidentLocations, setIncidentLocations] = useState<Map<string, any>>(new Map());
  const [mapVisible, setMapVisible] = useState(false);
  const [region, setRegion] = useState({
    latitude: -1.2921,
    longitude: 36.8219,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Load initial data
  useEffect(() => {
    loadData();
    
    // Set up real-time listener
    const unsubscribe = IncidentService.onIncidentsUpdate((updatedIncidents) => {
      setIncidents(updatedIncidents);
      updateStats(updatedIncidents);
      geocodeIncidentLocations(updatedIncidents);
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allIncidents, statsData] = await Promise.all([
        IncidentService.getAllIncidents(),
        IncidentService.getIncidentStats(),
      ]);
      
      setIncidents(allIncidents);
      setStats(statsData);
      await geocodeIncidentLocations(allIncidents);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const geocodeIncidentLocations = async (incidentList: IncidentReport[]) => {
    const locationsMap = new Map<string, any>();
    
    for (const incident of incidentList) {
      try {
        const locationData = await LocationUtilService.extractLocationFromIncident(incident);
        
        if (locationData.coordinates) {
          locationsMap.set(incident.id, {
            coordinates: locationData.coordinates,
            locationName: locationData.locationName,
            fullAddress: locationData.fullAddress,
          });
        }
      } catch (error) {
        console.error(`Error geocoding incident ${incident.id}:`, error);
        locationsMap.set(incident.id, {
          coordinates: null,
          locationName: 'Unknown Location',
        });
      }
    }
    
    setIncidentLocations(locationsMap);
  };

  const updateStats = (incidentData: IncidentReport[]) => {
    const newStats: DashboardStats = {
      total: incidentData.length,
      pending: incidentData.filter(i => i.status === 'pending').length,
      investigating: incidentData.filter(i => i.status === 'investigating').length,
      resolved: incidentData.filter(i => i.status === 'resolved').length,
      security: incidentData.filter(i => i.type === 'security').length,
      medical: incidentData.filter(i => i.type === 'medical').length,
      highPriority: incidentData.filter(i => i.priority === 'high').length,
      criticalPriority: incidentData.filter(i => i.priority === 'critical').length,
    };
    setStats(newStats);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9500';
      case 'investigating': return '#007AFF';
      case 'resolved': return '#34C759';
      case 'false_report': return '#8E8E93';
      default: return '#8E8E93';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return '#FF3B30';
      case 'high': return '#FF9500';
      case 'medium': return '#007AFF';
      case 'low': return '#34C759';
      default: return '#8E8E93';
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const handleIncidentPress = (incident: IncidentReport) => {
    const locationData = incidentLocations.get(incident.id);
    
    if (locationData?.coordinates) {
      setSelectedIncident(incident);
      setMapVisible(true);
      
      // Center map on the incident location
      setRegion({
        latitude: locationData.coordinates.latitude,
        longitude: locationData.coordinates.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } else {
      Alert.alert(
        'Location Not Available',
        `No coordinates available for this incident.\n\nLocation: ${incident.location?.address || 'Unknown'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const renderStatCard = (title: string, value: number, color: string, icon: string) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={24} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  const renderIncidentItem = (incident: IncidentReport) => {
    const locationData = incidentLocations.get(incident.id);
    
    return (
      <TouchableOpacity 
        key={incident.id} 
        style={styles.incidentItem}
        onPress={() => handleIncidentPress(incident)}
        activeOpacity={0.7}
      >
        <View style={styles.incidentHeader}>
          <View style={styles.incidentType}>
            <Ionicons 
              name={incident.type === 'security' ? 'shield-checkmark' : 'medical'} 
              size={16} 
              color={incident.type === 'security' ? '#007AFF' : '#FF3B30'} 
            />
            <Text style={styles.incidentTypeText}>
              {incident.type === 'security' ? incident.category?.toUpperCase() : incident.medicalSubType?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.incidentStatus}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(incident.status) }]} />
            <Text style={styles.statusText}>{incident.status}</Text>
          </View>
        </View>
        
        <Text style={styles.incidentDescription}>{incident.description}</Text>
        
        <View style={styles.incidentDetails}>
          <Text style={styles.incidentLocation}>
            <Ionicons name="location" size={14} color="#8E8E93" />
            {locationData?.locationName || incident.location?.address || 'Unknown Location'}
          </Text>
          <Text style={styles.incidentTime}>
            <Ionicons name="time" size={14} color="#8E8E93" />
            {formatTime(incident.createdAt)}
          </Text>
        </View>
        
        <View style={styles.incidentFooter}>
          <Text style={styles.incidentReporter}>
            Reporter: {incident.reporter.name}
          </Text>
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(incident.priority) + '20' }]}>
            <Text style={[styles.priorityText, { color: getPriorityColor(incident.priority) }]}>
              {incident.priority.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Map indicator */}
        {locationData?.coordinates && (
          <View style={styles.mapIndicator}>
            <Ionicons name="map" size={14} color="#007AFF" />
            <Text style={styles.mapIndicatorText}>Tap to view on map</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderMapView = () => {
    if (!selectedIncident) return null;
    
    const locationData = incidentLocations.get(selectedIncident.id);
    
    return (
      <View style={styles.mapContainer}>
        <View style={styles.mapHeader}>
          <Text style={styles.mapTitle}>Incident Location</Text>
          <TouchableOpacity onPress={() => { setMapVisible(false); setSelectedIncident(null); }}>
            <Ionicons name="close-circle" size={28} color="#8E8E93" />
          </TouchableOpacity>
        </View>
        
        {Platform.OS === 'web' ? (
          <View style={styles.webMapPlaceholder}>
            <Ionicons name="map-outline" size={64} color="#007AFF" />
            <Text style={styles.webMapText}>
              Map view is optimized for mobile devices
            </Text>
            <Text style={styles.locationDetails}>
              📍 {locationData?.locationName || 'Unknown Location'}
            </Text>
            {locationData?.fullAddress && (
              <Text style={styles.addressDetails}>
                {locationData.fullAddress.formattedAddress}
              </Text>
            )}
            <Text style={styles.coordinatesText}>
              Coordinates: {locationData?.coordinates?.latitude.toFixed(4)}, {locationData?.coordinates?.longitude.toFixed(4)}
            </Text>
          </View>
        ) : (
          <MapView
            style={styles.map}
            region={region}
            showsUserLocation
            showsMyLocationButton
          >
            {/* Selected incident marker */}
            {locationData?.coordinates && (
              <>
                <Marker
                  coordinate={{
                    latitude: locationData.coordinates.latitude,
                    longitude: locationData.coordinates.longitude,
                  }}
                  title={selectedIncident.reporter.name}
                  description={locationData.locationName}
                >
                  <View style={[
                    styles.markerContainer,
                    { backgroundColor: getPriorityColor(selectedIncident.priority) }
                  ]}>
                    <Ionicons 
                      name={selectedIncident.type === 'security' ? 'shield' : 'medical'} 
                      size={20} 
                      color="#FFFFFF" 
                    />
                  </View>
                </Marker>
                
                {/* Accuracy circle */}
                <Circle
                  center={{
                    latitude: locationData.coordinates.latitude,
                    longitude: locationData.coordinates.longitude,
                  }}
                  radius={50} // 50 meters
                  fillColor="rgba(255, 59, 48, 0.2)"
                  strokeColor="rgba(255, 59, 48, 0.5)"
                  strokeWidth={2}
                />
              </>
            )}
            
            {/* Other incident markers (smaller) */}
            {incidents
              .filter(i => i.id !== selectedIncident.id)
              .map(incident => {
                const otherLocation = incidentLocations.get(incident.id);
                if (!otherLocation?.coordinates) return null;
                
                return (
                  <Marker
                    key={incident.id}
                    coordinate={{
                      latitude: otherLocation.coordinates.latitude,
                      longitude: otherLocation.coordinates.longitude,
                    }}
                    pinColor={getPriorityColor(incident.priority)}
                    onPress={() => handleIncidentPress(incident)}
                  />
                );
              })}
          </MapView>
        )}
        
        {/* Location details panel */}
        <View style={styles.locationPanel}>
          <View style={styles.locationInfo}>
            <Ionicons name="location" size={24} color="#007AFF" />
            <View style={styles.locationTextContainer}>
              <Text style={styles.locationName}>
                {locationData?.locationName || 'Unknown Location'}
              </Text>
              {locationData?.fullAddress && (
                <Text style={styles.locationAddress}>
                  {locationData.fullAddress.formattedAddress}
                </Text>
              )}
              {locationData?.coordinates && (
                <Text style={styles.coordinates}>
                  {locationData.coordinates.latitude.toFixed(6)}, {locationData.coordinates.longitude.toFixed(6)}
                </Text>
              )}
            </View>
          </View>
          
          {/* Quick actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionButton}>
              <Ionicons name="navigate" size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Navigate</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#007AFF' }]}>
              <Ionicons name="call" size={20} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>Call Reporter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Main Dashboard */}
      <ScrollView 
        style={[styles.container, { display: mapVisible ? 'none' : 'flex' }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Security Dashboard</Text>
          <Text style={styles.headerSubtitle}>Laikipia University Campus</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          {renderStatCard('Total Incidents', stats.total, '#007AFF', 'documents')}
          {renderStatCard('Pending', stats.pending, '#FF9500', 'time')}
          {renderStatCard('Investigating', stats.investigating, '#007AFF', 'search')}
          {renderStatCard('Resolved', stats.resolved, '#34C759', 'checkmark-circle')}
        </View>

        {/* Priority Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Priority Alerts</Text>
          <View style={styles.priorityStats}>
            {renderStatCard('Critical', stats.criticalPriority, '#FF3B30', 'warning')}
            {renderStatCard('High Priority', stats.highPriority, '#FF9500', 'alert')}
          </View>
        </View>

        {/* Recent Incidents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Incidents</Text>
          <Text style={styles.sectionNote}>Tap an incident to view location on map</Text>
          {incidents.slice(0, 20).map(renderIncidentItem)}
        </View>
      </ScrollView>

      {/* Map View Overlay */}
      {mapVisible && renderMapView()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F6FA',
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    backgroundColor: '#0C156D',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 15,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0C156D',
    marginTop: 8,
  },
  statTitle: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0C156D',
    marginBottom: 12,
  },
  sectionNote: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  priorityStats: {
    flexDirection: 'row',
    gap: 15,
  },
  incidentItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  incidentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  incidentType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  incidentTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0C156D',
  },
  incidentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
  },
  incidentDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  incidentDetails: {
    gap: 4,
    marginBottom: 8,
  },
  incidentLocation: {
    fontSize: 12,
    color: '#8E8E93',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incidentTime: {
    fontSize: 12,
    color: '#8E8E93',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incidentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  incidentReporter: {
    fontSize: 12,
    color: '#8E8E93',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  mapIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  mapIndicatorText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '500',
  },
  mapContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 1000,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0C156D',
  },
  map: {
    flex: 1,
  },
  webMapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F5F6FA',
  },
  webMapText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
    textAlign: 'center',
  },
  locationDetails: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0C156D',
    marginTop: 20,
    textAlign: 'center',
  },
  addressDetails: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
  coordinatesText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 16,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  locationPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    padding: 20,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  locationName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0C156D',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  coordinates: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  markerContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
