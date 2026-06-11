/**
 * FirebaseConnectivityMonitor
 *
 * Compact network banner that:
 * - Shows ONLY when the device is actually offline (no internet)
 * - Disappears automatically as soon as connectivity restores
 * - Never runs heavy Firebase connectivity tests on mount
 * - Does NOT pop Alert dialogs
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

interface ConnectivityMonitorProps {
  /** Legacy prop — kept for backward compatibility, not used */
  showDetails?: boolean;
  /** Legacy prop — kept for backward compatibility, not used */
  autoTest?: boolean;
}

export default function FirebaseConnectivityMonitor(_props: ConnectivityMonitorProps) {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false); // for "back online" flash
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-60)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = (offline: boolean) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (offline) {
      setIsOffline(true);
      setWasOffline(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      ]).start();
    } else {
      // Was offline, now online → briefly flash "Back online" then hide
      setIsOffline(false);
      if (wasOffline) {
        // keep banner visible for 2s with "back online" message then animate out
        hideTimerRef.current = setTimeout(() => {
          setWasOffline(false);
          Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: -60, duration: 400, useNativeDriver: true }),
          ]).start();
        }, 2000);
      }
    }
  };

  useEffect(() => {
    // Subscribe to real network state changes
    const unsub = NetInfo.addEventListener(state => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      showBanner(!connected);
    });

    // Initial check
    NetInfo.fetch().then(state => {
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      if (!connected) showBanner(true);
    });

    return () => {
      unsub();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Nothing to show — connected and never was offline this session
  if (!isOffline && !wasOffline) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        isOffline ? styles.offlineBanner : styles.onlineBanner,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={isOffline ? 'cloud-offline-outline' : 'cloud-done-outline'}
        size={16}
        color="#fff"
      />
      <Text style={styles.text}>
        {isOffline
          ? 'No internet connection · Check your Wi-Fi or data'
          : 'Back online'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  offlineBanner: {
    backgroundColor: '#B71C1C',
  },
  onlineBanner: {
    backgroundColor: '#2E7D32',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
