/**
 * update-profile.tsx
 *
 * ONE-TIME verification form for students.
 * Shows only when isProfileComplete === false.
 * After submission → pending-approval screen.
 * After admin approval → never shown again.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { auth, db } from '@/services/firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getIdToken } from '@/services/firebase';
import { api } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

// ─── Validation ───────────────────────────────────────────────────────────────
function validateRegNo(v: string): string {
  if (!v.trim()) return 'Registration number is required';
  if (!/^[A-Za-z0-9\/\-]+$/.test(v.trim())) return 'Use letters, numbers, / or - only';
  return '';
}

function validatePhone(v: string): string {
  const clean = v.replace(/[\s\-\(\)]/g, '');
  if (!clean) return 'Phone number is required';
  if (!/^\+?[0-9]{10,15}$/.test(clean)) return 'Enter a valid phone number (10-15 digits)';
  return '';
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function UpdateProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userProfile } = useAuth();

  const [regNo, setRegNo] = useState('');
  const [phone, setPhone] = useState('');
  const [regNoError, setRegNoError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Guard: already approved — regNo/phone are sealed ──────────────────────
  const isSealed =
    userProfile?.verificationStatus === 'approved' ||
    userProfile?.isApproved === true ||
    userProfile?.isRegNumberVerified === true;

  if (isSealed) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {router.canGoBack() && (
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color="#0C156D" />
          </TouchableOpacity>
        )}
        <View style={s.sealedWrap}>
          <View style={s.sealedIcon}>
            <Ionicons name="shield-checkmark" size={48} color="#16A34A" />
          </View>
          <Text style={s.sealedTitle}>Identity Verified</Text>
          <Text style={s.sealedSub}>
            Your registration number and phone number have been verified and are locked.
          </Text>
          <View style={s.sealedCard}>
            <View style={s.sealedRow}>
              <Ionicons name="id-card-outline" size={18} color="#0C156D" />
              <Text style={s.sealedLabel}>Reg No.</Text>
              <Text style={s.sealedValue}>{userProfile?.regNo || '—'}</Text>
            </View>
            <View style={s.sealedRow}>
              <Ionicons name="call-outline" size={18} color="#0C156D" />
              <Text style={s.sealedLabel}>Phone</Text>
              <Text style={s.sealedValue}>{userProfile?.phone || '—'}</Text>
            </View>
          </View>
          <Text style={s.sealedNote}>
            To change these details, contact your campus administrator.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const validate = (): boolean => {
    const re = validateRegNo(regNo);
    const pe = validatePhone(phone);
    setRegNoError(re);
    setPhoneError(pe);
    return !re && !pe;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const user = auth.currentUser;
    if (!user) {
      Alert.alert('Session expired', 'Please log in again.');
      router.replace('/(auth)/login');
      return;
    }

    setLoading(true);

    try {
      const cleanRegNo = regNo.trim().toUpperCase();
      const cleanPhone = phone.trim();

      // ── Step 1: Write to Firestore (source of truth) ────────────────────
      await setDoc(
        doc(db, 'users', user.uid),
        {
          regNo: cleanRegNo,
          phone: cleanPhone,
          isVerified: false,           // admin sets this to true after review
          isRegNumberVerified: false,  // admin sets this to true after review
          isApproved: false,
          isProfileComplete: true,
          hasCompletedProfile: true,
          verificationStatus: 'pending',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // ── Step 2: Create verification request for admin ───────────────────
      await addDoc(collection(db, 'verification_requests'), {
        userId: user.uid,
        studentId: user.uid,
        studentEmail: user.email || '',
        studentName: user.displayName || user.email || '',
        regNo: cleanRegNo,
        phone: cleanPhone,
        status: 'pending',
        verificationStatus: 'pending',
        submittedAt: serverTimestamp(),
      });

      // ── Step 3: Persist locally — prevents re-showing form ──────────────
      const cached = await AsyncStorage.getItem('userData');
      const userData = cached ? JSON.parse(cached) : {};
      await AsyncStorage.setItem('userData', JSON.stringify({
        ...userData,
        regNo: cleanRegNo,
        phone: cleanPhone,
        isProfileComplete: true,
        hasCompletedProfile: true,
        verificationStatus: 'pending',
        isApproved: false,
      }));
      // These two keys are the gate flags used by splash + tabs layout
      await AsyncStorage.setItem('profileCompleted', 'true');
      await AsyncStorage.setItem('isApproved', 'false');
      await AsyncStorage.removeItem('needsProfileUpdate');

      // ── Step 4: Sync to backend (non-blocking) ──────────────────────────
      try {
        const idToken = await getIdToken(user);
        await api.submitVerification(idToken, cleanRegNo, cleanPhone);
      } catch {
        // Backend offline — Firestore is source of truth
      }

      // ── Step 5: Show success then go to Home ───────────────────────────
      Alert.alert(
        '✅ Submitted Successfully',
        `Your registration number (${cleanRegNo}) has been submitted for verification.\n\nAn admin will review and approve your account within 24–48 hours. You can use the app while you wait.`,
        [{ text: 'Go to Home', onPress: () => router.replace('/(tabs)') }]
      );

    } catch (err: any) {
      const msg = err?.response?.data?.message
        || err?.message
        || 'Something went wrong. Please try again.';
      Alert.alert('Submission Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Back arrow — only shown when there's history (i.e. opened from profile, not forced) */}
      {router.canGoBack() && (
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#0C156D" />
        </TouchableOpacity>
      )}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Ionicons name="shield-checkmark-outline" size={32} color="#0C156D" />
            </View>
            <Text style={s.headerTitle}>Complete Your Profile</Text>
            <Text style={s.headerSub}>
              This is a one-time step to verify your student identity.
            </Text>
          </View>

          {/* Info banner */}
          <View style={s.infoBanner}>
            <Ionicons name="information-circle-outline" size={20} color="#0C156D" />
            <Text style={s.infoBannerText}>
              Enter your Reg No. and phone number. An admin will approve your account within 24–48 hours.
              You only need to do this once.
            </Text>
          </View>

          {/* Reg No field */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Registration Number *</Text>
            <TextInput
              style={[s.input, regNoError ? s.inputErr : null]}
              placeholder="e.g. CS/2024/12345"
              placeholderTextColor="#AAA"
              value={regNo}
              onChangeText={(t) => { setRegNo(t.toUpperCase()); if (regNoError) setRegNoError(''); }}
              autoCapitalize="characters"
              editable={!loading}
              returnKeyType="next"
            />
            {regNoError
              ? <Text style={s.errText}>{regNoError}</Text>
              : <Text style={s.hint}>Your official student ID number</Text>}
          </View>

          {/* Phone field */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Phone Number *</Text>
            <TextInput
              style={[s.input, phoneError ? s.inputErr : null]}
              placeholder="e.g. +254712345678"
              placeholderTextColor="#AAA"
              value={phone}
              onChangeText={(t) => { setPhone(t); if (phoneError) setPhoneError(''); }}
              keyboardType="phone-pad"
              editable={!loading}
              returnKeyType="done"
            />
            {phoneError
              ? <Text style={s.errText}>{phoneError}</Text>
              : <Text style={s.hint}>Include country code (e.g. +254)</Text>}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, loading && s.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={s.submitBtnText}>Submitting…</Text>
              </>
            ) : (
              <>
                <Ionicons name="send-outline" size={20} color="#FFF" />
                <Text style={s.submitBtnText}>Submit Verification</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={s.footer}>
            After submission, an admin will verify your Reg No. within 24–48 hours.
            You will be notified once approved.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  backBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  scroll: { padding: 24 },

  header: { alignItems: 'center', marginBottom: 24 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0C156D', marginBottom: 6, textAlign: 'center' },
  headerSub: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, marginBottom: 24,
  },
  infoBannerText: { flex: 1, fontSize: 13, color: '#0C156D', lineHeight: 19 },

  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12,
    padding: 14, fontSize: 16, backgroundColor: '#FAFAFA', color: '#111',
  },
  inputErr: { borderColor: '#FF4444', backgroundColor: '#FFF5F5' },
  errText: { fontSize: 12, color: '#FF4444', marginTop: 5 },
  hint: { fontSize: 12, color: '#999', marginTop: 5 },

  submitBtn: {
    backgroundColor: '#0C156D', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    marginBottom: 16,
    shadowColor: '#0C156D', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
  },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },

  footer: { textAlign: 'center', fontSize: 12, color: '#888', lineHeight: 18, marginTop: 8 },

  // ── Sealed state ────────────────────────────────────────────────────────────
  sealedWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  sealedIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#F0FDF4', borderWidth: 2, borderColor: '#BBF7D0',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  sealedTitle: { fontSize: 22, fontWeight: '800', color: '#0C156D', marginBottom: 8, textAlign: 'center' },
  sealedSub: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  sealedCard: {
    width: '100%', backgroundColor: '#F8FAFF', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#C7D2FE', padding: 16, gap: 12, marginBottom: 20,
  },
  sealedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sealedLabel: { fontSize: 13, color: '#666', flex: 1 },
  sealedValue: { fontSize: 14, fontWeight: '700', color: '#0C156D' },
  sealedNote: { fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 18 },
});
