/**
 * Mobile API Testing Utility
 * Run this in your browser console or import in a test component
 */

import WeatherService from '../services/weatherService';
import { api } from '../services/api';

export const testAllAPIs = async () => {
  console.log('🧪 MOBILE API TEST SUITE\n');
  console.log('═══════════════════════════════════════\n');
  
  const results: any = {};
  
  // Test 1: Weather API
  console.log('🌤️  Testing Weather API...');
  try {
    const weather = await WeatherService.getWeatherByCoordinates(0.0417, 36.2920);
    if (weather) {
      console.log('✅ Weather API working');
      console.log(`   Temp: ${weather.temperature}°C`);
      console.log(`   Condition: ${weather.description}`);
      results.weather = true;
    } else {
      console.log('❌ Weather API returned null');
      results.weather = false;
    }
  } catch (error: any) {
    console.error('❌ Weather API error:', error.message);
    results.weather = false;
  }
  
  console.log('');
  
  // Test 2: Backend Connection
  console.log('🔌 Testing Backend Connection...');
  try {
    const connectionTest = await api.testConnection();
    if (connectionTest.success) {
      console.log('✅ Backend connected');
      console.log(`   URL: ${connectionTest.details?.baseURL}`);
      results.backend = true;
    } else {
      console.log('❌ Backend connection failed');
      console.log(`   Error: ${connectionTest.message}`);
      results.backend = false;
    }
  } catch (error: any) {
    console.error('❌ Backend error:', error.message);
    results.backend = false;
  }
  
  console.log('');
  
  // Test 3: Firebase Auth (if user is logged in)
  console.log('🔥 Testing Firebase Auth...');
  try {
    const { auth } = await import('../services/firebase');
    const user = auth.currentUser;
    if (user) {
      console.log('✅ User is authenticated');
      console.log(`   UID: ${user.uid}`);
      console.log(`   Email: ${user.email}`);
      results.firebaseAuth = true;
      
      // Test token
      const token = await user.getIdToken();
      console.log('✅ Firebase token obtained');
      console.log(`   Token: ${token.substring(0, 20)}...`);
    } else {
      console.log('⚠️  No user logged in');
      results.firebaseAuth = false;
    }
  } catch (error: any) {
    console.error('❌ Firebase Auth error:', error.message);
    results.firebaseAuth = false;
  }
  
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('📊 TEST RESULTS');
  console.log('═══════════════════════════════════════\n');
  
  Object.entries(results).forEach(([name, passed]) => {
    console.log(`${name}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  const allPassed = Object.values(results).every(v => v);
  
  console.log('\n═══════════════════════════════════════\n');
  
  if (allPassed) {
    console.log('🎉 All API tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above.');
  }
  
  return results;
};

// Quick test function
export const quickTest = async () => {
  console.log('⚡ Quick API Test...');
  
  try {
    const weather = await WeatherService.getWeatherByCoordinates(0.0417, 36.2920);
    console.log(weather ? '✅ APIs working' : '❌ API issue');
    return !!weather;
  } catch (e) {
    console.log('❌ API error');
    return false;
  }
};

export default { testAllAPIs, quickTest };
