/**
 * NotificationBell.tsx
 *
 * Shows unread count from:
 *   1. `notifications` collection — user-specific (userId == uid, read == false)
 *      Covers: verification, doctor replies, ambulance dispatch, security alerts
 *   2. `area_alerts` — active security broadcasts (treated as unread until visited)
 *   3. `health_advisories` — active medical broadcasts (treated as unread until visited)
 *
 * "Visited" state for broadcasts is tracked in AsyncStorage so the badge
 * clears once the user opens the notifications screen.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, View, Text, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_VISITED_KEY = 'notifications_last_visited_ms';

export default function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  // Track when user last visited the notifications screen
  const getLastVisited = useCallback(async (): Promise<number> => {
    try {
      const val = await AsyncStorage.getItem(LAST_VISITED_KEY);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    let userUnread = 0;
    let broadcastUnread = 0;

    const updateTotal = () => setUnread(userUnread + broadcastUnread);

    // ── 1. User-specific unread notifications ────────────────────────────────
    const q1 = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false)
    );
    const unsub1 = onSnapshot(q1, snap => {
      userUnread = snap.size;
      updateTotal();
    }, () => { userUnread = 0; updateTotal(); });

    // ── 2. Broadcast alerts (area_alerts + health_advisories) ────────────────
    // Count ones created after the last time the user visited notifications
    const countBroadcasts = async () => {
      const lastVisited = await getLastVisited();

      let areaCount = 0;
      let healthCount = 0;
      let areaLoaded = false;
      let healthLoaded = false;

      const q2 = query(
        collection(db, 'area_alerts'),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const unsub2 = onSnapshot(q2, snap => {
        areaCount = snap.docs.filter(d => {
          const val = d.data().createdAt;
          const ms = val?.toDate ? val.toDate().getTime() : val?.seconds ? val.seconds * 1000 : 0;
          return ms > lastVisited;
        }).length;
        areaLoaded = true;
        if (healthLoaded) { broadcastUnread = areaCount + healthCount; updateTotal(); }
      }, () => { areaLoaded = true; if (healthLoaded) { broadcastUnread = areaCount + healthCount; updateTotal(); } });

      const q3 = query(
        collection(db, 'health_advisories'),
        where('active', '==', true),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const unsub3 = onSnapshot(q3, snap => {
        healthCount = snap.docs.filter(d => {
          const val = d.data().createdAt;
          const ms = val?.toDate ? val.toDate().getTime() : val?.seconds ? val.seconds * 1000 : 0;
          return ms > lastVisited;
        }).length;
        healthLoaded = true;
        if (areaLoaded) { broadcastUnread = areaCount + healthCount; updateTotal(); }
      }, () => { healthLoaded = true; if (areaLoaded) { broadcastUnread = areaCount + healthCount; updateTotal(); } });

      return () => { unsub2(); unsub3(); };
    };

    let broadcastCleanup: (() => void) | undefined;
    countBroadcasts().then(cleanup => { broadcastCleanup = cleanup; });

    return () => {
      unsub1();
      broadcastCleanup?.();
    };
  }, [getLastVisited]);

  // When the notifications screen is focused, stamp the visit time so
  // broadcast alerts are no longer counted as unread
  useFocusEffect(
    useCallback(() => {
      // This runs when the bell's parent screen gains focus — not ideal,
      // but the notifications screen itself stamps on mount via the effect below.
    }, [])
  );

  const handlePress = async () => {
    // Stamp visit time before navigating so broadcasts clear on return
    await AsyncStorage.setItem(LAST_VISITED_KEY, Date.now().toString());
    router.push('/notifications' as any);
  };

  return (
    <TouchableOpacity
      style={s.outer}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityLabel={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      accessibilityRole="button"
    >
      <View style={s.inner}>
        <Ionicons name="notifications" size={20} color="#FFFFFF" />
      </View>

      {unread > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  outer: {
    width: 42, height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  inner: {
    width: 34, height: 34,
    borderRadius: 17,
    backgroundColor: '#0C156D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2, right: -2,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
