import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth, signOut } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserRole } from '@/hooks/useUserRole';
import { logAppError } from '@/utils/errorReporting';

export default function ProfileScreen() {
  const router = useRouter();
  const canGoBack = router.canGoBack();
  const { user, userProfile, isAuthenticated, authLoading, refreshAuthData } = useAuth();
  const { clearUserData } = useUserRole();

  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPressedRef = useRef(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    if (logoutPressedRef.current) return;
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out', style: 'destructive',
        onPress: async () => {
          logoutPressedRef.current = true;
          try {
            setLoggingOut(true);
            await signOut(auth);
            await clearUserData();
            await AsyncStorage.multiRemove(['userData', 'userRole', 'authToken', 'idToken', 'refreshToken']);
            router.replace('/(auth)/login');
          } catch (error: any) {
            await logAppError(error, 'handleLogout');
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          } finally {
            setLoggingOut(false);
            logoutPressedRef.current = false;
          }
        },
      },
    ]);
  };

  // ── Menu navigation ───────────────────────────────────────────────────────
  const handleMenu = useCallback(async (item: string) => {
    if (loading) return;
    try {
      if (['change-password', 'personal-info'].includes(item)) {
        await refreshAuthData();
        if (!isAuthenticated || !user) { router.replace('/(auth)/login'); return; }
      }
      switch (item) {
        case 'personal-info': router.push('/(tabs)/personal-info'); break;
        case 'update-profile': router.push('/update-profile' as any); break;
        case 'change-password': router.push('/(tabs)/change-password'); break;
        case 'notification-prefs': router.push('/(tabs)/notification-preferences'); break;
        case 'settings': router.push('/(tabs)/settings'); break;
      }
    } catch (error: any) {
      await logAppError(error, 'handleMenu', { item });
    }
  }, [loading, isAuthenticated, user, refreshAuthData, router]);

  // ── Derived values ────────────────────────────────────────────────────────
  const displayName = userProfile?.fullName || userProfile?.displayName || 'User';
  const initial = displayName[0].toUpperCase();
  const verStatus = userProfile?.verificationStatus ||
    (userProfile?.isApproved ? 'approved' : userProfile?.isProfileComplete ? 'pending' : 'unverified');
  const badgeCfg =
    verStatus === 'approved'
      ? { label: 'Verified', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: 'checkmark-circle' }
      : verStatus === 'pending'
        ? { label: 'Pending Approval', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: 'time' }
        : verStatus === 'rejected'
          ? { label: 'Verification Rejected', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: 'close-circle' }
          : { label: 'Not Verified', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: 'shield-outline' };

  // ── Loading / unauthenticated ─────────────────────────────────────────────
  if (authLoading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color="#0C156D" />
          <Text style={s.loadingText}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!isAuthenticated) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Header */}
      <SafeAreaView edges={['top']} style={s.headerWrap}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.backBtn, !canGoBack && { opacity: 0, pointerEvents: 'none' }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={!canGoBack}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Profile</Text>
          <View style={{ width: 44 }} />
        </View>
      </SafeAreaView>

      {/* Body */}
      <View style={s.body}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Avatar + name */}
          <View style={s.avatarSection}>
            <View style={s.avatar}>
              <Text style={s.avatarInitial}>{initial}</Text>
            </View>
            <Text style={s.userName}>{displayName}</Text>

            {/* Verification badge — students only */}
            {userProfile?.role === 'student' && (
              <>
                <View style={[s.badge, { backgroundColor: badgeCfg.bg, borderColor: badgeCfg.border }]}>
                  <Ionicons name={badgeCfg.icon as any} size={13} color={badgeCfg.color} />
                  <Text style={[s.badgeText, { color: badgeCfg.color }]}>{badgeCfg.label}</Text>
                </View>
                {/* Action hint for non-approved states */}
                {verStatus === 'pending' && (
                  <Text style={s.verHint}>Awaiting admin review — usually 24–48 hrs</Text>
                )}
                {verStatus === 'rejected' && (
                  <TouchableOpacity onPress={() => handleMenu('update-profile')} style={s.verAction}>
                    <Ionicons name="refresh-outline" size={13} color="#DC2626" />
                    <Text style={[s.verHint, { color: '#DC2626' }]}>Tap to resubmit verification</Text>
                  </TouchableOpacity>
                )}
                {(verStatus === 'unverified' || !userProfile?.isProfileComplete) && (
                  <TouchableOpacity onPress={() => handleMenu('update-profile')} style={s.verAction}>
                    <Ionicons name="shield-checkmark-outline" size={13} color="#0C156D" />
                    <Text style={[s.verHint, { color: '#0C156D' }]}>Tap to verify your Reg No.</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Settings card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Account Settings</Text>

            <MenuItem icon="person-outline" label="Personal Information" onPress={() => handleMenu('personal-info')} />
            <MenuItem icon="shield-checkmark-outline" label={userProfile?.isProfileComplete ? 'Update Reg No. / Phone' : 'Verify Student Reg No.'} onPress={() => handleMenu('update-profile')} />
            <MenuItem icon="lock-closed-outline" label="Change Password" onPress={() => handleMenu('change-password')} />
            <MenuItem icon="notifications-outline" label="Notification Preferences" onPress={() => handleMenu('notification-prefs')} />
            <MenuItem icon="settings-outline" label="Settings" onPress={() => handleMenu('settings')} last />
          </View>

          {/* Logout */}
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loggingOut} activeOpacity={0.8}>
            {loggingOut
              ? <ActivityIndicator size="small" color="#FFF" />
              : <><Ionicons name="log-out-outline" size={20} color="#FFF" /><Text style={s.logoutText}>Log Out</Text></>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── MenuItem helper ──────────────────────────────────────────────────────────
function MenuItem({ icon, label, onPress, last = false }: {
  icon: string; label: string; onPress: () => void; last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.menuItem, last && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.menuIcon}>
        <Ionicons name={icon as any} size={18} color="#0C156D" />
      </View>
      <Text style={s.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0C156D' },
  container: { flex: 1, backgroundColor: '#FFF' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 15, color: '#666' },

  headerWrap: { backgroundColor: '#0C156D' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20,
  },
  backBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFF' },

  body: {
    flex: 1, backgroundColor: '#F5F6FA',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
  },

  avatarSection: { alignItems: 'center', paddingTop: 28, paddingBottom: 20 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#0C156D',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarInitial: { fontSize: 34, fontWeight: '800', color: '#FFF' },
  userName: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 8 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  verHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },
  verAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },

  card: {
    backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, marginBottom: 14,
  },
  cardTitle: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },

  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  menuIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, color: '#1F2937', fontWeight: '500' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#DC2626', marginHorizontal: 16, borderRadius: 14,
    paddingVertical: 15, marginTop: 4,
    shadowColor: '#DC2626', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  logoutText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
