const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin to allow cleartext traffic in Android
 * This is useful for development when connecting to local HTTP servers
 */
module.exports = function withAllowCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Find the application element in AndroidManifest.xml
    const application = androidManifest.manifest.application?.[0];

    if (application) {
      // Set android:usesCleartextTraffic="true"
      application.$['android:usesCleartextTraffic'] = 'true';
      
      console.log('✅ Added android:usesCleartextTraffic="true" to AndroidManifest.xml');
    }

    return config;
  });
};
