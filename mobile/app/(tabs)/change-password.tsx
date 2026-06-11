import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth } from '@/services/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';

// ─── Password strength ────────────────────────────────────────────────────────
function getStrength(p: string): { score: number; label: string; color: string } {
  if (!p) return { score: 0, label: '', color: '#E5E7EB' };
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[@$!%*?&]/.test(p)) s++;
  const map = [
    { score: 0, label: '', color: '#E5E7EB' },
    { score: 1, label: 'Weak', color: '#DC2626' },
    { score: 2, label: 'Fair', color: '#F59E0B' },
    { score: 3, label: 'Strong', color: '#10B981' },
  ];
  return map[s];
}

function validate(newPwd: string): string {
  if (newPwd.length < 8) return 'At least 8 characters required';
  if (!/[a-z]/.test(newPwd)) return 'Add a lowercase letter (a-z)';
  if (!/[A-Z]/.test(newPwd)) return 'Add an uppercase letter (A-Z)';
  if (!/\d/.test(newPwd)) return 'Add a number (0-9)';
  if (!/[@$!%*?&]/.test(newPwd)) return 'Add a special character (@$!%*?&)';
  return '';
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ChangePasswordScreen() {
  const router = useRouter();

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPwdError, setNewPwdError] = useState('');

  const strength = getStrength(newPwd);
  const pwdValidErr = validate(newPwd);
  const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;
  const canSave = !saving && currentPwd.length > 0 && !pwdValidErr && newPwd === confirmPwd && confirmPwd.length > 0;

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user?.email) {
      Alert.alert('Session expired', 'Please log in again.');
      router.replace('/(auth)/login');
      return;
    }

    const err = validate(newPwd);
    if (err) { setNewPwdError(err); return; }
    if (newPwd !== confirmPwd) { Alert.alert('Validation', 'Passwords do not match.'); return; }

    try {
      setSaving(true);
      // Re-authenticate first (required by Firebase before sensitive operations)
      const credential = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, credential);
      // Update password in Firebase Auth
      await updatePassword(user, newPwd);

      Alert.alert('✅ Password Updated', 'Your password has been changed successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (error: any) {
      const code = error?.code || '';
      const message =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect. Please try again.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Please wait a few minutes and try again.'
            : code === 'auth/requires-recent-login'
              ? 'Session expired. Please log out and log back in, then try again.'
              : error?.message || 'Failed to update password. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Change Password</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Info */}
          <View style={s.infoBanner}>
            <Ionicons name="lock-closed-outline" size={18} color="#0C156D" />
            <Text style={s.infoText}>Enter your current password, then choose a strong new one.</Text>
          </View>

          {/* Current password */}
          <Text style={s.label}>Current Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Enter current password"
              placeholderTextColor="#AAA"
              value={currentPwd}
              onChangeText={setCurrentPwd}
              secureTextEntry={!showCurrent}
              editable={!saving}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowCurrent(v => !v)} style={s.eye}>
              <Ionicons name={showCurrent ? 'eye-off' : 'eye'} size={20} color="#888" />
            </TouchableOpacity>
          </View>

          {/* New password */}
          <Text style={s.label}>New Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Min 8 chars, upper, lower, number, symbol"
              placeholderTextColor="#AAA"
              value={newPwd}
              onChangeText={(t) => { setNewPwd(t); setNewPwdError(''); }}
              secureTextEntry={!showNew}
              editable={!saving}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowNew(v => !v)} style={s.eye}>
              <Ionicons name={showNew ? 'eye-off' : 'eye'} size={20} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Strength bar */}
          {newPwd.length > 0 && (
            <View style={s.strengthRow}>
              {[1, 2, 3].map(i => (
                <View key={i} style={[s.strengthBar, { backgroundColor: strength.score >= i ? strength.color : '#E5E7EB' }]} />
              ))}
              <Text style={[s.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}

          {/* Requirements */}
          {newPwd.length > 0 && pwdValidErr ? (
            <Text style={s.errText}>⚠ {pwdValidErr}</Text>
          ) : newPwd.length > 0 && !pwdValidErr ? (
            <Text style={s.okText}>✓ Password meets all requirements</Text>
          ) : null}

          {/* Confirm password */}
          <Text style={[s.label, { marginTop: 16 }]}>Confirm New Password</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={[s.input, mismatch && s.inputErr]}
              placeholder="Re-enter new password"
              placeholderTextColor="#AAA"
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              secureTextEntry={!showConfirm}
              editable={!saving}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={s.eye}>
              <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#888" />
            </TouchableOpacity>
          </View>
          {mismatch && <Text style={s.errText}>⚠ Passwords do not match</Text>}
          {!mismatch && confirmPwd.length > 0 && <Text style={s.okText}>✓ Passwords match</Text>}

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {saving
              ? <><ActivityIndicator size="small" color="#FFF" /><Text style={s.saveBtnText}>Updating…</Text></>
              : <><Ionicons name="checkmark-circle-outline" size={20} color="#FFF" /><Text style={s.saveBtnText}>Update Password</Text></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0C156D', paddingHorizontal: 20, paddingVertical: 14,
  },
  backBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },

  scroll: { padding: 20, paddingBottom: 60 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, marginBottom: 24,
  },
  infoText: { flex: 1, fontSize: 13, color: '#0C156D', lineHeight: 19 },

  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    marginBottom: 6, paddingRight: 12,
  },
  input: { flex: 1, padding: 14, fontSize: 15, color: '#111' },
  inputErr: { borderColor: '#DC2626' },
  eye: { padding: 4 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '700', minWidth: 44 },

  errText: { fontSize: 12, color: '#DC2626', marginBottom: 4 },
  okText: { fontSize: 12, color: '#16A34A', marginBottom: 4 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0C156D', borderRadius: 14, paddingVertical: 15, marginTop: 24,
    shadowColor: '#0C156D', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
