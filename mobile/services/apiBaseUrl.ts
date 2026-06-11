import Constants from 'expo-constants';
import { Platform } from 'react-native';

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function looksLikeIp(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function getExpoHostIp(): string | null {
  // Typical values:
  // - Constants.expoConfig.hostUri: "192.168.1.12:8081"
  // - Constants.manifest.debuggerHost: "192.168.1.12:8081"
  // - Constants.manifest2.extra.expoGo.debuggerHost: "192.168.1.12:8081"
  const anyConstants: any = Constants as any;
  const hostUri: string | undefined =
    Constants.expoConfig?.hostUri ||
    anyConstants?.expoGoConfig?.debuggerHost ||
    anyConstants?.manifest2?.extra?.expoGo?.debuggerHost ||
    anyConstants?.manifest?.debuggerHost;

  if (!hostUri) return null;

  const host = hostUri.split(':')[0]?.trim();
  if (!host) return null;
  if (!looksLikeIp(host)) return null;
  return host;
}

/**
 * Resolve backend base URL for Expo.
 * 
 * Priority:
 * - Explicit env override: EXPO_PUBLIC_API_BASE_URL
 * - Web: localhost
 * - Native:
 *   - If we can detect the Expo dev-server IP, use that (works on physical devices)
 *   - Otherwise fall back to Android emulator default (10.0.2.2) or localhost (iOS sim)
 */
export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    console.log('🔧 API Base URL from environment (OVERRIDE):', configured);
    return stripTrailingSlash(configured);
  } else {
    console.log('ℹ️ No EXPO_PUBLIC_API_BASE_URL set, using platform-specific detection');
  }

  if (Platform.OS === 'web') {
    console.log('🌐 Platform: Web, using localhost');
    return 'http://localhost:5000';
  }

  const expoHostIp = getExpoHostIp();
  if (expoHostIp) {
    // This is the most reliable default for Expo Go on a physical device
    console.log('📱 Platform: Mobile (Native), detected Expo host IP:', expoHostIp);
    console.log('✅ Using auto-detected IP for backend connection');
    return `http://${expoHostIp}:5000`;
  }

  // Fallback defaults
  if (Platform.OS === 'android') {
    console.log('📱 Platform: Android emulator, using 10.0.2.2');
    return 'http://10.0.2.2:5000';
  }
  
  console.log('📱 Platform: iOS, using localhost');
  return 'http://localhost:5000';
}

