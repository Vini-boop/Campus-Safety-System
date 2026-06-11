import express from 'express';
import { body, validationResult } from 'express-validator';
import { auth, db, verifyIdToken, createLog, COLLECTIONS } from '../services/firebaseAdmin.js';
import { success, error } from '../utils/response.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { loginRateLimit, registerRateLimit, passwordResetRateLimit, googleAuthRateLimit } from '../middleware/rateLimiter.js';
import {
    login,
    refresh,
    logout,
    logoutAll,
    register,
    changePassword,
    forgotPassword,
    resetPassword
} from '../controllers/authController.js';
import { googleAuthCallback, googleRegister, verifyGoogleToken } from '../controllers/googleAuthController.js';

const router = express.Router();

// @route   POST /admin/auth/login
// @desc    Login admin with email/password (creates Firebase Auth user if needed)
// @access  Public
router.post(
    '/login',
    loginRateLimit,
    [
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await login(req, res);
        } catch (err) {
            console.error('Login error:', err);
            error(res, 'Login failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/refresh
// @desc    Refresh access token using refresh token
// @access  Public
router.post(
    '/refresh',
    [
        body('refreshToken').notEmpty().withMessage('Refresh token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await refresh(req, res);
        } catch (err) {
            console.error('Token refresh error:', err);
            error(res, 'Token refresh failed', 500);
        }
    }
);

// @route   POST /auth/register
// @desc    Register a new user
// @access  Public
router.post(
    '/register',
    registerRateLimit,
    [
        body('fullName').notEmpty().withMessage('Full name is required'),
        body('email').isEmail().withMessage('Valid email is required')
        // Password not required here - Firebase Auth already validated it
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await register(req, res);
        } catch (err) {
            console.error('Registration error:', err);
            error(res, 'Registration failed. Please try again.', 500);
        }
    }
);

// @route   POST /auth/change-password
// @desc    Change user password
// @access  Private
router.post(
    '/change-password',
    adminAuth,
    [
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await changePassword(req, res);
        } catch (err) {
            console.error('Change password error:', err);
            error(res, 'Password change failed', 500);
        }
    }
);

// @route   POST /auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post(
    '/forgot-password',
    passwordResetRateLimit,
    [
        body('email').isEmail().withMessage('Valid email is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await forgotPassword(req, res);
        } catch (err) {
            console.error('Forgot password error:', err);
            error(res, 'Password reset request failed', 500);
        }
    }
);

// @route   POST /auth/reset-password
// @desc    Reset password with verification code
// @access  Public
router.post(
    '/reset-password',
    [
        body('code').notEmpty().withMessage('Verification code is required'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await resetPassword(req, res);
        } catch (err) {
            console.error('Reset password error:', err);
            error(res, 'Password reset failed', 500);
        }
    }
);

// @route   POST /auth/verify-reset-code
// @desc    Verify a password reset code is valid (without consuming it)
// @access  Public
router.post(
    '/verify-reset-code',
    [
        body('code').notEmpty().withMessage('Verification code is required'),
        body('email').isEmail().withMessage('Valid email is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { code, email } = req.body;

            const codeDoc = await db.collection('password_reset_codes').doc(code).get();
            if (!codeDoc.exists) return error(res, 'Invalid verification code', 400);

            const codeData = codeDoc.data();
            if (codeData.used) return error(res, 'Verification code has already been used', 400);
            if (codeData.email.toLowerCase() !== email.toLowerCase()) return error(res, 'Invalid verification code', 400);
            if (new Date(codeData.expiresAt) <= new Date()) {
                await db.collection('password_reset_codes').doc(code).delete();
                return error(res, 'Verification code has expired', 400);
            }

            success(res, { message: 'Code is valid' });
        } catch (err) {
            console.error('Verify reset code error:', err);
            error(res, 'Code verification failed', 500);
        }
    }
);

// @route   POST /admin/auth/submit-verification
// @desc    Student submits Reg No + Phone for admin approval
// @access  Private (requires valid Firebase ID token)
router.post(
    '/submit-verification',
    [
        body('idToken').notEmpty().withMessage('ID token is required'),
        body('regNo').notEmpty().withMessage('Registration number is required'),
        body('phone').notEmpty().withMessage('Phone number is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { idToken, regNo, phone } = req.body;

            // Verify Firebase token
            let decodedToken;
            try {
                decodedToken = await auth.verifyIdToken(idToken);
            } catch {
                return error(res, 'Invalid or expired token', 401);
            }

            const uid = decodedToken.uid;
            const email = decodedToken.email;

            // Block re-submission if already approved (sealed)
            const userQuery = await db.collection(COLLECTIONS.USERS)
                .where('uid', '==', uid)
                .limit(1)
                .get();

            if (!userQuery.empty) {
                const existing = userQuery.docs[0].data();
                if (existing.isApproved === true || existing.verificationStatus === 'approved') {
                    return error(res, 'Your registration number and phone are already verified and cannot be changed.', 403);
                }
            }

            // Check for duplicate reg number
            const existing = await db.collection('verification_requests')
                .where('regNo', '==', regNo.trim().toUpperCase())
                .where('status', 'in', ['pending', 'approved'])
                .limit(1)
                .get();

            if (!existing.empty && existing.docs[0].data().userId !== uid) {
                return error(res, 'This registration number is already in use.', 409);
            }

            const userData = {
                regNo: regNo.trim().toUpperCase(),
                phone: phone.trim(),
                isVerified: true,
                isApproved: false,
                verificationStatus: 'pending',
                updatedAt: new Date().toISOString(),
            };

            if (!userQuery.empty) {
                await db.collection(COLLECTIONS.USERS).doc(userQuery.docs[0].id).update(userData);
            } else {
                await db.collection(COLLECTIONS.USERS).add({
                    uid,
                    email,
                    role: 'student',
                    fullName: decodedToken.name || email.split('@')[0],
                    createdAt: new Date().toISOString(),
                    ...userData,
                });
            }

            // Create / update verification request
            const reqQuery = await db.collection('verification_requests')
                .where('userId', '==', uid)
                .limit(1)
                .get();

            const verificationDoc = {
                userId: uid,
                studentEmail: email,
                regNo: regNo.trim().toUpperCase(),
                phone: phone.trim(),
                status: 'pending',
                submittedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            if (!reqQuery.empty) {
                await db.collection('verification_requests').doc(reqQuery.docs[0].id).update(verificationDoc);
            } else {
                await db.collection('verification_requests').add(verificationDoc);
            }

            success(res, { message: 'Verification submitted. Awaiting admin approval (24–48 hours).' });
        } catch (err) {
            console.error('Submit verification error:', err);
            error(res, 'Failed to submit verification. Please try again.', 500);
        }
    }
);

// @route   GET /admin/auth/verification-status
// @desc    Check current user's verification/approval status
// @access  Private
router.post(
    '/verification-status',
    [body('idToken').notEmpty().withMessage('ID token is required')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { idToken } = req.body;
            let decodedToken;
            try {
                decodedToken = await auth.verifyIdToken(idToken);
            } catch {
                return error(res, 'Invalid or expired token', 401);
            }

            const userQuery = await db.collection(COLLECTIONS.USERS)
                .where('uid', '==', decodedToken.uid)
                .limit(1)
                .get();

            if (userQuery.empty) {
                return success(res, { status: 'not_submitted', isApproved: false });
            }

            const userData = userQuery.docs[0].data();
            success(res, {
                status: userData.verificationStatus || 'not_submitted',
                isApproved: userData.isApproved || false,
                isVerified: userData.isVerified || false,
                regNo: userData.regNo || null,
            });
        } catch (err) {
            console.error('Verification status error:', err);
            error(res, 'Failed to check status.', 500);
        }
    }
);
router.post(
    '/verify',
    [
        body('idToken').notEmpty().withMessage('ID token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.error('❌ [BACKEND] Validation errors:', errors.array());
                return error(res, 'Validation error', 400, errors.array());
            }

            const { idToken } = req.body;

            console.log('🔍 [BACKEND] Verifying Firebase ID token...');
            console.log('🔍 [BACKEND] Request IP:', req.ip || req.connection.remoteAddress);
            console.log('🔍 [BACKEND] ID Token present:', !!idToken);

            // Verify the Firebase ID token
            let decodedToken;
            try {
                decodedToken = await auth.verifyIdToken(idToken);
                console.log('✅ [BACKEND] Token verified successfully for:', decodedToken.email);
            } catch (tokenError) {
                console.error('❌ [BACKEND] ID token verification failed:', tokenError.message);
                return error(res, 'Invalid or expired token', 401);
            }

            // Get additional user data from Firestore
            console.log('📥 [BACKEND] Fetching user data from Firestore...');
            const userDoc = await db.collection(COLLECTIONS.USERS)
                .where('uid', '==', decodedToken.uid)
                .limit(1)
                .get();

            let userData = {
                id: decodedToken.uid,
                email: decodedToken.email,
                role: 'student', // Default to student
                emailVerified: decodedToken.email_verified || false,
                displayName: decodedToken.name || decodedToken.email.split('@')[0],
                photoURL: decodedToken.picture,
            };

            if (!userDoc.empty) {
                const firestoreData = userDoc.docs[0].data();
                userData = {
                    ...userData,
                    ...firestoreData,
                    role: firestoreData.role || 'student', // Ensure lowercase role
                    status: firestoreData.status || 'ACTIVE'
                };
                console.log('✅ [BACKEND] Found existing user in Firestore:', userData.email, 'Role:', userData.role);
            } else {
                // User exists in Firebase Auth but not in Firestore
                // Create a basic user record
                console.log(`⚠️ [BACKEND] User not in Firestore, creating new record for: ${decodedToken.uid}`);
                const newUserRef = await db.collection(COLLECTIONS.USERS).add({
                    uid: decodedToken.uid,
                    email: decodedToken.email,
                    role: 'student',
                    status: 'ACTIVE',
                    fullName: decodedToken.name || decodedToken.email.split('@')[0],
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString()
                });
                console.log('✅ [BACKEND] Created new Firestore user record with ID:', newUserRef.id);
                userData.id = newUserRef.id;
            }

            success(res, { user: userData });
        } catch (err) {
            console.error('Verify token error:', err);
            error(res, 'Invalid or expired token', 401);
        }
    }
);

// @route   GET /admin/auth/me
// @desc    Get current admin user
// @access  Private/Admin
router.get('/me', adminAuth, async (req, res) => {
    try {
        // Get full user data from Firestore
        const userDoc = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', req.user.uid)
            .limit(1)
            .get();

        let userData = {
            id: req.user.uid,
            email: req.user.email,
            role: req.user.role,
        };

        if (!userDoc.empty) {
            const firestoreData = userDoc.docs[0].data();
            userData = {
                ...userData,
                ...firestoreData,
            };
        }

        success(res, { user: userData });
    } catch (err) {
        console.error('Get current user error:', err);
        error(res, 'Server error', 500);
    }
});

// @route   POST /admin/auth/logout
// @desc    Logout admin (client-side token removal, server-side logging)
// @access  Private/Admin
router.post('/logout', adminAuth, async (req, res) => {
    try {
        await logout(req, res);
    } catch (err) {
        console.error('Logout error:', err);
        error(res, 'Server error', 500);
    }
});

// @route   POST /admin/auth/logout-all
// @desc    Logout from all devices
// @access  Private/Admin
router.post('/logout-all', adminAuth, async (req, res) => {
    try {
        await logoutAll(req, res);
    } catch (err) {
        console.error('Logout all error:', err);
        error(res, 'Server error', 500);
    }
});

// @route   POST /admin/auth/google/callback
// @desc    Google authentication callback - verifies Google ID token and creates/updates user
// @access  Public
router.post(
    '/google/callback',
    googleAuthRateLimit,
    [
        body('idToken').notEmpty().withMessage('Google ID token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await googleAuthCallback(req, res);
        } catch (err) {
            console.error('Google auth callback error:', err);
            error(res, 'Google authentication failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/google/register
// @desc    Register a new user via Google authentication
// @access  Public
router.post(
    '/google/register',
    googleAuthRateLimit,
    [
        body('idToken').notEmpty().withMessage('Google ID token is required'),
        body('fullName').optional().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await googleRegister(req, res);
        } catch (err) {
            console.error('Google registration error:', err);
            error(res, 'Google registration failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/google/verify
// @desc    Verify Google ID token and get user data
// @access  Public
router.post(
    '/google/verify',
    [
        body('idToken').notEmpty().withMessage('Google ID token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await verifyGoogleToken(req, res);
        } catch (err) {
            console.error('Verify Google token error:', err);
            error(res, 'Token verification failed', 500);
        }
    }
);

export default router;