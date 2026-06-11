import { db, auth, COLLECTIONS } from '../services/firebaseAdmin.js';

const demoAdmins = [
    { email: 'admin@campus.edu', password: 'admin123', role: 'superadmin', name: 'Admin User' },
    { email: 'security@campus.edu', password: 'security123', role: 'security', name: 'Security Admin' },
    { email: 'medical@campus.edu', password: 'medical123', role: 'medical', name: 'Medical Admin' },
];

const ensureUser = async ({ email, password, role, name }) => {
    const normalizedEmail = email.toLowerCase();

    // Ensure Firestore doc exists
    const fsSnapshot = await db.collection(COLLECTIONS.USERS)
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

    let userDocRef;
    if (fsSnapshot.empty) {
        userDocRef = await db.collection(COLLECTIONS.USERS).add({
            email: normalizedEmail,
            role,
            name,
            createdAt: new Date().toISOString(),
        });
        console.log(`➕ Created Firestore user doc for ${normalizedEmail} (${role})`);
    } else {
        userDocRef = fsSnapshot.docs[0].ref;
        console.log(`✔️ Firestore doc already exists for ${normalizedEmail}`);
    }

    // Ensure Firebase Auth user exists
    let firebaseUser;
    try {
        firebaseUser = await auth.getUserByEmail(normalizedEmail);
        console.log(`✔️ Firebase Auth user exists for ${normalizedEmail}`);
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            firebaseUser = await auth.createUser({
                email: normalizedEmail,
                password,
                emailVerified: true,
                disabled: false,
            });
            console.log(`➕ Created Firebase Auth user for ${normalizedEmail}`);
        } else {
            throw err;
        }
    }

    // Link Firestore doc to Firebase UID
    await userDocRef.set({
        uid: firebaseUser.uid,
        email: normalizedEmail,
        role,
        name,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
};

const run = async () => {
    try {
        for (const user of demoAdmins) {
            await ensureUser(user);
        }
        console.log('\n✅ Demo admin users are ready.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding admin users:', error);
        process.exit(1);
    }
};

run();

