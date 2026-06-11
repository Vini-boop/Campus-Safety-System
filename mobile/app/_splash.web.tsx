import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, getIdToken, auth } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRouteForRole, USER_ROLES } from '@/utils/roleUtils';
import { api } from '@/services/api';
import { useFonts, Montserrat_800ExtraBold_Italic } from '@expo-google-fonts/montserrat';

const AUTH_READY_TIMEOUT_MS = 3500;
const SESSION_RESTORE_EXTRA_MS = 2500;
const MIN_LOADING_TIME = 1500;

// Web: sessionStorage is cleared on tab close / server restart
let _webSessionMarked = false;

function isNewWebSession(): boolean {
  if (_webSessionMarked) return false;
  if (typeof sessionStorage !== 'undefined') {
    if (!sessionStorage.getItem('_jsSession')) {
      sessionStorage.setItem('_jsSession', '1');
      _webSessionMarked = true;
      return true;
    }
  }
  _webSessionMarked = true;
  return false;
}

async function resolveInitialAuthUser(): Promise<typeof auth.currentUser> {
  const authMod = auth as { authStateReady?: () => Promise<void> };
  try {
    if (typeof authMod.authStateReady === 'function') {
      await Promise.race([
        authMod.authStateReady(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('authStateReady timeout')), AUTH_READY_TIMEOUT_MS)
        ),
      ]);
    }
  } catch {
    // continue
  }

  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (user: typeof auth.currentUser) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { unsub(); } catch { /* noop */ }
      resolve(user ?? auth.currentUser);
    };
    const unsub = onAuthStateChanged(auth, (user) => { if (user) finish(user); });
    const timer = setTimeout(() => finish(auth.currentUser), SESSION_RESTORE_EXTRA_MS);
  });
}

export default function CustomSplashScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<'splash' | 'loading'>('splash');
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Starting...');
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  const entranceRunRef = useRef(false);

  const [fontsLoaded, fontError] = useFonts({ Montserrat_800ExtraBold_Italic });

  // Web-safe animations — useNativeDriver: false
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;

  const runEntranceAnimations = () => {
    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // web requires false
    }).start();
  };

  const runSpinAnimation = () => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: false, // web requires false
      })
    ).start();
  };

  const navigate = (route: string) => {
    try {
      router.replace(route as any);
    } catch {
      try { router.replace('/(auth)/login' as any); } catch { /* stay */ }
    }
  };

  // Check first-time status once on mount
  useEffect(() => {
    const check = async () => {
      try {
        // New web session (server restart / tab close) → treat as first-timer
        if (isNewWebSession()) {
          await AsyncStorage.multiRemove(['hasOpenedApp', 'hasCompletedOnboarding']);
          setIsFirstTime(true);
          return;
        }
        const completed = await AsyncStorage.getItem('hasCompletedOnboarding');
        if (completed === 'true') {
          setIsFirstTime(false);
        } else {
          const opened = await AsyncStorage.getItem('hasOpenedApp');
          setIsFirstTime(opened === null);
        }
      } catch {
        setIsFirstTime(true);
      }
    };
    check();
  }, []);

  // Main auth + navigation logic
  useEffect(() => {
    if (isFirstTime === null || (!fontsLoaded && !fontError) || entranceRunRef.current) return;
    entranceRunRef.current = true;

    runEntranceAnimations();

    setTimeout(async () => {
      setPhase('loading');
      setShowLoadingScreen(true);
      runSpinAnimation();

      const startTime = Date.now();

      try {
        const currentUser = await resolveInitialAuthUser();

        // First-time, no user → onboarding
        if (!currentUser && isFirstTime) {
          await AsyncStorage.setItem('hasOpenedApp', 'true');
          const elapsed = Date.now() - startTime;
          if (elapsed < MIN_LOADING_TIME) await new Promise(r => setTimeout(r, MIN_LOADING_TIME - elapsed));
          navigate('/(auth)/onboarding');
          return;
        }

        if (currentUser) {
          // Load cached role immediately as fallback
          let userRole = USER_ROLES.STUDENT;
          try {
            const cached = await AsyncStorage.getItem('userData');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed.role) userRole = parsed.role;
            }
          } catch { /* ignore */ }

          // Single backend attempt — non-blocking
          try {
            const idToken = await getIdToken(currentUser);
            const response = await api.verifyToken(idToken);
            if (response.status >= 200 && response.status < 300 && response.data?.data?.user) {
              const backendUser = response.data.data.user;
              userRole = backendUser.role || userRole;
              await AsyncStorage.setItem('userData', JSON.stringify({
                uid: currentUser.uid,
                email: currentUser.email || '',
                role: userRole,
                displayName: backendUser.displayName || currentUser.displayName || '',
                photoURL: backendUser.photoURL || '',
                idToken,
              }));
            }
          } catch {
            // Backend unavailable — use cached role, no retries
          }

          await AsyncStorage.setItem('hasOpenedApp', 'true');
          const elapsed = Date.now() - startTime;
          if (elapsed < MIN_LOADING_TIME) await new Promise(r => setTimeout(r, MIN_LOADING_TIME - elapsed));
          navigate(getRouteForRole(userRole));
        } else {
          // No user — clear stale cache and go to login
          await AsyncStorage.multiRemove(['userData', 'userRole', 'authToken']);
          const elapsed = Date.now() - startTime;
          if (elapsed < MIN_LOADING_TIME) await new Promise(r => setTimeout(r, MIN_LOADING_TIME - elapsed));
          navigate('/(auth)/login');
        }
      } catch {
        // Critical error — go to login
        navigate('/(auth)/login');
      }
    }, 2500); // branding display time
  }, [isFirstTime, fontsLoaded, fontError]);

  // Loading messages
  useEffect(() => {
    if (phase !== 'loading' || isFirstTime === null) return;
    const messages = isFirstTime
      ? ['Welcome to Campus Safety…', 'Getting things ready…', 'One moment…']
      : ['Welcome back…', 'Securing your session…', 'Loading your home…'];
    setLoadingMessage(messages[0]);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setLoadingMessage(messages[i % messages.length]);
    }, 1500);
    return () => clearInterval(interval);
  }, [phase, isFirstTime]);

  if (!fontsLoaded && !fontError) return null;

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.gradient}>
        {/* Branding */}
        <Animated.View style={[styles.textContainer, { opacity: logoOpacity }]}>
          <Text style={styles.titleLine1}>Campus</Text>
          <Text style={styles.titleLine2}>Safety</Text>
        </Animated.View>

        {/* Loading indicator */}
        {phase === 'loading' && showLoadingScreen && (
          <View style={styles.loaderBottomContainer}>
            <Animated.View
              style={[styles.spinnerContainer, { width: 30, height: 30, transform: [{ rotate: spin }] }]}
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    transform: [{ rotate: `${i * 60}deg` }],
                  }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }} />
                </View>
              ))}
            </Animated.View>
            <Text style={styles.loadingText}>{loadingMessage}</Text>
            <Text style={styles.poweredByText}>Powered by Simbariu</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: {
    flex: 1,
    backgroundColor: '#0C156D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: { alignItems: 'center', justifyContent: 'center' },
  titleLine1: {
    fontFamily: 'Montserrat_800ExtraBold_Italic',
    fontSize: 56,
    color: '#FFFFFF',
    letterSpacing: 1,
    lineHeight: 56,
    textAlign: 'center',
  },
  titleLine2: {
    fontFamily: 'Montserrat_800ExtraBold_Italic',
    fontSize: 56,
    color: '#FFFFFF',
    letterSpacing: 1,
    lineHeight: 56,
    textAlign: 'center',
  },
  loaderBottomContainer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerContainer: { marginBottom: 24 },
  loadingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  poweredByText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    opacity: 0.7,
  },
});
