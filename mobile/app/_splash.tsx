/**
 * _splash.tsx — Single source of truth for app startup navigation.
 *
 * Flow:
 *   First install  → Splash → Onboarding → Auth → Home
 *   After login    → Splash → Home
 *   Dev reload     → Splash → Home (if logged in) | Onboarding (treated as first-timer)
 *   Reopen app     → Splash → Home (if logged in) | Onboarding/Login
 *   Not logged in  → Splash → Onboarding or Login
 *
 * Keys used (AsyncStorage):
 *   hasLaunchedBefore      — set on first ever launch
 *   hasCompletedOnboarding — set when user finishes onboarding
 *   isLoggedIn             — set to 'true' on login, 'false' on logout
 *   _jsSession             — module-level flag; absent = new JS bundle session
 */

import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { auth, onAuthStateChanged } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Montserrat_800ExtraBold_Italic } from '@expo-google-fonts/montserrat';

// ─── Timing constants ─────────────────────────────────────────────────────────
const BRANDING_MS = 2000; // how long to show the logo before loading
const MIN_LOAD_MS = 1000; // minimum spinner time for smooth UX
const FIREBASE_WAIT = 3000; // max ms to wait for Firebase auth state

// ─── Module-level session flag ────────────────────────────────────────────────
// This variable lives in the JS heap. It resets to false every time the Metro
// bundler reloads (dev server restart, Expo Go reload, cold start).
// AsyncStorage persists across reloads — so if _jsSession is absent in storage
// but this flag is false, we know it's a new JS session.
let _sessionFlagWritten = false;

async function checkIsNewSession(): Promise<boolean> {
  if (_sessionFlagWritten) return false; // already ran in this JS session

  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') {
      const exists = sessionStorage.getItem('_jsSession');
      sessionStorage.setItem('_jsSession', '1');
      _sessionFlagWritten = true;
      return !exists;
    }
    _sessionFlagWritten = true;
    return false;
  }

  // Native: _jsSession key in AsyncStorage
  const existing = await AsyncStorage.getItem('_jsSession');
  await AsyncStorage.setItem('_jsSession', '1');
  _sessionFlagWritten = true;
  return existing === null; // null = never written = new session
}

// ─── Wait for Firebase to restore auth state ─────────────────────────────────
async function waitForFirebaseUser(): Promise<any> {
  if (auth.currentUser !== undefined) return auth.currentUser;

  return new Promise((resolve) => {
    let settled = false;
    const done = (user: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { unsub(); } catch { /* noop */ }
      resolve(user ?? null);
    };
    const unsub = onAuthStateChanged(auth, (u: any) => done(u));
    const timer = setTimeout(() => done(null), FIREBASE_WAIT);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SplashScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true); // controls splash visibility
  const [loadMsg, setLoadMsg] = useState('Starting…');
  const [showSpinner, setShowSpinner] = useState(false);
  const hasNavigated = useRef(false);

  const [fontsLoaded, fontError] = useFonts({ Montserrat_800ExtraBold_Italic });
  const isNative = Platform.OS !== 'web';

  // ── Animations ──────────────────────────────────────────────────────────────
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(24)).current;
  const screenFade = useRef(new Animated.Value(1)).current;
  const spinVal = useRef(new Animated.Value(0)).current;

  const runEntrance = () => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 700, easing: Easing.out(Easing.cubic),
        useNativeDriver: isNative,
      }),
      isNative
        ? Animated.timing(titleY, {
          toValue: 0, duration: 700, delay: 150, easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
        : { start: (cb?: any) => { titleY.setValue(0); cb?.({ finished: true }); } } as any,
    ]).start();
  };

  const runSpinner = () => {
    Animated.loop(
      Animated.timing(spinVal, {
        toValue: 1, duration: 900, easing: Easing.linear,
        useNativeDriver: isNative,
      })
    ).start();
  };

  const fadeOutAndGo = (route: string) => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    Animated.timing(screenFade, {
      toValue: 0, duration: 300, easing: Easing.in(Easing.cubic),
      useNativeDriver: isNative,
    }).start(() => {
      try { router.replace(route as any); }
      catch { router.replace('/(auth)/login' as any); }
    });
  };

  // ── Loading messages ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showSpinner) return;
    const msgs = ['Loading…', 'Checking your session…', 'Almost ready…'];
    let i = 0;
    setLoadMsg(msgs[0]);
    const t = setInterval(() => { i++; setLoadMsg(msgs[i % msgs.length]); }, 1200);
    return () => clearInterval(t);
  }, [showSpinner]);

  // ── Main startup logic ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!fontsLoaded && !fontError) return; // wait for fonts

    runEntrance();

    // Show branding first, then load state
    const brandTimer = setTimeout(async () => {
      setShowSpinner(true);
      runSpinner();

      const t0 = Date.now();

      try {
        // ── 1. Detect new JS session (dev reload / cold start) ──────────────
        const isNewSession = await checkIsNewSession();

        if (isNewSession) {
          // Treat as first-timer: clear all persisted flags
          await AsyncStorage.multiRemove([
            'hasLaunchedBefore',
            'hasCompletedOnboarding',
            'isLoggedIn',
            'userData',
          ]);
        }

        // ── 2. Read persisted state ─────────────────────────────────────────
        const [hasLaunched, onboardingDone, storedLogin] = await Promise.all([
          AsyncStorage.getItem('hasLaunchedBefore'),
          AsyncStorage.getItem('hasCompletedOnboarding'),
          AsyncStorage.getItem('isLoggedIn'),
        ]);

        // ── 3. Verify actual Firebase auth state ────────────────────────────
        // We check Firebase even if isLoggedIn='true' to handle token expiry
        const firebaseUser = await waitForFirebaseUser();
        const isActuallyLoggedIn = !!firebaseUser && storedLogin === 'true';

        // If Firebase says logged out but storage says logged in → clear it
        if (!firebaseUser && storedLogin === 'true') {
          await AsyncStorage.setItem('isLoggedIn', 'false');
        }

        // ── 4. Enforce minimum loading time ────────────────────────────────
        const elapsed = Date.now() - t0;
        if (elapsed < MIN_LOAD_MS) {
          await new Promise(r => setTimeout(r, MIN_LOAD_MS - elapsed));
        }

        // ── 5. Navigate based on state ──────────────────────────────────────
        setIsLoading(false);

        if (isActuallyLoggedIn) {
          await AsyncStorage.setItem('hasLaunchedBefore', 'true');
          await AsyncStorage.setItem('hasCompletedOnboarding', 'true');

          // ── Verification gate for students ──────────────────────────────
          // Read verification state from Firestore (source of truth)
          try {
            const { getDoc, doc } = await import('firebase/firestore');
            const { db } = await import('@/services/firebase');
            const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid));

            if (userSnap.exists()) {
              const userData = userSnap.data();
              const role = userData.role || 'student';
              const profileCompleted = userData.isProfileComplete === true
                || userData.hasCompletedProfile === true;
              const isApproved = userData.isApproved === true
                || userData.verificationStatus === 'approved';

              // Persist locally so we don't re-fetch on every reload
              await AsyncStorage.setItem('profileCompleted', profileCompleted ? 'true' : 'false');
              await AsyncStorage.setItem('isApproved', isApproved ? 'true' : 'false');

              if (role === 'student') {
                if (!profileCompleted) {
                  // First time — show verification form (once only)
                  fadeOutAndGo('/update-profile');
                  return;
                }
                // Profile submitted → go to Home regardless of approval status
                // Admin reviews in background; user is not blocked
              }
            } else {
              // No Firestore doc yet — check local cache
              const localCompleted = await AsyncStorage.getItem('profileCompleted');
              if (localCompleted !== 'true') {
                fadeOutAndGo('/update-profile');
                return;
              }
            }
          } catch {
            // Firestore unavailable — fall through to home using cached state
            const localCompleted = await AsyncStorage.getItem('profileCompleted');
            if (localCompleted === 'false') {
              fadeOutAndGo('/update-profile');
              return;
            }
          }

          // All checks passed → Home
          fadeOutAndGo('/(tabs)');
          return;
        }

        if (!hasLaunched) {
          // First ever install → Onboarding
          await AsyncStorage.setItem('hasLaunchedBefore', 'true');
          fadeOutAndGo('/(auth)/onboarding');
          return;
        }

        if (onboardingDone !== 'true') {
          // Launched before but onboarding not done → Onboarding
          fadeOutAndGo('/(auth)/onboarding');
          return;
        }

        // Onboarding done, not logged in → Login
        fadeOutAndGo('/(auth)/login');

      } catch {
        // Fallback on any error
        setIsLoading(false);
        fadeOutAndGo('/(auth)/login');
      }
    }, BRANDING_MS);

    return () => clearTimeout(brandTimer);
  }, [fontsLoaded, fontError]);

  // ── Render ───────────────────────────────────────────────────────────────────
  // Return null only while fonts are loading (< 100ms typically)
  if (!fontsLoaded && !fontError) return null;

  const spinDeg = spinVal.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isWeb = Platform.OS === 'web';

  const content = (
    <View style={s.bg}>
      {/* Logo / title */}
      <Animated.View style={[
        s.titleBox,
        {
          opacity: logoOpacity,
          transform: isWeb ? [] : [{ translateY: titleY }],
        },
      ]}>
        <Text style={s.line1}>Campus</Text>
        <Text style={s.line2}>Safety</Text>
      </Animated.View>

      {/* Spinner + message */}
      {showSpinner && (
        <View style={s.loaderBox}>
          <Animated.View style={[s.spinWrap, { transform: [{ rotate: spinDeg }] }]}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={[s.dot, { transform: [{ rotate: `${i * 60}deg` }] }]}>
                <View style={s.dotInner} />
              </View>
            ))}
          </Animated.View>
          <Text style={s.msg}>{loadMsg}</Text>
          <Text style={s.powered}>Powered by Simbariu</Text>
        </View>
      )}
    </View>
  );

  if (isWeb) return <View style={s.root}>{content}</View>;

  return (
    <Animated.View style={[s.root, { opacity: screenFade }]}>
      {content}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  bg: { flex: 1, backgroundColor: '#0C156D', alignItems: 'center', justifyContent: 'center' },
  titleBox: { alignItems: 'center' },
  line1: { fontFamily: 'Montserrat_800ExtraBold_Italic', fontSize: 56, color: '#FFF', letterSpacing: 1, lineHeight: 60, textAlign: 'center' },
  line2: { fontFamily: 'Montserrat_800ExtraBold_Italic', fontSize: 56, color: '#FFF', letterSpacing: 1, lineHeight: 60, textAlign: 'center' },
  loaderBox: { position: 'absolute', bottom: 60, alignItems: 'center' },
  spinWrap: { width: 30, height: 30, marginBottom: 20 },
  dot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-start', alignItems: 'center' },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  msg: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: 6 },
  powered: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
});
