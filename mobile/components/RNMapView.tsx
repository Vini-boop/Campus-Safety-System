/**
 * RNMapView.tsx  (web + fallback stub)
 *
 * Metro picks this file on web (and any non-native platform).
 * All exports are null/noop so that imports succeed without errors.
 * Source files check Platform.OS === 'web' and return an OSM fallback
 * before ever rendering these null values.
 */
import React from 'react';
import { View } from 'react-native';

// ── Null exports ──────────────────────────────────────────────────────────────
export const MapView = null as any;
export const Marker = null as any;
export const Circle = null as any;
export const Polyline = null as any;
export const PROVIDER_GOOGLE = 'google' as const;
export const PROVIDER_DEFAULT = null as any;

// ── Type alias (mirrors react-native-maps Region) ─────────────────────────────
export type Region = {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
};
export type MapViewProps = Record<string, any>;
