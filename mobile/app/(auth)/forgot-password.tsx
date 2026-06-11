import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail, auth, fetchSignInMethodsForEmail } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import apiClient from '@/services/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState<'request' | 'verify' | 'reset'>('request');

  // Password strength indicator
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Calculate password strength
  useEffect(() => {
    if (!newPassword) {
      setPasswordStrength(0);
      return;
    }

    let strength = 0;
    if (newPassword.length >= 8) strength++;
    if (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)) strength++;
    if (/\d/.test(newPassword) && /[@$!%*?&]/.test(newPassword)) strength++;
    setPasswordStrength(strength);
  }, [newPassword]);

  const handleResetPassword = async () => {
    // Reset error
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      // Check network connectivity first
      console.log('🔍 Checking network connectivity before password reset...');
      const isConnected = await fetch('https://www.google.com', { method: 'HEAD' })
        .then(() => true)
        .catch(() => false);
      if (!isConnected) {
        setError('No internet connection. Please check your network and try again.');
        setLoading(false);
        return;
      }
      console.log('✅ Network connection verified');

      console.log('📧 Step 1: Requesting password reset from backend...');
      console.log('   Email:', email);
      console.log('   Backend API URL:', process.env.EXPO_PUBLIC_API_BASE_URL);

      // Call backend API to send reset code
      const response = await apiClient.post('/admin/auth/forgot-password', {
        email: email.toLowerCase().trim()
      });

      console.log('✅ Password reset request successful');
      console.log('   Response:', response.data);

      // Store email for next step
      await AsyncStorage.setItem('resetEmail', email);

      // In development, show the debug code
      if (response.data.data?.debugCode) {
        console.log('🔑 DEBUG CODE (Development only):', response.data.data.debugCode);
        Alert.alert(
          'Debug Code (Development)',
          `Your verification code is: ${response.data.data.debugCode}\n\nIn production, this would be sent via email.`,
          [{ text: 'OK' }]
        );
      }

      // Move to verification step
      setEmailSent(true);
      setStep('verify');

      console.log('✅ Moved to verification step');

    } catch (error: any) {
      // Silent error handling

      let errorMessage = 'Failed to send password reset code. Please try again.';

      if (error.response?.status === 404 || error.response?.status === 400) {
        // We don't reveal if an account exists for privacy reasons
        errorMessage = 'If an account exists for this email, you will receive a reset code.';
      } else if (error.code === 'ERR_NETWORK' || error.message?.includes('Network')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');

    if (!resetToken) {
      setError('Please enter the verification code');
      return;
    }

    if (resetToken.length < 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);

    try {
      const storedEmail = await AsyncStorage.getItem('resetEmail');
      if (!storedEmail) {
        setError('Session expired. Please start over.');
        setStep('request');
        return;
      }

      // Verify the code with the backend before proceeding
      await apiClient.post('/admin/auth/verify-reset-code', {
        code: resetToken,
        email: storedEmail.toLowerCase().trim(),
      });

      // Code is valid — store it and advance
      await AsyncStorage.setItem('resetToken', resetToken);
      setStep('reset');

    } catch (err: any) {
      if (err.response?.status === 400 || err.response?.status === 404) {
        setError(err.response.data?.message || 'Invalid or expired verification code.');
      } else if (err.code === 'ERR_NETWORK' || err.message?.includes('Network')) {
        // Backend unreachable — trust the code locally (it will be validated on reset)
        await AsyncStorage.setItem('resetToken', resetToken);
        setStep('reset');
      } else {
        setError('Could not verify code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async () => {
    setError('');

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/(?=.*[a-z])/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter (a-z)');
      return;
    }
    if (!/(?=.*[A-Z])/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter (A-Z)');
      return;
    }
    if (!/(?=.*\d)/.test(newPassword)) {
      setError('Password must contain at least one number (0-9)');
      return;
    }
    if (!/(?=.*[@$!%*?&])/.test(newPassword)) {
      setError('Password must contain at least one special character (@$!%*?&)');
      return;
    }

    setLoading(true);

    try {
      console.log('🔑 Step 3: Setting new password via backend API...');
      const storedEmail = await AsyncStorage.getItem('resetEmail');
      const storedCode = await AsyncStorage.getItem('resetToken');

      if (!storedEmail) {
        throw new Error('Session expired. Please start over.');
      }

      // Call backend API to reset password
      console.log('   Email:', storedEmail);
      console.log('   Code:', storedCode);

      const response = await apiClient.post('/admin/auth/reset-password', {
        code: storedCode,
        newPassword: newPassword,
        email: storedEmail.toLowerCase().trim()
      });

      console.log('✅ Password reset successful');
      console.log('   Response:', response.data);

      // Clear reset storage
      await AsyncStorage.removeItem('resetEmail');
      await AsyncStorage.removeItem('resetToken');

      // Update cached userData so next login works with new password context
      try {
        const cached = await AsyncStorage.getItem('userData');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.email === storedEmail.toLowerCase().trim()) {
            // Clear the cached idToken so login re-authenticates fresh
            await AsyncStorage.setItem('userData', JSON.stringify({ ...parsed, idToken: '' }));
          }
        }
      } catch { /* ignore cache errors */ }

      // Show success message
      Alert.alert(
        'Password Reset Successful!',
        'Your password has been updated. You can now log in with your new password.',
        [
          {
            text: 'Go to Login',
            onPress: () => router.replace('/(auth)/login')
          }
        ]
      );

    } catch (error: any) {
      // Silent error handling

      let errorMessage = error.message || 'Failed to reset password. Please try again.';

      if (error.response?.status === 400) {
        errorMessage = error.response.data.message || 'Invalid verification code or password';
      } else if (error.response?.status === 404) {
        errorMessage = 'User not found. Please check your email.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your connection.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="lock-closed-outline" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>Reset Password</Text>
          <Text style={styles.subtitle}>
            {step === 'request' && "Enter your registered email and we'll send you a Code to reset your password."}
            {step === 'verify' && 'Enter the verification code sent to your email'}
            {step === 'reset' && 'Create a new secure password for your account'}
          </Text>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          {step === 'request' ? (
            /* Step 1: Request Reset */
            <>
              {/* Error Message */}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <View style={styles.emailInputContainer}>
                  <Ionicons name="mail-outline" size={20} color="#666" style={styles.emailIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                    textContentType="emailAddress"
                  />
                </View>
              </View>

              {/* Send Reset Link Button */}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Send Code</Text>
                )}
              </TouchableOpacity>

              {/* Reassurance Text */}
              <Text style={styles.reassuranceText}>
                If an account exists for this email, you will receive a code to reset your password.
              </Text>
            </>
          ) : step === 'verify' ? (
            /* Step 2: Verify Code */
            <>
              {/* Error Message */}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* Code Input */}
              <View style={styles.inputContainer}>
                <View style={styles.codeInputContainer}>
                  <Ionicons name="key-outline" size={20} color="#666" style={styles.codeIcon} />
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#999"
                    value={resetToken}
                    onChangeText={setResetToken}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                    autoComplete="one-time-code"
                  />
                </View>
                <Text style={styles.helperText}>
                  Check your email inbox (and spam folder) for the verification code
                </Text>
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading}
                activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Verify Code</Text>
                )}
              </TouchableOpacity>

              {/* Resend Code */}
              <TouchableOpacity
                onPress={handleResetPassword}
                style={styles.resendButton}
                disabled={loading}>
                <Ionicons name="refresh-outline" size={16} color="#0C156D" />
                <Text style={styles.resendButtonText}>Resend Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* Step 3: Set New Password */
            <>
              {/* Error Message */}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              {/* New Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.passwordInputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.passwordIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    placeholderTextColor="#999"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    editable={!loading}
                    textContentType="newPassword"
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    disabled={loading}>
                    <Ionicons
                      name={showNewPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>

                {/* Password Strength Indicator */}
                <View style={styles.passwordStrengthContainer}>
                  <View style={[styles.strengthBar, { backgroundColor: passwordStrength >= 1 ? '#DC2626' : '#E5E7EB', flex: 1 }]} />
                  <View style={[styles.strengthBar, { backgroundColor: passwordStrength >= 2 ? '#F59E0B' : '#E5E7EB', flex: 1 }]} />
                  <View style={[styles.strengthBar, { backgroundColor: passwordStrength >= 3 ? '#10B981' : '#E5E7EB', flex: 1 }]} />
                </View>
                <Text style={styles.helperText}>
                  {passwordStrength === 0 && 'Enter a strong password'}
                  {passwordStrength === 1 && 'Weak password'}
                  {passwordStrength === 2 && 'Medium password'}
                  {passwordStrength === 3 && 'Strong password ✓'}
                </Text>
              </View>

              {/* Confirm Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.passwordInputContainer}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#666" style={styles.passwordIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm New Password"
                    placeholderTextColor="#999"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    editable={!loading}
                    textContentType="newPassword"
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={loading}>
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off' : 'eye'}
                      size={20}
                      color="#666"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Reset Password Button */}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSetNewPassword}
                disabled={loading}
                activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Reset Password</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Back to Login */}
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login' as any)}
            style={styles.backToLogin}
            activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={16} color="#0C156D" />
            <Text style={styles.backToLoginText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  // Brand Header
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0C156D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0C156D',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Form Container
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  // Error Message
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  // Input Field UX
  inputContainer: {
    marginBottom: 25,
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDEDED',
    borderRadius: 25, // Pill-shaped
    height: 50,
  },
  emailIcon: {
    marginLeft: 15,
  },
  input: {
    flex: 1,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#000',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  // Primary CTA Button
  button: {
    backgroundColor: '#0C156D',
    height: 55,
    borderRadius: 27.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#0C156D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Reassurance Text
  reassuranceText: {
    color: '#666666',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  // Success Feedback
  successContainer: {
    alignItems: 'center',
  },
  successMessage: {
    backgroundColor: '#E8F5E9', // Softer green background
    padding: 25,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 30,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 15,
    marginBottom: 10,
  },
  successText: {
    color: '#2E7D32',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 10,
  },
  nextStepsText: {
    color: '#1B5E20',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Back to Login Navigation
  backToLogin: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backToLoginText: {
    color: '#0C156D',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Code Input Styling
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDEDED',
    borderRadius: 25,
    height: 50,
  },
  codeIcon: {
    marginLeft: 15,
  },
  codeInput: {
    flex: 1,
    paddingHorizontal: 15,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: 'center',
  },
  // Password Input Styling
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDEDED',
    borderRadius: 25,
    height: 50,
  },
  passwordIcon: {
    marginLeft: 15,
  },
  eyeIcon: {
    paddingHorizontal: 15,
  },
  // Password Strength Indicator
  passwordStrengthContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
  },
  strengthBar: {
    height: 4,
    borderRadius: 2,
    flex: 1,
  },
  // Helper Text
  helperText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 5,
    marginLeft: 5,
  },
  // Resend Code Button
  resendButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
    paddingVertical: 10,
  },
  resendButtonText: {
    color: '#0C156D',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});