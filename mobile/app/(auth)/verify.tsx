import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { submitVerification, validateKenyanPhone, validateRegNo } from '@/services/userVerification';

export default function VerificationScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [regNo, setRegNo] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [regNoError, setRegNoError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const handleBack = () => {
    if (Platform.OS === 'web') {
      // On web, router.back() can fail if no history, so use replace
      router.replace('/(auth)/login');
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    // Reset errors
    setRegNoError('');
    setPhoneError('');

    // Validate inputs
    let hasError = false;

    if (!regNo.trim()) {
      setRegNoError('Registration Number is required');
      hasError = true;
    } else if (!validateRegNo(regNo)) {
      setRegNoError('Invalid format. Example: COMP/0001/24');
      hasError = true;
    }

    if (!phone.trim()) {
      setPhoneError('Phone number is required');
      hasError = true;
    } else if (!validateKenyanPhone(phone)) {
      setPhoneError('Use Kenya format: +254XXXXXXXXX');
      hasError = true;
    }

    if (hasError) return;

    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    setLoading(true);

    try {
      await submitVerification(
        user.uid,
        user.email || '',
        user.displayName || user.email || '',
        regNo,
        phone
      );

      // Navigate to pending approval screen
      router.replace('/pending-approval');
    } catch (error: any) {
      Alert.alert('Submission Failed', error.message || 'Failed to submit verification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="arrow-back" size={24} color="#0C156D" />
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={40} color="#0C156D" />
        <Text style={styles.title}>Student Verification</Text>
        <Text style={styles.subtitle}>Complete your registration</Text>
      </View>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#0C156D" />
        <Text style={styles.infoText}>
          Your details will be reviewed by an administrator. You'll gain full access once approved.
        </Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        {/* Registration Number */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Registration Number (Reg No.)</Text>
          <TextInput
            style={[styles.input, regNoError && styles.inputError]}
            placeholder="e.g., COMP/0001/24"
            value={regNo}
            onChangeText={(text) => {
              setRegNo(text.toUpperCase());
              if (regNoError) setRegNoError('');
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!loading}
          />
          {regNoError ? <Text style={styles.errorText}>{regNoError}</Text> : null}
          <Text style={styles.hintText}>Format: DEPT/NUMBER/YEAR</Text>
        </View>

        {/* Phone Number */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, phoneError && styles.inputError]}
            placeholder="+254XXXXXXXXX"
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              if (phoneError) setPhoneError('');
            }}
            keyboardType="phone-pad"
            autoCapitalize="none"
            editable={!loading}
          />
          {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
          <Text style={styles.hintText}>Kenya format: +254 followed by 9 digits</Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Submit Verification</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F5F5F5',
    padding: 20,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    marginBottom: 10,
    padding: 4,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0C156D',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
  },
  infoCard: {
    backgroundColor: '#E8EAF6',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 25,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#0C156D',
    lineHeight: 20,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 5,
  },
  hintText: {
    color: '#666',
    fontSize: 12,
    marginTop: 5,
  },
  button: {
    backgroundColor: '#0C156D',
    height: 55,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
