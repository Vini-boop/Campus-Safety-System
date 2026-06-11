// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// ── Windows: fix file watching & cache ────────────────────────────────────────
config.watchFolders = [
  projectRoot,
  path.resolve(projectRoot, 'node_modules/@expo/vector-icons'),
  path.resolve(projectRoot, 'node_modules/react-native-vector-icons'),
];
config.cacheStores = [
  new (require('metro-cache').FileStore)({
    root: path.join(require('os').tmpdir(), 'metro-cache'),
  }),
];
config.watcher = {
  ...config.watcher,
  healthCheck: { enabled: true, interval: 5000, timeout: 30000 },
};

// ── Asset extensions ──────────────────────────────────────────────────────────
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'db', 'gltf', 'glb', 'mtl', 'obj', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
];

// ── Path alias configuration ─────────────────────────────────────────────────
// Add @ alias to resolve to the project root (for imports like @/services/*)
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@': projectRoot,
};

// ── Web: block ALL react-native-maps imports ──────────────────────────────────
//
// WHY this is necessary:
//   Metro builds the full dependency graph *statically* before applying any
//   Platform.OS dead-code elimination.  Because our source files contain
//   `require('react-native-maps')` (even inside a Platform guard), Metro
//   eagerly follows every import inside the real package:
//     react-native-maps → MapMarker → MapMarkerNativeComponent
//       → react-native/Libraries/Utilities/codegenNativeCommands  ← CRASH
//
//   The resolver hook below intercepts imports at graph-build time for the web
//   platform, replacing ANY react-native-maps-related import with a harmless
//   no-op stub BEFORE Metro ever tries to load the native code.
//
const RNM_PKG_DIR = path.resolve(projectRoot, 'node_modules', 'react-native-maps');
const WEB_STUB = path.resolve(projectRoot, 'modules', 'react-native-maps-web-stub.js');

// Tiny empty-module stub for deep native-only RN internals (e.g. codegenNativeCommands)
const EMPTY_STUB = path.resolve(projectRoot, 'modules', 'empty-stub.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force async-storage to compiled JS (its react-native field points to .ts source
  // which Metro can't always resolve on Android)
  if (moduleName === '@react-native-async-storage/async-storage') {
    return {
      filePath: path.resolve(
        projectRoot,
        'node_modules/@react-native-async-storage/async-storage/lib/commonjs/index.js'
      ),
      type: 'sourceFile',
    };
  }

  if (platform === 'web') {
    // 1. Top-level package name
    if (moduleName === 'react-native-maps') {
      return { filePath: WEB_STUB, type: 'sourceFile' };
    }

    // 2. Any relative import originating INSIDE the react-native-maps package
    //    (e.g. './MapMarker', './MapMarkerNativeComponent')
    const origin = context.originModulePath || '';
    if (origin.startsWith(RNM_PKG_DIR)) {
      return { filePath: WEB_STUB, type: 'sourceFile' };
    }

    // 3. Specific RN native-only internals that react-native-maps pulls in
    if (
      moduleName === 'react-native/Libraries/Utilities/codegenNativeCommands' ||
      moduleName.startsWith('react-native/Libraries/Utilities/codegenNative') ||
      moduleName.includes('NativeComponent') ||
      moduleName.includes('codegenNative')
    ) {
      return { filePath: EMPTY_STUB, type: 'sourceFile' };
    }
  }

  // Default resolver for everything else
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

