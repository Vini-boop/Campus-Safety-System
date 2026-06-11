/**
 * Network Diagnostic Test Script
 * 
 * Run this to test backend connectivity from the mobile app
 * 
 * Usage:
 * 1. Start your backend: cd backend; npm start
 * 2. Run this test in the mobile app context
 */

import { getNetworkStatus, testUrlReachability, validateApiConnection } from './networkUtils';
import { getApiBaseUrl } from './apiBaseUrl';

export const runNetworkDiagnostics = async () => {
  console.log('🔍 Starting Network Diagnostics...\n');
  
  // Test 1: Check network status
  console.log('📡 Test 1: Network Status');
  const networkStatus = await getNetworkStatus();
  console.log('   Connected:', networkStatus.isConnected);
  console.log('   Internet Reachable:', networkStatus.isInternetReachable);
  console.log('   Network Type:', networkStatus.type);
  console.log('   Details:', networkStatus.details);
  console.log('');
  
  // Test 2: Test backend health endpoint
  const API_BASE_URL = getApiBaseUrl();
  console.log(`🌐 Test 2: Backend Server Check (${API_BASE_URL})`);
  
  const healthResult = await testUrlReachability(`${API_BASE_URL}/health`);
  console.log('   Reachable:', healthResult.reachable);
  if (healthResult.responseTime) {
    console.log('   Response Time:', `${healthResult.responseTime}ms`);
  }
  if (healthResult.error) {
    console.log('   Error:', healthResult.error);
  }
  console.log('');
  
  // Test 3: Full API validation
  console.log('🔧 Test 3: Full API Connection Validation');
  const validationResult = await validateApiConnection(API_BASE_URL);
  console.log('   Valid:', validationResult.valid);
  console.log('   Network OK:', validationResult.networkOk);
  console.log('   Server OK:', validationResult.serverOk);
  if (validationResult.issues.length > 0) {
    console.log('   Issues Found:');
    validationResult.issues.forEach((issue, index) => {
      console.log(`     ${index + 1}. ${issue}`);
    });
  } else {
    console.log('   ✅ No issues detected');
  }
  console.log('');
  
  // Summary
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════');
  
  if (validationResult.valid) {
    console.log('✅ ALL TESTS PASSED');
    console.log('   Your network and backend server are working correctly!');
  } else {
    console.log('❌ TESTS FAILED');
    console.log('   Please check the issues above and fix them.');
    console.log('');
    console.log('   Common fixes:');
    console.log('   1. Make sure backend is running: cd backend; npm start');
    console.log('   2. Check .env.local has correct API URL');
    console.log('   3. Verify firewall allows connections');
    console.log('   4. For emulator: use http://10.0.2.2:5000');
    console.log('   5. For physical device: use your computer\'s LAN IP');
  }
  
  console.log('═══════════════════════════════════════\n');
  
  return validationResult;
};

// Auto-run when imported (for testing)
if (typeof window !== 'undefined') {
  console.log('🚀 Network diagnostics available. Call runNetworkDiagnostics() to test.');
}
