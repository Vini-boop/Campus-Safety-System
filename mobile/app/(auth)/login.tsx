import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { signInWithEmailAndPassword, getIdToken } from '@/services/firebase';
import { auth } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRouteForRole, USER_ROLES } from '@/utils/roleUtils';
import { api } from '@/services/api';
import AuthMessageService from '@/services/authMessages';
import AuthErrorHandler from '@/services/authErrorHandler';
import AuthValidation from '@/services/authValidation';
import { getGoogleConfig, handleGoogleSignIn, verifyUserSession, getStoredUser, storeUserSession } from '@/services/googleAuth';

export default function LoginScreen() {
  const router = useRouter();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Validation state
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [fieldTouched, setFieldTouched] = useState({
    email: false,
    password: false
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Google auth state
  const [googleLoading, setGoogleLoading] = useState(false);

  // Get Google auth request
  const [googleRequest, , promptGoogleAsync] = Google.useAuthRequest({
    ...getGoogleConfig(),
  });

  // Refs for tracking previous values
  const prevEmailRef = useRef(email);
  const prevPasswordRef = useRef(password);

  // Load any pending auth messages
  useEffect(() => {
    const loadAuthMessage = async () => {
      const message = await AuthMessageService.getMessage();
      if (message) {
        if (message.type === 'success') {
          setSuccessMessage(message.text);
        } else {
          setGlobalError(message.text);
        }
      }
    };

    loadAuthMessage();
  }, []);

  // Handle Google Sign-In
  const handleGoogleSignInFunc = async () => {
    try {
      setGlobalError('');
      setGoogleLoading(true);

      if (!googleRequest) {
        setGlobalError('Google authentication is not properly configured. Please check your settings.');
        return;
      }

      const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      if (!webClientId || webClientId.includes('YOUR_WEB_CLIENT_ID_HERE')) {
        setGlobalError('Google authentication is not properly configured. Please contact the administrator to set up Google OAuth.');
        return;
      }

      // Dismiss any lingering browser session before starting a new one
      await WebBrowser.coolDownAsync().catch(() => { });

      const result = await handleGoogleSignIn(googleRequest, promptGoogleAsync);
      // Silent - result logged internally if needed

      if (result.success && result.user) {
        // Silent - successful sign-in


        // Verify session with backend
        const isVerified = await verifyUserSession();
        // Silent verification

        if (isVerified) {
          const storedUser = await getStoredUser();
          const route = storedUser ? getRouteForRole(storedUser.role as any) : '/(tabs)';
          router.replace(route as any);
        } else {
          try {
            await storeUserSession(result.user);
            router.replace('/(tabs)' as any);
          } catch {
            setGlobalError('Unable to verify your account. Please try again.');
          }
        }
      } else {
        setGlobalError(result.error || 'Google sign-in failed');
      }
    } catch (error: any) {
      // Silent error handling - no console.error to prevent text node errors
      const friendlyMessage = AuthErrorHandler.getFriendlyErrorMessage(error);

      // Provide more specific error messages for common Google auth issues
      if (error.message?.includes('invalid-credential') || error.message?.includes('invalid-oauth-response')) {
        setGlobalError('Google authentication is not properly configured. Please contact the administrator.');
      } else if (error.message?.includes('network')) {
        setGlobalError('Network connection failed. Please check your internet connection.');
      } else {
        setGlobalError(friendlyMessage);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Intelligent error clearing - only when user makes meaningful corrections
  useEffect(() => {
    // Clear email error when user makes progress
    if (AuthValidation.shouldClearError(prevEmailRef.current, email, emailError)) {
      setEmailError('');
    }
    prevEmailRef.current = email;
  }, [email, emailError]);

  useEffect(() => {
    // Clear password error when user makes progress
    if (AuthValidation.shouldClearError(prevPasswordRef.current, password, passwordError)) {
      setPasswordError('');
    }
    prevPasswordRef.current = password;
  }, [password, passwordError]);

  // Mark fields as touched when user interacts with them
  const handleEmailFocus = useCallback(() => {
    setFieldTouched(prev => ({ ...prev, email: true }));
  }, []);

  const handlePasswordFocus = useCallback(() => {
    setFieldTouched(prev => ({ ...prev, password: true }));
  }, []);

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    // Clear global error when user starts typing
    if (globalError) setGlobalError('');
  }, [globalError]);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    // Clear global error when user starts typing
    if (globalError) setGlobalError('');
  }, [globalError]);

  const handleLogin = async () => {
    // Reset previous errors
    setGlobalError('');
    setEmailError('');
    setPasswordError('');
    setFormSubmitted(true);

    // Pre-validate inputs
    if (!email || !password) {
      setGlobalError('Email and password are required');
      return;
    }

    // First, validate email format
    const emailValidation = AuthValidation.getEmailError(email);
    if (emailValidation) {
      setEmailError(emailValidation);
      return;
    }

    // Then validate password format
    const passwordValidation = AuthValidation.getPasswordError(password);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    // Prevent duplicate submissions
    if (loading) return;

    setLoading(true);

    // Track request controllers for cleanup
    const controller = new AbortController();
    const apiController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let apiTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // Declare variables that need to be accessible in catch block
    let userCredential: any = null;
    let idToken: string | undefined;

    try {
      // Set timeouts for both Firebase auth and backend verification
      timeoutId = setTimeout(() => controller.abort(), 10000);
      apiTimeoutId = setTimeout(() => apiController.abort(), 10000);

      // Step 1: Firebase Authentication
      userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (timeoutId) clearTimeout(timeoutId);

      // Silent - Firebase auth successful

      // Step 2: Get ID token for backend verification
      idToken = await getIdToken(userCredential.user);

      // Step 3: Backend verification (optional — Firebase auth is the source of truth)
      if (!idToken) {
        throw new Error('Failed to get authentication token');
      }

      let response;
      let backendVerificationSuccess = false;
      let backendUserRole = USER_ROLES.STUDENT; // Default role

      try {
        response = await api.verifyToken(idToken);
        if (apiTimeoutId) clearTimeout(apiTimeoutId);

        if (response.status >= 200 && response.status < 300 && response.data?.data?.user) {
          const backendUserData = response.data.data;
          const receivedRole = backendUserData.user.role;
          if (Object.values(USER_ROLES).includes(receivedRole)) {
            backendUserRole = receivedRole;
          }
          backendVerificationSuccess = true;
        }
      } catch (apiError: any) {
        // Backend is unavailable or errored — not a blocker, use cached/default role
        if (apiTimeoutId) clearTimeout(apiTimeoutId);
        try {
          const cachedData = await AsyncStorage.getItem('userData');
          if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            if (parsedData.role && Object.values(USER_ROLES).includes(parsedData.role)) {
              backendUserRole = parsedData.role;
            }
          }
        } catch {
          // ignore cache errors
        }
      }

      // Store user data and navigate immediately
      const userDataToStore = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        role: backendUserRole,
        displayName: backendVerificationSuccess && response?.data?.data?.user?.fullName
          ? (response.data.data.user.fullName || userCredential.user.displayName || userCredential.user.email || '')
          : (userCredential.user.displayName || userCredential.user.email || ''),
        idToken: idToken,
      };

      await AsyncStorage.setItem('userData', JSON.stringify(userDataToStore));

      // Persist login state for splash screen on next open
      await AsyncStorage.setItem('isLoggedIn', 'true');
      await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
      await AsyncStorage.setItem('hasLaunchedBefore', 'true');

      // Navigate immediately
      const route = getRouteForRole(backendUserRole);
      router.replace(route as any);

    } catch (error: any) {
      // Clean up timeouts
      if (timeoutId) clearTimeout(timeoutId);
      if (apiTimeoutId) clearTimeout(apiTimeoutId);

      // Silent error logging
      // AuthErrorHandler.logError(error, 'Login Process');

      // Check if this is a network/backend error vs Firebase auth error
      const isNetworkError = error.code === 'ERR_NETWORK' ||
        error.message?.includes('Network Error') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('connect ECONNREFUSED') ||
        error.message?.includes('ERR_NETWORK') ||
        error.response?.status ||
        error.message?.includes('timeout');

      // Firebase auth succeeded but backend unreachable — navigate with default/cached role
      if (isNetworkError && userCredential) {
        let userRole = USER_ROLES.STUDENT;
        try {
          const cachedUserData = await AsyncStorage.getItem(`user_role_${userCredential.user.uid}`);
          if (cachedUserData) {
            const parsedData = JSON.parse(cachedUserData);
            if (parsedData.role && Object.values(USER_ROLES).includes(parsedData.role)) {
              userRole = parsedData.role;
            }
          }
        } catch { /* use default */ }

        await AsyncStorage.setItem('userData', JSON.stringify({
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          role: userRole,
          displayName: userCredential.user.displayName || userCredential.user.email || '',
          idToken: idToken || '',
        }));

        await AsyncStorage.setItem('isLoggedIn', 'true');
        await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
        await AsyncStorage.setItem('hasLaunchedBefore', 'true');

        router.replace(getRouteForRole(userRole) as any);
        return;
      }

      // Handle specific Firebase auth errors
      if (error?.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            setEmailError('User does not exist');
            // Don't show password error when user doesn't exist
            break;
          case 'auth/wrong-password':
            setPasswordError('Invalid password');
            break;
          default:
            // Display user-friendly error message for other errors
            const friendlyMessage = AuthErrorHandler.getFriendlyErrorMessage(error);
            setGlobalError(friendlyMessage);
        }
      } else {
        // Display user-friendly error message for other errors
        const friendlyMessage = AuthErrorHandler.getFriendlyErrorMessage(error);
        setGlobalError(friendlyMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Brand Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>Campus Safety</Text>
          <Text style={styles.subtitle}>Login to your Account</Text>
        </View>

        {/* Form Container */}
        <View style={styles.formContainer}>
          {/* Success Message */}
          {successMessage ? (
            <View style={styles.messageContainer}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Global Error Message */}
          {globalError ? (
            <View style={styles.messageContainer}>
              <Text style={styles.errorText}>{globalError}</Text>
            </View>
          ) : null}

          {/* Email Input with inline validation */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                (emailError && AuthValidation.shouldShowFieldError(email, fieldTouched.email, formSubmitted))
                  ? styles.inputError
                  : null
              ]}
              placeholder="Email address"
              placeholderTextColor="#999"
              value={email}
              onChangeText={handleEmailChange}
              onFocus={handleEmailFocus}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              textContentType="emailAddress"
            />
            {(emailError && AuthValidation.shouldShowFieldError(email, fieldTouched.email, formSubmitted)) && (
              <Text style={styles.fieldErrorText}>{emailError}</Text>
            )}
          </View>

          {/* Password Input with inline validation */}
          <View style={styles.inputContainer}>
            <View style={[
              styles.passwordContainer,
              (passwordError && AuthValidation.shouldShowFieldError(password, fieldTouched.password, formSubmitted))
                ? styles.inputError
                : null
            ]}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={handlePasswordChange}
                onFocus={handlePasswordFocus}
                secureTextEntry={!showPassword}
                editable={!loading}
                textContentType="password"
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
            {(passwordError && AuthValidation.shouldShowFieldError(password, fieldTouched.password, formSubmitted)) && (
              <Text style={styles.fieldErrorText}>{passwordError}</Text>
            )}
          </View>

          {/* Forgot Password */}
          <TouchableOpacity
            style={styles.forgotPassword}
            onPress={() => {
              // Clear any messages when navigating away
              setSuccessMessage('');
              setGlobalError('');
              router.push('/(auth)/forgot-password');
            }}
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Or sign in with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Login */}
          <View style={styles.socialContainer}>
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton]}
              onPress={handleGoogleSignInFunc}
              disabled={googleLoading || loading}
              activeOpacity={0.7}
            >
              {googleLoading ? (
                <View style={styles.googleButtonContent}>
                  <ActivityIndicator size="small" color="#DB4437" />
                </View>
              ) : (
                <View style={styles.googleButtonContent}>
                  <View style={styles.googleIconContainer}>
                    <Image
                      source={require('@/assets/images/google.png')}
                      style={styles.googleIcon}
                    />
                  </View>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Signup Link */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/signup' as any)}
              disabled={loading}
            >
              <Text style={styles.signupLinkText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 30,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0C156D',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
  },
  // Form Container
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  // Message Containers
  messageContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  // Error Message
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Success Message
  successText: {
    color: '#4CD964',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  // Field Error Message
  fieldErrorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 5,
    marginLeft: 5,
    fontWeight: '400',
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
  // Forgot Password
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotPasswordText: {
    color: '#0C156D',
    fontSize: 14,
    fontWeight: '500',
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
    marginVertical: 25,
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
  // Social Login
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 25,
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
  facebookButton: {
    backgroundColor: '#4267B2',
  },
  twitterButton: {
    backgroundColor: '#000000',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleButtonText: {
    color: '#DB4437',
    fontSize: 16,
    fontWeight: '500',
  },
  // Signup Container
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  signupText: {
    color: '#666666',
    fontSize: 14,
  },
  signupLinkText: {
    color: '#0C156D',
    fontWeight: '600',
    fontSize: 14,
  },
});
