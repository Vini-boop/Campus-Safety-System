import React from 'react';
import {
  ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/services/firebase';

// ─── Read-only info row ───────────────────────────────────────────────────────
function InfoRow({
  icon, label, value, mono = false,
}: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon as any} size={18} color="#0C156D" />
      </View>
      <View style={s.infoText}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, mono && s.mono]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Verification badge ───────────────────────────────────────────────────────
function VerificationBadge({ status }: { status: string }) {
  const cfg =
    status === 'approved'
      ? { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: 'checkmark-circle', label: 'Verified' }
      : status === 'pending'
        ? { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: 'time', label: 'Pending Approval' }
        : { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: 'alert-circle', label: 'Not Verified' };

  return (
    <View style={[s.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
      <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PersonalInfoScreen() {
  const router = useRouter();
  const { userProfile } = useAuth();

  // Derive display values
  const verificationStatus =
    userProfile?.verificationStatus ||
    (userProfile?.isApproved ? 'approved' : userProfile?.isProfileComplete ? 'pending' : 'unverified');

  const roleLabel =
    userProfile?.role === 'student' ? 'Student'
      : userProfile?.role === 'security_admin' ? 'Security Admin'
        : userProfile?.role === 'medical_admin' ? 'Medical Admin'
          : userProfile?.role === 'superadmin' ? 'Super Admin'
            : userProfile?.role || 'Student';

  const joinedDate = userProfile?.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString('en-KE', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    : null;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Personal Information</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar placeholder */}
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarInitial}>
              {(userProfile?.fullName || userProfile?.displayName || 'U')[0].toUpperCase()}
            </Text>
          </View>
          {userProfile?.role === 'student' && (
            <VerificationBadge status={verificationStatus} />
          )}
        </View>

        {/* Read-only: Account Info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Account Information</Text>
          <InfoRow icon="person-outline" label="Full Name" value={userProfile?.fullName || userProfile?.displayName || ''} />
          <InfoRow icon="mail-outline" label="Email Address" value={userProfile?.email || auth.currentUser?.email || ''} />
          <InfoRow icon="briefcase-outline" label="Role" value={roleLabel} />
          {joinedDate && (
            <InfoRow icon="calendar-outline" label="Member Since" value={joinedDate} />
          )}
        </View>

        {/* Read-only: Account Info */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Account Information</Text>
          <InfoRow icon="mail-outline" label="Email Address" value={userProfile?.email || auth.currentUser?.email || ''} />
          <InfoRow icon="person-outline" label="Role" value={roleLabel} />
          {joinedDate && (
            <InfoRow icon="calendar-outline" label="Member Since" value={joinedDate} />
          )}
        </View>

        {/* Read-only: Student Verification */}
        {userProfile?.role === 'student' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Student Verification</Text>
            <InfoRow
              icon="id-card-outline"
              label="Registration Number"
              value={userProfile?.regNo || 'Not submitted yet'}
              mono
            />
            <InfoRow
              icon="call-outline"
              label="Phone Number"
              value={userProfile?.phone || 'Not submitted yet'}
            />
            <View style={s.infoRow}>
              <View style={s.infoIcon}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#0C156D" />
              </View>
              <View style={s.infoText}>
                <Text style={s.infoLabel}>Verification Status</Text>
                <VerificationBadge status={verificationStatus} />
              </View>
            </View>
            {verificationStatus === 'unverified' && (
              <TouchableOpacity
                style={s.verifyBtn}
                onPress={() => router.push('/update-profile' as any)}
              >
                <Ionicons name="create-outline" size={16} color="#0C156D" />
                <Text style={s.verifyBtnText}>Submit Verification</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Security note — no password shown */}
        <View style={s.securityNote}>
          <Ionicons name="lock-closed-outline" size={16} color="#6B7280" />
          <Text style={s.securityNoteText}>
            Password is not shown for security. Use "Change Password" to update it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0C156D',
    paddingHorizontal: 20, paddingVertical: 16, gap: 14,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FFF' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  avatarWrap: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#0C156D',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  avatarInitial: { fontSize: 32, fontWeight: '800', color: '#FFF' },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  card: {
    backgroundColor: '#FFF', borderRadius: 16,
    padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#1F2937', fontWeight: '600' },
  mono: { fontFamily: 'monospace', letterSpacing: 0.5 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    padding: 14, fontSize: 16, backgroundColor: '#F9FAFB', color: '#111',
    marginBottom: 14,
  },
  saveBtn: {
    backgroundColor: '#0C156D', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#EEF2FF', borderRadius: 10, alignSelf: 'flex-start',
  },
  verifyBtnText: { fontSize: 13, fontWeight: '600', color: '#0C156D' },

  securityNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  securityNoteText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },
});
