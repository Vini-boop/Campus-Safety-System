/**
 * withGoogleMapsKey.js
 *
 * Config plugin that runs LAST and ensures com.google.android.geo.API_KEY
 * is set to the correct value in AndroidManifest.xml, overriding any
 * value injected by react-native-maps or other plugins.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const MAPS_API_KEY = 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow'; // Maps SDK for Android

module.exports = function withGoogleMapsKey(config) {
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults.manifest;
        const application = manifest.application?.[0];
        if (!application) return config;

        // Ensure meta-data array exists
        if (!application['meta-data']) application['meta-data'] = [];

        // Remove any existing geo.API_KEY entries (from react-native-maps plugin etc.)
        application['meta-data'] = application['meta-data'].filter(
            (item) => item.$?.['android:name'] !== 'com.google.android.geo.API_KEY'
        );

        // Inject the correct key
        application['meta-data'].push({
            $: {
                'android:name': 'com.google.android.geo.API_KEY',
                'android:value': MAPS_API_KEY,
            },
        });

        console.log('✅ withGoogleMapsKey: injected Maps API key into AndroidManifest.xml');
        return config;
    });
};
