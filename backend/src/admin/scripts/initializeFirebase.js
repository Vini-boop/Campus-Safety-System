/**
 * Firebase Initialization Script
 * Preloads admin users into Firestore with proper roles
 * Run this once to set up the initial admin accounts
 */

import 'dotenv/config';
import { db, auth, COLLECTIONS } from '../services/firebaseAdmin.js';

const ADMIN_CREDENTIALS = [
    {
        email: 'superadmin@campus.edu',
        password: 'SuperAdmin@2025',
        role: 'superadmin',
        name: 'Super Admin',
    },
    {
        email: 'security@campus.edu',
        password: 'Security@2025',
        role: 'security',
        name: 'Security Admin',
    },
    {
        email: 'medical@campus.edu',
        password: 'Medical@2025',
        role: 'medical',
        name: 'Medical Admin',
    },
];

async function initializeAdmins() {
    console.log('🚀 Starting Firebase initialization...\n');

    // Check if Firebase is initialized
    if (!db || !auth) {
        console.error('❌ Firebase Admin is not initialized. Please configure credentials first.');
        console.error('📖 See backend/SETUP_FIREBASE.md for setup instructions');
        process.exit(1);
    }

    try {
        for (const admin of ADMIN_CREDENTIALS) {
            console.log(`📝 Processing ${admin.email}...`);

            // Check if user already exists in Firestore
            const existingUsers = await db.collection(COLLECTIONS.USERS)
                .where('email', '==', admin.email.toLowerCase())
                .limit(1)
                .get();

            let firebaseUser;
            let userDocId;

            if (!existingUsers.empty) {
                // User exists in Firestore
                const existingDoc = existingUsers.docs[0];
                userDocId = existingDoc.id;
                const existingData = existingDoc.data();

                if (existingData.uid) {
                    // Firebase Auth user exists
                    try {
                        firebaseUser = await auth.getUser(existingData.uid);
                        console.log(`   ✅ Firebase Auth user already exists: ${firebaseUser.uid}`);
                    } catch (err) {
                        if (err.code === 'auth/user-not-found') {
                            // Create new Firebase Auth user
                            firebaseUser = await auth.createUser({
                                email: admin.email,
                                password: admin.password,
                                emailVerified: true,
                                disabled: false,
                            });
                            console.log(`   ✅ Created Firebase Auth user: ${firebaseUser.uid}`);
                        } else {
                            throw err;
                        }
                    }
                } else {
                    // Create Firebase Auth user
                    firebaseUser = await auth.createUser({
                        email: admin.email,
                        password: admin.password,
                        emailVerified: true,
                        disabled: false,
                    });
                    console.log(`   ✅ Created Firebase Auth user: ${firebaseUser.uid}`);

                    // Update Firestore with UID
                    await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                        uid: firebaseUser.uid,
                    });
                }

                // ✅ Set custom claim so Firestore rules (request.auth.token.role) work
                await auth.setCustomUserClaims(firebaseUser.uid, { role: admin.role });
                console.log(`   ✅ Set custom claim: role=${admin.role}`);

                // Update user data
                await db.collection(COLLECTIONS.USERS).doc(userDocId).update({
                    role: admin.role,
                    name: admin.name,
                    email: admin.email.toLowerCase(),
                    updatedAt: new Date().toISOString(),
                });
                console.log(`   ✅ Updated Firestore user document`);
            } else {
                // Create new Firebase Auth user
                firebaseUser = await auth.createUser({
                    email: admin.email,
                    password: admin.password,
                    emailVerified: true,
                    disabled: false,
                });
                console.log(`   ✅ Created Firebase Auth user: ${firebaseUser.uid}`);

                // Create Firestore user document
                const userData = {
                    uid: firebaseUser.uid,
                    email: admin.email.toLowerCase(),
                    role: admin.role,
                    name: admin.name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                const userRef = await db.collection(COLLECTIONS.USERS).add(userData);
                userDocId = userRef.id;
                console.log(`   ✅ Created Firestore user document: ${userDocId}`);

                // ✅ Set custom claim so Firestore rules (request.auth.token.role) work
                await auth.setCustomUserClaims(firebaseUser.uid, { role: admin.role });
                console.log(`   ✅ Set custom claim: role=${admin.role}`);
            }

            console.log(`   ✅ ${admin.email} initialized successfully\n`);
        }

        console.log('✅ Firebase initialization completed successfully!');
        console.log('\n📋 Admin Credentials:');
        ADMIN_CREDENTIALS.forEach(admin => {
            console.log(`   ${admin.email} / ${admin.password} (${admin.role}) — custom claim set ✅`);
        });
        console.log('\n⚠️  IMPORTANT: Users must log out and back in for custom claims to take effect.');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        throw error;
    }
}

// Run initialization
initializeAdmins()
    .then(() => {
        console.log('\n🎉 All done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });

