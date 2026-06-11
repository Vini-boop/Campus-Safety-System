/**
 * Web stub for react-native-maps.
 *
 * react-native-maps cannot be bundled for the web platform because it
 * imports native-only React Native internals. This stub exports no-op
 * components so that any file that imports react-native-maps on web
 * renders nothing instead of crashing the bundler.
 *
 * Mapped via metro.config.js → config.resolver.resolveRequest on web.
 */
import React from 'react';
import { View } from 'react-native';

const Noop = () => null;

// Named exports that consumers of react-native-maps use
export const Marker = Noop;
export const Circle = Noop;
export const Polyline = Noop;
export const Polygon = Noop;
export const Callout = Noop;
export const Overlay = Noop;
export const Heatmap = Noop;
export const Geojson = Noop;

// Provider constants
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

// Default export – MapView itself
const MapView = ({ style, children }) => (
    <View style={[{ backgroundColor: '#1e2347' }, style]}>{children}</View>
);

export default MapView;
