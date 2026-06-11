import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { onAuthStateChanged, signOut as firebaseSignOut, getIdToken } from '@/services/firebase';
import { auth, db } from '@/services/firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_ROLES } from '@/utils/roleUtils';
import { api } from '@/services/api';
import { syncPendingProfiles } from '@/services/backgroundSync';

interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: string;
  displayName: string;
  photoURL?: string;
  createdAt?: string;
  isActive?: boolean;
  isProfileComplete?: boolean;
  hasCompletedProfile?: boolean;
  isVerified?: boolean;
  isApproved?: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  status?: 'pending' | 'approved' | 'rejected';
  regNo?: string;
  regNumber?: string;
  phone?: string;
  isRegNumberVerified?: boolean;
}

interface AuthContextType {
  user: any | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  userRole: string | null;
  /** True once admin has approved — regNo & phone are sealed and cannot be changed */
  isSealed: boolean;
  /** Convenience: the verified regNo and phone, only set when isSealed */
  verifiedIdentity: { regNo: string; phone: string } | null;
  refreshAuthData: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasRestoredRef = useRef(false);

  // ── Load profile + role from Firestore (and optionally backend) ─────────────
  const refreshAuthData = async () => {
    try {
      setAuthLoading(true);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        setUser(null); setUserProfile(null); setUserRole(null);
        await AsyncStorage.removeItem('userData');
        return;
      }

      const idToken = await getIdToken(currentUser, true);

      let snap: any;
      try { snap = await getDoc(doc(db, 'users', currentUser.uid)); }
      catch { snap = null; }

      let profile: UserProfile;
      if (snap?.exists()) {
        const d = snap.data();
        profile = {
          uid: currentUser.uid,
          fullName: d.fullName || '',
          email: currentUser.email || '',
          role: d.role || USER_ROLES.STUDENT,
          displayName: d.fullName || currentUser.displayName || currentUser.email || '',
          photoURL: d.photoURL,
          createdAt: d.createdAt,
          isActive: d.isActive,
          isProfileComplete: d.isProfileComplete,
          hasCompletedProfile: d.hasCompletedProfile,
          isVerified: d.isVerified,
          isApproved: d.isApproved,
          verificationStatus: d.verificationStatus,
          regNo: d.regNo,
          phone: d.phone,
          isRegNumberVerified: d.isRegNumberVerified,
        };
      } else {
        profile = {
          uid: currentUser.uid,
          fullName: currentUser.displayName || currentUser.email || '',
          email: currentUser.email || '',
          role: USER_ROLES.STUDENT,
          displayName: currentUser.displayName || currentUser.email || '',
        };
      }

      setUserProfile(profile);

      // Persist verification state locally for splash screen
      const profileCompleted = profile.isProfileComplete === true || profile.hasCompletedProfile === true;
      const isApproved = profile.isApproved === true || profile.verificationStatus === 'approved';
      await AsyncStorage.setItem('profileCompleted', profileCompleted ? 'true' : 'false');
      await AsyncStorage.setItem('isApproved', isApproved ? 'true' : 'false');

      // Backend enrichment — single attempt, non-blocking
      try {
        const res = await api.verifyToken(idToken);
        if (res.status >= 200 && res.status < 300 && res.data?.data?.user) {
          const bu = res.data.data.user;
          const enriched = {
            ...profile,
            role: bu.role || profile.role,
            displayName: bu.displayName || profile.displayName,
          };
          setUserProfile(enriched);
          setUserRole(enriched.role);
          await AsyncStorage.setItem('userData', JSON.stringify({ ...enriched, idToken }));
          try { await syncPendingProfiles(); } catch { /* ignore */ }
        } else {
          setUserRole(profile.role);
          await AsyncStorage.setItem('userData', JSON.stringify({ ...profile, idToken }));
        }
      } catch {
        setUserRole(profile.role);
        await AsyncStorage.setItem('userData', JSON.stringify({ ...profile, idToken }));
      }

      // Set user LAST — flips isAuthenticated = true
      setUser(currentUser);

      // Update needsProfileUpdate flag based on verification state
      if (profile.role === 'student') {
        const profileCompleted = profile.isProfileComplete === true || profile.hasCompletedProfile === true;
        if (!profileCompleted) {
          await AsyncStorage.setItem('needsProfileUpdate', 'true');
        } else {
          await AsyncStorage.removeItem('needsProfileUpdate');
        }
      } else {
        await AsyncStorage.removeItem('needsProfileUpdate');
      }

    } catch {
      // keep existing state on error
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = async () => {
    try { await firebaseSignOut(auth); } catch { /* ignore */ }
    finally {
      setUser(null); setUserProfile(null); setUserRole(null);
      await AsyncStorage.multiRemove(['userData', 'userRole', 'authToken']);
      // Persist logout so splash knows on next open
      await AsyncStorage.setItem('isLoggedIn', 'false');
    }
  };

  // ── Firebase auth listener + real-time Firestore user doc listener ──────────
  useEffect(() => {
    let firestoreUnsub: (() => void) | undefined;

    // ── Restore session silently from AsyncStorage on first mount ────────────
    // This prevents the brief "logged out" flash when app cold-starts
    const restoreSessionSilently = async () => {
      if (hasRestoredRef.current) return;
      hasRestoredRef.current = true;
      try {
        const [isLoggedIn, rawData] = await AsyncStorage.multiGet(['isLoggedIn', 'userData']);
        const loggedIn = isLoggedIn[1] === 'true';
        const cached = rawData[1] ? JSON.parse(rawData[1]) : null;
        if (loggedIn && cached && auth.currentUser) {
          // Firebase already has the user — just set the profile from cache instantly
          setUserProfile(cached as UserProfile);
          setUserRole(cached.role ?? USER_ROLES.STUDENT);
          setUser(auth.currentUser);
          // authLoading stays true until Firebase listener fires below
        }
      } catch { /* non-critical */ }
    };

    restoreSessionSilently();

    const authUnsub = onAuthStateChanged(auth, async (currentUser: any) => {
      // Clean up previous Firestore listener when user changes
      firestoreUnsub?.();
      firestoreUnsub = undefined;

      if (!currentUser) {
        setUser(null); setUserProfile(null); setUserRole(null);
        setAuthLoading(false);
        await AsyncStorage.removeItem('userData');
        await AsyncStorage.setItem('isLoggedIn', 'false');
        return;
      }

      // Initial load
      await refreshAuthData();
      await AsyncStorage.setItem('isLoggedIn', 'true');

      // ── Real-time listener on user doc ──────────────────────────────────
      firestoreUnsub = onSnapshot(
        doc(db, 'users', currentUser.uid),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          setUserProfile((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              isApproved: d.isApproved,
              isVerified: d.isVerified,
              isRegNumberVerified: d.isRegNumberVerified,
              verificationStatus: d.verificationStatus,
              regNo: d.regNo ?? prev.regNo,
              phone: d.phone ?? prev.phone,
              isProfileComplete: d.isProfileComplete,
              hasCompletedProfile: d.hasCompletedProfile,
              fullName: d.fullName || prev.fullName,
              displayName: d.fullName || prev.displayName,
            };
            const isApproved = d.isApproved === true || d.verificationStatus === 'approved';
            AsyncStorage.setItem('isApproved', isApproved ? 'true' : 'false').catch(() => { });
            return updated;
          });
        },
        () => { /* ignore snapshot errors */ }
      );
    });

    // ── AppState listener: refresh silently when app comes to foreground ─────
    // This fixes the "session lost" flash when the user backgrounds and returns
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          // Silently refresh profile without showing loading state
          try {
            const snap = await getDoc(doc(db, 'users', currentUser.uid));
            if (snap.exists()) {
              const d = snap.data();
              setUserProfile((prev) => prev ? { ...prev, ...d as Partial<UserProfile> } : prev);
            }
          } catch { /* non-critical — stale cache is fine */ }
        }
      }
      appStateRef.current = nextState;
    });

    return () => {
      try { authUnsub(); } catch { /* ignore */ }
      try { firestoreUnsub?.(); } catch { /* ignore */ }
      appStateSub.remove();
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user, userProfile, isAuthenticated: !!user,
      authLoading, userRole, refreshAuthData, logout,
      isSealed: userProfile?.isApproved === true || userProfile?.verificationStatus === 'approved' || userProfile?.isRegNumberVerified === true,
      verifiedIdentity: (userProfile?.isApproved === true || userProfile?.verificationStatus === 'approved')
        ? { regNo: userProfile?.regNo ?? '', phone: userProfile?.phone ?? '' }
        : null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
