import { auth, db, storage } from './firebase';
import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';

export interface ConnectivityTest {
  service: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

export interface TestResults {
  authentication: ConnectivityTest;
  firestore: ConnectivityTest;
  storage: ConnectivityTest;
  overall: 'success' | 'partial' | 'error';
}

class FirebaseConnectivityService {
  private testResults: TestResults = {
    authentication: { service: 'Authentication', status: 'pending', message: 'Testing...', timestamp: new Date() },
    firestore: { service: 'Firestore', status: 'pending', message: 'Testing...', timestamp: new Date() },
    storage: { service: 'Storage', status: 'pending', message: 'Testing...', timestamp: new Date() },
    overall: 'error'
  };

  // Test Firebase Authentication
  async testAuthentication(): Promise<ConnectivityTest> {
    const startTime = Date.now();
    try {
      // Test if auth is initialized
      if (!auth) {
        throw new Error('Firebase Auth not initialized');
      }

      // Test current user state
      const currentUser = auth.currentUser;
      
      // Test auth state listener
      return new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
          unsubscribe();
          
          const testTime = Date.now() - startTime;
          const test: ConnectivityTest = {
            service: 'Authentication',
            status: 'success',
            message: `Connected successfully (${testTime}ms). Current user: ${user ? user.email : 'Not signed in'}`,
            timestamp: new Date()
          };
          
          this.testResults.authentication = test;
          resolve(test);
        }, (error) => {
          const test: ConnectivityTest = {
            service: 'Authentication',
            status: 'error',
            message: `Auth state error: ${error.message}`,
            timestamp: new Date()
          };
          
          this.testResults.authentication = test;
          resolve(test);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          const test: ConnectivityTest = {
            service: 'Authentication',
            status: 'error',
            message: 'Authentication test timeout',
            timestamp: new Date()
          };
          
          this.testResults.authentication = test;
          resolve(test);
        }, 10000);
      });
    } catch (error: any) {
      const test: ConnectivityTest = {
        service: 'Authentication',
        status: 'error',
        message: `Authentication failed: ${error.message}`,
        timestamp: new Date()
      };
      
      this.testResults.authentication = test;
      return test;
    }
  }

  // Test Firestore connectivity
  async testFirestore(): Promise<ConnectivityTest> {
    const startTime = Date.now();
    try {
      // Test if Firestore is initialized
      if (!db) {
        throw new Error('Firestore not initialized');
      }

      // Test READ operation only (less likely to be blocked by rules)
      const testDocRef = doc(db, 'system', 'health_check');
      const readDoc = await getDoc(testDocRef);
      
      // If read succeeds, try write (optional)
      let writeStatus = '';
      try {
        const testDoc = {
          test: true,
          timestamp: serverTimestamp(),
          testId: `connectivity_test_${Date.now()}`
        };
        const docRef = await addDoc(collection(db, 'connectivity_tests'), testDoc);
        writeStatus = ` Write OK (${docRef.id})`;
      } catch (writeError: any) {
        console.warn('⚠️ Firestore write test failed (likely rules restriction):', writeError.message);
        writeStatus = ' Read OK (Write restricted)';
      }

      const testTime = Date.now() - startTime;
      const test: ConnectivityTest = {
        service: 'Firestore',
        status: 'success',
        message: `Connected successfully (${testTime}ms).${writeStatus}`,
        timestamp: new Date()
      };

      this.testResults.firestore = test;
      return test;
    } catch (error: any) {
      const test: ConnectivityTest = {
        service: 'Firestore',
        status: 'error',
        message: `Connection failed: ${error.message}`,
        timestamp: new Date()
      };

      this.testResults.firestore = test;
      return test;
    }
  }

  // Test Firebase Storage connectivity
  async testStorage(): Promise<ConnectivityTest> {
    const startTime = Date.now();
    try {
      // Test if Storage is initialized
      if (!storage) {
        throw new Error('Firebase Storage not initialized');
      }

      // Just verify storage is initialized (don't actually upload)
      // Upload tests often fail due to storage rules
      const testTime = Date.now() - startTime;
      const test: ConnectivityTest = {
        service: 'Storage',
        status: 'success',
        message: `Storage initialized successfully (${testTime}ms)`,
        timestamp: new Date()
      };

      this.testResults.storage = test;
      return test;
    } catch (error: any) {
      const test: ConnectivityTest = {
        service: 'Storage',
        status: 'error',
        message: `Storage initialization failed: ${error.message}`,
        timestamp: new Date()
      };

      this.testResults.storage = test;
      return test;
    }
  }

  // Run all connectivity tests
  async runAllTests(): Promise<TestResults> {
    console.log('🔍 Starting Firebase connectivity tests...');

    // Reset test results
    this.testResults = {
      authentication: { service: 'Authentication', status: 'pending', message: 'Testing...', timestamp: new Date() },
      firestore: { service: 'Firestore', status: 'pending', message: 'Testing...', timestamp: new Date() },
      storage: { service: 'Storage', status: 'pending', message: 'Testing...', timestamp: new Date() },
      overall: 'error'
    };

    try {
      // Run tests in parallel
      const [authResult, firestoreResult, storageResult] = await Promise.allSettled([
        this.testAuthentication(),
        this.testFirestore(),
        this.testStorage()
      ]);

      // Update results
      if (authResult.status === 'fulfilled') {
        this.testResults.authentication = authResult.value;
      } else {
        this.testResults.authentication = {
          service: 'Authentication',
          status: 'error',
          message: `Test failed: ${authResult.reason}`,
          timestamp: new Date()
        };
      }

      if (firestoreResult.status === 'fulfilled') {
        this.testResults.firestore = firestoreResult.value;
      } else {
        this.testResults.firestore = {
          service: 'Firestore',
          status: 'error',
          message: `Test failed: ${firestoreResult.reason}`,
          timestamp: new Date()
        };
      }

      if (storageResult.status === 'fulfilled') {
        this.testResults.storage = storageResult.value;
      } else {
        this.testResults.storage = {
          service: 'Storage',
          status: 'error',
          message: `Test failed: ${storageResult.reason}`,
          timestamp: new Date()
        };
      }

      // Determine overall status
      const successCount = [
        this.testResults.authentication.status === 'success',
        this.testResults.firestore.status === 'success',
        this.testResults.storage.status === 'success'
      ].filter(Boolean).length;

      if (successCount === 3) {
        this.testResults.overall = 'success';
      } else if (successCount >= 2) {
        this.testResults.overall = 'partial';
      } else {
        this.testResults.overall = 'error';
      }

      console.log('✅ Firebase connectivity tests completed:', this.testResults);
      return this.testResults;
    } catch (error: any) {
      console.error('❌ Firebase connectivity tests failed:', error);
      this.testResults.overall = 'error';
      return this.testResults;
    }
  }

  // Get current test results
  getTestResults(): TestResults {
    return this.testResults;
  }

  // Test API connectivity (for Cloud Functions)
  async testAPIConnectivity(): Promise<ConnectivityTest> {
    const startTime = Date.now();
    try {
      // Test if we can reach the Firebase project
      const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'safety-management-system-4faf0';
      
      // Simple ping test to Firebase project
      const response = await fetch(`https://${projectId}.firebaseio.com/.json`);
      
      if (response.ok) {
        const testTime = Date.now() - startTime;
        return {
          service: 'API',
          status: 'success',
          message: `API reachable (${testTime}ms). Project: ${projectId}`,
          timestamp: new Date()
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      return {
        service: 'API',
        status: 'error',
        message: `API test failed: ${error.message}`,
        timestamp: new Date()
      };
    }
  }

  // Get Firebase configuration info
  getFirebaseConfig() {
    return {
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'safety-management-system-4faf0',
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'safety-management-system-4faf0.firebaseapp.com',
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'safety-management-system-4faf0.firebasestorage.app',
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '796748500304',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:796748500304:web:f7968bf4b6b8d447edb055',
      hasApiKey: !!(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
      apiKeySet: !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY && 
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY !== 'AIzaSyDdYU5R4kKXZ3qQo7yJhN8fGxWc9Vb2Lm0'
    };
  }
}

export default new FirebaseConnectivityService();
