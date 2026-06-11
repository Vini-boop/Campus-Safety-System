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
  Modal,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, getIdToken, updateProfile, auth, db, doc, setDoc, getDoc } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRouteForRole, USER_ROLES } from '@/utils/roleUtils';
import { api } from '@/services/api';
import { queueProfileSync } from '@/services/backgroundSync';
import AuthErrorHandler from '@/services/authErrorHandler';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { getGoogleConfig, handleGoogleSignIn, verifyUserSession, getStoredUser, storeUserSession } from '@/services/googleAuth';

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [googleRequest, , promptGoogleAsync] = Google.useAuthRequest({ ...getGoogleConfig() });

  const handleGoogleSignUp = async () => {
    try {
      setError('');
      setGoogleLoading(true);
      if (!googleRequest) {
        setError('Google authentication is not configured.');
        return;
      }
      // Dismiss any lingering browser session before starting a new one
      await WebBrowser.coolDownAsync().catch(() => { });
      const result = await handleGoogleSignIn(googleRequest, promptGoogleAsync);
      if (result.success && result.user) {
        const isVerified = await verifyUserSession();
        if (isVerified) {
          const storedUser = await getStoredUser();
          router.replace((storedUser ? getRouteForRole(storedUser.role as any) : '/(tabs)') as any);
        } else {
          await storeUserSession(result.user);
          router.replace('/(tabs)' as any);
        }
      } else {
        setError(result.error || 'Google sign-in failed. Please try again.');
      }
    } catch (err: any) {
      setError(AuthErrorHandler.getFriendlyErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Calculate password strength
  useEffect(() => {
    if (!password) {
      setPasswordStrength(0);
      return;
    }

    let strength = 0;

    // Check length (8+ characters)
    if (password.length >= 8) strength++;

    // Check for lowercase and uppercase
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;

    // Check for numbers and special characters
    if (/\d/.test(password) && /[@$!%*?&]/.test(password)) strength++;

    setPasswordStrength(strength);
  }, [password]);

  // Inline validation as user types
  useEffect(() => {
    // Validate name
    if (name && name.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
    } else {
      setNameError('');
    }

    // Validate email
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setEmailError('Please enter a valid email address');
      } else {
        setEmailError('');
      }
    } else {
      setEmailError('');
    }

    // Validate password with stronger requirements
    if (password) {
      if (password.length < 8) {
        setPasswordError('Password must be at least 8 characters');
      } else if (!/(?=.*[a-z])/.test(password)) {
        setPasswordError('Password must contain at least one lowercase letter (a-z)');
      } else if (!/(?=.*[A-Z])/.test(password)) {
        setPasswordError('Password must contain at least one uppercase letter (A-Z)');
      } else if (!/(?=.*\d)/.test(password)) {
        setPasswordError('Password must contain at least one number (0-9)');
      } else if (!/(?=.*[@$!%*?&])/.test(password)) {
        setPasswordError('Password must contain at least one special character (@$!%*?&)');
      } else {
        setPasswordError('');
      }
    } else {
      setPasswordError('');
    }

    // Validate confirm password
    if (confirmPassword) {
      if (password !== confirmPassword) {
        setConfirmPasswordError('Passwords do not match');
      } else {
        setConfirmPasswordError('');
      }
    } else {
      setConfirmPasswordError('');
    }
  }, [name, email, password, confirmPassword]);

  const handleSignup = async () => {
    // Reset errors
    setError('');
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');

    // Validation
    let hasError = false;

    if (!name || !name.trim()) {
      setNameError('Name is required');
      hasError = true;
    } else if (name.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      hasError = true;
    }

    if (!email) {
      setEmailError('Email is required');
      hasError = true;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setEmailError('Please enter a valid email address');
        hasError = true;
      }
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      hasError = true;
    } else if (!/(?=.*[a-z])/.test(password)) {
      setPasswordError('Password must contain at least one lowercase letter (a-z)');
      hasError = true;
    } else if (!/(?=.*[A-Z])/.test(password)) {
      setPasswordError('Password must contain at least one uppercase letter (A-Z)');
      hasError = true;
    } else if (!/(?=.*\d)/.test(password)) {
      setPasswordError('Password must contain at least one number (0-9)');
      hasError = true;
    } else if (!/(?=.*[@$!%*?&])/.test(password)) {
      setPasswordError('Password must contain at least one special character (@$!%*?&)');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      hasError = true;
    }

    if (hasError) {
      return;
    }

    // Prevent duplicate submissions
    if (loading) {
      return;
    }

    setLoading(true);

    // Check network connectivity first
    try {
      const isConnected = await fetch('https://www.google.com', { method: 'HEAD' })
        .then(() => true).catch(() => false);
      if (!isConnected) {
        setError('No internet connection. Please check your network and try again.');
        setLoading(false);
        return;
      }
    } catch {
      setError('Unable to check network connection. Please try again.');
      setLoading(false);
      return;
    }

    let timeoutId: any = null;
    let apiTimeoutId: any = null;

    try {
      // Implement Firebase auth with timeout
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      // 1. Create Firebase Auth user
      // Silent - creating user

      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } catch (authError: any) {
        // Silent error handling - re-throw
        throw authError; // Re-throw to be handled by the outer catch block
      }

      if (timeoutId) clearTimeout(timeoutId);

      // Silent - Firebase auth successful

      // 2. Update Firebase Auth profile with displayName
      // Silent - updating profile

      try {
        await updateProfile(userCredential.user, {
          displayName: name
        });
        // Silent - profile updated
      } catch (profileError: any) {
        // Silent - continuing despite profile update failure
      }

      // Skip creating Firestore document directly from mobile
      // The backend API will handle creating the user profile in Firestore
      // Silent - proceeding to get ID token

      // 4. Get ID token for backend API calls
      // Silent - getting token

      let idToken;
      try {
        idToken = await getIdToken(userCredential.user);
        // Silent - token retrieved
      } catch (tokenError: any) {
        // Silent error handling
        throw new Error(`Failed to get authentication token: ${tokenError.message || 'Unknown error'}`);
      }

      // 5. Register user with backend API OR write directly to Firestore
      // Silent - registering with backend
      const apiController = new AbortController();
      apiTimeoutId = setTimeout(() => apiController.abort(), 10000); // 10 second timeout

      let userData: any = null;
      let backendSuccess = false;

      try {
        // Silent - sending request

        const registerResponse = await api.register(
          { fullName: name, email: email },
          idToken
        );

        // Silent - response received

        // Critical: Backend registration must succeed
        if (!(registerResponse.status >= 200 && registerResponse.status < 300)) {
          const errorMessage = registerResponse.data?.message || `Backend registration failed with status: ${registerResponse.status}`;
          throw new Error(`Failed to create user profile in database: ${errorMessage}`);
        }

        // Silent - backend registration successful
        backendSuccess = true;

        // Verify the response contains expected user data
        userData = registerResponse.data?.data?.user;
        if (!userData || !userData.uid) {
          throw new Error('Backend registration succeeded but returned invalid user data');
        }

        // Silent - user profile confirmed

      } catch (apiError: any) {
        // Silently handle backend registration failures
        const isNetworkError = apiError.code === 'ERR_NETWORK' ||
          apiError.message?.includes('Network Error') ||
          apiError.message?.includes('net::ERR_CONNECTION_REFUSED') ||
          apiError.message?.includes('Failed to fetch') ||
          apiError.message?.includes('timeout');

        if (isNetworkError) {
          // BACKEND UNAVAILABLE: Write directly to Firestore as fallback

          try {
            // Create user document in Firestore
            const userDocRef = doc(db, 'users', userCredential.user.uid);

            const firestoreUserData = {
              uid: userCredential.user.uid,
              email: email,
              fullName: name,
              displayName: name,
              role: USER_ROLES.STUDENT,
              createdAt: new Date().toISOString(),
              emailVerified: userCredential.user.emailVerified,
              provider: 'email/password',
              lastLogin: new Date().toISOString(),
              // Profile completion flags — all false until update-profile is submitted
              isActive: true,
              isProfileComplete: false,
              hasCompletedProfile: false,
              isVerified: false,
              isRegNumberVerified: false,
              isApproved: false,
              verificationStatus: 'pending',
              regNo: null,
              phone: null,
            };

            // Write to Firestore
            await setDoc(userDocRef, firestoreUserData);

            // Verify the write was successful
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              userData = userDoc.data();
            } else {
              throw new Error('Failed to verify Firestore document creation');
            }

          } catch (firestoreError: any) {
            // If Firestore write also fails, queue for background sync

            try {
              await queueProfileSync({
                uid: userCredential.user.uid,
                email: email,
                fullName: name,
                role: 'student'
              });
            } catch (queueError) {
              // Ignore queue errors
            }

            throw new Error('Unable to create user profile. Please try again.');
          }

        } else {
          // For other errors, throw to be caught by outer handler
          const backendErrorMessage = apiError.response?.data?.message || apiError.message;
          throw new Error(`Signup incomplete: ${backendErrorMessage}`);
        }
      }

      if (apiTimeoutId) clearTimeout(apiTimeoutId);

      // 6. Fetch and verify user data from Firestore
      try {
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const fetchedUserData = userDoc.data();
          // Verify data matches what we expect
          if (fetchedUserData.email !== email || fetchedUserData.fullName !== name) {
            // Silent warning - data mismatch detected
          }
          // Store in AsyncStorage for offline access
          await AsyncStorage.setItem('userData', JSON.stringify({
            uid: userCredential.user.uid,
            email: email,
            role: fetchedUserData.role || USER_ROLES.STUDENT,
            displayName: name,
            idToken: idToken,
          }));
        } else {
          // Silent - user document not found
        }
      } catch (fetchError: any) {
        // Non-critical - continue with signup even if fetch fails
      }

      // Show success message and redirect after 3 seconds
      // Silent - showing success message
      setShowSuccessModal(true);

      // Wait 3 seconds then redirect to login
      setTimeout(() => {
        setShowSuccessModal(false);
        router.replace('/(auth)/login?accountCreated=true' as any);
      }, 3000);

    } catch (err: any) {
      // Silent error handling
      if (timeoutId) clearTimeout(timeoutId);
      if (apiTimeoutId) clearTimeout(apiTimeoutId);

      // Handle different types of errors with user-friendly messages
      if (err.name === 'AbortError') {
        // Silent timeout handling
        setError('Request timed out. Please check your connection and try again.');
      } else if (err.code === 'auth/email-already-in-use') {
        // Silent error handling
        setEmailError('An account with this email already exists.');
      } else if (err.code === 'auth/invalid-email') {
        // Silent error handling
        setEmailError('Invalid email address format.');
      } else if (err.code === 'auth/operation-not-allowed') {
        // Silent error handling
        setError('Email/password accounts are not enabled.');
      } else if (err.code === 'auth/weak-password') {
        // Silent error handling
        setPasswordError('Password is too weak. Please use a stronger password.');
      } else if (err.code === 'auth/network-request-failed') {
        // Silent error handling
        setError('Network error. Please check your internet connection and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        // Silent error handling
        setError('Too many requests. Please try again later.');
      } else if (err.code === 'auth/internal-error') {
        // Silent error handling
        setError('Internal error. Please try again later.');
      } else if (err.message && (err.message.includes('Network Error') || err.message.includes('net::ERR_CONNECTION_REFUSED'))) {
        // If this is a network error from backend registration, allow signup to continue
        // Silent - signup completed despite network issues
        // Show success message and redirect after 3 seconds
        setShowSuccessModal(true);
        setTimeout(() => {
          router.replace('/(auth)/login?accountCreated=true' as any);
        }, 3000);
        return;
      } else if (err.message) {
        // Use the friendly error message handler - silent
        const friendlyMessage = AuthErrorHandler.getFriendlyErrorMessage(err);
        setError(`Signup failed: ${friendlyMessage}`);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
      // Silent completion
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>Campus Safety</Text>
          <Text style={styles.title}>Create your account</Text>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          {/* General Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Name Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled, nameError && styles.inputError]}
              placeholder="Full name"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!loading}
              textContentType="name"
            />
            {nameError ? <Text style={styles.inlineErrorText}>{nameError}</Text> : null}
          </View>

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled, emailError && styles.inputError]}
              placeholder="Email address"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              textContentType="emailAddress"
            />
            {emailError ? <Text style={styles.inlineErrorText}>{emailError}</Text> : null}
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <View style={[styles.passwordContainer, loading && styles.inputDisabled, passwordError && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
                textContentType="newPassword"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
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
              {passwordStrength === 0 && password.length > 0 && 'Use 8+ chars, upper, lower, number & symbol'}
              {passwordStrength === 1 && 'Add uppercase + lowercase letters'}
              {passwordStrength === 2 && 'Add a number and a special character (@$!%*?&)'}
              {passwordStrength === 3 && '✓ Strong password'}
            </Text>

            {passwordError ? <Text style={styles.inlineErrorText}>{passwordError}</Text> : null}
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputContainer}>
            <View style={[styles.passwordContainer, loading && styles.inputDisabled, confirmPasswordError && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirm Password"
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
                disabled={loading}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
            {confirmPasswordError ? <Text style={styles.inlineErrorText}>{confirmPasswordError}</Text> : null}
          </View>

          {/* Signup Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Or sign up with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Login */}
          <View style={styles.socialContainer}>
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton]}
              onPress={handleGoogleSignUp}
              disabled={googleLoading || loading}
              activeOpacity={0.7}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#DB4437" />
              ) : (
                <Image
                  source={require('@/assets/images/google.png')}
                  style={styles.socialIcon}
                  resizeMode="contain"
                />
              )}
            </TouchableOpacity>
          </View>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login?accountCreated=false' as any)}
              disabled={loading}
            >
              <Text style={styles.loginLinkText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalContent}>
            <Ionicons name="checkmark-circle" size={80} color="#10B981" />
            <Text style={styles.successTitle}>Account Created Successfully!</Text>
            <Text style={styles.successMessage}>Redirecting to login...</Text>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        </View>
      </Modal>
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
    marginBottom: 20,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0C156D',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0C156D',
    marginBottom: 5,
  },
  title: {
    fontSize: 16,
    color: '#666666',
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
  inlineErrorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 5,
  },
  // Input Field Styling
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    height: 50,
    backgroundColor: '#EDEDED',
    borderRadius: 25, // Pill-shaped
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#000',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  inputError: {
    borderColor: '#FF3B30',
    borderWidth: 1,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDEDED',
    borderRadius: 25, // Pill-shaped
    height: 50,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#000',
  },
  eyeIcon: {
    paddingHorizontal: 15,
  },
  // Helper Text

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
  helperText: {
    fontSize: 12,
    color: '#666666',
    marginTop: 5,
    marginLeft: 5,
  },
  // Primary CTA Buttons
  button: {
    backgroundColor: '#0C156D',
    height: 55,
    borderRadius: 27.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
    shadowColor: '#0C156D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
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
  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#666',
    fontSize: 14,
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  socialButton: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  socialIcon: {
    width: 24,
    height: 24,
  },
  // Login Container
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  loginText: {
    color: '#666666',
    fontSize: 14,
  },

  // Success Modal
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  successIconContainer: { marginBottom: 24 },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  successLoader: { marginTop: 8 },
  loginLinkText: {
    color: '#0C156D',
    fontWeight: '600',
    fontSize: 14,
  },
});

