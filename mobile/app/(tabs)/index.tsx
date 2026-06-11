import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, RefreshControl, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth, db, doc, getDoc, setDoc } from '@/services/firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import * as Location from 'expo-location';
import { getAccurateLocation } from '@/utils/getAccurateLocation';
import { api } from '@/services/api';
import weatherService, { WeatherData } from '@/services/weatherService';
import { geofencingService, SecurityStatus, RiskZone } from '@/services/geofencing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import NotificationBell from '@/components/NotificationBell';
import { registerForPushNotificationsAsync, sendLocalNotification } from '@/services/fcmService';
import { resolveLocation, resolveLocationSync, lookupCampusZone } from '@/services/placeIntelligenceService';

// Laikipia University coordinates (Nyahururu, Shamane, Kenya)
const LAIKIPIA_UNIVERSITY_COORDS = {
  latitude: -0.0358,
  longitude: 36.3683,
};

// ─── Weather helpers ──────────────────────────────────────────────────────────

/** Background image — time + condition aware */
const getWeatherBackgroundImage = (condition: string) => {
  const h = new Date().getHours();
  const isNight = h < 6 || h >= 19;
  const isMorning = h >= 6 && h <= 10;
  const c = (condition || '').toLowerCase();

  if (isNight) {
    if (c.includes('rain') || c.includes('drizzle') || c.includes('thunder'))
      return { uri: 'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?q=80&w=800&auto=format&fit=crop' }; // Rainy night
    return { uri: 'https://images.unsplash.com/photo-1507400492013-162706c8c05e?q=80&w=800&auto=format&fit=crop' }; // Starry night
  }
  if (c.includes('thunder'))
    return { uri: 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?q=80&w=800&auto=format&fit=crop' }; // Thunderstorm
  if (c.includes('rain') || c.includes('drizzle'))
    return { uri: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=800&auto=format&fit=crop' }; // Rainy
  if (c.includes('cloud') || c.includes('mist') || c.includes('fog') || c.includes('haze'))
    return { uri: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?q=80&w=800&auto=format&fit=crop' }; // Cloudy
  if (isMorning)
    return { uri: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9d869?q=80&w=800&auto=format&fit=crop' }; // Sunrise
  return { uri: 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=800&auto=format&fit=crop' }; // Sunny day
};

/** Gradient — time + condition aware */
const getWeatherGradient = (condition: string): readonly [string, string, ...string[]] => {
  const h = new Date().getHours();
  const isNight = h < 6 || h >= 19;
  const isMorning = h >= 6 && h <= 10;
  const isEvening = h >= 17 && h < 19;
  const c = (condition || '').toLowerCase();

  if (c.includes('thunder')) return ['#1a1a2e', '#16213e', '#0f3460'] as const;
  if (c.includes('rain') || c.includes('drizzle')) return ['#2C3E50', '#4CA1AF'] as const;
  if (c.includes('snow')) return ['#E0EAFC', '#CFDEF3'] as const;
  if (c.includes('cloud') || c.includes('mist') || c.includes('fog') || c.includes('haze'))
    return isNight ? ['#2d3561', '#4a4e69'] as const : ['#757F9A', '#D7DDE8'] as const;
  // Clear
  if (isNight) return ['#0F2027', '#203A43', '#2C5364'] as const;
  if (isMorning) return ['#FF6B6B', '#FFE66D', '#4ECDC4'] as const;
  if (isEvening) return ['#f7971e', '#ffd200', '#f7971e'] as const;
  return ['#2980B9', '#6DD5FA', '#FFFFFF'] as const;
};

/** Ionicons name — condition + isDaytime aware (WeatherAPI.com text) */
const getWeatherIcon = (weatherData: WeatherData | null): string => {
  if (!weatherData) return 'sunny';
  const { condition, isDaytime } = weatherData;
  const c = (condition || '').toLowerCase();

  if (c.includes('thunder') || c.includes('lightning')) return 'thunderstorm';
  if (c.includes('snow') || c.includes('sleet') || c.includes('blizzard') || c.includes('ice')) return 'snow';
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower') || c.includes('mist'))
    return isDaytime ? 'rainy' : 'rainy-outline';
  if (c.includes('fog') || c.includes('haze') || c.includes('smoke') || c.includes('dust') || c.includes('sand'))
    return isDaytime ? 'partly-sunny' : 'cloudy-night';
  if (c.includes('overcast')) return isDaytime ? 'cloudy' : 'cloudy-night';
  if (c.includes('cloud') || c.includes('partly')) return isDaytime ? 'partly-sunny' : 'cloudy-night';
  if (c.includes('clear') || c.includes('sunny')) return isDaytime ? 'sunny' : 'moon';
  return isDaytime ? 'partly-sunny' : 'cloudy-night';
};

/** Smart weather insight — condition + temperature + time + feels-like */
const generateWeatherInsight = (weather: any): string => {
  if (!weather) return '';

  const rain = weather.rainProbability ?? 0;
  const condition = (weather.condition ?? '').toLowerCase();
  const humidity = weather.humidity ?? 0;
  const windSpeed = weather.windSpeed ?? 0;
  const temperature = weather.temperature ?? weather.temp ?? 24;
  const feelsLike = weather.feelsLike ?? temperature;
  const isDaytime = weather.isDaytime ?? true;

  const feelsStr = feelsLike !== temperature ? ` (feels like ${feelsLike}°C)` : '';

  // ── Active severe conditions first ──────────────────────────────────────
  if (condition.includes('thunder') || condition.includes('lightning'))
    return `⛈️ Thunderstorm! (${temperature}°C${feelsStr}). Seek shelter immediately and avoid open spaces.`;

  if (condition.includes('snow') || condition.includes('sleet') || condition.includes('blizzard'))
    return `❄️ Snowfall! (${temperature}°C). Dress in warm layers and watch for slippery surfaces.`;

  if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('shower')) {
    if (rain >= 80)
      return `🌧️ Heavy rain right now (${temperature}°C${feelsStr}). Carry your umbrella — you'll need it!`;
    return `🌦️ Light rain falling (${temperature}°C${feelsStr}). An umbrella is a good idea.`;
  }

  // ── Temperature-based ────────────────────────────────────────────────────
  if (temperature < 10)
    return `🥶 Very cold! ${temperature}°C${feelsStr}. Wear layers — jacket, hat, and gloves are essential.`;
  if (temperature < 15)
    return `❄️ Cold weather — ${temperature}°C${feelsStr}. A warm sweater and jacket will keep you comfortable.`;
  if (temperature < 18)
    return `🌡️ Cool ${isDaytime ? 'day' : 'night'} — ${temperature}°C${feelsStr}. A light jacket is recommended.`;

  // ── Rain probability ─────────────────────────────────────────────────────
  if (rain >= 70)
    return `☔ ${rain}% chance of rain (${temperature}°C). High likelihood of showers — carry your umbrella!`;
  if (rain >= 50)
    return `⚠️ ${rain}% chance of rain (${temperature}°C${feelsStr}). Possible showers later — best to carry an umbrella.`;
  if (rain >= 30)
    return `☁️ ${rain}% chance of rain (${temperature}°C). Unpredictable — consider taking an umbrella just in case.`;

  // ── Clear / Cloudy ───────────────────────────────────────────────────────
  if (condition.includes('clear') || condition.includes('sunny')) {
    if (!isDaytime)
      return `🌙 Clear night — ${temperature}°C${feelsStr}. Beautiful starry skies. Stay warm if heading out.`;
    if (temperature >= 28)
      return `☀️ Hot and sunny — ${temperature}°C${feelsStr}. Stay hydrated and wear sunscreen.`;
    if (temperature >= 22)
      return `☀️ Warm and sunny — ${temperature}°C${feelsStr}. Great day to be outdoors!`;
    return `☀️ Clear skies — ${temperature}°C${feelsStr}. A pleasant ${isDaytime ? 'day' : 'evening'} outdoors.`;
  }

  if (condition.includes('cloud') || condition.includes('overcast') || condition.includes('partly')) {
    if (!isDaytime)
      return `☁️ Cloudy night — ${temperature}°C${feelsStr}. Overcast skies, stay warm.`;
    return `⛅ Partly cloudy — ${temperature}°C${feelsStr}. Rain unlikely, but conditions can change.`;
  }

  if (condition.includes('mist') || condition.includes('fog') || condition.includes('haze'))
    return `🌫️ Reduced visibility — ${temperature}°C${feelsStr}. Drive carefully and stay alert.`;

  // ── Wind / Humidity fallbacks ────────────────────────────────────────────
  if (windSpeed > 10)
    return `💨 Windy — ${windSpeed} m/s, ${temperature}°C${feelsStr}. Secure loose items and dress warmly.`;

  if (humidity > 80)
    return `💧 High humidity (${humidity}%) — ${temperature}°C. It may feel warmer than the actual temperature.`;

  return `✅ Stable conditions — ${temperature}°C${feelsStr}. No significant weather changes expected.`;
};

// formatTimeAgo helper
const formatTimeAgo = (timestamp: string | Date) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  return `${Math.floor(diffInSeconds / 86400)} days ago`;
};

export default function HomeScreen() {
  const [greeting, setGreeting] = useState('Hello!');
  const [isLoading, setIsLoading] = useState(true);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [securityLevel, setSecurityLevel] = useState('Low');
  const [movementStatus, setMovementStatus] = useState('Safe');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [latestAlert, setLatestAlert] = useState<any>(null);
  const [areaAlerts, setAreaAlerts] = useState<any[]>([]); // Area-specific alerts from security
  const [safetyTips, setSafetyTips] = useState<any[]>([]);
  const [location, setLocation] = useState<any>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [isAtRisk, setIsAtRisk] = useState(false);
  const [riskLevel, setRiskLevel] = useState<'Low' | 'Medium' | 'High' | 'None'>('None');
  const [riskZoneDescription, setRiskZoneDescription] = useState<string>('You are in a restricted area. Follow safety instructions.');
  const [showSafetyTipsModal, setShowSafetyTipsModal] = useState(false);

  // Geofencing state
  const [geoSecurityStatus, setGeoSecurityStatus] = useState<SecurityStatus | null>(null);
  const [nearbyRiskZones, setNearbyRiskZones] = useState<RiskZone[]>([]);
  const [nearestZone, setNearestZone] = useState<RiskZone | null>(null);
  const [distanceToNearest, setDistanceToNearest] = useState<number | null>(null);

  // Area-specific state (for location-based security status)
  const [currentArea, setCurrentArea] = useState<string | null>(null);
  const [areaSecurityLevel, setAreaSecurityLevel] = useState<string>('Low');
  const [areaMovementStatus, setAreaMovementStatus] = useState<string>('Safe');
  const [areaDisplayName, setAreaDisplayName] = useState<string>('Detecting location...');
  const [areaSpecificData, setAreaSpecificData] = useState<any>(null);

  const router = useRouter();
  const { userProfile, user } = useAuth();

  // Initialize Geofencing Service
  useEffect(() => {
    const initGeofencing = async () => {
      try {
        console.log('🔍 Initializing geofencing service...');
        const initialized = await geofencingService.initialize();

        if (initialized) {
          console.log('✅ Geofencing service initialized successfully');

          // Start monitoring location
          geofencingService.startMonitoring((status: SecurityStatus) => {
            console.log('📍 Security status update:', status);
            setGeoSecurityStatus(status);
            setNearbyRiskZones(status.nearbyZones);
            setNearestZone(status.nearestZone);
            setDistanceToNearest(status.distanceToNearest);

            // Update security level based on geofencing
            if (status.level !== securityLevel) {
              setSecurityLevel(status.level);
              console.log(`🚨 Security level changed to: ${status.level}`);
            }

            if (status.movementStatus !== movementStatus) {
              setMovementStatus(status.movementStatus);
              console.log(`🚶 Movement status changed to: ${status.movementStatus}`);
            }

            // Update in-app risk banner
            if (status.nearbyZones.length > 0 && status.nearestZone) {
              setIsAtRisk(true);
              setRiskLevel(status.nearestZone.riskLevel);
              setRiskZoneDescription(status.nearestZone.warningMessage);
            } else {
              setIsAtRisk(false);
              setRiskLevel('None');
            }
          });
        } else {
          console.warn('⚠️ Failed to initialize geofencing service');
        }
      } catch (error: any) {
        // Silently handle permission errors
        if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
          console.log('Geofencing requires permissions - service disabled');
        } else {
          console.error('❌ Error initializing geofencing:', error);
        }
      }
    };

    initGeofencing();

    // Cleanup on unmount
    return () => {
      console.log('🛑 Cleaning up geofencing service');
      geofencingService.cleanup();
    };
  }, []);

  // Load user profile with enhanced error handling
  const loadUserProfile = useCallback(async () => {
    try {
      const currentUser = auth.currentUser;

      // If user is not authenticated, redirect to login
      if (!currentUser) {
        console.log('No authenticated user, redirecting to login');
        router.replace('/(auth)/login');
        return;
      }

      // First try to get user data from AuthContext
      let userName = '';
      if (userProfile) {
        // Use profile data from context
        const fullName = userProfile.fullName;
        const displayName = userProfile.displayName;
        const email = userProfile.email || currentUser.email;

        if (fullName) {
          // Extract first name from full name if it contains multiple names
          const nameParts = fullName.trim().split(' ');
          userName = nameParts[0];
        } else if (displayName) {
          const nameParts = displayName.trim().split(' ');
          userName = nameParts[0];
        } else if (email) {
          userName = email.split('@')[0]; // Use username from email
        }
      } else {
        // Fallback to fetching from Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const fullName = userData.fullName;
          const displayName = userData.displayName;
          const email = currentUser.email;

          if (fullName) {
            const nameParts = fullName.trim().split(' ');
            userName = nameParts[0];
          } else if (displayName) {
            const nameParts = displayName.trim().split(' ');
            userName = nameParts[0];
          } else if (email) {
            userName = email.split('@')[0];
          }
        }
      }

      setGreeting(`Hello! ${userName || ''}`);
      console.log('User profile loaded successfully:', userName);
    } catch (error: any) {
      // Silently handle permission errors
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        console.log('User profile requires permissions - using default greeting');
      } else {
        console.error('Error loading user profile:', error);
      }
      // In case of error, show just 'Hello!'
      setGreeting('Hello!');

      // If it's an auth error, redirect to login
      if ((error as any).code === 'permission-denied' || (error as any).code === 'unauthenticated') {
        router.replace('/(auth)/login');
      }
    } finally {
      setIsLoading(false);
    }
  }, [router, userProfile]);

  // Subscribe to Global System Status (Security Level & Movement & Areas)
  // ── Track previous status to detect changes ──────────────────────────────
  const prevStatusRef = React.useRef<{ securityLevel: string; movementStatus: string } | null>(null);

  useEffect(() => {
    const statusDocRef = doc(db, 'system_status', 'general');

    const unsubscribe = onSnapshot(statusDocRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const globalData = docSnap.data();

      const newLevel = globalData.securityLevel || 'Low';
      const newMove = globalData.movementStatus || 'Safe';

      // Update UI state
      setSecurityLevel(newLevel);
      setMovementStatus(newMove);
      if (globalData.areas && Array.isArray(globalData.areas)) setSelectedAreas(globalData.areas);

      // Area-specific overrides
      if (currentArea && globalData.areaDetails?.[currentArea]) {
        const a = globalData.areaDetails[currentArea];
        setAreaSecurityLevel(a.securityLevel || newLevel);
        setAreaMovementStatus(a.movementStatus || newMove);
      } else {
        setAreaSecurityLevel(newLevel);
        setAreaMovementStatus(newMove);
      }

      // ── Fire local notification when status changes (foreground) ──────────
      const prev = prevStatusRef.current;
      if (prev) {
        const secChanged = prev.securityLevel !== newLevel;
        const moveChanged = prev.movementStatus !== newMove;

        if (secChanged || moveChanged) {
          const levelEmoji: Record<string, string> = { Low: '🟢', Medium: '🟡', High: '🔴' };
          const moveEmoji: Record<string, string> = { Safe: '✅', Caution: '⚠️', Lockdown: '🚨' };

          let title: string;
          let body: string;

          if (secChanged && moveChanged) {
            title = `${levelEmoji[newLevel] || '⚠️'} Campus Status Update`;
            body = `Security: ${newLevel}  •  Movement: ${newMove}`;
          } else if (secChanged) {
            title = `${levelEmoji[newLevel] || '⚠️'} Security Level: ${newLevel}`;
            body = `Campus security level changed to ${newLevel}.`;
          } else {
            title = `${moveEmoji[newMove] || '⚠️'} Movement Status: ${newMove}`;
            body = newMove === 'Lockdown'
              ? '🚨 LOCKDOWN in effect. Stay where you are.'
              : newMove === 'Caution'
                ? '⚠️ Exercise caution when moving around campus.'
                : '✅ Campus movement is now safe.';
          }

          // Show local notification (works in foreground + background)
          sendLocalNotification(title, body, {
            type: 'system_status_update',
            securityLevel: newLevel,
            movementStatus: newMove,
          }).catch(() => { });
        }
      }

      prevStatusRef.current = { securityLevel: newLevel, movementStatus: newMove };
    }, (error: any) => {
      // Silently handle permission errors
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        console.log('System status requires permissions - using default values');
      } else {
        console.error('❌ Error listening to system status:', error);
      }
    });

    return () => unsubscribe();
  }, [currentArea]);

  // Request location permission
  const requestLocationPermission = async () => {
    try {
      const loc = await getAccurateLocation({ targetAccuracyM: 30, timeoutMs: 12_000 });
      setLocationPermission(true);

      // Wrap in expo-location shape so existing weather/SOS code still works
      const locationObj = {
        coords: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          altitude: null, altitudeAccuracy: null, heading: null, speed: null,
        },
        timestamp: Date.now(),
      } as unknown as Location.LocationObject;
      setLocation(locationObj);
      console.log(`📡 Home GPS: ±${Math.round(loc.accuracy)} m`);

      // Detect campus area
      const zone = lookupCampusZone(loc.latitude, loc.longitude);
      if (zone) {
        setCurrentArea(zone);
        setAreaDisplayName(zone);
        await AsyncStorage.setItem('currentArea', zone);
        console.log(`✅ Campus area detected: ${zone}`);
      }

      return { granted: true, location: locationObj };
    } catch (error) {
      console.error('Error requesting location permission:', error);
      setLocationPermission(false);
      return { granted: false, location: null };
    }
  };

  // Fetch weather data
  const fetchWeatherData = async (lat: number, lon: number, forceRefresh = false) => {
    try {
      console.log(`🌍 Fetching weather data for coordinates: ${lat}, ${lon}`);
      const weatherData = await weatherService.getWeatherByCoordinates(lat, lon, forceRefresh);

      if (weatherData) {
        console.log('✅ Weather data received in home screen:', JSON.stringify({
          temperature: weatherData.temperature + '°C',
          humidity: weatherData.humidity + '%',
          windSpeed: weatherData.windSpeed + ' m/s',
          rainProbability: weatherData.rainProbability + '%',
          condition: weatherData.condition,
          feelsLike: weatherData.feelsLike + '°C',
          isDaytime: weatherData.isDaytime,
          isMock: weatherData.isMock || false,
        }, null, 2));
        setWeatherData(weatherData);
        console.log('✓ Weather state updated successfully');

        // Create weather alert if rain probability is very high
        if (weatherData.rainProbability > 80 && !weatherData.isMock) {
          await createWeatherAlert(weatherData);
        }
      } else {
        console.warn('⚠️ No weather data received from API');
      }
    } catch (error: any) {
      console.error('❌ Error fetching weather data:', error);
    }
  };

  // Create weather alert for high rain probability
  const createWeatherAlert = async (weatherData: any) => {
    try {
      const alertData = {
        type: 'weather',
        title: 'High Rain Probability Alert',
        message: `High chance of rainfall (${weatherData.rainProbability}%) today. Exercise caution when moving around campus.`,
        severity: 'medium',
        timestamp: new Date().toISOString(),
        location: 'Campus-wide',
        status: 'active'
      };

      // Save to Firestore alerts collection
      const alertRef = doc(collection(db, 'alerts'));
      await setDoc(alertRef, alertData);

      console.log('Weather alert created for high rain probability');
    } catch (error: any) {
      // Silently handle permission errors - alerts collection may not be accessible
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        console.log('Weather alerts require admin permissions - skipping alert creation');
      } else {
        console.error('Error creating weather alert:', error);
      }
    }
  };

  // Fetch system status (security level and movement status)
  const fetchSystemStatus = async () => {
    try {
      const systemStatusRef = doc(db, 'system_status', 'current');
      const systemStatusSnap = await getDoc(systemStatusRef);

      if (systemStatusSnap.exists()) {
        const data = systemStatusSnap.data();
        setSecurityLevel(data.securityLevel || 'Low');
        setMovementStatus(data.movementStatus || 'Safe');
        console.log('System status updated:', data);
      } else {
        // Set default values
        setSecurityLevel('Low');
        setMovementStatus('Safe');
        console.log('Using default system status');
      }
    } catch (error: any) {
      // Silently handle permission errors
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        console.log('System status requires permissions - using default values');
      } else {
        console.error('Error fetching system status:', error);
      }
      // Set default values on error
      setSecurityLevel('Low');
      setMovementStatus('Safe');
    }
  };

  // Fetch alerts
  const fetchAlerts = useCallback(() => {
    // Guard: only listen if user is authenticated
    if (!auth.currentUser) {
      return () => { };
    }
    try {
      const alertsQuery = query(
        collection(db, 'alerts'),
        orderBy('timestamp', 'desc'),
        limit(5)
      );

      const unsubscribe = onSnapshot(alertsQuery, (snapshot) => {
        const alertsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setAlerts(alertsList);
        if (alertsList.length > 0) {
          setLatestAlert(alertsList[0]);
        }
      }, (error) => {
        // Silently ignore permission errors — collection may not exist yet
        if (!error.message?.includes('Missing or insufficient permissions')) {
          console.warn('Alerts listener error:', error.message);
        }
      });

      return unsubscribe;
    } catch (error) {
      return () => { };
    }
  }, []);

  // Fetch area-specific alerts — merges security (area_alerts) + medical (health_advisories)
  const fetchAreaAlerts = useCallback(() => {
    const seen = new Set<string>();

    const merge = (newItems: any[]) => {
      setAreaAlerts(prev => {
        const map = new Map(prev.map((a: any) => [a.id, a]));
        newItems.forEach(a => map.set(a.id, a));
        // Sort newest first, filter expired/resolved
        const now = Date.now();
        return Array.from(map.values())
          .filter((a: any) => {
            if (a.status === 'resolved') return false;
            if (a.active === false) return false;
            if (a.expiresAt) {
              const exp = a.expiresAt?.seconds
                ? a.expiresAt.seconds * 1000
                : new Date(a.expiresAt).getTime();
              if (now > exp) return false;
            }
            return true;
          })
          .sort((a: any, b: any) => {
            const ta = a.createdAt?.seconds || 0;
            const tb = b.createdAt?.seconds || 0;
            return tb - ta;
          });
      });

      // Fire local notification for new items
      newItems.forEach((alert: any) => {
        if (!seen.has(alert.id)) {
          seen.add(alert.id);
          const isMedical = alert.source === 'medical' || !!alert.active; // health_advisories have `active`
          const title = alert.title || (isMedical ? '🏥 Health Advisory' : '🚨 Security Alert');
          const body = alert.message || alert.description || '';
          import('@/services/fcmService').then(({ sendLocalNotification }) => {
            sendLocalNotification(title, body, {
              type: isMedical ? 'health_advisory' : 'security_alert',
              severity: alert.severity || 'info',
              alertId: alert.id,
            }).catch(() => { });
          }).catch(() => { });
        }
      });
    };

    // ── Listener 1: area_alerts (security + security_admin broadcasts) ──────
    const q1 = query(
      collection(db, 'area_alerts'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub1 = onSnapshot(q1, (snap) => {
      const docs = snap.docs.map(d => ({
        id: d.id,
        source: 'security',
        ...d.data(),
      }));
      merge(docs);
    }, () => { });

    // ── Listener 2: health_advisories (medical dashboard broadcasts) ─────────
    const q2 = query(
      collection(db, 'health_advisories'),
      where('active', '==', true),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub2 = onSnapshot(q2, (snap) => {
      const docs = snap.docs.map(d => ({
        id: d.id,
        source: 'medical',
        // Map health_advisory fields → area_alert shape
        title: 'Health Advisory',
        area: d.data().targetLocation || 'All Campus',
        description: d.data().message,
        severity: d.data().severity === 'critical' ? 'critical'
          : d.data().severity === 'warning' ? 'high'
            : 'medium',
        createdByName: d.data().createdBy || 'Medical Admin',
        ...d.data(),
      }));
      merge(docs);
    }, () => { });

    return () => { unsub1(); unsub2(); };
  }, []);

  // Fetch safety tips
  const fetchSafetyTips = async () => {
    // Guard: only listen if user is authenticated
    if (!auth.currentUser) {
      return () => { };
    }
    try {
      const tipsQuery = query(
        collection(db, 'safety_tips'),
        orderBy('priority', 'asc'),
        limit(10)
      );

      const unsubscribe = onSnapshot(tipsQuery, (snapshot) => {
        const tipsList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSafetyTips(tipsList);
      }, (error) => {
        // Silently ignore permission errors — collection may not exist yet
        if (!error.message?.includes('Missing or insufficient permissions')) {
          console.warn('Safety tips listener error:', error.message);
        }
      });

      return unsubscribe;
    } catch (error) {
      return () => { };
    }
  };

  // Send emergency alert
  const sendEmergencyAlert = async () => {
    if (emergencyLoading) return;

    // ── Pre-warm GPS immediately — runs while user reads the dialog ──────────
    // targetAccuracyM: 20 m, timeoutMs: 20 s (generous — dialog gives us time)
    const gpsPromise = getAccurateLocation({ targetAccuracyM: 20, timeoutMs: 20_000 })
      .catch(() => null); // never throw — we have fallbacks

    // Show confirmation dialog
    Alert.alert(
      '🚨 EMERGENCY SOS',
      'Are you in a life-threatening emergency? This will immediately alert campus security with your exact location.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            console.log('ℹ️ User cancelled emergency alert');
          }
        },
        {
          text: 'YES, SEND HELP NOW',
          style: 'destructive',
          onPress: async () => {
            try {
              setEmergencyLoading(true);
              console.log('🚨 EMERGENCY ALERT INITIATED');

              const currentUser = auth.currentUser;
              if (!currentUser) {
                console.error('❌ No authenticated user found');
                Alert.alert('❌ Authentication Error', 'Please log in again to use emergency features.');
                router.replace('/(auth)/login');
                return;
              }

              // Get user data
              const userDataString = await AsyncStorage.getItem('userData');
              const storedData = userDataString ? JSON.parse(userDataString) : {};
              const userData = {
                fullName: userProfile?.fullName || storedData.fullName || storedData.displayName,
                regNo: userProfile?.regNumber || userProfile?.regNo || storedData.regNo || storedData.regNumber || null,
                phone: userProfile?.phone || storedData.phone || null,
              };

              // ── Await the pre-warmed GPS result ──────────────────────────────
              let locationData: any = null;
              let locationAccuracy = 'Unknown';
              let resolvedName = 'Near Campus Area';

              try {
                // gpsPromise was started before the dialog — should already have a good fix
                let freshLoc = await gpsPromise;

                // If pre-warm failed or accuracy is poor, try one more time with remaining budget
                if (!freshLoc || freshLoc.accuracy > 50 || (freshLoc.latitude === 0 && freshLoc.longitude === 0)) {
                  console.log('⚠️ Pre-warm GPS insufficient, retrying...');
                  freshLoc = await getAccurateLocation({ targetAccuracyM: 30, timeoutMs: 8_000 })
                    .catch(() => freshLoc); // keep pre-warm result if retry also fails
                }

                if (freshLoc && freshLoc.latitude !== 0) {
                  locationData = {
                    latitude: freshLoc.latitude,
                    longitude: freshLoc.longitude,
                    accuracy: freshLoc.accuracy,
                    sampleCount: freshLoc.sampleCount,
                  };
                  locationAccuracy = `±${Math.round(freshLoc.accuracy)} m`;

                  // Resolve place name from accurate coordinates
                  resolvedName = resolveLocationSync(freshLoc.latitude, freshLoc.longitude)
                    || await resolveLocation(freshLoc.latitude, freshLoc.longitude)
                    || 'Near Campus Area';

                  console.log(`🚨 SOS GPS: ±${Math.round(freshLoc.accuracy)} m, ${freshLoc.sampleCount} samples → ${resolvedName}`);
                } else if (location) {
                  // Last resort: use cached location from home screen
                  locationData = {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    accuracy: location.coords.accuracy,
                    sampleCount: 1,
                  };
                  locationAccuracy = `±${Math.round(location.coords.accuracy || 999)} m (cached)`;
                  resolvedName = resolveLocationSync(location.coords.latitude, location.coords.longitude)
                    || 'Near Campus Area';
                  console.log(`🚨 SOS using cached location: ${resolvedName}`);
                }
              } catch (locError) {
                console.error('❌ SOS location error:', locError);
              }

              const emergencyData = {
                userId: currentUser.uid,
                reporterName: userData.fullName || currentUser.email || 'Student',
                reporterEmail: currentUser.email || 'Unknown',
                // Student verification fields — shown on security dashboard
                regNo: userData.regNo,
                phone: userData.phone,
                createdAt: new Date().toISOString(),
                // Location — always human-readable name, never raw coordinates
                location: resolvedName,
                locationAccuracy,
                coordinates: locationData,
                placeName: resolvedName,
                campusZone: resolvedName !== 'Outside Laikipia University' && resolvedName !== 'Near Campus Area'
                  ? resolvedName : null,
                status: 'pending',
                type: 'SOS',
                priority: 'critical',
                description: 'EMERGENCY SOS BUTTON ACTIVATED - IMMEDIATE RESPONSE REQUIRED',
                isHighRisk: true,
                timestamp: new Date().toISOString(),
                requiresImmediateResponse: true,
                platform: Platform.OS,
                appVersion: '1.0.0',
              };

              console.log('📤 Sending emergency alert to Firestore...');
              console.log('   Collection: security_alerts');
              console.log('   Data:', JSON.stringify(emergencyData, null, 2));

              // Create a reference with a generated ID
              const newAlertRef = doc(collection(db, 'security_alerts'));

              try {
                await setDoc(newAlertRef, emergencyData);
                console.log('✅ SUCCESS: Emergency alert saved to Firestore!');
                console.log('   Document ID:', newAlertRef.id);
                console.log('   Security dashboard should now show this alert');

                // Play alarm sound if on web
                if (Platform.OS === 'web') {
                  try {
                    const audio = new Audio('/sounds/alert.mp3');
                    audio.play().catch(() => console.log('⚠️ Could not play alert sound'));
                  } catch (e) {
                    console.log('⚠️ Alert sound not available');
                  }
                }

                Alert.alert(
                  '✅ HELP IS ON THE WAY!',
                  `Security has been notified and is responding to your location.\n\n📍 Location: ${resolvedName}\n\nStay on the line and keep your phone accessible.`,
                  [{ text: 'OK', onPress: () => console.log('✅ User acknowledged SOS sent') }]
                );

                // Vibrate pattern for emergency confirmation (mobile only)
                if (Platform.OS !== 'web') {
                  try {
                    const { Vibration } = require('react-native');
                    // Long vibration pattern to confirm alert sent
                    Vibration.vibrate([0, 500, 200, 500, 200, 500]);
                  } catch (e) {
                    console.log('⚠️ Vibration not available');
                  }
                }

              } catch (firestoreError: any) {
                // Silently handle permission errors - emergency alerts collection may not be accessible
                if (firestoreError?.code === 'permission-denied' || firestoreError?.message?.includes('Missing or insufficient permissions')) {
                  console.log('Emergency alerts require admin permissions - alert not saved to database');
                  throw new Error('Database permissions denied. Please contact support.');
                } else {
                  console.error('❌ FIRESTORE ERROR:', firestoreError);
                  console.error('   Error code:', firestoreError.code);
                  console.error('   Error message:', firestoreError.message);
                  throw firestoreError;
                }
              }

            } catch (error: any) {
              // Silently handle permission errors - log as info instead of error
              if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions') || error?.message?.includes('Database permissions denied')) {
                console.log('Emergency alert permissions issue - user will be prompted to call emergency services');
              } else {
                console.error('❌ CRITICAL ERROR sending SOS:', error);
                console.error('   Error name:', error.name);
                console.error('   Error code:', error.code);
                console.error('   Error message:', error.message);
              }

              let errorMessage = 'Failed to send SOS.';
              if (error.code === 'permission-denied' || error.message?.includes('Database permissions denied')) {
                errorMessage = 'Cannot access emergency system. Please contact support immediately.';
              } else if (error.message?.includes('network') || error.code === 'unavailable') {
                errorMessage = 'Network error. Please check your connection and try again.';
              } else if (error.message?.includes('location')) {
                errorMessage = 'Location unavailable, but alert can still be sent.';
              }

              Alert.alert(
                '❌ Emergency Alert Failed',
                errorMessage + '\n\n📞 Please call emergency services directly: [Your Campus Emergency Number]',
                [
                  { text: 'OK' },
                  { text: 'Call Emergency', onPress: () => console.log('User should call emergency number') }
                ]
              );
            } finally {
              setEmergencyLoading(false);
              console.log('🏁 Emergency alert process completed');
            }
          }
        }
      ],
      { cancelable: false } // Prevent dismissing by tapping outside
    );
  };

  // Monitor auth state changes
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user: any) => {
      if (!user) {
        console.log('User logged out, redirecting to login');
        router.replace('/(auth)/login');
      }
    });

    return () => unsubscribeAuth();
  }, [router]);

  // Note: Geofencing is now initialized automatically in the useEffect hook above
  // This function is kept for backward compatibility but no longer needed
  const initializeGeofencing = async () => {
    try {
      console.log('Geofencing already initialized via useEffect hook');
      return true;
    } catch (error) {
      console.error('❌ Error with geofencing:', error);
      return false;
    }
  };

  // Initialize all data
  useEffect(() => {
    const initializeData = async () => {
      await loadUserProfile();

      // Request location permission and get location synchronously
      const locationResult = await requestLocationPermission();

      // Initialize geofencing service
      if (locationResult.granted) {
        await initializeGeofencing();
      }

      // Fetch weather data - use returned location or fallback to Laikipia University
      let weatherLat = LAIKIPIA_UNIVERSITY_COORDS.latitude;
      let weatherLon = LAIKIPIA_UNIVERSITY_COORDS.longitude;

      if (locationResult.granted && locationResult.location) {
        weatherLat = locationResult.location.coords.latitude;
        weatherLon = locationResult.location.coords.longitude;
        console.log(`Fetching weather for user location: ${weatherLat}, ${weatherLon}`);
      } else {
        console.log('Using Laikipia University location for weather:', weatherLat, weatherLon);
      }

      await fetchWeatherData(weatherLat, weatherLon);

      // Fetch initial system status
      await fetchSystemStatus();

      // Set up real-time listeners
      const unsubscribeAlerts = fetchAlerts();
      const unsubscribeAreaAlerts = fetchAreaAlerts();
      const unsubscribeTips = await fetchSafetyTips();

      // Set up system status listener
      const systemStatusRef = doc(db, 'system_status', 'current');
      const unsubscribeSystemStatus = onSnapshot(systemStatusRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setSecurityLevel(data.securityLevel || 'Low');
          setMovementStatus(data.movementStatus || 'Safe');
        }
      }, (error) => {
        if (!error.message?.includes('Missing or insufficient permissions')) {
          console.warn('System status listener error:', error.message);
        }
      });

      // Cleanup function
      return () => {
        unsubscribeAlerts();
        unsubscribeAreaAlerts();
        unsubscribeTips();
        unsubscribeSystemStatus();
        // Stop geofencing tracking - will be handled by component unmount
        console.log('Cleanup: Stopping location monitoring');
      };
    };

    initializeData();
  }, [loadUserProfile, fetchAlerts, fetchAreaAlerts]);

  // Monitor location changes and fetch weather accordingly
  useEffect(() => {
    if (location && locationPermission) {
      console.log('Location updated, fetching weather:', location.coords.latitude, location.coords.longitude);
      fetchWeatherData(location.coords.latitude, location.coords.longitude);
    }
  }, [location]);

  // Periodically refresh weather data (every 30 minutes)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (locationPermission && location) {
        console.log('Periodic weather refresh for location:', location.coords.latitude, location.coords.longitude);
        await fetchWeatherData(location.coords.latitude, location.coords.longitude);
      }
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(interval);
  }, [locationPermission, location]);

  // Pull-to-refresh functionality
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadUserProfile();

      // Refresh weather using current location if available
      if (location && locationPermission) {
        console.log('Manual refresh: Fetching weather for location:', location.coords.latitude, location.coords.longitude);
        await fetchWeatherData(location.coords.latitude, location.coords.longitude, true);
      } else {
        console.log('Manual refresh: Location not available, using Laikipia University');
        await fetchWeatherData(LAIKIPIA_UNIVERSITY_COORDS.latitude, LAIKIPIA_UNIVERSITY_COORDS.longitude, true);
      }

      // Refresh system status
      await fetchSystemStatus();

      console.log('Manual refresh completed');
    } catch (error) {
      console.error('Error during manual refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [loadUserProfile, location, locationPermission]);

  // Early returns for loading and authentication states
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C156D" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  // Check if user is authenticated
  if (!auth.currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C156D" />
        <Text style={styles.loadingText}>Redirecting to login...</Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" />

      {/* Fixed Blue Header */}
      <SafeAreaView edges={['top']} style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>{greeting}</Text>
          <NotificationBell />
        </View>
      </SafeAreaView>

      {/* Scrollable White Body */}
      <View style={styles.bodyContainer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#0C156D']}
              tintColor="#0C156D"
            />
          }
        >

          {/* Main Weather Widget */}
          <View style={styles.weatherCard}>
            <LinearGradient
              colors={['#0C156D', '#1a237e', '#283593']}
              style={{ padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View style={styles.weatherInfo}>
                {/* Temperature */}
                <Text style={styles.temperature}>
                  {weatherData ? `${weatherData.temperature}°C` : '24°C'}
                </Text>

                {/* Feels Like */}
                {weatherData?.feelsLike && weatherData.feelsLike !== weatherData.temperature && (
                  <Text style={{ color: '#FFF', fontSize: 13, opacity: 0.85, marginTop: -4 }}>
                    Feels like {weatherData.feelsLike}°C
                  </Text>
                )}

                {/* Condition */}
                <Text style={styles.weatherDetail}>
                  {weatherData
                    ? weatherData.description.charAt(0).toUpperCase() + weatherData.description.slice(1)
                    : 'Clear sky'
                  }
                </Text>

                {/* Smart Weather Insight */}
                <Text style={styles.weatherInsight}>
                  {generateWeatherInsight(weatherData)}
                </Text>

                {/* Weather Statistics */}
                <Text style={styles.weatherStats}>
                  Rain: {weatherData?.rainProbability || 0}% | Humidity: {weatherData?.humidity || 40}% | Wind: {weatherData?.windSpeed || 3} m/s
                </Text>

                {/* Data Source Indicator */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, opacity: 0.8 }}>
                  <Ionicons
                    name={weatherData?.isMock ? "cloud-offline" : "radio"}
                    size={12}
                    color="#FFF"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: '#FFF', fontSize: 10 }}>
                    {weatherData?.isMock ? "Offline Data (Estimated)" : "Live Weather"}
                  </Text>
                </View>

              </View>

              <View style={styles.weatherIcon}>
                <Ionicons
                  name={getWeatherIcon(weatherData) as any}
                  size={48}
                  color="#FFFFFF"
                />
                {(weatherData?.condition === 'Clouds' || weatherData?.condition === 'Rain') && (
                  <Ionicons name="cloud" size={32} color="#FFFFFF" style={styles.cloudIcon} />
                )}
              </View>
            </LinearGradient>
          </View>

          {/* Risk Zone Alert Banner */}
          {isAtRisk && (
            <View style={[
              styles.riskZoneBanner,
              riskLevel === 'High' ? styles.highRiskBanner :
                riskLevel === 'Medium' ? styles.mediumRiskBanner :
                  styles.lowRiskBanner
            ]}>
              <View style={styles.riskZoneContent}>
                <Ionicons
                  name={
                    riskLevel === 'High' ? 'warning' :
                      riskLevel === 'Medium' ? 'alert-circle' :
                        'information-circle'
                  }
                  size={24}
                  color="#FFFFFF"
                  style={styles.riskZoneIcon}
                />
                <View style={styles.riskZoneTextContainer}>
                  <Text style={styles.riskZoneTitle}>
                    ⚠ {riskLevel} Risk Zone Detected
                  </Text>
                  <Text style={styles.riskZoneMessage}>
                    {riskZoneDescription || 'You are in a restricted area. Follow safety instructions.'}
                  </Text>
                </View>
              </View>
            </View>
          )
          }

          {/* Status Grid with Real-Time Location-Based Security Data */}
          <View style={styles.statusGrid}>
            {/* Security Level Card - Area Specific */}
            <View style={[styles.statusCard,
            areaSecurityLevel === 'High' ? styles.highSecurityCard :
              areaSecurityLevel === 'Medium' ? styles.mediumSecurityCard :
                styles.lowSecurityCard
            ]}>
              <View style={styles.statusIconContainer}>
                <Ionicons
                  name={
                    areaSecurityLevel === 'High' ? 'warning' :
                      areaSecurityLevel === 'Medium' ? 'alert-circle' :
                        'checkmark-circle'
                  }
                  size={24}
                  color={
                    areaSecurityLevel === 'High' ? '#D50000' :
                      areaSecurityLevel === 'Medium' ? '#FF9800' :
                        '#2ecc71'
                  }
                />
              </View>
              <View style={styles.securityStatusHeader}>
                <Text style={styles.statusText}>Security Alert - {areaSecurityLevel}</Text>
              </View>

              {/* Show nearby risk zone info if available */}
              {nearestZone && (
                <View style={styles.riskZoneInfo}>
                  <Text style={styles.riskZoneName}>{nearestZone.name}</Text>
                  {distanceToNearest !== null && (
                    <Text style={styles.distanceText}>
                      {Math.round(distanceToNearest)}m away
                    </Text>
                  )}
                  <Text style={styles.riskZoneWarning} numberOfLines={2}>
                    ⚠️ {nearestZone.warningMessage}
                  </Text>
                </View>
              )}

              {/* Show area-specific broadcast message from security */}
              {areaSpecificData?.broadcastMessage && (
                <View style={styles.broadcastMessage}>
                  <Ionicons name="megaphone" size={16} color="#fff" />
                  <Text style={styles.broadcastText}>{areaSpecificData.broadcastMessage}</Text>
                </View>
              )}
            </View>

            {/* Movement Status Card - Area Specific */}
            <View style={[styles.statusCard,
            areaMovementStatus === 'Unsafe' ? styles.unsafeMovementCard :
              areaMovementStatus === 'Caution' ? styles.cautionMovementCard :
                styles.safeMovementCard
            ]}>
              <View style={styles.statusIconContainer}>
                <Ionicons
                  name={
                    areaMovementStatus === 'Unsafe' ? 'close-circle' :
                      areaMovementStatus === 'Caution' ? 'alert' :
                        'walk'
                  }
                  size={24}
                  color={
                    areaMovementStatus === 'Unsafe' ? '#D50000' :
                      areaMovementStatus === 'Caution' ? '#FF9800' :
                        '#2E7D32'
                  }
                />
              </View>
              <View style={styles.securityStatusHeader}>
                <Text style={styles.statusText}>Movement: {areaMovementStatus}</Text>
              </View>

              {/* Show safety tip based on status */}
              {areaMovementStatus === 'Unsafe' && (
                <View style={styles.movementAlertBox}>
                  <Ionicons name="radio-button-on" size={16} color="#D50000" />
                  <Text style={styles.movementWarning}>
                    ⚠️ DANGER: Leave immediately!
                  </Text>
                </View>
              )}
              {areaMovementStatus === 'Caution' && (
                <View style={styles.movementAlertBox}>
                  <Ionicons name="eye" size={16} color="#FF9800" />
                  <Text style={styles.movementWarning}>
                    ⚠️ Stay alert. Consider alternative routes.
                  </Text>
                </View>
              )}
              {areaMovementStatus === 'Safe' && nearbyRiskZones.length === 0 && (
                <View style={styles.movementSafeBox}>
                  <Ionicons name="shield-checkmark" size={16} color="#2E7D32" />
                  <Text style={styles.movementSafe}>
                    ✓ All areas clear. Stay vigilant.
                  </Text>
                </View>
              )}

              {/* Show area-specific movement advisory */}
              {areaSpecificData?.movementAdvisory && (
                <View style={styles.advisoryMessage}>
                  <Ionicons name="information-circle" size={16} color="#fff" />
                  <Text style={styles.advisoryText}>{areaSpecificData.movementAdvisory}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Area-Specific Alerts */}
          {
            selectedAreas && selectedAreas.length > 0 && (
              <View style={styles.areaAlertsContainer}>
                <Text style={styles.sectionTitle}>📍 Active Area Alerts ({selectedAreas.length})</Text>
                <View style={styles.areaAlertsGrid}>
                  {selectedAreas.map((area, index) => (
                    <View key={index} style={styles.selectedAreaCard}>
                      <Ionicons name="location" size={18} color="#9C27B0" />
                      <Text style={styles.selectedAreaText}>{area}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.areaAlertWarning}>
                  ⚠️ Security status updated for these specific locations. Exercise caution.
                </Text>
              </View>
            )
          }

          {/* Nearby Risk Zones List */}
          {
            nearbyRiskZones.length > 0 && (
              <View style={styles.nearbyZonesContainer}>
                <Text style={styles.sectionTitle}>⚠️ Nearby Risk Zones</Text>
                {nearbyRiskZones.map((zone) => (
                  <View key={zone.id} style={[
                    styles.zoneCard,
                    zone.riskLevel === 'High' ? styles.highRiskZoneCard :
                      zone.riskLevel === 'Medium' ? styles.mediumRiskZoneCard :
                        styles.lowRiskZoneCard
                  ]}>
                    <View style={styles.zoneHeader}>
                      <Ionicons
                        name={zone.riskLevel === 'High' ? 'warning' : 'alert-circle'}
                        size={20}
                        color={zone.riskLevel === 'High' ? '#D50000' : '#FF9800'}
                      />
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      <View style={[styles.riskBadge,
                      zone.riskLevel === 'High' ? styles.highRiskBadge :
                        zone.riskLevel === 'Medium' ? styles.mediumRiskBadge :
                          styles.lowRiskBadge
                      ]}>
                        <Text style={styles.riskBadgeText}>{zone.riskLevel}</Text>
                      </View>
                    </View>
                    <Text style={styles.zoneDescription}>{zone.description}</Text>
                    <Text style={styles.zoneWarning}>{zone.warningMessage}</Text>
                  </View>
                ))}
              </View>
            )
          }

          {/* Emergency Action Button */}
          <TouchableOpacity
            style={[styles.emergencyButton, emergencyLoading && styles.emergencyButtonDisabled]}
            onPress={sendEmergencyAlert}
            activeOpacity={0.7}
            disabled={emergencyLoading}
          >
            {emergencyLoading ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.emergencyText}>Sending Alert...</Text>
              </>
            ) : (
              <Text style={styles.emergencyText}>EMERGENCY: Tap for Help</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.emergencySubtext}>This sends Your Location to Campus Security</Text>

          {/* Alerts Section - Broadcasts from Security & Medical dashboards */}
          <View style={styles.alertsSection}>
            <View style={styles.alertsHeader}>
              <Text style={styles.alertsTitle}>Latest Alerts</Text>
              <Ionicons name="warning" size={20} color="#D50000" />
            </View>

            {/* No alerts at all */}
            {areaAlerts.length === 0 && alerts.length === 0 && (
              <View style={styles.noAlertsCard}>
                <Ionicons name="shield-checkmark-outline" size={28} color="#2E7D32" />
                <Text style={styles.noAlertsText}>No recent alerts</Text>
                <Text style={styles.noAlertsSubtext}>System operational — all clear</Text>
              </View>
            )}

            {/* Area Alerts from Security / Medical dashboards */}
            {areaAlerts.length > 0 && (
              <>
                {areaAlerts.map((alert: any) => {
                  const isMedical = alert.source === 'medical';
                  const sourceLabel = isMedical ? 'Medical' : 'Security';
                  const sourceIcon = isMedical ? 'medkit' : 'shield';
                  const sourceColor = isMedical ? '#1565C0' : '#D50000';
                  // health_advisories store text in `message`, area_alerts in `description`
                  const bodyText = alert.description || alert.message || '';
                  return (
                    <View
                      key={alert.id}
                      style={[
                        styles.areaAlertCard,
                        alert.severity === 'critical' ? styles.criticalAreaAlert :
                          alert.severity === 'high' ? styles.highAreaAlert :
                            alert.severity === 'medium' ? styles.mediumAreaAlert :
                              styles.lowAreaAlert,
                      ]}
                    >
                      {/* Source badge */}
                      <View style={[styles.sourceBadge, { backgroundColor: sourceColor + '22', borderColor: sourceColor + '55' }]}>
                        <Ionicons name={sourceIcon as any} size={11} color={sourceColor} />
                        <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>{sourceLabel}</Text>
                      </View>

                      <View style={styles.areaAlertContent}>
                        <Text style={styles.areaAlertTitle}>{alert.title}</Text>
                        {alert.area ? <Text style={styles.areaAlertArea}>📍 {alert.area}</Text> : null}
                        {bodyText ? (
                          <Text style={styles.areaAlertDescription}>{bodyText}</Text>
                        ) : null}
                        <View style={styles.areaAlertFooter}>
                          <Text style={styles.areaAlertTime}>{formatTimeAgo(alert.createdAt)}</Text>
                          {alert.createdByName ? (
                            <Text style={styles.areaAlertBy}>— {alert.createdByName}</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Regular system alerts (weather, etc.) */}
            {alerts.length > 0 && alerts.map((alert: any) => (
              <View key={alert.id} style={styles.alertCard}>
                <Text style={styles.alertText}>
                  {alert.type?.toUpperCase()}: {alert.title || alert.message}
                </Text>
                <Text style={styles.alertTimestamp}>
                  {formatTimeAgo(alert.timestamp)}
                </Text>
              </View>
            ))}

            {/* Tip Card */}
            <View style={styles.tipCard}>
              <Text style={styles.tipText}>
                {safetyTips.length > 0
                  ? safetyTips[0]?.tip || 'Ensure You are Walking in Groups, Females Avoid walking Alone.'
                  : 'Ensure You are Walking in Groups, Females Avoid walking Alone.'
                }
              </Text>
              <TouchableOpacity
                onPress={() => setShowSafetyTipsModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.tipLink}>See Safe Tips and Places</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView >
      </View >

      {/* Safety Tips Modal */}
      {
        showSafetyTipsModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}> Campus Safety Tips </Text>
                <TouchableOpacity onPress={() => setShowSafetyTipsModal(false)} style={styles.modalCloseButton}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
                {/* Tip 1: Lake Chacha */}
                <View style={styles.safetyTipCard}>
                  <View style={styles.tipIconContainer}>
                    <Text style={styles.tipIcon}>🏞️</Text>
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipTitle}>Enjoy Nature Safely - Lake Chacha</Text>
                    <Text style={styles.tipDescription}>
                      You can enjoy the beautiful view of Lake Chacha, but swimming is strictly prohibited. The lake is dangerous with strong currents and deep waters. Maintain a safe distance and never attempt to enter into the water.
                    </Text>
                    <Text style={styles.tipWarning}>⚠️ NO SWIMMING ALLOWED</Text>
                  </View>
                </View>

                {/* Tip 2: Avoid Walking Alone */}
                <View style={styles.safetyTipCard}>
                  <View style={styles.tipIconContainer}>
                    <Text style={styles.tipIcon}>👥</Text>
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipTitle}>Never Walk Alone - Especially Female Students</Text>
                    <Text style={styles.tipDescription}>
                      Avoid walking alone around the campus institution, especially during late hours (6:00 PM - 6:30 AM). Female students must always walk in groups for your safety. There have been security incidents reported in isolated areas.
                    </Text>
                    <Text style={styles.tipWarning}>⚠️ ALWAYS WALK IN GROUPS</Text>
                  </View>
                </View>

                {/* Tip 3: Ndolo Quarry */}
                <View style={styles.safetyTipCard}>
                  <View style={styles.tipIconContainer}>
                    <Text style={styles.tipIcon}>⛏️</Text>
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipTitle}>DANGER: Ndoro Quarry Near Gate A</Text>
                    <Text style={styles.tipDescription}>
                      Ndolo Quarry near Gate A (close to the forest) is an extremely deep excavation site. This is a high-risk zone with dangerous edges and unstable terrain. No interaction whatsoever is allowed here. Stay far away from this area at all times.
                    </Text>
                    <Text style={styles.tipWarning}>🚨 EXTREMELY DANGEROUS - KEEP AWAY</Text>
                  </View>
                </View>

                {/* Tip 4: Table Land Curfew */}
                <View style={styles.safetyTipCard}>
                  <View style={styles.tipIconContainer}>
                    <Text style={styles.tipIcon}>🕕</Text>
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipTitle}>Table Land Area: 6:00 PM - 6:30 AM</Text>
                    <Text style={styles.tipDescription}>
                      Table Land area is insecure during night hours (6:00 PM to 6:30 AM). High incident reports in this zone. Ensure you are back in your room before curfew time. If you must be out, travel only in groups with people you trust.
                    </Text>
                    <Text style={styles.tipWarning}>🌙 STAY INDOORS DURING CURFEW HOURS</Text>
                  </View>
                </View>

                {/* Tip 5: High-Risk Zones for Female Students */}
                <View style={[styles.safetyTipCard, styles.criticalTipCard]}>
                  <View style={styles.tipIconContainer}>
                    <Text style={styles.tipIcon}>🚨</Text>
                  </View>
                  <View style={styles.tipContent}>
                    <Text style={styles.tipTitle}>CRITICAL: High-Risk Residential Areas</Text>
                    <Text style={styles.tipDescription}>
                      Female students living in Table Land, Jaffa, Alexander Hostels, Shamenei, and Ndoro must ALWAYS walk in groups with people you know. These areas have high security incident rates. Never traverse these zones alone, regardless of the time of day.
                    </Text>
                    <Text style={styles.tipWarning}>👯 ALWAYS WALK IN GROUPS - PEOPLE YOU TRUST</Text>
                  </View>
                </View>

                {/* Hashtag */}
                <View style={styles.hashtagContainer}>
                  <Text style={styles.hashtagText}>#YourSafetyOurSafetyLUCampus</Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                onPress={() => setShowSafetyTipsModal(false)}
                style={styles.modalCloseButtonFull}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      }


    </View >
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#0C156D', // Match brand color for status bar area
  },
  headerContainer: {
    backgroundColor: '#0C156D',
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  bodyContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 40,
  },

  // Weather Widget
  weatherCard: {
    backgroundColor: '#0C156D',
    borderRadius: 20,
    // padding: 20, // Removed to allow full-bleed image
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(12, 21, 109, 0.3)',
    position: 'relative',
    overflow: 'hidden',
  },
  rainyWeatherCard: {
    backgroundColor: '#304FFE',
  },
  weatherIcon: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20, // Move it up relative to vertical alignment if needed, or justify-content
    alignSelf: 'flex-start', // Align to top
  },
  cloudIcon: {
    position: 'absolute',
    bottom: -5,
    right: -5,
  },
  weatherInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  temperature: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  weatherDetail: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  weatherInsight: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 16,
    lineHeight: 18,
  },
  weatherStats: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  debugInfo: {
    fontSize: 10,
    color: '#666666',
    marginTop: 6,
    fontStyle: 'italic',
  },

  // Status Grid
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  statusCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  movementCard: {
    backgroundColor: '#C5E1A5',
    marginRight: 0,
    marginLeft: 10,
  },

  // Security Level Cards
  lowSecurityCard: {
    backgroundColor: '#E8F5E8',
  },
  mediumSecurityCard: {
    backgroundColor: '#FFF3E0',
  },
  highSecurityCard: {
    backgroundColor: '#FFEBEE',
  },

  // Movement Status Cards
  safeMovementCard: {
    backgroundColor: '#C5E1A5',
    marginRight: 0,
    marginLeft: 10,
  },
  cautionMovementCard: {
    backgroundColor: '#FFE0B2',
    marginRight: 0,
    marginLeft: 10,
  },
  unsafeMovementCard: {
    backgroundColor: '#FFCDD2',
    marginRight: 0,
    marginLeft: 10,
  },
  statusIconContainer: {
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    textAlign: 'center',
  },

  // Risk Zone Info Styles (inside security card)
  riskZoneInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
    width: '100%',
  },
  riskZoneName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D50000',
    marginBottom: 2,
  },
  distanceText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  riskZoneWarning: {
    fontSize: 10,
    color: '#D50000',
    lineHeight: 14,
  },
  movementWarning: {
    marginTop: 8,
    fontSize: 11,
    color: '#D50000',
    textAlign: 'center',
    lineHeight: 14,
  },
  movementSafe: {
    marginTop: 8,
    fontSize: 11,
    color: '#2E7D32',
    textAlign: 'center',
  },

  // New Area Badge for Status Cards
  securityStatusHeader: {
    alignItems: 'center',
    marginBottom: 4,
  },
  areaBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C156D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
    gap: 4,
  },
  areaBadgeTextSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },

  // Broadcast Message from Security
  broadcastMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 21, 109, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 6,
    width: '100%',
  },
  broadcastText: {
    flex: 1,
    fontSize: 11,
    color: '#0C156D',
    lineHeight: 14,
    fontWeight: '500',
  },

  // Movement Alert Boxes
  movementAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(213, 0, 0, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 6,
    width: '100%',
  },
  movementSafeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 125, 50, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 6,
    width: '100%',
  },

  // Advisory Message
  advisoryMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 21, 109, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 6,
    width: '100%',
  },
  advisoryText: {
    flex: 1,
    fontSize: 11,
    color: '#0C156D',
    lineHeight: 14,
    fontWeight: '500',
  },

  // Area Alerts Section (for selected areas from admin dashboard)
  areaAlertsContainer: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#9C27B0',
  },
  areaAlertsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  selectedAreaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
    padding: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  selectedAreaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A148C',
    marginLeft: 4,
  },
  areaAlertWarning: {
    fontSize: 11,
    color: '#D50000',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },

  // Nearby Risk Zones Section
  nearbyZonesContainer: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
  },
  zoneCard: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  highRiskZoneCard: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  mediumRiskZoneCard: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FFE0B2',
  },
  lowRiskZoneCard: {
    backgroundColor: '#E8F5E8',
    borderColor: '#C8E6C9',
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  zoneName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginLeft: 6,
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  highRiskBadge: {
    backgroundColor: '#D50000',
  },
  mediumRiskBadge: {
    backgroundColor: '#FF9800',
  },
  lowRiskBadge: {
    backgroundColor: '#2E7D32',
  },
  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  zoneDescription: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 6,
  },
  zoneWarning: {
    fontSize: 11,
    color: '#D50000',
    fontWeight: '500',
    lineHeight: 15,
  },

  // Emergency Button
  emergencyButton: {
    backgroundColor: '#D50000',
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    flexDirection: 'row',
    shadowColor: '#D50000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#FFEBEE',
  },
  emergencyButtonDisabled: {
    backgroundColor: '#9E9E9E',
    shadowOpacity: 0,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  emergencyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emergencySubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 25,
    opacity: 0.8,
  },

  // Alerts Section
  alertsSection: {
    marginBottom: 30,
  },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  alertsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginRight: 10,
  },
  alertTag: {
    backgroundColor: '#D32F2F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 15,
  },
  alertTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  alertCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D50000',
    marginBottom: 8,
  },
  alertTimestamp: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'right',
  },
  weatherAlertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertIcon: {
    marginRight: 12,
  },
  weatherAlertText: {
    flex: 1,
    fontSize: 14,
    color: '#304FFE',
  },
  tipCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipText: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 8,
  },
  tipLink: {
    fontSize: 14,
    color: '#2962FF',
    fontStyle: 'italic',
  },

  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666666',
  },

  // Risk Zone Banner Styles
  riskZoneBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  highRiskBanner: {
    backgroundColor: '#D50000',
  },
  mediumRiskBanner: {
    backgroundColor: '#FF9800',
  },
  lowRiskBanner: {
    backgroundColor: '#2E7D32',
  },
  riskZoneContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riskZoneIcon: {
    marginRight: 12,
  },
  riskZoneTextContainer: {
    flex: 1,
  },
  riskZoneTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  riskZoneMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },

  // Area-Specific Alerts Styles
  areaAlertsSection: {
    marginBottom: 25,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  areaAlertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8323D',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  areaAlertsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  areaAlertsSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFF5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0E0',
  },
  areaAlertsSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D50000',
    marginLeft: 8,
  },
  areaAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  criticalAreaAlert: {
    backgroundColor: '#FFE6E6',
    borderLeftWidth: 4,
    borderLeftColor: '#D50000',
  },
  highAreaAlert: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  mediumAreaAlert: {
    backgroundColor: '#FFF9C4',
    borderLeftWidth: 4,
    borderLeftColor: '#FBC02D',
  },
  lowAreaAlert: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  areaAlertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D50000',
    marginRight: 12,
    marginTop: 2,
  },
  areaAlertContent: {
    flex: 1,
  },
  areaAlertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  areaAlertArea: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D50000',
    marginBottom: 4,
  },
  areaAlertDescription: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
    lineHeight: 16,
  },
  areaAlertTime: {
    fontSize: 11,
    color: '#999999',
    fontStyle: 'italic',
  },
  areaAlertChevron: {
    marginLeft: 8,
  },
  // Source badge (Security / Medical)
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 8,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  areaAlertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  areaAlertBy: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  // No alerts empty state
  noAlertsCard: {
    backgroundColor: '#F1F8E9',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 12,
  },
  noAlertsText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2E7D32',
  },
  noAlertsSubtext: {
    fontSize: 12,
    color: '#66BB6A',
  },

  // Safety Tips Modal Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0C156D',
    flex: 1,
    letterSpacing: 0.2,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
    lineHeight: 18,
  },
  modalScrollView: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  safetyTipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E9EBF0',
    shadowColor: '#0C156D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    gap: 14,
  },
  criticalTipCard: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FECACA',
    borderWidth: 1.5,
  },
  tipIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tipIcon: {
    fontSize: 26,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  tipDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 10,
  },
  tipWarning: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    overflow: 'hidden',
    letterSpacing: 0.3,
  },
  hashtagContainer: {
    alignItems: 'center',
    paddingVertical: 18,
    marginTop: 4,
  },
  hashtagText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0C156D',
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  modalCloseButtonFull: {
    marginHorizontal: 16,
    marginBottom: 24,
    marginTop: 4,
    backgroundColor: '#0C156D',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#0C156D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

});
