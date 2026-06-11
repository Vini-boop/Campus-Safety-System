/**
 * fcmService.ts
 * Push notification registration, local notification delivery,
 * and FCM token management for Campus Safety.
 *
 * Safe for Expo Go SDK 53+ (remote push removed — local notifications still work).
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Lazy-load expo-notifications to avoid Expo Go SDK 53 crash ───────────────
// The module auto-registers for push tokens on import, which throws in Expo Go.
// We load it lazily so the crash is caught per-call, not at bundle time.
type NotificationsModule = typeof import('expo-notifications');
let _N: NotificationsModule | null = null;

function getN(): NotificationsModule | null {
  if (_N) return _N;
  try {
    _N = require('expo-notifications') as NotificationsModule;
    return _N;
  } catch {
    return null;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const FCM_TOKEN_KEY = '@fcm_token_v2';

const CHANNEL_IDS = {
  emergency: 'campus_emergency',
  medical: 'campus_medical',
  security: 'campus_security',
  general: 'campus_general',
};

// ─── Setup notification handler (call once at app start) ──────────────────────
export const setupNotificationHandler = (): void => {
  try {
    const N = getN();
    if (!N) return;
    N.setNotificationHandler({
      handleNotification: async (notification) => {
        const type = (notification.request.content.data?.type as string) || '';
        const severity = (notification.request.content.data?.severity as string) || '';
        const isCritical =
          type.includes('emergency') || type.includes('sos') ||
          severity === 'critical' || severity === 'high';
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
          priority: isCritical
            ? N.AndroidNotificationPriority.MAX
            : N.AndroidNotificationPriority.HIGH,
        };
      },
    });
  } catch { /* Expo Go SDK 53+ — silently skip */ }
};

// ─── Channel setup ────────────────────────────────────────────────────────────
export const setupNotificationChannels = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    const N = getN();
    if (!N) return;
    const channels = [
      { id: CHANNEL_IDS.emergency, name: 'Emergency Alerts', importance: N.AndroidImportance.MAX, vibrationPattern: [0, 400, 200, 400, 200, 400], lightColor: '#FF0000', sound: 'default', enableLights: true, enableVibrate: true, bypassDnd: true },
      { id: CHANNEL_IDS.medical, name: 'Medical Alerts', importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 300, 150, 300], lightColor: '#1565C0', sound: 'default', enableLights: true, enableVibrate: true },
      { id: CHANNEL_IDS.security, name: 'Security Alerts', importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#D50000', sound: 'default', enableLights: true, enableVibrate: true },
      { id: CHANNEL_IDS.general, name: 'General Notifications', importance: N.AndroidImportance.DEFAULT, sound: 'default' },
    ];
    for (const ch of channels) {
      await N.setNotificationChannelAsync(ch.id, ch as any);
    }
  } catch (e) {
    console.warn('Channel setup error:', e);
  }
};

// ─── Permission request ───────────────────────────────────────────────────────
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    const N = getN();
    if (!N) return false;
    const { status: existing } = await N.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true },
    });
    return status === 'granted';
  } catch {
    return false;
  }
};

// ─── Register for push notifications ─────────────────────────────────────────
export const registerForPushNotificationsAsync = async (): Promise<string | null> => {
  try {
    const N = getN();
    if (!N) {
      console.log('⚠️ expo-notifications not available (Expo Go SDK 53+)');
      return null;
    }

    await setupNotificationChannels();

    if (!Device.isDevice) {
      console.log('⚠️ Push notifications require a physical device');
      return null;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      console.warn('❌ Notification permission denied');
      return null;
    }

    const projectId =
      (process.env.EXPO_PUBLIC_EAS_PROJECT_ID as string) || 'safety-management-system-4faf0';

    // getExpoPushTokenAsync throws in Expo Go SDK 53+ — catch silently
    let token: string;
    try {
      const tokenData = await N.getExpoPushTokenAsync({ projectId });
      token = tokenData.data;
    } catch (tokenErr: any) {
      // Expo Go SDK 53+ removed remote push — local notifications still work
      console.log('⚠️ Remote push unavailable (Expo Go). Local notifications active.');
      return null;
    }

    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    await saveFCMTokenToFirestore(token);

    console.log('✅ Push token registered:', token.substring(0, 30) + '…');
    return token;
  } catch (error: any) {
    // Silently skip — don't log the Expo Go SDK 53 warning to console
    if (!error.message?.includes('removed from Expo Go')) {
      console.warn('⚠️ Push registration skipped:', error.message);
    }
    return null;
  }
};

// ─── Save token to Firestore ──────────────────────────────────────────────────
export const saveFCMTokenToFirestore = async (token: string): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    const update = {
      fcmToken: token,
      fcmTokens: arrayUnion(token),
      lastFcmTokenUpdate: new Date().toISOString(),
      platform: Platform.OS,
    };
    if (snap.exists()) {
      await updateDoc(ref, update);
    } else {
      await setDoc(ref, { email: user.email, displayName: user.displayName || user.email, role: 'student', createdAt: new Date().toISOString(), ...update });
    }
  } catch (e: any) {
    console.error('❌ Error saving FCM token:', e.message);
  }
};

// ─── Remove token on logout ───────────────────────────────────────────────────
export const removeFCMTokenFromFirestore = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const stored = await AsyncStorage.getItem(FCM_TOKEN_KEY);
    if (!stored) return;
    const ref = doc(db, 'users', user.uid);
    await updateDoc(ref, { fcmToken: null, fcmTokens: arrayRemove(stored), lastFcmTokenUpdate: new Date().toISOString() });
    await AsyncStorage.removeItem(FCM_TOKEN_KEY);
  } catch (e: any) {
    console.error('❌ Error removing FCM token:', e.message);
  }
};

// ─── Send local notification (immediate) ─────────────────────────────────────
export const sendLocalNotification = async (
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<string | null> => {
  try {
    const N = getN();
    if (!N) return null;

    const type = (data?.type as string) || 'general';
    const severity = (data?.severity as string) || '';

    let channelId = CHANNEL_IDS.general;
    if (type.includes('emergency') || type.includes('sos') || severity === 'critical') {
      channelId = CHANNEL_IDS.emergency;
    } else if (type.includes('medical') || type.includes('health') || type.includes('ambulance')) {
      channelId = CHANNEL_IDS.medical;
    } else if (type.includes('security') || type.includes('alert')) {
      channelId = CHANNEL_IDS.security;
    }

    const id = await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: N.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android' ? { channelId } : {}),
        badge: 1,
      },
      trigger: null,
    });
    return id;
  } catch (error: any) {
    console.warn('⚠️ Local notification skipped:', error.message);
    return null;
  }
};

// ─── Badge management ─────────────────────────────────────────────────────────
export const setBadgeCounter = async (count: number): Promise<void> => {
  try { await getN()?.setBadgeCountAsync(count); } catch { /* ignore */ }
};

export const clearBadge = async (): Promise<void> => {
  try { await getN()?.setBadgeCountAsync(0); } catch { /* ignore */ }
};

export const getBadgeCounter = async (): Promise<number> => {
  try { return (await getN()?.getBadgeCountAsync()) ?? 0; } catch { return 0; }
};

// ─── Permission status ────────────────────────────────────────────────────────
export const getNotificationPermissionStatus = async (): Promise<'granted' | 'denied' | 'undetermined'> => {
  try {
    const result = await getN()?.getPermissionsAsync();
    return (result?.status as any) ?? 'undetermined';
  } catch {
    return 'undetermined';
  }
};

export default {
  registerForPushNotificationsAsync,
  saveFCMTokenToFirestore,
  removeFCMTokenFromFirestore,
  sendLocalNotification,
  setupNotificationChannels,
  setupNotificationHandler,
  requestNotificationPermission,
  setBadgeCounter,
  clearBadge,
  getBadgeCounter,
  getNotificationPermissionStatus,
};
