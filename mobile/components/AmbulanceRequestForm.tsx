import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { resolveLocation, resolveLocationSync } from '@/services/placeIntelligenceService';
import { getAccurateLocation } from '@/utils/getAccurateLocation';

interface AmbulanceRequestFormProps {
  onSubmit?: () => void;
  onCancel?: () => void;
}

export default function AmbulanceRequestForm({ onSubmit, onCancel }: AmbulanceRequestFormProps) {
  const { user, userProfile } = useAuth();

  const [hostelName, setHostelName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [medicalCondition, setMedicalCondition] = useState('');
  const [notes, setNotes] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number; longitude: number; placeName: string;
  } | null>(null);

  useEffect(() => {
    fetchCurrentLocation();
    if (userProfile?.phone) setPhone(userProfile.phone);
  }, []);

  const fetchCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const loc = await getAccurateLocation({ targetAccuracyM: 40, timeoutMs: 15_000 });
      const { latitude, longitude, accuracy } = loc;

      if (latitude === 0 && longitude === 0) {
        Alert.alert('Location Error', 'Could not get your location. Please try again.');
        return;
      }

      const syncName = resolveLocationSync(latitude, longitude);
      const placeName = syncName || 'Resolving location…';
      setCurrentLocation({ latitude, longitude, placeName });
      console.log(`📡 Ambulance GPS: ±${Math.round(accuracy)} m → ${placeName}`);

      resolveLocation(latitude, longitude).then(name => {
        if (name) setCurrentLocation(prev => prev ? { ...prev, placeName: name } : prev);
      }).catch(() => { });
    } catch (err: any) {
      if (err?.message?.includes('permission')) {
        Alert.alert('Location Required', 'We need your location to dispatch the ambulance.');
      } else {
        Alert.alert('Location Error', 'Could not get your location. Please try again.');
      }
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSubmit = async () => {
    const errors: string[] = [];
    if (!hostelName.trim()) errors.push('Hostel name is required');
    if (!roomNumber.trim()) errors.push('Room number is required');
    if (!phone.trim()) errors.push('Phone number is required');
    if (!medicalCondition.trim() || medicalCondition.trim().length < 10)
      errors.push('Please describe the medical condition (min 10 characters)');
    if (!currentLocation) errors.push('Waiting for GPS location…');
    if (errors.length) { Alert.alert('Missing Information', errors.join('\n')); return; }
    if (!user) { Alert.alert('Error', 'Please log in first.'); return; }

    Alert.alert(
      '🚑 Confirm Ambulance Request',
      `Location: ${currentLocation!.placeName}\nHostel: ${hostelName} — Room ${roomNumber}\nPhone: ${phone}\nCondition: ${medicalCondition}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'DISPATCH NOW', style: 'destructive', onPress: processSubmission },
      ]
    );
  };

  const processSubmission = async () => {
    if (!user || !currentLocation) return;
    setSubmitting(true);
    try {
      const studentName = userProfile?.fullName || (userProfile as any)?.displayName || user.email || 'Student';
      const regNo = userProfile?.regNo || (userProfile as any)?.regNumber || null;

      const requestData = {
        // Student identity
        studentId: user.uid,
        studentName,
        studentEmail: user.email || '',
        regNo,
        phone,
        isRegNumberVerified: !!userProfile?.isRegNumberVerified,

        // Location — always human-readable name
        placeName: currentLocation.placeName,
        campusZone: currentLocation.placeName,
        hostelName,
        roomNumber,
        coordinates: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },

        // Medical details
        medicalCondition,
        notes: notes || null,
        priority: 'critical',

        // Status
        status: 'pending',
        type: 'medical',
        subType: 'ambulance',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        assignedDriverId: null,
        assignedDriverName: null,
        estimatedArrival: null,
        resolvedAt: null,
      };

      // Write to BOTH collections so admin dashboard sees it
      await addDoc(collection(db, 'ambulance_requests'), requestData);
      await addDoc(collection(db, 'medical_reports'), {
        ...requestData,
        reporterId: user.uid,
        reporterName: studentName,
        reporterEmail: user.email || '',
        medicalSubType: 'ambulance',
        location: currentLocation.placeName,
      });

      Alert.alert(
        '🚑 Help is on the way!',
        `Ambulance dispatched to:\n📍 ${currentLocation.placeName}\n🏠 ${hostelName} — Room ${roomNumber}\n\nETA: 5–10 minutes\nKeep your phone available at ${phone}`,
        [{ text: 'Got it', onPress: () => onSubmit?.() }]
      );
    } catch (error: any) {
      Alert.alert('Request Failed', error.message || 'Please try again or call emergency services.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Ionicons name="medical" size={40} color="#DC2626" />
        <Text style={styles.headerTitle}>Emergency Ambulance Request</Text>
        <Text style={styles.headerSubtitle}>Fill in the details below to request immediate medical assistance</Text>

        {/* Emergency Contact Number */}
        <TouchableOpacity
          style={styles.emergencyCallButton}
          onPress={() => {
            const phoneNumber = Platform.OS === 'ios' ? 'telprompt:0705824331' : 'tel:0705824331';
            Alert.alert(
              '📞 Call Emergency Medical',
              'If response is delayed, call this number directly:\n\n0705 824 331',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Call Now',
                  onPress: () => {
                    Linking.openURL(phoneNumber).catch(() => {
                      Alert.alert('Error', 'Unable to make phone call');
                    });
                  }
                }
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="call" size={18} color="#FFFFFF" />
          <Text style={styles.emergencyCallText}>If delayed, call: 0705 824 331</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.warningBanner}>
        <Ionicons name="warning" size={20} color="#DC2626" />
        <Text style={styles.warningText}>For emergencies only. Misuse may result in disciplinary action.</Text>
      </View>

      {/* Location Status — shows campus zone name */}
      <View style={styles.locationStatus}>
        <View style={styles.locationHeader}>
          <Ionicons
            name={locationLoading ? 'locate-outline' : currentLocation ? 'checkmark-circle' : 'location-outline'}
            size={24}
            color={locationLoading ? '#F59E0B' : currentLocation ? '#10B981' : '#9CA3AF'}
          />
          <Text style={[styles.locationStatusLabel, { color: locationLoading ? '#F59E0B' : currentLocation ? '#10B981' : '#9CA3AF' }]}>
            {locationLoading ? 'Acquiring GPS…' : currentLocation ? '✓ Location Captured' : 'Location not available'}
          </Text>
          {!locationLoading && (
            <TouchableOpacity onPress={fetchCurrentLocation} style={{ marginLeft: 'auto' }}>
              <Ionicons name="refresh" size={18} color="#3B82F6" />
            </TouchableOpacity>
          )}
        </View>
        {currentLocation && (
          <Text style={styles.addressText}>📍 {currentLocation.placeName}</Text>
        )}
      </View>

      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Required Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>🏠 Hostel Name <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} placeholder="e.g., Mandela Hall, Sabaki Hostel"
            value={hostelName} onChangeText={setHostelName} placeholderTextColor="#9CA3AF" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>🚪 Room Number <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} placeholder="e.g., A-101, Block A Room 5"
            value={roomNumber} onChangeText={setRoomNumber} placeholderTextColor="#9CA3AF" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>📞 Phone Number <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} placeholder="e.g., +254 712 345 678"
            value={phone} onChangeText={setPhone} placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>🏥 Medical Condition <Text style={styles.required}>*</Text></Text>
          <TextInput style={[styles.input, styles.textArea]}
            placeholder="Describe symptoms: e.g., chest pain, difficulty breathing, severe bleeding"
            value={medicalCondition} onChangeText={setMedicalCondition}
            placeholderTextColor="#9CA3AF" multiline numberOfLines={4} />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>📝 Additional Notes <Text style={styles.optional}>(Optional)</Text></Text>
          <TextInput style={[styles.input, styles.textArea]}
            placeholder="Any additional information that might help…"
            value={notes} onChangeText={setNotes}
            placeholderTextColor="#9CA3AF" multiline numberOfLines={3} />
        </View>
      </View>

      <View style={styles.safetyNotice}>
        <Ionicons name="information-circle" size={24} color="#3B82F6" />
        <View style={styles.safetyContent}>
          <Text style={styles.safetyTitle}>Important</Text>
          <Text style={styles.safetyText}>In life-threatening emergencies, call 999 first. This notifies campus medical staff.</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit} disabled={submitting} activeOpacity={0.7}>
        {submitting
          ? <ActivityIndicator color="#FFFFFF" />
          : <><Ionicons name="flash" size={24} color="#FFFFFF" /><Text style={styles.submitButtonText}>DISPATCH AMBULANCE NOW</Text></>}
      </TouchableOpacity>

      {onCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: '#FFFFFF', padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1F2937', marginTop: 12, textAlign: 'center' },
  headerSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emergencyCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
    elevation: 3,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emergencyCallText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  warningBanner: { flexDirection: 'row', backgroundColor: '#FEF2F2', padding: 12, margin: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', gap: 8 },
  warningText: { flex: 1, fontSize: 13, color: '#DC2626', fontWeight: '600', lineHeight: 18 },
  locationStatus: { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#D1FAE5' },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  locationStatusLabel: { fontSize: 14, fontWeight: '600' },
  addressText: { fontSize: 14, color: '#10B981', fontWeight: '600' },
  formSection: { backgroundColor: '#FFFFFF', marginHorizontal: 16, borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#DC2626' },
  optional: { color: '#6B7280', fontWeight: '400' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#1F2937' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  safetyNotice: { flexDirection: 'row', backgroundColor: '#EFF6FF', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16, gap: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  safetyContent: { flex: 1 },
  safetyTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
  safetyText: { fontSize: 13, color: '#1E40AF', lineHeight: 18 },
  submitButton: { flexDirection: 'row', backgroundColor: '#DC2626', marginHorizontal: 16, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 10, elevation: 6 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, marginHorizontal: 16, marginTop: 8 },
  cancelText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
});
