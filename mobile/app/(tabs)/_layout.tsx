import { Tabs, useRouter, useSegments } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user, userProfile, authLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const profileCheckDone = React.useRef(false);

  const TAB_BAR_HEIGHT = 60 + (insets.bottom > 0 ? insets.bottom : 0);

  // Only handle sign-out while on tabs.
  // Initial navigation (first launch, login, etc.) is handled by _splash.tsx.
  React.useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    // Enforce verification gate for students — only show form if never submitted
    if (userProfile?.role === 'student' && !profileCheckDone.current) {
      profileCheckDone.current = true;
      const currentRoute = segments.join('/');
      const onUpdateProfile = currentRoute.includes('update-profile');

      const profileCompleted = userProfile.isProfileComplete === true
        || (userProfile as any).hasCompletedProfile === true;

      if (!profileCompleted && !onUpdateProfile) {
        // Never submitted — show form once
        router.replace('/update-profile');
      }
      // If submitted (regardless of approval) → stay on Home
    }
  }, [authLoading, user, userProfile, router, segments]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#0C156D',
        tabBarInactiveTintColor: '#888888',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          height: TAB_BAR_HEIGHT,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'location' : 'location-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: 'Report',
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={24} color={color} />
          ),
        }}
      />

      {/* Hidden routes — not shown in tab bar */}
      <Tabs.Screen name="personal-info" options={{ href: null }} />
      <Tabs.Screen name="change-password" options={{ href: null }} />
      <Tabs.Screen name="notification-preferences" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="admin-risk-map" options={{ href: null }} />
      <Tabs.Screen name="qr-scanner" options={{ href: null }} />
      <Tabs.Screen name="doctor-chat" options={{ href: null }} />
    </Tabs>
  );
}
