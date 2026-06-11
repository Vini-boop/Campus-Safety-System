/**
 * notifications.tsx
 *
 * Aggregates notifications from all admin sources in real-time:
 *   • notifications       — user-specific (userId == uid): verification, doctor replies,
 *                           ambulance dispatch, security alerts sent to student
 *   • area_alerts         — security zone alerts (broadcast to all)
 *   • health_advisories   — medical advisories (broadcast to all, active == true)
 *
 * Marking as read: sets `read: true` on the `notifications` doc.
 * Area alerts and health advisories are read-only (no per-user read state).
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, updateDoc, doc, writeBatch,
  type QuerySnapshot, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_VISITED_KEY = 'notifications_last_visited_ms';

// ─── Types ────────────────────────────────────────────────────────────────────
interface NotifItem {
  id: string;
  source: 'user' | 'security' | 'medical';
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: Date;
  severity?: string;
  area?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDate(v: any): Date {
  if (!v) return new Date();
  if (v.toDate) return v.toDate();
  if (v.seconds) return new Date(v.seconds * 1000);
  return new Date(v);
}

function typeIcon(type: string, source: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('ambulance') || t === 'ambulance_dispatched') return '🚑';
  if (t.includes('doctor_reply') || t.includes('doctor') || t.includes('chat')) return '💬';
  if (t.includes('sos') || t.includes('emergency')) return '🚨';
  if (t.includes('medical') || source === 'medical') return '🏥';
  if (t.includes('security') || source === 'security') return '🛡️';
  if (t.includes('verification')) return '📋';
  if (t.includes('verification_approved')) return '✅';
  if (t.includes('verification_rejected')) return '❌';
  if (t.includes('report')) return '📝';
  return '🔔';
}

function severityColor(type?: string, severity?: string, source?: string): string {
  const t = (type || '').toLowerCase();
  if (t === 'ambulance_dispatched' || t.includes('ambulance')) return '#EA580C';
  if (t.includes('doctor_reply') || t.includes('chat')) return '#2563EB';
  if (t.includes('sos') || t.includes('emergency') || severity === 'critical') return '#DC2626';
  if (severity === 'high' || source === 'security') return '#EA580C';
  if (t.includes('verification_approved')) return '#16A34A';
  if (t.includes('verification_rejected')) return '#DC2626';
  if (severity === 'medium' || source === 'medical') return '#2563EB';
  return '#0C156D';
}

function sourceLabel(type: string, source: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('doctor_reply') || t.includes('chat')) return 'Medical';
  if (t === 'ambulance_dispatched' || t.includes('ambulance')) return 'Medical';
  if (t.includes('verification')) return 'Admin';
  if (source === 'security') return 'Security';
  if (source === 'medical') return 'Medical';
  return 'Admin';
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Stamp visit time on mount so the bell badge clears for broadcasts
  useEffect(() => {
    AsyncStorage.setItem(LAST_VISITED_KEY, Date.now().toString()).catch(() => { });
  }, []);

  // Merge helper — keeps a stable sorted list
  const merge = useCallback((incoming: NotifItem[], source: NotifItem['source']) => {
    setItems(prev => {
      const map = new Map(prev.map(n => [n.id, n]));
      // Remove old entries from this source then re-add fresh ones
      for (const [k, v] of map) { if (v.source === source) map.delete(k); }
      incoming.forEach(n => map.set(n.id, n));
      return Array.from(map.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    });
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }

    // ── 1. User-specific notifications ──────────────────────────────────────
    // Covers: verification approved/rejected, doctor replies, ambulance dispatch,
    // security alerts sent directly to this student by any admin dashboard.
    const q1 = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const unsub1 = onSnapshot(q1, (snap: QuerySnapshot<DocumentData>) => {
      const docs: NotifItem[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        return {
          id: d.id,
          source: 'user',
          title: data.title || 'Notification',
          message: data.message || '',
          type: data.type || 'info',
          read: data.read === true,
          createdAt: toDate(data.createdAt),
          severity: data.severity,
        };
      });
      merge(docs, 'user');
      setLoading(false);
    }, () => setLoading(false));

    // ── 2. Security area alerts (broadcast) ──────────────────────────────────
    const q2 = query(
      collection(db, 'area_alerts'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub2 = onSnapshot(q2, (snap: QuerySnapshot<DocumentData>) => {
      const docs: NotifItem[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        return {
          id: `area_${d.id}`,
          source: 'security',
          title: data.title || 'Security Alert',
          message: data.description || data.message || '',
          type: 'security_alert',
          read: true, // broadcast — no per-user read state
          createdAt: toDate(data.createdAt),
          severity: data.severity,
          area: data.area,
        };
      });
      merge(docs, 'security');
    }, () => { });

    // ── 3. Health advisories (broadcast) ────────────────────────────────────
    const q3 = query(
      collection(db, 'health_advisories'),
      where('active', '==', true),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub3 = onSnapshot(q3, (snap: QuerySnapshot<DocumentData>) => {
      const docs: NotifItem[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        return {
          id: `health_${d.id}`,
          source: 'medical',
          title: data.title || 'Health Advisory',
          message: data.message || '',
          type: 'health_advisory',
          read: true, // broadcast
          createdAt: toDate(data.createdAt),
          severity: data.severity,
        };
      });
      merge(docs, 'medical');
    }, () => { });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [merge]);

  // Mark single notification as read (only user-specific ones)
  const markRead = async (item: NotifItem) => {
    if (item.read || item.source !== 'user') return;
    try {
      await updateDoc(doc(db, 'notifications', item.id), { read: true });
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
    } catch { /* ignore */ }
  };

  // Mark all user notifications as read
  const markAllRead = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const unread = items.filter(n => n.source === 'user' && !n.read);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
      await batch.commit();
      setItems(prev => prev.map(n => n.source === 'user' ? { ...n, read: true } : n));
    } catch { /* ignore */ }
  };

  const displayed = filter === 'unread' ? items.filter(n => !n.read) : items;
  const unreadCount = items.filter(n => !n.read).length;

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Notifications</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {/* Filter tabs */}
      <View style={s.tabs}>
        {(['all', 'unread'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.tab, filter === f && s.tabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.tabText, filter === f && s.tabTextActive]}>
              {f === 'all' ? 'All' : `Unread (${unreadCount})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { }} tintColor="#FFF" />}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={56} color="rgba(255,255,255,0.3)" />
            <Text style={s.emptyTitle}>No notifications</Text>
            <Text style={s.emptyText}>
              {filter === 'unread'
                ? 'All caught up!'
                : 'Notifications from security, medical and admin will appear here.'}
            </Text>
          </View>
        ) : (
          displayed.map(item => {
            const color = severityColor(item.type, item.severity, item.source);
            const label = sourceLabel(item.type, item.source);
            return (
              <TouchableOpacity
                key={item.id}
                style={[s.card, !item.read && s.cardUnread]}
                onPress={() => markRead(item)}
                activeOpacity={0.75}
              >
                {/* Left accent bar */}
                <View style={[s.accent, { backgroundColor: color }]} />

                {/* Icon */}
                <View style={[s.iconWrap, { backgroundColor: color + '22' }]}>
                  <Text style={s.iconText}>{typeIcon(item.type, item.source)}</Text>
                </View>

                {/* Content */}
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                    {!item.read && <View style={s.dot} />}
                  </View>
                  <Text style={s.cardMsg} numberOfLines={3}>{item.message}</Text>
                  <View style={s.cardFooter}>
                    <Text style={s.cardTime}>{timeAgo(item.createdAt)}</Text>
                    {item.area && (
                      <View style={s.areaTag}>
                        <Ionicons name="location" size={10} color={color} />
                        <Text style={[s.areaText, { color }]}>{item.area}</Text>
                      </View>
                    )}
                    <View style={[s.sourceTag, { backgroundColor: color + '22' }]}>
                      <Text style={[s.sourceText, { color }]}>{label}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C156D' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  markAll: { fontSize: 12, fontWeight: '700', color: '#93C5FD' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  tabs: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 10, gap: 10 },
  tab: {
    paddingHorizontal: 18, paddingVertical: 7,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  tabTextActive: { color: '#0C156D' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardUnread: {
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  accent: { width: 4, alignSelf: 'stretch' },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    margin: 12, marginRight: 0, flexShrink: 0,
  },
  iconText: { fontSize: 20 },
  cardBody: { flex: 1, padding: 12, paddingLeft: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#FFF' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#60A5FA', marginLeft: 6 },
  cardMsg: { fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 17, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTime: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  areaTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  areaText: { fontSize: 10, fontWeight: '600' },
  sourceTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  sourceText: { fontSize: 10, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },
});
