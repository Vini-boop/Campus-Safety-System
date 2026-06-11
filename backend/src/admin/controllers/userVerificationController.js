import { auth, db, verifyIdToken, COLLECTIONS } from '../services/firebaseAdmin.js';
import { success, error } from '../utils/response.js';
import { getUserRole } from '../services/firebaseAdmin.js';

/**
 * Verify user credentials and check access rights to Home Screen
 */
export const verifyUserCredentials = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return error(res, 'ID token is required for verification', 400);
        }

        // Verify the Firebase ID token
        let decodedToken;
        try {
            decodedToken = await auth.verifyIdToken(idToken);
        } catch (tokenError) {
            console.error('ID token verification failed:', tokenError);
            return error(res, 'Invalid or expired token', 401);
        }

        // Check if user exists in Firestore
        const userDoc = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();

        let userData;
        
        if (userDoc.empty) {
            // User doesn't exist in Firestore, create a new record
            console.log(`Creating Firestore record for new user: ${decodedToken.uid}`);
            const newUserRef = await db.collection(COLLECTIONS.USERS).add({
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                status: 'ACTIVE',
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });
            
            userData = {
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                status: 'ACTIVE',
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
            };
        } else {
            userData = userDoc.docs[0].data();
            
            // Update last login
            await db.collection(COLLECTIONS.USERS).doc(userDoc.docs[0].id).update({
                lastLogin: new Date().toISOString()
            });
        }
        
        // Validate user status
        if (userData.status === 'INACTIVE' || userData.status === 'BANNED') {
            return error(res, 'User account is inactive or banned', 403);
        }

        // Get user role (ensuring it's properly formatted)
        const role = userData.role || 'student';
        
        // Ensure role is lowercase to match frontend expectations
        const normalizedRole = role.toLowerCase();

        // Verify user has valid credentials and access rights
        const verificationResult = {
            isValid: true,
            user: {
                id: decodedToken.uid,
                email: decodedToken.email,
                role: normalizedRole,
                status: userData.status || 'ACTIVE',
                displayName: userData.fullName || userData.displayName || decodedToken.name || decodedToken.email.split('@')[0],
                photoURL: userData.photoURL || decodedToken.picture,
                emailVerified: decodedToken.email_verified || false,
                createdAt: userData.createdAt || new Date().toISOString(),
                lastLogin: new Date().toISOString(),
            },
            accessRights: {
                canAccessHomeScreen: true,
                canAccessDashboard: ['admin', 'superadmin', 'security', 'medical'].includes(normalizedRole),
                canReportIncidents: true,
                canViewAlerts: true,
            }
        };

        success(res, verificationResult);
    } catch (err) {
        console.error('User credentials verification error:', err);
        error(res, 'User verification failed. Please try again.', 500);
    }
};

/**
 * Check if user has access to specific screens/features
 */
export const checkUserAccess = async (req, res) => {
    try {
        const { idToken, screen } = req.body;

        if (!idToken) {
            return error(res, 'ID token is required', 400);
        }

        if (!screen) {
            return error(res, 'Screen name is required', 400);
        }

        // Verify the Firebase ID token
        let decodedToken;
        try {
            decodedToken = await auth.verifyIdToken(idToken);
        } catch (tokenError) {
            console.error('ID token verification failed:', tokenError);
            return error(res, 'Invalid or expired token', 401);
        }

        // Check if user exists in Firestore
        const userDoc = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();

        if (userDoc.empty) {
            return error(res, 'User not found in system', 404);
        }

        const userData = userDoc.docs[0].data();
        
        // Validate user status
        if (userData.status === 'INACTIVE' || userData.status === 'BANNED') {
            return error(res, 'User account is inactive or banned', 403);
        }

        // Get user role
        const role = userData.role || await getUserRole(decodedToken.uid, decodedToken.email) || 'student';
        const normalizedRole = role.toLowerCase();

        // Define access rights based on screen
        let hasAccess = false;
        let accessDetails = {};

        switch (screen.toLowerCase()) {
            case 'home':
            case 'dashboard':
                hasAccess = true;
                accessDetails = {
                    canViewDashboard: true,
                    canViewReports: ['admin', 'superadmin', 'security', 'medical'].includes(normalizedRole),
                    canCreateReports: true,
                    canViewAlerts: true,
                    canManageUsers: ['admin', 'superadmin'].includes(normalizedRole),
                    canViewSecurity: ['admin', 'superadmin', 'security'].includes(normalizedRole),
                    canViewMedical: ['admin', 'superadmin', 'medical'].includes(normalizedRole),
                };
                break;
                
            case 'reports':
                hasAccess = true;
                accessDetails = {
                    canCreateReports: true,
                    canViewOwnReports: true,
                    canViewAllReports: ['admin', 'superadmin', 'security', 'medical'].includes(normalizedRole),
                    canEditReports: true,
                };
                break;
                
            case 'security':
                hasAccess = ['admin', 'superadmin', 'security'].includes(normalizedRole);
                accessDetails = {
                    canViewSecurityAlerts: hasAccess,
                    canCreateSecurityAlerts: hasAccess,
                    canManageSecurity: hasAccess,
                };
                break;
                
            case 'medical':
                hasAccess = ['admin', 'superadmin', 'medical'].includes(normalizedRole);
                accessDetails = {
                    canViewMedicalAlerts: hasAccess,
                    canCreateMedicalAlerts: hasAccess,
                    canManageMedical: hasAccess,
                };
                break;
                
            case 'admin':
                hasAccess = ['admin', 'superadmin'].includes(normalizedRole);
                accessDetails = {
                    canManageUsers: hasAccess,
                    canConfigureSystem: hasAccess,
                    canViewLogs: hasAccess,
                };
                break;
                
            default:
                hasAccess = true; // Default to allowing access to most screens
                accessDetails = {
                    canAccessScreen: true,
                };
        }

        success(res, {
            hasAccess,
            role: normalizedRole,
            screen: screen,
            accessDetails
        });
    } catch (err) {
        console.error('Check user access error:', err);
        error(res, 'Access check failed. Please try again.', 500);
    }
};

/**
 * Get complete user profile with access rights
 */
export const getUserProfile = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return error(res, 'ID token is required', 400);
        }

        // Verify the Firebase ID token
        let decodedToken;
        try {
            decodedToken = await auth.verifyIdToken(idToken);
        } catch (tokenError) {
            console.error('ID token verification failed:', tokenError);
            return error(res, 'Invalid or expired token', 401);
        }

        // Check if user exists in Firestore
        const userDoc = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();

        let userData;
        
        if (userDoc.empty) {
            // User doesn't exist in Firestore, create a new record
            console.log(`Creating Firestore record for user: ${decodedToken.uid}`);
            const newUserRef = await db.collection(COLLECTIONS.USERS).add({
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                status: 'ACTIVE',
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });
            
            userData = {
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                status: 'ACTIVE',
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
            };
        } else {
            userData = userDoc.docs[0].data();
            
            // Update last login
            await db.collection(COLLECTIONS.USERS).doc(userDoc.docs[0].id).update({
                lastLogin: new Date().toISOString()
            });
        }
        
        // Validate user status
        if (userData.status === 'INACTIVE' || userData.status === 'BANNED') {
            return error(res, 'User account is inactive or banned', 403);
        }

        // Get user role
        const role = userData.role || 'student';
        const normalizedRole = role.toLowerCase();

        // Build comprehensive user profile
        const userProfile = {
            id: decodedToken.uid,
            email: decodedToken.email,
            role: normalizedRole,
            status: userData.status || 'ACTIVE',
            profile: {
                fullName: userData.fullName || userData.displayName || decodedToken.name || decodedToken.email.split('@')[0],
                displayName: userData.displayName || decodedToken.name || decodedToken.email.split('@')[0],
                photoURL: userData.photoURL || decodedToken.picture || null,
                phoneNumber: userData.phoneNumber || decodedToken.phone_number || null,
                createdAt: userData.createdAt || new Date().toISOString(),
                lastLogin: new Date().toISOString(),
            },
            accessRights: {
                canAccessHomeScreen: true,
                canAccessDashboard: true,
                canReportIncidents: true,
                canViewAlerts: true,
                canViewReports: true,
                canCreateReports: true,
                canViewMaps: true,
                canSendMessage: true,
                canViewEmergencyContacts: true,
                canAccessSettings: true,
                canManageUsers: ['admin', 'superadmin'].includes(normalizedRole),
                canViewSecurity: ['admin', 'superadmin', 'security'].includes(normalizedRole),
                canViewMedical: ['admin', 'superadmin', 'medical'].includes(normalizedRole),
                canViewAdminPanel: ['admin', 'superadmin'].includes(normalizedRole),
            },
            permissions: {
                isAdmin: ['admin', 'superadmin'].includes(normalizedRole),
                isSecurity: normalizedRole === 'security',
                isMedical: normalizedRole === 'medical',
                isStudent: normalizedRole === 'student',
            }
        };

        success(res, { user: userProfile });
    } catch (err) {
        console.error('Get user profile error:', err);
        error(res, 'Failed to retrieve user profile. Please try again.', 500);
    }
};