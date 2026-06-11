import { auth, db, testFirebaseConnection } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

class AuthTestService {
  // Test Firebase connectivity - use the improved function from firebase.ts
  async testFirebaseConnection(): Promise<TestResult> {
    try {
      console.log('🔍 Testing Firebase connection...');
      
      // Use the enhanced test function from firebase.ts
      const result = await testFirebaseConnection();
      
      return {
        success: result.success,
        message: result.message,
        details: result.details
      };
    } catch (error: any) {
      console.error('❌ Firebase connection test failed:', error);
      return {
        success: false,
        message: `Firebase connection failed: ${error.message}`,
        details: {
          errorCode: error.code,
          errorMessage: error.message
        }
      };
    }
  }

  // Test authentication with test credentials
  async testAuthWithCredentials(email: string, password: string): Promise<TestResult> {
    try {
      console.log('🔍 Testing authentication...');
      
      if (!email || !password) {
        return {
          success: false,
          message: 'Email and password are required'
        };
      }

      // Test sign in
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Test user profile access
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      return {
        success: true,
        message: 'Authentication successful',
        details: {
          userId: userCredential.user.uid,
          email: userCredential.user.email,
          userExists: userDoc.exists(),
          displayName: userCredential.user.displayName
        }
      };
    } catch (error: any) {
      console.error('❌ Authentication test failed:', error);
      return {
        success: false,
        message: `Authentication failed: ${error.message}`,
        details: {
          errorCode: error.code,
          errorMessage: error.message
        }
      };
    }
  }

  // Create test user (for development)
  async createTestUser(email: string, password: string, role: string = 'student'): Promise<TestResult> {
    try {
      console.log('🔍 Creating test user...');
      
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create user profile in Firestore
      const userProfile = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: email.split('@')[0],
        role: role,
        isActive: true,
        createdAt: new Date().toISOString(),
        hostelName: 'Test Hostel',
        roomNumber: 'Test Room'
      };
      
      await setDoc(doc(db, 'users', userCredential.user.uid), userProfile);
      
      return {
        success: true,
        message: 'Test user created successfully',
        details: {
          userId: userCredential.user.uid,
          email: userCredential.user.email,
          role: role
        }
      };
    } catch (error: any) {
      console.error('❌ Test user creation failed:', error);
      return {
        success: false,
        message: `User creation failed: ${error.message}`,
        details: {
          errorCode: error.code,
          errorMessage: error.message
        }
      };
    }
  }

  // Get diagnostic information
  async getDiagnostics(): Promise<TestResult> {
    try {
      const diagnostics = {
        firebase: {
          auth: !!auth,
          db: !!db,
          app: auth?.app?.name || 'Unknown'
        },
        auth: {
          currentUser: auth?.currentUser ? {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            emailVerified: auth.currentUser.emailVerified
          } : null,
          config: auth?.app?.options ? {
            apiKey: auth.app.options.apiKey ? 'Set' : 'Missing',
            authDomain: auth.app.options.authDomain,
            projectId: auth.app.options.projectId
          } : 'No config'
        },
        environment: {
          platform: typeof window !== 'undefined' ? 'web' : 'mobile',
          timestamp: new Date().toISOString()
        }
      };

      return {
        success: true,
        message: 'Diagnostics collected',
        details: diagnostics
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Diagnostics failed: ${error.message}`,
        details: error
      };
    }
  }

  // Common test credentials for development
  static getTestCredentials() {
    return {
      student: {
        email: 'student@campus.edu',
        password: 'Test123456'
      },
      security: {
        email: 'security@campus.edu',
        password: 'Security123'
      },
      doctor: {
        email: 'doctor@campus.edu',
        password: 'Doctor123'
      }
    };
  }

  // Create test user if doesn't exist
  static async ensureTestUser(email: string, password: string, role: string = 'student'): Promise<TestResult> {
    try {
      const authInstance = auth;
      const dbInstance = db;
      
      // Try to sign in first to see if user exists
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return {
          success: true,
          message: 'Test user already exists',
          details: { userId: userCredential.user.uid, email: userCredential.user.email }
        };
      } catch (signInError: any) {
        // If user doesn't exist, create them
        if (signInError.code === 'auth/user-not-found') {
          const newUserCredential = await createUserWithEmailAndPassword(auth, email, password);
          
          // Create user profile in Firestore
          const userProfile = {
            uid: newUserCredential.user.uid,
            email: newUserCredential.user.email,
            displayName: email.split('@')[0],
            role: role,
            isActive: true,
            createdAt: new Date().toISOString(),
            hostelName: 'Test Hostel',
            roomNumber: 'Test Room',
            fullName: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1)
          };
          
          await setDoc(doc(db, 'users', newUserCredential.user.uid), userProfile);
          
          return {
            success: true,
            message: 'Test user created successfully',
            details: {
              userId: newUserCredential.user.uid,
              email: newUserCredential.user.email,
              role: role
            }
          };
        } else {
          throw signInError;
        }
      }
    } catch (error: any) {
      console.error('❌ Test user creation failed:', error);
      return {
        success: false,
        message: `Test user creation failed: ${error.message}`,
        details: {
          errorCode: error.code,
          errorMessage: error.message
        }
      };
    }
  }
}

const authTestService = new AuthTestService();
export default authTestService;
export { AuthTestService };
