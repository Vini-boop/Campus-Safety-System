import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { loginWithRole, DEMO_CREDENTIALS, getSession, clearSession } from '../../services/authService';
import { auth } from '../../services/firebase';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const navigate = useNavigate();

  // If already logged in, redirect to the correct dashboard
  useEffect(() => {
    const session = getSession();
    if (session?.route) {
      console.log('Login: Session found for', session.email, '- Redirecting to', session.route);
      navigate(session.route, { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('Login: Attempting login for', email.trim());

    const result = await loginWithRole(email.trim(), password);

    if (result.success) {
      console.log('Login: Success! Redirecting to', result.route);
      // Small delay to ensure session is saved
      setTimeout(() => {
        navigate(result.route, { replace: true });
      }, 300);
    } else {
      const code = result.error?.code || '';
      let msg = 'Login failed. Please check your credentials.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential')
        msg = 'Incorrect email or password.';
      else if (code === 'auth/user-not-found')
        msg = 'No account found with this email.';
      else if (code === 'auth/invalid-email')
        msg = 'Invalid email address format.';
      else if (code === 'auth/too-many-requests')
        msg = 'Too many attempts. Please wait a moment and try again.';
      
      console.error('Login: Failed -', msg, code);
      setError(msg);
      setLoading(false);
    }
  };

  // Fill credentials from demo card click
  const fillDemo = (cred) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setError('');
  };

  const colorMap = {
    indigo: {
      card: 'border-indigo-500/40 hover:border-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10',
      badge: 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30',
      dot: 'bg-indigo-500',
    },
    purple: {
      card: 'border-purple-500/40 hover:border-purple-400 bg-purple-500/5 hover:bg-purple-500/10',
      badge: 'bg-purple-600/20 text-purple-300 border border-purple-500/30',
      dot: 'bg-purple-500',
    },
    red: {
      card: 'border-red-500/40 hover:border-red-400 bg-red-500/5 hover:bg-red-500/10',
      badge: 'bg-red-600/20 text-red-300 border border-red-500/30',
      dot: 'bg-red-500',
    },
  };

  return (
    <div className="min-h-screen bg-[#0A0E27] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

        {/* ── Left: Login Form ── */}
        <div className="bg-[#0D1130] border border-[#1e2347] rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <ShieldCheckIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">Campus Safety</h1>
              <p className="text-gray-500 text-xs">Admin Portal</p>
            </div>
          </div>

          <h2 className="text-white text-2xl font-bold mb-1">Welcome back</h2>
          <p className="text-gray-400 text-sm mb-8">Sign in to access your dashboard</p>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <span className="text-red-400 text-lg">⚠</span>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-gray-400 text-xs font-medium mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@campus.edu"
                className="w-full bg-[#141728] border border-[#252A41] text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-gray-600"
              />
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
                  className="w-full bg-[#141728] border border-[#252A41] text-white text-sm rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder-gray-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-3 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPw
                    ? <EyeSlashIcon className="w-5 h-5" />
                    : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
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
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-gray-600 text-xs text-center mt-6">
            Campus Safety Management System · Admin Portal
          </p>

          <div className="mt-4 text-center">
            <p className="text-gray-600 text-xs">
              Don't have an account?{' '}
              <button
                onClick={() => navigate('/signup')}
                className="text-indigo-400 hover:text-indigo-300 font-medium text-xs underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>

        {/* ── Right: Demo Credentials ── */}
        <div className="space-y-4">
          <div className="mb-6">
            <h3 className="text-white font-bold text-lg">Demo Credentials</h3>
            <p className="text-gray-400 text-sm mt-1">
              Click any card to auto-fill credentials, then sign in.
            </p>
          </div>

          {DEMO_CREDENTIALS.map((cred) => {
            const c = colorMap[cred.color];
            const isSelected = email === cred.email;
            return (
              <button
                key={cred.role}
                onClick={() => fillDemo(cred)}
                className={`w-full text-left border rounded-2xl p-5 transition-all cursor-pointer ${c.card} ${isSelected ? 'ring-2 ring-offset-2 ring-offset-[#0A0E27] ring-indigo-500' : ''
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cred.icon}</span>
                    <div>
                      <p className="text-white font-semibold text-sm">{cred.role}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{cred.desc}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.badge}`}>
                    {isSelected ? '✓ Selected' : 'Click to use'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0D1130]/80 rounded-xl px-3 py-2">
                    <p className="text-gray-500 text-xs mb-1">Email</p>
                    <p className="text-gray-200 text-xs font-mono truncate">{cred.email}</p>
                  </div>
                  <div className="bg-[#0D1130]/80 rounded-xl px-3 py-2">
                    <p className="text-gray-500 text-xs mb-1">Password</p>
                    <p className="text-gray-200 text-xs font-mono">{cred.password}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`}></span>
                  <p className="text-gray-500 text-xs">Routes to: <span className="text-gray-300 font-mono">{cred.route}</span></p>
                </div>
              </button>
            );
          })}

          <div className="bg-[#141728] border border-[#252A41] rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-yellow-400 text-lg">💡</span>
            <p className="text-gray-400 text-xs leading-relaxed">
              Each role is automatically routed to its own dashboard after login. Roles are resolved from the email address.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;