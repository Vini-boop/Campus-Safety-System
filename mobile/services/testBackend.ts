/**
 * Mobile Backend Connectivity Test
 * Run this in the mobile app to test backend reachability
 */

import { validateApiConnection } from './networkUtils';
import { getApiBaseUrl } from './apiBaseUrl';

export const testBackendConnectivity = async () => {
  console.log('🧪 Testing Backend Connectivity...\n');
  
  const baseUrl = getApiBaseUrl();
  console.log(`Configured Base URL: ${baseUrl}\n`);
  
  // Test primary URL
  console.log('Testing primary URL...');
  const result = await validateApiConnection(baseUrl);
  
  console.log('\n═══════════════════════════════════════');
  console.log('CONNECTIVITY TEST RESULTS');
  console.log('═══════════════════════════════════════');
  console.log('Network OK:', result.networkOk ? '✅' : '❌');
  console.log('Server OK:', result.serverOk ? '✅' : '❌');
  console.log('Overall Valid:', result.valid ? '✅' : '❌');
  
  if (result.issues.length > 0) {
    console.log('\nIssues Found:');
    result.issues.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });
  }
  
  console.log('═══════════════════════════════════════\n');
  
  if (!result.valid) {
    console.log('⚠️  BACKEND NOT REACHABLE!\n');
    console.log('Troubleshooting Steps:');
    console.log('1. Check if backend is running:');
    console.log('   cd backend; npm start');
    console.log('');
    console.log('2. Verify backend logs show:');
    console.log('   "Server running in development mode on port 5000"');
    console.log('');
    console.log('3. Check firewall settings:');
    console.log('   - Windows Firewall may be blocking port 5000');
    console.log('   - Allow Node.js through firewall');
    console.log('');
    console.log('4. Try different API URLs:');
    console.log('   - Android Emulator: http://10.0.2.2:5000');
    console.log('   - Physical Device: http://YOUR_IP:5000');
    console.log('   - Your IP: Run ipconfig in cmd');
    console.log('');
    console.log('5. Clear Expo cache and restart:');
    console.log('   npx expo start -c');
    console.log('');
  } else {
    console.log('✅ BACKEND IS REACHABLE!\n');
    console.log('You can now try logging in.');
  }
  
  return result;
};

// Auto-run when imported (optional)
if (typeof window !== 'undefined') {
  console.log('📡 Backend connectivity test loaded. Call testBackendConnectivity() to run.\n');
}
