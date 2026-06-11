import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin
let firebaseInitialized = false;

if (!admin.apps.length) {
    try {
        // Try to load service account from file path or JSON string
        let serviceAccount;

        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS.startsWith('{')) {
                // JSON string
                serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
            } else {
                // File path
                const serviceAccountPath = resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
                if (existsSync(serviceAccountPath)) {
                    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
                } else {
                    throw new Error(`Service account file not found: ${serviceAccountPath}`);
                }
            }
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else {
            // Try to find serviceAccountKey.json in backend directory
            const defaultPath = resolve(process.cwd(), 'serviceAccountKey.json');
            if (existsSync(defaultPath)) {
                console.log(`📁 Found serviceAccountKey.json at: ${defaultPath}`);
                serviceAccount = JSON.parse(readFileSync(defaultPath, 'utf8'));
            } else {
                // Try to use Application Default Credentials (for local development with gcloud)
                try {
                    admin.initializeApp({
                        projectId: process.env.FIREBASE_PROJECT_ID || 'safety-management-system-4faf0',
                    });
                    console.log('✅ Firebase Admin initialized with Application Default Credentials');
                    firebaseInitialized = true;
                } catch (adcError) {
                    console.error('❌ Firebase Admin initialization error:', adcError.message);
                    console.error('\n📝 To fix this, you need to:');
                    console.error('   1. Go to Firebase Console → Project Settings → Service Accounts');
                    console.error('   2. Click "Generate New Private Key"');
                    console.error('   3. Save the JSON file');
                    console.error('   4. Create a .env file in backend/ directory with:');
                    console.error('      GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json');
                    console.error('   OR set FIREBASE_SERVICE_ACCOUNT as JSON string');
                    console.error('\n📖 See backend/SETUP_FIREBASE.md for detailed instructions');
                    throw new Error('Firebase credentials not configured. See instructions above.');
                }
            }
        }

        if (!firebaseInitialized && serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id || 'safety-management-system-4faf0'}.firebaseio.com`,
            });
            firebaseInitialized = true;
            console.log('✅ Firebase Admin initialized successfully');
        }
    } catch (error) {
        console.error('❌ Firebase Admin initialization error:', error.message);
        // In production, throw error
        if (process.env.NODE_ENV === 'production') {
            throw error;
        }
        // In development, allow graceful failure for initialization script
        if (process.env.ALLOW_MISSING_CREDENTIALS !== 'true') {
            throw error;
        }
    }
}

// Export Firebase services
let db, auth, messaging;

if (firebaseInitialized || admin.apps.length > 0) {
    db = admin.firestore();
    auth = admin.auth();
    messaging = admin.messaging();
} else {
    // Create placeholder objects that will throw helpful errors
    db = null;
    auth = null;
    messaging = null;
}

export { db, auth, messaging, admin };

// Firestore Collections
export const COLLECTIONS = {
    USERS: 'users',
    EMERGENCIES: 'emergencies',
    MEDICAL_REQUESTS: 'medical_requests',
    SECURITY_ALERTS: 'security_alerts',
    WEATHER_UPDATES: 'weather_updates',
    MOVEMENT_ALERTS: 'movement_alerts',
    LOGS: 'logs',
    NOTIFICATIONS: 'notifications',
};

// FCM Topics
export const FCM_TOPICS = {
    SECURITY: 'security',
    MEDICAL: 'medical',
    STUDENTS: 'students',
    ADMINS: 'admins',
};

/**
 * Send FCM notification to a topic
 */
export const sendNotificationToTopic = async (topic, notification, data = {}) => {
    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                ...data,
                timestamp: new Date().toISOString(),
            },
            topic: topic,
        };

        const response = await messaging.send(message);
        console.log(`✅ Notification sent to topic ${topic}:`, response);
        return { success: true, messageId: response };
    } catch (error) {
        console.error(`❌ Error sending notification to topic ${topic}:`, error);
        return { success: false, error: error.message };
    }
};

/**
 * Send FCM notification to specific device tokens
 */
export const sendNotificationToTokens = async (tokens, notification, data = {}) => {
    try {
        const message = {
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                ...data,
                timestamp: new Date().toISOString(),
            },
        };

        const response = await messaging.sendEachForMulticast({
            tokens: Array.isArray(tokens) ? tokens : [tokens],
            ...message,
        });

        console.log(`✅ Notification sent to ${response.successCount} devices`);
        return { 
            success: true, 
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    } catch (error) {
        console.error('❌ Error sending notification to tokens:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Create action log
 */
export const createLog = async (adminId, role, action, details = {}) => {
    try {
        const logData = {
            adminId,
            role,
            action,
            details,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: new Date().toISOString(),
        };

        const logRef = await db.collection(COLLECTIONS.LOGS).add(logData);
        console.log(`✅ Log created: ${logRef.id}`);
        return logRef.id;
    } catch (error) {
        console.error('❌ Error creating log:', error);
        throw error;
    }
};

/**
 * Get user role from Firestore
 */
export const getUserRole = async (uid, email) => {
    try {
        // First, try by uid field (more reliable when docs are not keyed by uid)
        const byUid = await db.collection(COLLECTIONS.USERS)
            .where('uid', '==', uid)
            .limit(1)
            .get();

        if (!byUid.empty) {
            return byUid.docs[0].data().role;
        }

        // Fallback: try document id equals uid
        const docById = await db.collection(COLLECTIONS.USERS).doc(uid).get();
        if (docById.exists) {
            return docById.data().role;
        }

        // Fallback: try email match if provided
        if (email) {
            const byEmail = await db.collection(COLLECTIONS.USERS)
                .where('email', '==', email.toLowerCase())
                .limit(1)
                .get();
            if (!byEmail.empty) {
                return byEmail.docs[0].data().role;
            }
        }

        return null;
    } catch (error) {
        console.error('❌ Error getting user role:', error);
        return null;
    }
};

/**
 * Verify Firebase ID token and get user data
 */
export const verifyIdToken = async (idToken) => {
    try {
        const decodedToken = await auth.verifyIdToken(idToken);
        
        // Try to get user role from Firestore, but don't fail if it doesn't exist
        let role = null;
        try {
            role = await getUserRole(decodedToken.uid, decodedToken.email);
        } catch (roleError) {
            console.log('Could not get user role (user may not exist in Firestore yet):', roleError.message);
            // This is OK - user might be logging in for the first time
        }
        
        return {
            uid: decodedToken.uid,
            email: decodedToken.email,
            role: role || 'student', // Default to student if no role found
            emailVerified: decodedToken.email_verified || false,
        };
    } catch (error) {
        console.error('❌ Error verifying ID token:', error);
        throw error;
    }
};
