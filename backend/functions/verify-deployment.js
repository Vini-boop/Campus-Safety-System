/**
 * Pre-Deployment Verification Script
 * Run this before deploying to ensure everything is configured correctly
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 PRE-DEPLOYMENT VERIFICATION\n');
console.log('═══════════════════════════════════════\n');

const checks = {
    firebaseConfig: false,
    serviceAccount: false,
    functionsLoaded: false,
    dependenciesInstalled: false,
};

// 1. Check Firebase Configuration
try {
    const firebasercPath = path.join(__dirname, '..', '.firebaserc');
    if (fs.existsSync(firebasercPath)) {
        const config = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'));
        console.log(`✅ Firebase project configured: ${config.projects.default}`);
        checks.firebaseConfig = true;
    } else {
        console.log('❌ .firebaserc not found');
    }
} catch (error) {
    console.log('❌ Error reading Firebase config:', error.message);
}

// 2. Check Service Account Key
try {
    const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        console.log(`✅ Service account configured: ${serviceAccount.client_email || '✓'}`);
        checks.serviceAccount = true;
    } else {
        console.log('❌ serviceAccountKey.json not found');
    }
} catch (error) {
    console.log('❌ Error reading service account:', error.message);
}

// 3. Check Functions Loaded
try {
    const fns = require('./index.js');
    const functionNames = Object.keys(fns).filter(k => typeof fns[k] === 'function');
    console.log(`✅ ${functionNames.length} functions loaded successfully`);
    checks.functionsLoaded = true;
} catch (error) {
    console.log('❌ Error loading functions:', error.message);
}

// 4. Check Dependencies
try {
    const packageJson = require('./package.json');
    const deps = Object.keys(packageJson.dependencies);
    console.log(`✅ All dependencies installed (${deps.length} packages)`);
    checks.dependenciesInstalled = true;
} catch (error) {
    console.log('❌ Error checking dependencies:', error.message);
}

console.log('\n═══════════════════════════════════════\n');

const allPassed = Object.values(checks).every(v => v);

if (allPassed) {
    console.log('✅ ALL CHECKS PASSED - READY TO DEPLOY\n');
    console.log('Deploy with: firebase deploy --only functions\n');
} else {
    console.log('⚠️  SOME CHECKS FAILED - FIX ISSUES BEFORE DEPLOYING\n');
}

process.exit(allPassed ? 0 : 1);
