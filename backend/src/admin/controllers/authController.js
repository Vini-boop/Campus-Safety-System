import { auth, db, verifyIdToken, createLog, COLLECTIONS } from '../services/firebaseAdmin.js';
import { success, error } from '../utils/response.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    validateRefreshToken,
    revokeRefreshToken,
    storeRefreshToken
} from '../utils/authUtils.js';

/**
 * Login admin with email/password
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const normalizedEmail = email.toLowerCase().trim();

        // Check if Firebase Auth user exists first
        let firebaseUser;
        let userData = null;
        let userDocId = null;

        try {
            firebaseUser = await auth.getUserByEmail(normalizedEmail);

            // User exists in Firebase Auth, get Firestore data
            const usersSnapshot = await db.collection(COLLECTIONS.USERS)
                .where('uid', '==', firebaseUser.uid)
                .limit(1)
                .get();

            if (!usersSnapshot.empty) {
                userDocId = usersSnapshot.docs[0].id;
                userData = usersSnapshot.docs[0].data();
            } else {
                // Try finding by email
                const emailSnapshot = await db.collection(COLLECTIONS.USERS)
                    .where('email', '==', normalizedEmail)
                    .limit(1)
                    .get();

                if (!emailSnapshot.empty) {
                    userDocId = emailSnapshot.docs[0].id;
                    userData = emailSnapshot.docs[0].data();
                    // Update with Firebase UID
                    await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                        uid: firebaseUser.uid,
                    });
                }
            }
        } catch (err) {
            if (err.code === 'auth/user-not-found') {
                // User doesn't exist in Firebase Auth, check Firestore first
                const usersSnapshot = await db.collection(COLLECTIONS.USERS)
                    .where('email', '==', normalizedEmail)
                    .limit(1)
                    .get();

                if (usersSnapshot.empty) {
                    return error(res, 'Invalid email or password', 401);
                }

                userDocId = usersSnapshot.docs[0].id;
                userData = usersSnapshot.docs[0].data();

                // For users in Firestore but not in hardcoded list, allow Firebase Auth creation
                // This enables new users who registered via the mobile app to log in
                try {
                    // Create Firebase Auth user
                    firebaseUser = await auth.createUser({
                        email: normalizedEmail,
                        password: password,
                        emailVerified: true,
                        disabled: false,
                    });
                    console.log(`Created Firebase Auth user for: ${normalizedEmail}`);
                } catch (createErr) {
                    if (createErr.code === 'auth/email-already-exists') {
                        // User already exists in Firebase Auth, get the existing user
                        firebaseUser = await auth.getUserByEmail(normalizedEmail);
                        console.log(`Found existing Firebase Auth user for: ${normalizedEmail}`);
                    } else {
                        console.error('Error creating Firebase Auth user:', createErr);
                        throw createErr;
                    }
                }

                // Update Firestore with Firebase UID
                await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                    uid: firebaseUser.uid,
                });

                // Update Firestore with Firebase UID
                await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                    uid: firebaseUser.uid,
                });
            } else {
                throw err;
            }
        }

        // If userData is still null, create a basic user record
        if (!userData) {
            const roleMap = {
                'admin@campus.edu': 'superadmin',
                'security@campus.edu': 'security',
                'medical@campus.edu': 'medical',
            };

            userData = {
                email: normalizedEmail,
                role: roleMap[normalizedEmail] || 'student', // Default to student for unknown emails
                name: normalizedEmail.split('@')[0],
            };

            if (userDocId) {
                await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                    ...userData,
                    uid: firebaseUser.uid,
                });
            } else {
                // Create new user document
                const newDoc = await db.collection(COLLECTIONS.USERS).add({
                    ...userData,
                    uid: firebaseUser.uid,
                    status: 'ACTIVE',
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                });
                userDocId = newDoc.id;
                userData.uid = firebaseUser.uid;
            }
        }

        // Generate JWT tokens
        const accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
        const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';

        const tokenPayload = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || normalizedEmail,
            role: userData.role || 'admin',
        };

        const accessToken = generateAccessToken(
            tokenPayload,
            accessTokenSecret,
            process.env.JWT_ACCESS_EXPIRES_IN || '15m'
        );

        const refreshToken = generateRefreshToken(
            { uid: firebaseUser.uid },
            refreshTokenSecret,
            process.env.JWT_REFRESH_EXPIRES_IN || '7d'
        );

        // Store refresh token in database
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7); // 7 days from now

        await storeRefreshToken(firebaseUser.uid, refreshToken, expiryDate);

        // Get user role
        const role = userData.role || 'admin';

        // Log login
        try {
            await createLog(firebaseUser.uid, role, 'admin_login', {
                email: normalizedEmail,
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
        } catch (logError) {
            console.error('Failed to create login log:', logError);
            // Continue even if logging fails
        }

        success(res, {
            accessToken,
            refreshToken,
            user: {
                id: firebaseUser.uid,
                email: firebaseUser.email || normalizedEmail,
                role: role,
                name: userData.name || normalizedEmail.split('@')[0],
                photoURL: userData.photoURL,
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        error(res, 'Login failed. Please try again.', 500);
    }
};

/**
 * Refresh access token using refresh token
 */
export const refresh = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return error(res, 'Refresh token is required', 401);
        }

        // Validate refresh token in database
        const tokenData = await validateRefreshToken(refreshToken);

        if (!tokenData) {
            return error(res, 'Invalid or expired refresh token', 401);
        }

        // Verify the JWT refresh token
        const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
        let decodedToken;

        try {
            decodedToken = await verifyToken(refreshToken, refreshTokenSecret);
        } catch (jwtError) {
            // If JWT verification fails, also revoke the token from DB
            await revokeRefreshToken(refreshToken);
            return error(res, 'Invalid refresh token', 401);
        }

        // Fetch user data from Firebase
        const firebaseUser = await auth.getUser(decodedToken.uid);
        const userSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();

        let userData = {};
        if (!userSnapshot.empty) {
            userData = userSnapshot.docs[0].data();
        }

        // Generate new access token
        const accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
        const tokenPayload = {
            uid: decodedToken.uid,
            email: firebaseUser.email,
            role: userData.role || 'user',
        };

        const newAccessToken = generateAccessToken(
            tokenPayload,
            accessTokenSecret,
            process.env.JWT_ACCESS_EXPIRES_IN || '15m'
        );

        // Generate new refresh token to rotate tokens
        const newRefreshToken = generateRefreshToken(
            { uid: decodedToken.uid },
            refreshTokenSecret,
            process.env.JWT_REFRESH_EXPIRES_IN || '7d'
        );

        // Revoke old refresh token and store new one
        await revokeRefreshToken(refreshToken);

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7); // 7 days from now

        await storeRefreshToken(decodedToken.uid, newRefreshToken, expiryDate);

        success(res, {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        console.error('Token refresh error:', err);
        error(res, 'Token refresh failed', 500);
    }
};

/**
 * Logout admin
 */
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        // Revoke refresh token if provided
        if (refreshToken) {
            try {
                await revokeRefreshToken(refreshToken);
            } catch (revokeError) {
                console.error('Error revoking refresh token:', revokeError);
                // Continue with logout even if token revocation fails
            }
        }

        // Log logout
        try {
            await createLog(req.user.uid, req.user.role, 'admin_logout', {
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
        } catch (logError) {
            console.error('Failed to create logout log:', logError);
            // Continue with response even if logging fails
        }

        success(res, { message: 'Logged out successfully' });
    } catch (err) {
        console.error('Logout error:', err);
        error(res, 'Logout failed', 500);
    }
};

/**
 * Logout all sessions for a user
 */
export const logoutAll = async (req, res) => {
    try {
        const userId = req.user.uid;

        // Delete all refresh tokens for this user
        const userTokensSnapshot = await db.collection('refresh_tokens')
            .where('userId', '==', userId)
            .get();

        const batch = db.batch();
        userTokensSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        if (!userTokensSnapshot.empty) {
            await batch.commit();
        }

        // Log logout all
        try {
            await createLog(userId, req.user.role, 'admin_logout_all', {
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
        } catch (logError) {
            console.error('Failed to create logout all log:', logError);
            // Continue with response even if logging fails
        }

        success(res, { message: 'Logged out from all devices successfully' });
    } catch (err) {
        console.error('Logout all error:', err);
        error(res, 'Logout all failed', 500);
    }
};

/**
 * Register a new user
 */
export const register = async (req, res) => {
    try {
        const { fullName, email } = req.body;

        // Get the Firebase ID token from the Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('❌ Registration error: Missing or invalid Authorization header');
            return error(res, 'Authorization header with Bearer token is required', 401);
        }

        const idToken = authHeader.substring(7); // Remove 'Bearer ' prefix
        console.log('🎫 Received ID token for registration:', idToken ? 'Present' : 'Missing');

        // Verify the ID token - this confirms user was created in Firebase Auth
        let decodedToken;
        try {
            decodedToken = await verifyIdToken(idToken);
            console.log('✅ ID token verified successfully for:', decodedToken.email);
        } catch (tokenError) {
            console.error('❌ ID token verification failed:', tokenError.message);
            return error(res, 'Invalid or expired token', 401);
        }

        const uid = decodedToken.uid;

        console.log('📝 Processing registration for:', {
            uid,
            email: decodedToken.email,
            fullName,
            providedEmail: email
        });

        // Check if user already exists in Firestore
        const existingUserSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', uid)
            .limit(1)
            .get();

        if (!existingUserSnapshot.empty) {
            console.log('⚠️ User already exists in Firestore:', uid);
            const existingUser = existingUserSnapshot.docs[0].data();
            return success(res, {
                message: 'User already registered',
                user: {
                    uid: uid,
                    email: existingUser.email || decodedToken.email,
                    role: existingUser.role || 'student'
                }
            });
        }

        // Also check by email to prevent duplicates
        const emailUserSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('email', '==', (email || decodedToken.email).toLowerCase().trim())
            .limit(1)
            .get();

        if (!emailUserSnapshot.empty) {
            console.log('⚠️ User with this email already exists:', email);
            return error(res, 'User with this email already exists', 400);
        }

        // Create new user document in Firestore (no password needed - Firebase Auth handles that)
        const newUser = {
            uid: uid,
            fullName: fullName || decodedToken.name || (decodedToken.email ? decodedToken.email.split('@')[0] : 'User'),
            email: (email || decodedToken.email).toLowerCase().trim(),
            role: 'student', // Default role for new registrations
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            isProfileComplete: false // Will be updated when user completes profile
        };

        console.log(`📝 Creating user profile in Firestore for UID: ${uid}`);
        console.log('User data to save:', JSON.stringify(newUser, null, 2));

        // Create the document with the user's UID as the document ID to match security rules
        try {
            await db.collection(COLLECTIONS.USERS).doc(uid).set(newUser);
            console.log(`✅ Successfully created user profile in Firestore for UID: ${uid}`);

            // Verify the document was actually created
            const verificationDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
            if (!verificationDoc.exists) {
                throw new Error('Document creation reported success but document not found');
            }

            const savedData = verificationDoc.data();
            console.log(`✅ Verified user profile exists in Firestore for UID: ${uid}`);
            console.log('Saved data:', JSON.stringify(savedData, null, 2));

        } catch (firestoreError) {
            console.error(`❌ Failed to create user profile in Firestore for UID: ${uid}`);
            console.error('Firestore error details:', firestoreError);
            throw new Error(`Failed to create user profile in database: ${firestoreError.message}`);
        }

        success(res, {
            message: 'User registered successfully',
            user: {
                uid: uid,
                email: email || decodedToken.email,
                role: 'student' // lowercase to match frontend
            }
        });
    } catch (err) {
        console.error('❌ Registration error:', err);
        console.error('Error stack:', err.stack);
        error(res, 'Registration failed. Please try again.', 500);
    }
};

/**
 * Change user password
 */
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.uid;

        // Get user document to retrieve stored password hash
        const userDoc = await db.collection(COLLECTIONS.USERS).doc(userId).get();

        if (!userDoc.exists) {
            return error(res, 'User not found', 404);
        }

        const userData = userDoc.data();

        // Verify current password
        if (!userData.password) {
            return error(res, 'Password authentication not enabled for this user', 400);
        }

        const isPasswordValid = await comparePassword(currentPassword, userData.password);

        if (!isPasswordValid) {
            return error(res, 'Current password is incorrect', 401);
        }

        // Hash new password
        const hashedNewPassword = await hashPassword(newPassword);

        // Update password in database
        await db.collection(COLLECTIONS.USERS).doc(userId).update({
            password: hashedNewPassword,
            passwordChangedAt: new Date().toISOString()
        });

        success(res, { message: 'Password changed successfully' });
    } catch (err) {
        console.error('Change password error:', err);
        error(res, 'Password change failed', 500);
    }
};

/**
 * Forgot password request
 */
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        console.log('📧 Forgot password request for:', email);

        // Find user by email
        const userSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('email', '==', email.toLowerCase())
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            // Return success even if user doesn't exist to prevent email enumeration
            console.log('ℹ️ User not found, but returning success for privacy');
            return success(res, { message: 'If an account exists with this email, a password reset code has been sent' });
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();
        const uid = userData.uid;

        // Generate a 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('✅ Generated verification code for user:', uid);

        // Store verification code in database with expiry (15 minutes)
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        await db.collection('password_reset_codes').doc(verificationCode).set({
            uid: uid,
            email: userData.email,
            code: verificationCode,
            expiresAt: expiresAt.toISOString(),
            createdAt: new Date().toISOString(),
            used: false
        });

        console.log('✅ Verification code stored in Firestore');

        // Send email with verification code
        const emailSent = await sendPasswordResetEmail(
            userData.email,
            verificationCode,
            userData.fullName || userData.name || userData.email.split('@')[0]
        ).then(() => true).catch((emailErr) => {
            console.error('❌ Failed to send reset email:', emailErr.message);
            return false;
        });

        if (emailSent) {
            console.log(`✅ Password reset email sent to: ${userData.email}`);
        } else {
            console.warn('⚠️ Email delivery failed — code still valid in Firestore');
        }

        success(res, {
            message: 'If an account exists with this email, a password reset code has been sent',
            ...(process.env.NODE_ENV === 'development' && !emailSent && {
                debugCode: verificationCode,
                note: 'Email delivery failed — showing code for development only.'
            })
        });
    } catch (err) {
        console.error('❌ Forgot password error:', err);
        error(res, 'Password reset request failed', 500);
    }
};

/**
 * Reset password with verification code
 */
export const resetPassword = async (req, res) => {
    try {
        const { code, newPassword, email } = req.body;

        console.log('🔑 Reset password request received');
        console.log('   Email:', email);
        console.log('   Code:', code);

        // Validate inputs
        if (!code || !newPassword || !email) {
            return error(res, 'Verification code, email, and new password are required', 400);
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return error(res, 'Password must be at least 8 characters', 400);
        }
        if (!/(?=.*[a-z])/.test(newPassword)) {
            return error(res, 'Password must contain at least one lowercase letter', 400);
        }
        if (!/(?=.*[A-Z])/.test(newPassword)) {
            return error(res, 'Password must contain at least one uppercase letter', 400);
        }
        if (!/(?=.*\d)/.test(newPassword)) {
            return error(res, 'Password must contain at least one number', 400);
        }
        if (!/(?=.*[@$!%*?&])/.test(newPassword)) {
            return error(res, 'Password must contain at least one special character', 400);
        }

        // Find user by email
        const userSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('email', '==', email.toLowerCase())
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            // Don't reveal if user exists
            return error(res, 'Invalid verification code', 400);
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();
        const uid = userData.uid;

        // Verify the code exists and is valid
        const codeDoc = await db.collection('password_reset_codes').doc(code).get();

        if (!codeDoc.exists) {
            return error(res, 'Invalid verification code', 400);
        }

        const codeData = codeDoc.data();

        // Check if code matches user
        if (codeData.uid !== uid) {
            return error(res, 'Invalid verification code', 400);
        }

        // Check if code has been used
        if (codeData.used) {
            return error(res, 'Verification code has already been used', 400);
        }

        // Check if code is expired
        const expiresAt = new Date(codeData.expiresAt);
        const now = new Date();

        if (expiresAt <= now) {
            // Clean up expired code
            await db.collection('password_reset_codes').doc(code).delete();
            return error(res, 'Verification code has expired', 400);
        }

        console.log('✅ Verification code validated successfully');

        // Update password in Firebase Auth
        try {
            await auth.updateUser(uid, {
                password: newPassword
            });
            console.log('✅ Password updated in Firebase Auth');
        } catch (authError) {
            console.error('❌ Error updating password in Firebase Auth:', authError);
            return error(res, 'Failed to update password', 500);
        }

        // Mark code as used
        await db.collection('password_reset_codes').doc(code).update({
            used: true,
            usedAt: new Date().toISOString()
        });

        // Log password change
        try {
            await createLog(uid, userData.role || 'user', 'password_reset', {
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });
        } catch (logError) {
            console.error('Failed to create password reset log:', logError);
        }

        console.log('✅ Password reset successful for user:', uid);

        success(res, {
            message: 'Password reset successfully',
            resetAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('❌ Reset password error:', err);
        console.error('Error stack:', err.stack);
        error(res, 'Password reset failed', 500);
    }
};