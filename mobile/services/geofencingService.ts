import * as Location from 'expo-location';
import { sendLocalNotification } from './fcmService';
import { sendRiskAreaAlert } from './notificationService';
import { PREDEFINED_RISK_AREAS, IRiskArea, NotificationSeverity } from '@/types/notification';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RISK_AREA_COOLDOWN_KEY = '@risk_area_cooldown_';
const COOLDOWN_PERIOD_MS = 20 * 60 * 1000; // 20 minutes

// Callback for risk status changes
let onRiskStatusChangeCallback: ((status: { isAtRisk: boolean; riskLevel: string; zoneName?: string; zoneDescription?: string }) => void) | null = null;

/**
 * Set callback for risk status changes
 */
export const setOnRiskStatusChange = (callback: (status: { isAtRisk: boolean; riskLevel: string; zoneName?: string; zoneDescription?: string }) => void) => {
  onRiskStatusChangeCallback = callback;
};

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
export const isPointInPolygon = (
  pointLat: number,
  pointLon: number,
  polygon: Array<{ latitude: number; longitude: number }>
): boolean => {
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude;
    const yi = polygon[i].longitude;
    const xj = polygon[j].latitude;
    const yj = polygon[j].longitude;
    
    const intersect = ((yi > pointLon) !== (yj > pointLon)) &&
      (pointLat < (xj - xi) * (pointLon - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
};

/**
 * Calculate distance between two points using Haversine formula
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Check if user is within radius of a point
 */
export const isWithinRadius = (
  userLat: number,
  userLon: number,
  centerLat: number,
  centerLon: number,
  radiusMeters: number
): boolean => {
  const distance = calculateDistance(userLat, userLon, centerLat, centerLon);
  return distance <= radiusMeters;
};

/**
 * Get cooldown status for a risk area
 */
const getCooldownStatus = async (areaId: string): Promise<boolean> => {
  try {
    const lastAlertTime = await AsyncStorage.getItem(`${RISK_AREA_COOLDOWN_KEY}${areaId}`);
    
    if (!lastAlertTime) return false;
    
    const now = Date.now();
    const timeSinceLastAlert = now - parseInt(lastAlertTime);
    
    return timeSinceLastAlert < COOLDOWN_PERIOD_MS;
  } catch (error) {
    console.error('❌ Error getting cooldown status:', error);
    return false;
  }
};

/**
 * Set cooldown for a risk area
 */
const setCooldown = async (areaId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(RISK_AREA_COOLDOWN_KEY + areaId, Date.now().toString());
  } catch (error) {
    console.error('❌ Error setting cooldown:', error);
  }
};

/**
 * Check current location against all risk areas
 */
export const checkRiskAreas = async (
  userLat: number,
  userLon: number
): Promise<Array<{ area: IRiskArea; notified: boolean }>> => {
  try {
    const riskAreasEntered: Array<{ area: IRiskArea; notified: boolean }> = [];
    let highestRiskStatus = { isAtRisk: false, riskLevel: 'None' as string, zoneName: undefined as string | undefined, zoneDescription: undefined as string | undefined };
    
    for (const areaData of PREDEFINED_RISK_AREAS) {
      const area: IRiskArea = { ...areaData, id: areaData.name.toLowerCase().replace(/\s+/g, '_') };
      
      if (!area.isActive) continue;
      
      // Check if user is inside the polygon or within radius
      const isInPolygon = isPointInPolygon(userLat, userLon, area.polygon);
      const isWithinRadiusValue = isWithinRadius(
        userLat,
        userLon,
        area.center.latitude,
        area.center.longitude,
        area.radius
      );
      
      if (isInPolygon || isWithinRadiusValue) {
        // Track highest risk level
        const riskLevels: Record<string, number> = { 'None': 0, 'Low': 1, 'Medium': 2, 'High': 3 };
        if (riskLevels[area.riskLevel] > riskLevels[highestRiskStatus.riskLevel]) {
          highestRiskStatus = {
            isAtRisk: true,
            riskLevel: area.riskLevel,
            zoneName: area.name,
            zoneDescription: area.description
          };
        }
        
        // Check cooldown
        const isOnCooldown = await getCooldownStatus(area.id);
        
        if (!isOnCooldown) {
          // Send notification
          await sendLocalNotification(
            '⚠️ Campus Safety Alert',
            `You are entering ${area.name}. ${area.description} Please remain alert and stay safe.`,
            {
              type: 'risk',
              areaName: area.name,
              severity: area.riskLevel,
              latitude: userLat,
              longitude: userLon,
            }
          );
          
          // Also save to Firestore
          try {
            await sendRiskAreaAlert(area.name, userLat, userLon);
          } catch (firestoreError) {
            console.error('❌ Error saving risk alert to Firestore:', firestoreError);
          }
          
          // Set cooldown
          await setCooldown(area.id);
          
          riskAreasEntered.push({ area, notified: true });
          console.log(`✅ Risk alert sent for: ${area.name}`);
        } else {
          riskAreasEntered.push({ area, notified: false });
          console.log(`⏭️ Skipped alert for ${area.name} (on cooldown)`);
        }
      }
    }
    
    // Notify callback about risk status change
    if (onRiskStatusChangeCallback) {
      onRiskStatusChangeCallback(highestRiskStatus);
    }
    
    return riskAreasEntered;
  } catch (error) {
    console.error('❌ Error checking risk areas:', error);
    return [];
  }
};

/**
 * Start continuous location monitoring for risk areas
 */
export const startRiskAreaMonitoring = async (): Promise<Location.LocationSubscription | null> => {
  try {
    // Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      console.warn('⚠️ Location permission not granted for risk area monitoring');
      return null;
    }
    
    // Start watching position
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // Check every 5 seconds
        distanceInterval: 10, // Or every 10 meters
      },
      async (location) => {
        const { latitude, longitude } = location.coords;
        console.log('📍 Location update:', latitude, longitude);
        
        // Check risk areas
        await checkRiskAreas(latitude, longitude);
      }
    );
    
    console.log('✅ Started risk area monitoring');
    return subscription;
  } catch (error) {
    console.error('❌ Error starting risk area monitoring:', error);
    return null;
  }
};

/**
 * Stop risk area monitoring
 */
export const stopRiskAreaMonitoring = async (subscription: Location.LocationSubscription | null): Promise<void> => {
  try {
    if (subscription) {
      subscription.remove();
      console.log('✅ Stopped risk area monitoring');
    }
  } catch (error) {
    console.error('❌ Error stopping risk area monitoring:', error);
  }
};

/**
 * Get nearby risk areas (for display in UI)
 */
export const getNearbyRiskAreas = async (
  userLat: number,
  userLon: number,
  maxDistanceMeters: number = 1000
): Promise<Array<IRiskArea & { distance: number }>> => {
  try {
    const nearbyAreas: Array<IRiskArea & { distance: number }> = [];
    
    for (const areaData of PREDEFINED_RISK_AREAS) {
      if (!areaData.isActive) continue;
      
      const area: IRiskArea = { ...areaData, id: areaData.name.toLowerCase().replace(/\s+/g, '_') };
      const distance = calculateDistance(
        userLat,
        userLon,
        area.center.latitude,
        area.center.longitude
      );
      
      if (distance <= maxDistanceMeters) {
        nearbyAreas.push({ ...area, distance });
      }
    }
    
    // Sort by distance
    nearbyAreas.sort((a, b) => a.distance - b.distance);
    
    return nearbyAreas;
  } catch (error) {
    console.error('❌ Error getting nearby risk areas:', error);
    return [];
  }
};

export default {
  isPointInPolygon,
  calculateDistance,
  isWithinRadius,
  checkRiskAreas,
  startRiskAreaMonitoring,
  stopRiskAreaMonitoring,
  getNearbyRiskAreas,
  setOnRiskStatusChange,
};
