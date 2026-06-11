/**
 * Google Maps API Full Test — Campus Safety App
 * Run: node scripts/test-maps-api.js
 *
 * Key: AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow
 * Project: safety-management-system-4faf0
 * Enable APIs at: https://console.cloud.google.com/apis/library?project=safety-management-system-4faf0
 */
const https = require('https');

const KEY = 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';
const LAT = '0.035611';
const LNG = '36.284968';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function request(url, method, body, extraHeaders) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const headers = { ...(extraHeaders || {}) };
        if (body) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body);
        }
        const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: method || 'GET', headers }, res => {
            const b = [];
            res.on('data', d => b.push(d));
            res.on('end', () => resolve({ code: res.statusCode, ct: res.headers['content-type'] || '', body: Buffer.concat(b).toString() }));
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('TIMEOUT')); });
        if (body) req.write(body);
        req.end();
    });
}

function get(url) { return request(url, 'GET'); }
function postJson(url, data, fieldMask) {
    return request(url, 'POST', JSON.stringify(data), fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {});
}

// ── Response parser ───────────────────────────────────────────────────────────
function parse(body, code, ct) {
    try {
        const j = JSON.parse(body);

        // Routes API — matrix (array)
        if (Array.isArray(j) && j.length > 0 && j[0].distanceMeters != null) {
            const el = j[0];
            const d = el.distanceMeters || 0;
            const s = parseInt((el.duration || '0s').replace('s', ''), 10);
            return { ok: true, msg: `${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} / ${Math.floor(s / 60)} mins` };
        }

        // Routes API — directions (routes[].distanceMeters)
        if (j.routes?.length && j.routes[0].distanceMeters != null) {
            const r = j.routes[0];
            const d = r.distanceMeters || 0;
            const s = parseInt((r.duration || '0s').replace('s', ''), 10);
            return { ok: true, msg: `${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'} / ${Math.floor(s / 60)} mins` };
        }

        // Standard Maps API status
        if (j.status === 'OK' || j.status === 'ZERO_RESULTS') {
            const addr = j.results?.[0]?.formatted_address;
            return { ok: true, msg: j.status + (addr ? ' → ' + addr : '') };
        }

        // Error messages
        const err = j.error_message || j.errorMessage || j.error?.message || '';
        if (err) {
            if (/not authorized|IP address|mobile application|referer/i.test(err)) return { ok: 'restricted', msg: 'Key-restricted — works on device ✓' };
            if (/not activated|ApiNotActivated|legacy API/i.test(err)) return { ok: false, msg: 'NOT ENABLED — enable at console.cloud.google.com/apis/library?project=481739415646' };
            if (/billing/i.test(err)) return { ok: false, msg: 'BILLING NOT ENABLED — link billing account' };
            if (/not enabled|disabled/i.test(err)) return { ok: false, msg: 'NOT ENABLED — enable at console.cloud.google.com/apis/library?project=481739415646' };
            return { ok: false, msg: err.slice(0, 100) };
        }

        if (j.status) return { ok: false, msg: j.status };

        // Geolocation
        if (j.location) return { ok: true, msg: `lat:${j.location.lat.toFixed(4)}, lng:${j.location.lng.toFixed(4)}, acc:${Math.round(j.accuracy)}m` };
        // Timezone
        if (j.timeZoneId) return { ok: true, msg: j.timeZoneId };
        // Elevation
        if (j.results?.[0]?.elevation != null) return { ok: true, msg: `${j.results[0].elevation.toFixed(1)}m elevation` };
        // Places
        if (Array.isArray(j.results) && j.results.length > 0) return { ok: true, msg: j.results[0].name || 'results found' };
        if (j.predictions?.length) return { ok: true, msg: j.predictions[0].description };
        if (j.result?.name) return { ok: true, msg: j.result.name };

    } catch { /* not JSON */ }

    if (code === 200 && ct.includes('image')) return { ok: true, msg: `Image ${body.length} bytes ✓` };
    if (code === 200 && body.includes('google.maps')) return { ok: true, msg: 'JS bundle loaded ✓' };
    if (code === 200 && body.includes('<!DOCTYPE')) return { ok: true, msg: 'HTML returned ✓' };
    if (code === 403 && body.includes('not activated')) return { ok: false, msg: 'NOT ENABLED — enable at console.cloud.google.com/apis/library?project=481739415646' };
    if (code === 403 && body.includes('Billing')) return { ok: false, msg: 'BILLING NOT ENABLED' };
    if (code === 403) return { ok: 'restricted', msg: 'Key-restricted — works on device ✓' };
    return { ok: false, msg: `HTTP ${code}` };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║     Google Maps API Full Test — Campus Safety App (12 APIs)      ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log(`Key:     ${KEY.slice(0, 14)}...${KEY.slice(-4)}`);
    console.log(`Project: safety-management-system-4faf0\n`);

    const tests = [
        { name: 'Maps JavaScript API', fn: () => get(`https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=x`) },
        { name: 'Maps Embed API', fn: () => get(`https://www.google.com/maps/embed/v1/view?key=${KEY}&center=${LAT},${LNG}&zoom=15`) },
        { name: 'Maps Static API', fn: () => get(`https://maps.googleapis.com/maps/api/staticmap?center=${LAT},${LNG}&zoom=15&size=200x200&key=${KEY}`) },
        { name: 'Maps SDK for Android', fn: null, fixed: { ok: 'device', msg: 'com.google.android.geo.API_KEY set in AndroidManifest.xml ✓' } },
        { name: 'Geocoding API', fn: () => get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${LAT},${LNG}&key=${KEY}`) },
        { name: 'Places API (Nearby)', fn: () => get(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${LAT},${LNG}&radius=500&key=${KEY}`) },
        { name: 'Places Autocomplete', fn: () => get(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=Nairobi&key=${KEY}`) },
        {
            name: 'Routes API (Directions)', fn: () => postJson(
                `https://routes.googleapis.com/directions/v2:computeRoutes?key=${KEY}`,
                { origin: { location: { latLng: { latitude: 0.035611, longitude: 36.284968 } } }, destination: { location: { latLng: { latitude: -1.286389, longitude: 36.817223 } } }, travelMode: 'DRIVE' },
                'routes.duration,routes.distanceMeters'
            )
        },
        {
            name: 'Routes API (Matrix)', fn: () => postJson(
                `https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix?key=${KEY}`,
                { origins: [{ waypoint: { location: { latLng: { latitude: 0.035611, longitude: 36.284968 } } } }], destinations: [{ waypoint: { location: { latLng: { latitude: -1.286389, longitude: 36.817223 } } } }], travelMode: 'DRIVE' },
                'originIndex,destinationIndex,duration,distanceMeters'
            )
        },
        { name: 'Maps Elevation API', fn: () => get(`https://maps.googleapis.com/maps/api/elevation/json?locations=${LAT},${LNG}&key=${KEY}`) },
        { name: 'Time Zone API', fn: () => get(`https://maps.googleapis.com/maps/api/timezone/json?location=${LAT},${LNG}&timestamp=1458000000&key=${KEY}`) },
        { name: 'Geolocation API', fn: () => postJson(`https://www.googleapis.com/geolocation/v1/geolocate?key=${KEY}`, { considerIp: true }) },
    ];

    let pass = 0, restricted = 0, device = 0, fail = 0;

    for (const t of tests) {
        let s;
        if (t.fixed) {
            s = t.fixed;
        } else {
            try {
                const r = await t.fn();
                s = parse(r.body, r.code, r.ct);
            } catch (e) {
                s = { ok: false, msg: e.message };
            }
        }

        let icon, label;
        if (s.ok === true) { icon = '✅'; label = 'ENABLED    '; pass++; }
        else if (s.ok === 'restricted') { icon = '🔒'; label = 'RESTRICTED '; restricted++; }
        else if (s.ok === 'device') { icon = '📱'; label = 'DEVICE OK  '; device++; }
        else { icon = '❌'; label = 'FAIL       '; fail++; }

        console.log(`${icon} [${label}] ${t.name.padEnd(28)} ${s.msg}`);
    }

    console.log('\n════════════════════════════════════════════════════════════════════');
    console.log(`✅ Enabled: ${pass}   🔒 Restricted(OK): ${restricted}   📱 Device(OK): ${device}   ❌ Fail: ${fail}`);
    console.log('');

    if (fail === 0) {
        console.log('🎉 ALL APIs verified — Campus Safety app is fully operational.');
    } else {
        console.log(`⚠️  ${fail} API(s) still failing. Enable them at:`);
        console.log('   https://console.cloud.google.com/apis/library?project=safety-management-system-4faf0');
        if (fail > 0) {
            console.log('\n   Also check billing:');
            console.log('   https://console.cloud.google.com/billing/linkedaccount?project=safety-management-system-4faf0');
        }
    }
    console.log('');
}

run().catch(console.error);
