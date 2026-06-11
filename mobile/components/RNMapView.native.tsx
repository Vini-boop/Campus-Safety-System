/**
 * RNMapView.native.tsx
 *
 * Re-exports react-native-maps components for iOS/Android.
 * Metro COMPLETELY EXCLUDES .native.* files from web builds —
 * this file is never seen by the web bundler.
 *
 * All source files import from './RNMapView' (no extension).
 * Metro picks this file on native and RNMapView.tsx on web.
 */
export {
    default as MapView,
    Marker,
    Circle,
    Polyline,
    PROVIDER_GOOGLE,
    PROVIDER_DEFAULT,
} from 'react-native-maps';

export type { Region, MapViewProps } from 'react-native-maps';
