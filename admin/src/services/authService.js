/**
 * authService.js
 * Handles role-based authentication and routing for the Campus Safety Admin.
 *
 * DEMO CREDENTIALS (stored locally for demo — replace with Firestore roles in production):
 *   Super Admin   → superadmin@campus.edu  / SuperAdmin@2025
 *   Security Admin→ security@campus.edu    / Security@2025
 *   Medical Admin → medical@campus.edu     / Medical@2025
 */

import { signInWithEmailAndPassword, auth, onAuthStateChanged, signOut, getIdToken } from './firebase';

// ─── Role → Route map ─────────────────────────────────────────────────────────
export const ROLE_ROUTES = {
    super_admin: '/super-admin-dashboard',
    security_admin: '/security-dashboard',
    medical_admin: '/medical-dashboard',
};

// ─── Demo credential map (email → role) ───────────────────────────────────────
// In production, fetch the role from Firestore `admins/{uid}` document.
export const DEMO_ROLES = {
    'superadmin@campus.edu': 'super_admin',
    'security@campus.edu': 'security_admin',
    'medical@campus.edu': 'medical_admin',
};

export const DEMO_CREDENTIALS = [
    {
        role: 'Super Admin',
        email: 'superadmin@campus.edu',
        password: 'SuperAdmin@2025',
        route: '/super-admin-dashboard',
        color: 'indigo',
        icon: '🛡️',
        desc: 'Full system access & user management',
    },
    {
        role: 'Security Admin',
        email: 'security@campus.edu',
        password: 'Security@2025',
        route: '/security-dashboard',
        color: 'purple',
        icon: '🔒',
        desc: 'Incident reports & security team control',
    },
    {
        role: 'Medical Admin',
        email: 'medical@campus.edu',
        password: 'Medical@2025',
        route: '/medical-dashboard',
        color: 'red',
        icon: '🏥',
        desc: 'Medical reports & ambulance dispatch',
    },
];

// ─── Get role from email (demo) or Firestore (production) ─────────────────────
export const getRoleFromEmail = (email) => {
    return DEMO_ROLES[email?.toLowerCase()] || null;
};

// ─── Get dashboard route for a role ───────────────────────────────────────────
export const getDashboardRoute = (role) => {
    return ROLE_ROUTES[role] || '/security-dashboard';
};

// ─── Login with role resolution ───────────────────────────────────────────────
export const loginWithRole = async (email, password) => {
    const result = await signInWithEmailAndPassword(email, password);

    if (!result.success) {
        return result; // pass error through
    }

    // Force token refresh so custom claims (role) set by backend are immediately
    // available in request.auth.token.role for Firestore security rules.
    try {
        await getIdToken(result.user, true);
    } catch (e) {
        console.warn('Token refresh failed, claims may not be available yet:', e);
    }

    const role = getRoleFromEmail(email);
    const route = getDashboardRoute(role);

    // Persist session
    const sessionData = {
        uid: result.user.uid,
        email: result.user.email,
        role,
        route,
        name: getRoleName(role),
    };
    localStorage.setItem('adminSession', JSON.stringify(sessionData));

    return { success: true, user: result.user, role, route };
};

// ─── Get current session ──────────────────────────────────────────────────────
export const getSession = () => {
    try {
        const raw = localStorage.getItem('adminSession');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

// ─── Clear session ────────────────────────────────────────────────────────────
export const clearSession = async () => {
    localStorage.removeItem('adminSession');
    try { await signOut(auth); } catch { }
};

// ─── Helper: role → display name ─────────────────────────────────────────────
export const getRoleName = (role) => {
    const names = {
        super_admin: 'Super Admin',
        security_admin: 'Security Admin',
        medical_admin: 'Medical Admin',
    };
    return names[role] || 'Admin';
};
