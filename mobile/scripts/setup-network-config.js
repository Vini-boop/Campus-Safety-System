#!/usr/bin/env node

/**
 * Setup script for mobile app network configuration
 * This ensures all necessary Android configurations are in place
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up mobile app network configuration...\n');

// Check if .env.local exists
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env.local file not found!');
  console.log('Creating .env.local with default configuration...\n');
  
  const defaultEnv = `# Mobile App Environment Configuration
# ======================================

# API Base URL Configuration
# --------------------------
# CHOOSE THE APPROPRIATE URL FOR YOUR SETUP:

# For Android Emulator (maps to host machine):
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:5000

# For Physical Device on same network (replace with your machine's IP):
# Find your IP with: ipconfig (Windows) or ifconfig (Mac/Linux)
# EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:5000

# For Web Development:
# EXPO_PUBLIC_API_BASE_URL=http://localhost:5000

# Firebase Configuration (Web config from Firebase Console)
# ---------------------------------------------------------
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyA1i7mNhoaRlWAYeH0RRagOeFAOEFZAUXc
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=safety-management-system-4faf0.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=safety-management-system-4faf0
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=safety-management-system-4faf0.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=796748500304
EXPO_PUBLIC_FIREBASE_APP_ID=1:796748500304:web:f7968bf4b6b8d447edb055
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XY2MMK95ZP
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=796748500304-5ua8hqd6lqoghi1pq8k38v28ahs4ec6d.apps.googleusercontent.com
`;

  fs.writeFileSync(envPath, defaultEnv);
  console.log('✅ Created .env.local\n');
} else {
  console.log('✅ .env.local already exists\n');
}

// Check if cleartext traffic plugin exists
const pluginPath = path.join(__dirname, '..', 'withAllowCleartextTraffic.js');
if (!fs.existsSync(pluginPath)) {
  console.log('❌ Cleartext traffic plugin not found!');
  console.log('Creating cleartext traffic plugin...\n');
  
  const pluginContent = `const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin to allow cleartext HTTP traffic for development
 * This is needed because Android blocks HTTP connections by default
 */
function withAllowCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Find the application element
    const application = androidManifest.manifest.application?.[0];

    if (application) {
      // Add usesCleartextTraffic attribute
      application.$['android:usesCleartextTraffic'] = 'true';
      
      console.log('✅ Added android:usesCleartextTraffic="true" to AndroidManifest.xml');
    }

    return config;
  });
}

module.exports = withAllowCleartextTraffic;
`;
  
  fs.writeFileSync(pluginPath, pluginContent);
  console.log('✅ Created cleartext traffic plugin\n');
} else {
  console.log('✅ Cleartext traffic plugin exists\n');
}

// Check if app.json includes the plugin
const appJsonPath = path.join(__dirname, '..', 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const hasCleartextPlugin = appJson.expo.plugins?.some(plugin => 
  typeof plugin === 'string' && plugin.includes('withAllowCleartextTraffic')
);

if (!hasCleartextPlugin) {
  console.log('⚠️  Cleartext traffic plugin not configured in app.json');
  console.log('Please add "./withAllowCleartextTraffic.js" to the plugins array in app.json\n');
} else {
  console.log('✅ Cleartext traffic plugin configured in app.json\n');
}

// Check if INTERNET permission is in app.json
const hasInternetPermission = appJson.expo.android?.permissions?.includes(
  'android.permission.INTERNET'
);

if (!hasInternetPermission) {
  console.log('⚠️  INTERNET permission not found in app.json');
  console.log('Adding INTERNET permission to app.json...\n');
  
  if (!appJson.expo.android) {
    appJson.expo.android = {};
  }
  if (!appJson.expo.android.permissions) {
    appJson.expo.android.permissions = [];
  }
  
  appJson.expo.android.permissions.push('android.permission.INTERNET');
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
  console.log('✅ Added INTERNET permission to app.json\n');
} else {
  console.log('✅ INTERNET permission configured in app.json\n');
}

console.log('═══════════════════════════════════════════');
console.log('✅ Network configuration setup complete!');
console.log('═══════════════════════════════════════════\n');

console.log('Next steps:');
console.log('1. Update EXPO_PUBLIC_API_BASE_URL in .env.local with your setup');
console.log('   - Android Emulator: http://10.0.2.2:5000');
console.log('   - Physical Device: http://YOUR_IP:5000');
console.log('   - Web: http://localhost:5000\n');

console.log('2. Run prebuild to generate Android native files:');
console.log('   npx expo prebuild --clean\n');

console.log('3. Start the development server:');
console.log('   npx expo start -c\n');

console.log('4. Test the connection:');
console.log('   - Backend should be running: cd backend; npm start');
console.log('   - Test health endpoint: http://localhost:5000/health\n');
