/**
 * getAccurateLocation.ts
 *
 * Progressive GPS accuracy strategy:
 *   1. Start watchPositionAsync with BestForNavigation
 *   2. Collect fixes, keep a rolling window of the best N
 *   3. Once we have ≥ MIN_SAMPLES fixes all ≤ targetAccuracyM → compute
 *      a weighted centroid (weight = 1/accuracy²) and resolve
 *   4. If timeout fires → return weighted centroid of best fixes seen
 *   5. Web / emulator → getCurrentPositionAsync fallback
 *
 * The weighted centroid eliminates single-fix outliers and gives a
 * much more stable coordinate than any individual reading.
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export interface AccurateLocation {
    latitude: number;
    longitude: number;
    /** Estimated accuracy of the returned position in metres */
    accuracy: number;
    /** Number of GPS samples averaged */
    sampleCount: number;
}

interface Options {
    /** Collect fixes until all recent ones are ≤ this value. Default 25 m */
    targetAccuracyM?: number;
    /** Minimum number of good samples before resolving early. Default 3 */
    minSamples?: number;
    /** Hard timeout — return best available after this. Default 18 000 ms */
    timeoutMs?: number;
}

interface Fix {
    lat: number;
    lng: number;
    acc: number;
    ts: number;
}

/** Weighted centroid: weight = 1 / acc² (better fixes count more) */
function weightedCentroid(fixes: Fix[]): AccurateLocation {
    let wLat = 0, wLng = 0, wSum = 0;
    for (const f of fixes) {
        const w = 1 / (f.acc * f.acc);
        wLat += f.lat * w;
        wLng += f.lng * w;
        wSum += w;
    }
    const bestAcc = Math.min(...fixes.map(f => f.acc));
    return {
        latitude: wLat / wSum,
        longitude: wLng / wSum,
        accuracy: bestAcc,
        sampleCount: fixes.length,
    };
}

export async function getAccurateLocation(opts: Options = {}): Promise<AccurateLocation> {
    const {
        targetAccuracyM = 25,
        minSamples = 3,
        timeoutMs = 18_000,
    } = opts;

    // ── Permission ────────────────────────────────────────────────────────────
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Location permission not granted');

    // ── Web fast-path ─────────────────────────────────────────────────────────
    if (Platform.OS === 'web') return _singleFix();

    // ── Native: collect + average ─────────────────────────────────────────────
    return new Promise<AccurateLocation>((resolve) => {
        const goodFixes: Fix[] = [];   // fixes ≤ targetAccuracyM
        const allFixes: Fix[] = [];    // every fix received
        let sub: Location.LocationSubscription | null = null;
        let settled = false;

        const finish = (fixes: Fix[], label: string) => {
            if (settled) return;
            settled = true;
            sub?.remove();
            const result = weightedCentroid(fixes);
            console.log(
                `📍 GPS ${label}: ±${Math.round(result.accuracy)} m` +
                ` (${result.sampleCount} samples, centroid)`
            );
            resolve(result);
        };

        // Timeout — use best fixes available
        const timer = setTimeout(() => {
            if (settled) return;
            const pool = goodFixes.length > 0 ? goodFixes : allFixes;
            if (pool.length > 0) {
                finish(pool, 'timeout-best');
            } else {
                // Nothing at all — try one-shot fallback
                settled = true;
                sub?.remove();
                _singleFix()
                    .then(r => resolve(r))
                    .catch(() => resolve({ latitude: 0, longitude: 0, accuracy: 9999, sampleCount: 0 }));
            }
        }, timeoutMs);

        Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 400,
                distanceInterval: 0,
            },
            (loc) => {
                const acc = loc.coords.accuracy ?? 9999;
                const fix: Fix = {
                    lat: loc.coords.latitude,
                    lng: loc.coords.longitude,
                    acc,
                    ts: Date.now(),
                };

                allFixes.push(fix);
                // Keep only the 10 most recent fixes to avoid stale data
                if (allFixes.length > 10) allFixes.shift();

                if (acc <= targetAccuracyM) {
                    goodFixes.push(fix);
                    console.log(`📡 Good fix #${goodFixes.length}: ±${Math.round(acc)} m`);

                    // Resolve once we have enough consistent good fixes
                    if (goodFixes.length >= minSamples) {
                        clearTimeout(timer);
                        finish(goodFixes, 'converged');
                    }
                } else {
                    console.log(`📡 Fix: ±${Math.round(acc)} m (waiting for ≤${targetAccuracyM} m)`);
                }
            }
        ).then(s => {
            sub = s;
            if (settled) s.remove();
        }).catch(async (err) => {
            clearTimeout(timer);
            if (settled) return;
            console.warn('watchPositionAsync error:', err.message);
            settled = true;
            try { resolve(await _singleFix()); }
            catch { resolve({ latitude: 0, longitude: 0, accuracy: 9999, sampleCount: 0 }); }
        });
    });
}

async function _singleFix(): Promise<AccurateLocation> {
    const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
    });
    return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? 9999,
        sampleCount: 1,
    };
}
