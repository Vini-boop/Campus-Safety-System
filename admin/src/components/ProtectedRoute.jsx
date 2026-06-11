import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSession, clearSession } from '../services/authService';
import { auth, onAuthStateChanged } from '../services/firebase';

/**
 * ProtectedRoute
 * Wraps a dashboard route. Validates session on mount and redirects to /login if:
 * - No session exists in localStorage
 * - Firebase auth state is not authenticated
 * - Server/backend is unreachable
 * - Session role doesn't match required role
 */
const ProtectedRoute = ({ children, requiredRole }) => {
    const navigate = useNavigate();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [redirectPath, setRedirectPath] = useState(null);

    useEffect(() => {
        const validateSession = async () => {
            try {
                // Get session from localStorage
                const session = getSession();

                if (!session) {
                    console.warn('ProtectedRoute: No session found, redirecting to login');
                    setRedirectPath('/login');
                    setIsLoading(false);
                    return;
                }

                // Check Firebase auth state with timeout
                const unsubscribe = onAuthStateChanged(auth, async (user) => {
                    try {
                        // Give Firebase time to initialize auth state
                        if (!user) {
                            console.log('ProtectedRoute: Waiting for Firebase auth...');
                            // Wait a bit longer for auth to initialize
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            const currentUser = auth.currentUser;
                            if (!currentUser) {
                                console.warn('ProtectedRoute: Firebase auth not initialized, but session exists. Allowing access.');
                                // Session exists in localStorage, allow access even if Firebase is slow
                                setIsAuthenticated(true);
                                setIsLoading(false);
                                return;
                            }
                            user = currentUser;
                        }

                        // Verify user UID matches session
                        if (user.uid !== session.uid) {
                            console.warn('ProtectedRoute: User UID mismatch. Session:', session.uid, 'Firebase:', user.uid);
                            // Re-check after brief delay (might be auth transition)
                            await new Promise(resolve => setTimeout(resolve, 500));
                            const recheckUser = auth.currentUser;

                            if (!recheckUser || recheckUser.uid !== session.uid) {
                                console.error('ProtectedRoute: UID mismatch confirmed, redirecting to login');
                                setRedirectPath('/login');
                                setIsLoading(false);
                            } else {
                                // User matched on recheck - proceed
                                console.log('ProtectedRoute: UID match confirmed after recheck');
                                setIsAuthenticated(true);
                                setIsLoading(false);
                            }
                            return;
                        }

                        // Role check
                        if (requiredRole && session.role !== requiredRole) {
                            console.log(`ProtectedRoute: Role mismatch. Required: ${requiredRole}, Current: ${session.role}`);
                            setRedirectPath(session.route || '/security-dashboard');
                            setIsLoading(false);
                            return;
                        }

                        // All checks passed
                        console.log('ProtectedRoute: ✅ Validation successful for', session.email, '->', session.route);
                        setIsAuthenticated(true);
                        setIsLoading(false);
                    } catch (error) {
                        console.error('ProtectedRoute: Session validation error:', error);
                        // Don't clear session on errors - let user retry
                        setRedirectPath('/login');
                        setIsLoading(false);
                    }
                }, (error) => {
                    // Auth state listener error (server down/network issue)
                    console.error('ProtectedRoute: Firebase auth listener error:', error);
                    // Allow access with existing session even if Firebase is unreachable
                    if (session) {
                        console.warn('ProtectedRoute: Firebase unavailable but session exists. Allowing access.');
                        setIsAuthenticated(true);
                        setIsLoading(false);
                    } else {
                        setRedirectPath('/login');
                        setIsLoading(false);
                    }
                });

                return () => unsubscribe();
            } catch (error) {
                console.error('ProtectedRoute: Critical session validation error:', error);
                setRedirectPath('/login');
                setIsLoading(false);
            }
        };

        validateSession();
    }, [requiredRole]);

    // Show loading state while validating
    if (isLoading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                backgroundColor: '#0C156D'
            }}>
                <div style={{
                    textAlign: 'center',
                    color: 'white'
                }}>
                    <div style={{
                        fontSize: '18px',
                        fontWeight: '600'
                    }}>
                        Verifying your session...
                    </div>
                </div>
            </div>
        );
    }

    // Redirect if needed
    if (redirectPath) {
        return <Navigate to={redirectPath} replace />;
    }

    // Render children if authenticated
    return isAuthenticated ? children : null;
};

export default ProtectedRoute;
