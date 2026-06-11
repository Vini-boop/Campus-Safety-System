import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Auth/Login'
import Signup from './pages/Auth/Signup'
import SecurityDashboard from './pages/SecurityDashboard'
import MedicalDashboardEnhanced from './pages/MedicalDashboard'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import { getSession } from './services/authService'
import audioService from './services/audioService'
import './App.css'

// Smart redirect component - sends user to their role's dashboard
const DashboardRedirect = () => {
  const session = getSession();

  if (session?.route) {
    console.log('Root redirect: Sending', session.email, 'to', session.route);
    return <Navigate to={session.route} replace />;
  }

  // No session - go to login
  return <Navigate to="/login" replace />;
};

function App() {
  useEffect(() => {
    // Initialize audio service on first user interaction
    const initAudio = () => {
      audioService.init();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };

    // Listen for user interaction to initialize audio (browser policy)
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="App">
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<DashboardRedirect />} />

          {/* Security Admin Dashboard */}
          <Route
            path="/security-dashboard"
            element={
              <ProtectedRoute requiredRole="security_admin">
                <SecurityDashboard />
              </ProtectedRoute>
            }
          />

          {/* Medical Admin Dashboard */}
          <Route
            path="/medical-dashboard"
            element={
              <ProtectedRoute requiredRole="medical_admin">
                <MedicalDashboardEnhanced />
              </ProtectedRoute>
            }
          />

          {/* Super Admin Dashboard */}
          <Route
            path="/super-admin-dashboard"
            element={
              <ProtectedRoute requiredRole="super_admin">
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Legacy redirect */}
          <Route path="/dashboard" element={<Navigate to="/security-dashboard" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App