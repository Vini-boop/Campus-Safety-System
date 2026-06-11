import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { AuthProvider } from '@/contexts/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LogBox, Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { useState } from 'react';
import { Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome, Feather } from '@expo/vector-icons';
import {
  registerForPushNotificationsAsync,
  setupNotificationChannels,
  setupNotificationHandler,
  sendLocalNotification,
  clearBadge,
} from '@/services/fcmService';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/services/firebase';

// Lazy-load expo-notifications to avoid Expo Go SDK 53 crash
type NotifModule = typeof import('expo-notifications');
let Notifications: NotifModule | null = null;
try { Notifications = require('expo-notifications'); } catch { /* Expo Go SDK 53+ */ }

// Suppress known non-critical warnings
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  'expo-notifications: iOS Push notifications',
  'expo-notifications: Listening to push token',
  'expo-notifications: Android Push notifications (remote notifications) functionality',
  'expo-notifications: Push notifications',
  '"shadow*" style props are deprecated',
  'shadow* style props are deprecated',
  'Non-serializable values were found in the navigation state',
]);

export const unstable_settings = {
  initialRouteName: '_splash',
};

// ─── Firestore → local notification bridge ────────────────────────────────────
// Watches the notifications collection for new unread docs and fires
// a local notification so it appears in the Android/iOS notification bar.
// Also replays unread notifications when internet is restored after being offline.
function FirestoreNotificationWatcher() {
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const wasOfflineRef = useRef(false);

  const fireForDoc = (id: string, data: Record<string, any>) => {
    if (seenRef.current.has(id)) return;
    seenRef.current.add(id);
    const title = data.title || 'Campus Safety';
    const body = data.message || '';
    const type = data.type || 'general';
    sendLocalNotification(title, body, { type, notificationId: id }).catch(() => { });
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      // On first snapshot, seed the seen set so we don't replay ALL existing ones
      if (!initializedRef.current) {
        snap.docs.forEach(d => seenRef.current.add(d.id));
        initializedRef.current = true;
        return;
      }

      // Fire for each genuinely new added doc
      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        fireForDoc(change.doc.id, change.doc.data() as Record<string, any>);
      });
    }, () => { /* ignore errors */ });

    // ── When internet comes back, replay unread notifications ──────────────
    // @ts-ignore
    const netUnsub = require('@react-native-community/netinfo').default.addEventListener(
      (state: any) => {
        const connected = state.isConnected === true && state.isInternetReachable !== false;
        if (!connected) {
          wasOfflineRef.current = true;
          return;
        }
        if (!wasOfflineRef.current) return;
        wasOfflineRef.current = false;

        // Re-query unread notifications and fire any we haven't seen yet
        import('firebase/firestore').then(({ getDocs }) => {
          getDocs(q).then(snapshot => {
            snapshot.docs.forEach(d => {
              fireForDoc(d.id, d.data() as Record<string, any>);
            });
          }).catch(() => { });
        }).catch(() => { });
      }
    );

    return () => {
      unsub();
      netUnsub();
    };
  }, []);

  return null;
}

// ─── Notification tap handler ─────────────────────────────────────────────────
function NotificationHandler() {
  const router = useRouter();
  const responseListener = useRef<any>(null);
  const foregroundListener = useRef<any>(null);

  useEffect(() => {
    // Setup notification handler (safe — no-ops if Expo Go SDK 53+)
    setupNotificationHandler();

    // Setup channels on Android
    if (Platform.OS === 'android') {
      setupNotificationChannels().catch(() => { });
    }

    // Register for push notifications (non-blocking, safe)
    registerForPushNotificationsAsync().catch(() => { });

    if (!Notifications) return; // Expo Go SDK 53+ — skip listeners

    // ── Foreground notification listener ──────────────────────────────────────
    foregroundListener.current = Notifications.addNotificationReceivedListener(notification => {
      const type = notification.request.content.data?.type as string || '';
      console.log('📬 Notification received (foreground):', type);
    });

    // ── Notification tap/response listener ────────────────────────────────────
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, any>;
      const type = (data?.type as string) || '';
      console.log('👆 Notification tapped:', type, data);
      clearBadge().catch(() => { });
      try {
        if (type.includes('ambulance') || type.includes('emergency')) {
          router.push('/(tabs)/report');
        } else if (type === 'chat_message') {
          router.push('/(tabs)/doctor-chat');
        } else if (type === 'report_status_update') {
          router.push('/(tabs)/report');
        } else {
          // All other notifications → notification centre
          router.push('/notifications');
        }
      } catch { /* navigation not ready */ }
    });

    // ── Handle notification that launched the app ─────────────────────────────
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, any>;
      const type = (data?.type as string) || '';
      clearBadge().catch(() => { });
      try {
        if (type.includes('ambulance') || type.includes('emergency')) {
          router.push('/(tabs)/report');
        } else if (type === 'chat_message') {
          router.push('/(tabs)/doctor-chat');
        } else {
          router.push('/notifications');
        }
      } catch { /* ignore */ }
    }).catch(() => { });

    return () => {
      foregroundListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      ...Ionicons.font,
      ...MaterialIcons.font,
      ...MaterialCommunityIcons.font,
      ...FontAwesome.font,
      ...Feather.font,
    })
      .catch(() => { /* non-fatal — icons fall back to squares */ })
      .finally(() => setFontsLoaded(true));
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <NotificationHandler />
          <FirestoreNotificationWatcher />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="_splash" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="update-profile" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="pending-approval" />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
          <StatusBar style="auto" translucent={false} />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
