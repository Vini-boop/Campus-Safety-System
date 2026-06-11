/**
 * test-notifications.js
 *
 * Comprehensive test script for expo-notifications setup.
 * Run: node mobile/scripts/test-notifications.js
 *
 * Checks:
 *   1. expo-notifications package installed
 *   2. app.json notification plugin configured
 *   3. AndroidManifest.xml permissions present
 *   4. google-services.json exists
 *   5. Notification channels defined
 *   6. fcmService exports all required functions
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';

let passed = 0;
let failed = 0;
let warnings = 0;

function check(name, condition, failMsg = '', warnMsg = '') {
    if (condition === true) {
        console.log(`${PASS} ${name}`);
        passed++;
    } else if (condition === 'warn') {
        console.log(`${WARN} ${name}${warnMsg ? ': ' + warnMsg : ''}`);
        warnings++;
    } else {
        console.log(`${FAIL} ${name}${failMsg ? ': ' + failMsg : ''}`);
        failed++;
    }
}

console.log('\n🔔 Testing expo-notifications setup...\n');

// ── 1. Package installed ──────────────────────────────────────────────────────
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const hasNotifPkg = !!pkg.dependencies['expo-notifications'];
check('expo-notifications package installed', hasNotifPkg, 'Run: npm install expo-notifications');

if (hasNotifPkg) {
    const version = pkg.dependencies['expo-notifications'];
    console.log(`   Version: ${version}`);
}

// ── 2. app.json plugin configured ─────────────────────────────────────────────
const appJsonPath = path.join(ROOT, 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const plugins = appJson.expo?.plugins || [];
const notifPlugin = plugins.find(p => {
    if (typeof p === 'string') return p === 'expo-notifications';
    if (Array.isArray(p)) return p[0] === 'expo-notifications';
    return false;
});
check('app.json expo-notifications plugin configured', !!notifPlugin, 'Add expo-notifications to plugins array');

if (notifPlugin && Array.isArray(notifPlugin)) {
    const config = notifPlugin[1] || {};
    const channels = config.androidNotificationChannels || [];
    check('Android notification channels defined', channels.length > 0, 'Define at least one channel');

    if (channels.length > 0) {
        console.log(`   Channels: ${channels.map(c => c.id).join(', ')}`);

        const emergencyChannel = channels.find(c => c.id === 'campus_emergency');
        check('Emergency channel (campus_emergency) exists', !!emergencyChannel);

        if (emergencyChannel) {
            check('Emergency channel has MAX importance', emergencyChannel.importance === 'MAX');
            check('Emergency channel bypasses DND', emergencyChannel.bypassDnd === true, '', 'bypassDnd not set');
        }
    }
}

// ── 3. AndroidManifest.xml permissions ────────────────────────────────────────
const manifestPath = path.join(ROOT, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    check('POST_NOTIFICATIONS permission', manifest.includes('android.permission.POST_NOTIFICATIONS'));
    check('RECEIVE_BOOT_COMPLETED permission', manifest.includes('android.permission.RECEIVE_BOOT_COMPLETED'));
    check('VIBRATE permission', manifest.includes('android.permission.VIBRATE'));
    check('SYSTEM_ALERT_WINDOW permission', manifest.includes('android.permission.SYSTEM_ALERT_WINDOW'));
} else {
    check('AndroidManifest.xml exists', 'warn', '', 'Run: npx expo prebuild to generate native files');
}

// ── 4. google-services.json ───────────────────────────────────────────────────
const googleServicesPath = path.join(ROOT, 'google-services.json');
check('google-services.json exists', fs.existsSync(googleServicesPath), 'Download from Firebase Console');

// ── 5. fcmService exports ─────────────────────────────────────────────────────
const fcmServicePath = path.join(ROOT, 'services/fcmService.ts');
if (fs.existsSync(fcmServicePath)) {
    const fcmService = fs.readFileSync(fcmServicePath, 'utf8');
    check('setupNotificationHandler exported', fcmService.includes('export const setupNotificationHandler'));
    check('setupNotificationChannels exported', fcmService.includes('export const setupNotificationChannels'));
    check('sendLocalNotification exported', fcmService.includes('export const sendLocalNotification'));
    check('registerForPushNotificationsAsync exported', fcmService.includes('export const registerForPushNotificationsAsync'));

    // Check channel IDs match app.json
    const channelIds = fcmService.match(/campus_emergency|campus_medical|campus_security|campus_general/g) || [];
    check('Channel IDs defined in fcmService', channelIds.length >= 4);
} else {
    check('fcmService.ts exists', false, 'File not found');
}

// ── 6. _layout.tsx setup ──────────────────────────────────────────────────────
const layoutPath = path.join(ROOT, 'app/_layout.tsx');
if (fs.existsSync(layoutPath)) {
    const layout = fs.readFileSync(layoutPath, 'utf8');
    check('setupNotificationHandler called in _layout', layout.includes('setupNotificationHandler()'));
    check('setupNotificationChannels called in _layout', layout.includes('setupNotificationChannels()'));
    check('registerForPushNotificationsAsync called in _layout', layout.includes('registerForPushNotificationsAsync()'));
    check('NotificationHandler component exists', layout.includes('function NotificationHandler'));
    check('FirestoreNotificationWatcher component exists', layout.includes('function FirestoreNotificationWatcher'));
} else {
    check('_layout.tsx exists', false, 'File not found');
}

// ── 7. geofencing.ts integration ──────────────────────────────────────────────
const geofencingPath = path.join(ROOT, 'services/geofencing.ts');
if (fs.existsSync(geofencingPath)) {
    const geofencing = fs.readFileSync(geofencingPath, 'utf8');
    check('geofencing imports sendLocalNotification', geofencing.includes("import { sendLocalNotification } from '@/services/fcmService'"));
    check('geofencing uses sendLocalNotification', geofencing.includes('await sendLocalNotification('));

    const riskZones = geofencing.match(/id:\s*'[^']+'/g) || [];
    check('Risk zones defined', riskZones.length > 0);
    console.log(`   Risk zones: ${riskZones.length}`);

    check('Time-gated zones (activeHours) implemented', geofencing.includes('activeHours'));
    check('Proximity warning (warnRadius) implemented', geofencing.includes('warnRadius'));
} else {
    check('geofencing.ts exists', false, 'File not found');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`${PASS} Passed: ${passed}`);
if (warnings > 0) console.log(`${WARN} Warnings: ${warnings}`);
if (failed > 0) console.log(`${FAIL} Failed: ${failed}`);
console.log('─'.repeat(60));

if (failed === 0 && warnings === 0) {
    console.log('\n🎉 All checks passed! expo-notifications is properly configured.\n');
    console.log('Next steps:');
    console.log('  1. Run: npx expo prebuild --clean (if AndroidManifest warning)');
    console.log('  2. Build: eas build --platform android --profile preview');
    console.log('  3. Install APK on physical device');
    console.log('  4. Grant notification permission when prompted');
    console.log('  5. Test geofencing by walking near risk zones\n');
} else if (failed === 0) {
    console.log('\n✅ Core setup complete. Review warnings above.\n');
} else {
    console.log('\n❌ Setup incomplete. Fix failed checks above.\n');
    process.exit(1);
}
