/**
 * Patches native packages whose "react-native" field in package.json
 * points to TypeScript source files that Metro cannot resolve on Android.
 * Redirects them to their compiled CommonJS output instead.
 *
 * Runs automatically via "postinstall" in package.json.
 */
const fs = require('fs');
const path = require('path');

const patches = [
    {
        pkg: '@react-native-async-storage/async-storage',
        field: 'react-native',
        value: 'lib/commonjs/index.js',
    },
    {
        pkg: 'react-native-webview',
        field: 'react-native',
        value: 'index.js',
    },
    {
        pkg: '@react-native-community/netinfo',
        field: 'react-native',
        value: 'lib/commonjs/index.js',
    },
];

let anyPatched = false;

for (const { pkg, field, value } of patches) {
    const pkgJsonPath = path.resolve(__dirname, '../node_modules', pkg, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
        console.log(`patch: ${pkg} not found, skipping.`);
        continue;
    }

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

    if (pkgJson[field] !== value) {
        pkgJson[field] = value;
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2), 'utf8');
        console.log(`patch: ${pkg} → ${field}: "${value}"`);
        anyPatched = true;
    } else {
        console.log(`patch: ${pkg} already OK.`);
    }
}

if (anyPatched) {
    console.log('Patches applied. Run "npx expo start --clear" to rebuild.');
}
