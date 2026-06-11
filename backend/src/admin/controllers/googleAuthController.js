import { auth, db, verifyIdToken, createLog, COLLECTIONS } from '../services/firebaseAdmin.js';
import { success, error } from '../utils/response.js';
import { 
    generateAccessToken, 
    generateRefreshToken, 
    validateRefreshToken, 
    revokeRefreshToken,
    storeRefreshToken 
} from '../utils/authUtils.js';

/**
 * Google authentication callback - verifies Google ID token and creates/updates user
 */
export const googleAuthCallback = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return error(res, 'Google ID token is required', 400);
        }

        // Verify the Google ID token
        let decodedToken;
        try {
            decodedToken = await verifyIdToken(idToken);
        } catch (tokenError) {
            console.error('Google ID token verification failed:', tokenError);
            return error(res, 'Invalid Google ID token', 401);
        }

        // Check if user already exists in Firebase Auth
        let firebaseUser;
        try {
            firebaseUser = await auth.getUser(decodedToken.uid);
        } catch (userNotFoundErr) {
            if (userNotFoundErr.code === 'auth/user-not-found') {
                // User doesn't exist in Firebase Auth, this shouldn't happen if the token is valid
                // But we'll handle it gracefully by creating the user
                try {
                    firebaseUser = await auth.createUser({
                        uid: decodedToken.uid,
                        email: decodedToken.email,
                        emailVerified: true,
                        displayName: decodedToken.name,
                        photoURL: decodedToken.picture,
                        disabled: false,
                    });
                    console.log(`Created Firebase Auth user for Google login: ${decodedToken.email}`);
                } catch (createErr) {
                    if (createErr.code === 'auth/email-already-exists') {
                        // Another user with this email exists, get the existing user
                        firebaseUser = await auth.getUserByEmail(decodedToken.email);
                        console.log(`Found existing Firebase Auth user for: ${decodedToken.email}`);
                    } else {
                        throw createErr;
                    }
                }
            } else {
                throw userNotFoundErr;
            }
        }

        // Check if user exists in Firestore
        const usersSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();

        let userDocId = null;
        let userData = null;

        if (!usersSnapshot.empty) {
            userDocId = usersSnapshot.docs[0].id;
            userData = usersSnapshot.docs[0].data();
            
            // Update user data with latest Google info
            await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                email: decodedToken.email,
                displayName: decodedToken.name,
                photoURL: decodedToken.picture,
                lastLogin: new Date().toISOString(),
                emailVerified: true,
            });
        } else {
            // Create new user in Firestore
            const newUser = {
                uid: decodedToken.uid,
                email: decodedToken.email,
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
                displayName: decodedToken.name || decodedToken.email.split('@')[0],
                photoURL: decodedToken.picture,
                role: 'student', // Default role for new Google sign-in users
                status: 'ACTIVE',
                emailVerified: true,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
            };

            const newDoc = await db.collection(COLLECTIONS.USERS).add(newUser);
            userDocId = newDoc.id;
            userData = newUser;
        }

        // Generate JWT tokens for our system
        const accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
        const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret';
        
        const tokenPayload = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            role: userData.role || 'student',
            provider: 'google'
        };

        const accessToken = generateAccessToken(
            tokenPayload, 
            accessTokenSecret, 
            process.env.JWT_ACCESS_EXPIRES_IN || '15m'
        );

        const refreshToken = generateRefreshToken(
            { uid: decodedToken.uid }, 
            refreshTokenSecret, 
            process.env.JWT_REFRESH_EXPIRES_IN || '7d'
        );

        // Store refresh token in database
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7); // 7 days from now
        
        await storeRefreshToken(decodedToken.uid, refreshToken, expiryDate);

        // Get final user data
        const finalUserData = {
            id: decodedToken.uid,
            email: decodedToken.email,
            role: userData.role || 'student',
            name: decodedToken.name,
            photoURL: decodedToken.picture,
            emailVerified: true,
        };

        // Log Google authentication
        try {
            await createLog(decodedToken.uid, finalUserData.role, 'google_login', {
                email: decodedToken.email,
                timestamp: new Date().toISOString(),
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                provider: 'google'
            });
        } catch (logError) {
            console.error('Failed to create Google login log:', logError);
            // Continue even if logging fails
        }

        success(res, {
            accessToken,
            refreshToken,
            user: finalUserData
        });
    } catch (err) {
        console.error('Google authentication error:', err);
        error(res, 'Google authentication failed. Please try again.', 500);
    }
};

/**
 * Google registration endpoint - registers a new user via Google auth
 */
export const googleRegister = async (req, res) => {
    try {
        const { idToken, fullName } = req.body;

        if (!idToken) {
            return error(res, 'Google ID token is required', 400);
        }

        // Verify the Google ID token
        let decodedToken;
        try {
            decodedToken = await verifyIdToken(idToken);
        } catch (tokenError) {
            console.error('Google ID token verification failed:', tokenError);
            return error(res, 'Invalid Google ID token', 401);
        }

        // Verify that the token belongs to the Google provider
        if (!decodedToken.firebase || !decodedToken.firebase.sign_in_provider || 
            !decodedToken.firebase.sign_in_provider.startsWith('google')) {
            return error(res, 'Invalid Google authentication provider', 400);
        }

        // Check if user already exists
        const usersSnapshot = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();
            
        if (!usersSnapshot.empty) {
            return error(res, 'User already exists', 400);
        }

        // Create new user document in Firestore
        const newUser = {
            uid: decodedToken.uid,
            fullName: fullName || decodedToken.name || decodedToken.email.split('@')[0],
            email: decodedToken.email,
            displayName: decodedToken.name || decodedToken.email.split('@')[0],
            photoURL: decodedToken.picture,
            role: 'student', // Default role for Google registrations
            status: 'ACTIVE',
            emailVerified: true,
            provider: 'google',
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };

        console.log(`📝 Creating Google user profile in Firestore for UID: ${decodedToken.uid}`);

        // Create the document with the user's UID as the document ID
        try {
            await db.collection(COLLECTIONS.USERS).doc(decodedToken.uid).set(newUser);
            console.log(`✅ Successfully created Google user profile in Firestore for UID: ${decodedToken.uid}`);
        } catch (firestoreError) {
            console.error(`❌ Failed to create Google user profile in Firestore for UID: ${decodedToken.uid}`);
            console.error('Firestore error details:', firestoreError);
            throw new Error(`Failed to create user profile in database: ${firestoreError.message}`);
        }

        success(res, {
            message: 'User registered successfully via Google',
            user: {
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                provider: 'google'
            }
        });
    } catch (err) {
        console.error('Google registration error:', err);
        error(res, 'Google registration failed. Please try again.', 500);
    }
};

/**
 * Verify Google ID token and get user data
 */
export const verifyGoogleToken = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return error(res, 'ID token is required', 400);
        }

        // Verify the Google ID token
        let decodedToken;
        try {
            decodedToken = await verifyIdToken(idToken);
        } catch (tokenError) {
            console.error('Google ID token verification failed:', tokenError);
            return error(res, 'Invalid or expired Google ID token', 401);
        }

        // Get user data from Firestore
        const userDoc = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', decodedToken.uid)
            .limit(1)
            .get();

        let userData;
        
        if (userDoc.empty) {
            // User doesn't exist in Firestore, create a new record
            console.log(`Creating Firestore record for Google user: ${decodedToken.uid}`);
            const newUserRef = await db.collection(COLLECTIONS.USERS).add({
                uid: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                status: 'ACTIVE',
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
                displayName: decodedToken.name || decodedToken.email.split('@')[0],
                photoURL: decodedToken.picture,
                emailVerified: true,
                provider: 'google',
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });
            
            userData = {
                id: decodedToken.uid,
                email: decodedToken.email,
                role: 'student',
                status: 'ACTIVE',
                emailVerified: true,
                provider: 'google',
                fullName: decodedToken.name || decodedToken.email.split('@')[0],
                displayName: decodedToken.name || decodedToken.email.split('@')[0],
                photoURL: decodedToken.picture,
            };
        } else {
            const firestoreData = userDoc.docs[0].data();
            userData = {
                id: decodedToken.uid,
                email: decodedToken.email,
                role: firestoreData.role || 'student',
                status: firestoreData.status || 'ACTIVE',
                ...firestoreData
            };
            
            // Update last login
            await db.collection(COLLECTIONS.USERS).doc(userDoc.docs[0].id).update({
                lastLogin: new Date().toISOString()
            });
        }

        success(res, { user: userData });
    } catch (err) {
        console.error('Verify Google token error:', err);
        error(res, 'Token verification failed', 500);
    }
};