import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { auth, createUserWithEmailAndPassword, updateProfile, db, doc, setDoc, COLLECTIONS } from '../../services/firebase';
import { api } from '../../services/api';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const navigate = useNavigate();

  // Validation states
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  // Real-time validation
  useEffect(() => {
    if (name && name.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
    } else {
      setNameError('');
    }

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

    if (password) {
      if (password.length < 8) {
        setPasswordError('Password must be at least 8 characters');
      } else if (!/(?=.*[a-z])/.test(password)) {
        setPasswordError('Must contain lowercase letter (a-z)');
      } else if (!/(?=.*[A-Z])/.test(password)) {
        setPasswordError('Must contain uppercase letter (A-Z)');
      } else if (!/(?=.*\d)/.test(password)) {
        setPasswordError('Must contain number (0-9)');
      } else if (!/(?=.*[@$!%*?&])/.test(password)) {
        setPasswordError('Must contain special character (@$!%*?&)');
      } else {
        setPasswordError('');
      }
    } else {
      setPasswordError('');
    }

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

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');

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
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      hasError = true;
    } else if (!/(?=.*[a-z])/.test(password)) {
      setPasswordError('Must contain lowercase letter');
      hasError = true;
    } else if (!/(?=.*[A-Z])/.test(password)) {
      setPasswordError('Must contain uppercase letter');
      hasError = true;
    } else if (!/(?=.*\d)/.test(password)) {
      setPasswordError('Must contain number');
      hasError = true;
    } else if (!/(?=.*[@$!%*?&])/.test(password)) {
      setPasswordError('Must contain special character');
      hasError = true;
    }

    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      hasError = true;
    } else if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      hasError = true;
    }

    if (hasError) return;
    if (loading) return;

    setLoading(true);

    try {
      // 1. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Update profile with display name
      await updateProfile(user, { displayName: name });

      // 3. Get ID token
      const idToken = await user.getIdToken();

      // 4. Create Firestore user profile via backend API
      const registerResponse = await api.register({ fullName: name, email: email }, idToken);

      if (!(registerResponse.status >= 200 && registerResponse.status < 300)) {
        throw new Error('Backend registration failed');
      }

      // 5. Success - redirect to login
      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (err) {
      console.error('Signup error:', err);
      
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please login instead.');
      } else if (err.code === 'auth/invalid-email') {
        setEmailError('Invalid email address format');
      } else if (err.code === 'auth/weak-password') {
        setPasswordError('Password is too weak');
      } else if (err.response?.status === 409) {
        setError('User already exists in the system. Please login instead.');
      } else if (err.message?.includes('Network Error')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.message || 'Signup failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E27] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-2xl bg-[#0D1130] border border-[#1e2347] rounded-3xl p-8 shadow-2xl">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <ShieldCheckIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Campus Safety</h1>
            <p className="text-gray-500 text-xs">Create Account</p>
          </div>
        </div>

        <h2 className="text-white text-2xl font-bold mb-1">Join the community</h2>
        <p className="text-gray-400 text-sm mb-8">Sign up to access your dashboard</p>

        {/* Error Message */}
        {error && (
          <div className="mb-5 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <span className="text-red-400 text-lg">⚠</span>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="mb-5 flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
            <span className="text-green-400 text-lg">✓</span>
            <p className="text-green-400 text-sm">{success}</p>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-2">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Doe"
              className={`w-full bg-[#141728] border border-[#252A41] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-gray-600 ${nameError ? 'border-red-500' : ''}`}
            />
            {nameError && <p className="text-red-400 text-xs mt-1">{nameError}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-2">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@campus.edu"
              className={`w-full bg-[#141728] border border-[#252A41] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-gray-600 ${emailError ? 'border-red-500' : ''}`}
            />
            {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-2">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••"
                className={`w-full bg-[#141728] border border-[#252A41] text-white text-sm rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-gray-600 ${passwordError ? 'border-red-500' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPw ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
            {passwordError && <p className="text-red-400 text-xs mt-1">{passwordError}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-gray-400 text-xs font-medium mb-2">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPw ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••••"
                className={`w-full bg-[#141728] border border-[#252A41] text-white text-sm rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-gray-600 ${confirmPasswordError ? 'border-red-500' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw(p => !p)}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showConfirmPw ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>
            {confirmPasswordError && <p className="text-red-400 text-xs mt-1">{confirmPasswordError}</p>}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Creating account...
              </>
            ) : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-xs">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-indigo-400 hover:text-indigo-300 font-medium text-xs underline"
            >
              Sign In
            </button>
          </p>
        </div>

        <p className="text-gray-600 text-xs text-center mt-6">
          Campus Safety Management System · Student Portal
        </p>
      </div>
    </div>
  );
};

export default Signup;
