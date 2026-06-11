import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, Linking, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IncidentService, { IncidentReport, IncidentStatus, SecurityCategory, MedicalSubType } from '@/services/incidentService';
import MapView, { Marker as MapMarker, Circle as MapCircle } from 'react-native-maps';

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

export default function SecurityDashboard() {
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
  const [securityStats, setSecurityStats] = useState<Record<SecurityCategory, number>>({
    harassment: 0,
    assault: 0,
    theft: 0,
    suspicious_activity: 0,
    unsafe_environment: 0,
  });
  const [medicalStats, setMedicalStats] = useState<Record<MedicalSubType, number>>({
    ambulance: 0,
    doctor_chat: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Map modal state
  const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
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
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allIncidents, statsData, securityData, medicalData] = await Promise.all([
        IncidentService.getAllIncidents(),
        IncidentService.getIncidentStats(),
        IncidentService.getSecurityStats(),
        IncidentService.getMedicalStats(),
      ]);
      
      setIncidents(allIncidents);
      setStats(statsData);
      setSecurityStats(securityData);
      setMedicalStats(medicalData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
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

  const getStatusColor = (status: IncidentStatus) => {
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

  // Parse coordinates from location string
  const parseCoordinates = (locationString: string) => {
    if (!locationString) return null;
    
    // Try to parse "lat, lng" format
    const parts = locationString.split(',');
    if (parts.length === 2) {
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());
      
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return null;
  };

  // Get location name from coordinates (reverse geocoding mock)
  const getLocationName = (coordinates: { lat: number; lng: number }) => {
    // Laikipia University campus area boundaries
    const campusBounds = {
      north: -0.0258,
      south: -0.0458,
      east: 36.0783,
      west: 36.0583,
    };

    const { lat, lng } = coordinates;

    // Check if within campus bounds
    if (
      lat >= campusBounds.south &&
      lat <= campusBounds.north &&
      lng >= campusBounds.west &&
      lng <= campusBounds.east
    ) {
      // Simple distance-based naming
      const centerLat = -0.0358;
      const centerLng = 36.0683;
      
      const distLat = Math.abs(lat - centerLat);
      const distLng = Math.abs(lng - centerLng);
      
      if (distLat < 0.005 && distLng < 0.005) {
        return 'Main Campus - Administration Block';
      } else if (lat > centerLat) {
        return 'North Campus - Hostels Area';
      } else if (lat < centerLat) {
        return 'South Campus - Sports Complex';
      } else if (lng > centerLng) {
        return 'East Campus - Library & Labs';
      } else {
        return 'West Campus - Lecture Halls';
      }
    }
    
    return 'Off-Campus Location (Nyahururu Area)';
  };

  // Handle viewing location on map
  const handleViewOnMap = (incident: IncidentReport) => {
    const coords = parseCoordinates(incident.location);
    
    if (!coords) {
      Alert.alert('Location Unavailable', 'This incident does not have valid coordinates.');
      return;
    }

    // Update map region to show this location
    setMapRegion({
      latitude: coords.lat,
      longitude: coords.lng,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });

    setSelectedIncident(incident);
    setMapModalVisible(true);
    
    console.log('📍 Viewing incident on map:', {
      name: getLocationName(coords),
      coordinates: coords,
    });
  };

  // Open in external maps app
  const handleOpenInMaps = (incident: IncidentReport) => {
    const coords = parseCoordinates(incident.location);
    
    if (!coords) {
      Alert.alert('Location Unavailable', 'Cannot open - no valid coordinates.');
      return;
    }

    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${coords.lat},${coords.lng}&q=${encodeURIComponent(incident.reporterName || 'Emergency Location')}`,
      android: `geo:${coords.lat},${coords.lng}?q=${encodeURIComponent(incident.reporterName || 'Emergency Location')}`,
      web: `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open maps application.');
      });
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
    // Extract coordinates from incident.location object
    const coords = incident.location.latitude && incident.location.longitude 
      ? { lat: incident.location.latitude, lng: incident.location.longitude }
      : null;
    const locationName = incident.location.address || 'Location unavailable';
    
    return (
    <View key={incident.id} style={styles.incidentItem}>
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
      
      {/* Location with coordinates */}
      <View style={styles.locationSection}>
        <View style={styles.locationInfo}>
          <Ionicons name="location" size={16} color="#FF3B30" />
          <View style={styles.locationDetails}>
            <Text style={styles.locationName}>{locationName}</Text>
            {coords && (
              <Text style={styles.coordinates}>
                📍 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </Text>
            )}
          </View>
        </View>
        
        {/* Map action buttons */}
        <View style={styles.mapActions}>
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => handleViewOnMap(incident)}
          >
            <Ionicons name="map" size={18} color="#007AFF" />
            <Text style={styles.mapButtonText}>View on Map</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.mapButton, styles.navigateButton]}
            onPress={() => handleOpenInMaps(incident)}
          >
            <Ionicons name="navigate" size={18} color="#34C759" />
            <Text style={[styles.mapButtonText, styles.navigateButtonText]}>Navigate</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.incidentDetails}>
        <Text style={styles.incidentTime}>
          <Ionicons name="time" size={14} color="#8E8E93" />
          {formatTime(incident.createdAt)}
        </Text>
      </View>
      
      <View style={styles.incidentFooter}>
        <Text style={styles.incidentReporter}>
          Reporter: {incident.reporter.name} ({incident.reporter.email})
        </Text>
        <View style={styles.priorityBadge}>
          <Text style={[styles.priorityText, { color: getPriorityColor(incident.priority) }]}>
            {incident.priority.toUpperCase()}
          </Text>
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
    <ScrollView 
      style={styles.container}
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

      {/* Incident Types */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Incident Types</Text>
        <View style={styles.typeStats}>
          {renderStatCard('Security', stats.security, '#007AFF', 'shield-checkmark')}
          {renderStatCard('Medical', stats.medical, '#FF3B30', 'medical')}
        </View>
      </View>

      {/* Security Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security Categories</Text>
        <View style={styles.categoryContainer}>
          {Object.entries(securityStats).map(([category, count]) => (
            <View key={category} style={styles.categoryItem}>
              <Text style={styles.categoryName}>{category.replace('_', ' ').toUpperCase()}</Text>
              <Text style={styles.categoryCount}>{count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recent Incidents */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Incidents</Text>
        {incidents.slice(0, 10).map(renderIncidentItem)}
      </View>
    </ScrollView>
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
  priorityStats: {
    flexDirection: 'row',
    gap: 15,
  },
  typeStats: {
    flexDirection: 'row',
    gap: 15,
  },
  categoryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  categoryCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0C156D',
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
  },
  incidentReporter: {
    fontSize: 12,
    color: '#8E8E93',
  },
  priorityBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  // Location section styles
  locationSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  locationDetails: {
    flex: 1,
  },
  locationName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  coordinates: {
    fontSize: 11,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  mapActions: {
    flexDirection: 'row',
    gap: 8,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  navigateButton: {
    borderColor: '#34C759',
  },
  mapButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  navigateButtonText: {
    color: '#34C759',
  },
});
