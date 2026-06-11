import React from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, StyleSheet } from 'react-native';
import { CustomSpinner } from './CustomSpinner';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, authLoading, user, userProfile } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const profileCheckDone = React.useRef(false);

  React.useEffect(() => {
    if (authLoading) return;

    if (user) {
      // Check if student needs profile update once profile is available
      if (userProfile?.role === 'student' && !profileCheckDone.current) {
        profileCheckDone.current = true;
        const currentRoute = segments.join('/');
        const isProfileRoute = currentRoute.includes('update-profile');
        const isAuthRoute = currentRoute.includes('(auth)');

        AsyncStorage.getItem('needsProfileUpdate').then((flag) => {
          if (flag === 'true' && !isProfileRoute && !isAuthRoute) {
            router.replace('/(tabs)/update-profile');
          }
        }).catch(() => { /* ignore */ });
      }
    } else {
      // Not authenticated — redirect to login
      router.replace('/(auth)/login');
    }
  }, [authLoading, user, userProfile, router, segments]);

  // CRITICAL: Always render children so the Tabs navigator mounts.
  // Expo Router requires the navigator to always be in the tree.
  // We overlay a loading screen on top when auth is still resolving.
  return (
    <View style={styles.container}>
      {/* Always render the navigator */}
      {children}

      {/* Overlay spinner while auth is loading */}
      {authLoading && (
        <View style={styles.overlay}>
          <CustomSpinner />
        </View>
      )}

      {/* Overlay blank screen if not authenticated (redirect fires via useEffect) */}
      {!authLoading && !isAuthenticated && (
        <View style={styles.overlay} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C156D',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
});
