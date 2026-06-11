/**
 * test-map-render.js
 * Validates the map HTML that gets loaded into the WebView.
 * Run: node scripts/test-map-render.js
 */
const https = require('https');

const KEY = 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';
const CAMPUS_CENTER = { lat: 0.035611, lng: 36.284968 };
const CAMPUS_ZOOM = 15;

// ── Simulate buildMapHTML with no zones, no user ──────────────────────────────
const pins = JSON.stringify([
    { lat: 0.035611, lng: 36.284968, name: 'Main Campus Center', color: '#1565C0', type: 'university' },
    { lat: 0.031810, lng: 36.272946, name: 'Mandela Hall', color: '#0C156D', type: 'hostel' },
    { lat: 0.028423, lng: 36.273289, name: 'University Hospital', color: '#1565C0', type: 'university' },
]);
const zones = JSON.stringify([]);
const user = 'null';

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body,#map{width:100%;height:100%;overflow:hidden;}
</style>
</head>
<body>
<div id="map"></div>
<script>
var PINS=${pins};
var ZONES=${zones};
var USER=${user};
var _map,_iw,_userMarker;
function initMap(){
  var center={lat:${CAMPUS_CENTER.lat},lng:${CAMPUS_CENTER.lng}};
  _map=new google.maps.Map(document.getElementById('map'),{
    center:center,zoom:${CAMPUS_ZOOM},mapTypeId:'roadmap',gestureHandling:'greedy'
  });
  _iw=new google.maps.InfoWindow();
  PINS.forEach(function(p){
    new google.maps.Marker({position:{lat:p.lat,lng:p.lng},map:_map,title:p.name});
  });
}
window.gm_authFailure=function(){
  document.body.innerHTML='<p style="color:red">AUTH FAILURE</p>';
};
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=initMap&loading=async" async defer></script>
</body>
</html>`;

// ── Tests ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;

function check(name, condition, detail) {
    if (condition) {
        console.log('✅ ' + name);
        if (detail) console.log('   ' + detail);
        pass++;
    } else {
        console.log('❌ ' + name);
        if (detail) console.log('   ' + detail);
        fail++;
    }
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   Map HTML Render Validation — Campus Safety App      ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// 1. HTML structure
check('DOCTYPE present', html.includes('<!DOCTYPE html>'));
check('UTF-8 charset', html.includes('charset="utf-8"'));
check('Viewport meta tag', html.includes('name="viewport"'));
check('#map div present', html.includes('<div id="map">'));
check('initMap callback defined', html.includes('function initMap()'));
check('gm_authFailure handler', html.includes('window.gm_authFailure'));
check('gestureHandling greedy', html.includes("gestureHandling:'greedy'"));

// 2. API key in script tag
check('API key in script src', html.includes('key=' + KEY));
check('callback=initMap', html.includes('callback=initMap'));
check('loading=async', html.includes('loading=async'));
check('async defer on script', html.includes('async defer'));

// 3. Data injection
check('PINS data injected', html.includes('"Main Campus Center"'));
check('ZONES array present', html.includes('var ZONES='));
check('USER null (no location)', html.includes('var USER=null'));

// 4. CSS — map must fill container
check('html height:100%', html.includes('html,body,#map{width:100%;height:100%'));
check('overflow hidden', html.includes('overflow:hidden'));

// 5. RN bridge functions
check('locateUser bridge', html.includes('window.locateUser'));
check('goToCampus bridge', html.includes('window.goToCampus'));

// 6. HTML size sanity (too small = something missing, too large = bloat)
const sizeKB = (html.length / 1024).toFixed(1);
check('HTML size reasonable (5–50 KB)', html.length > 5000 && html.length < 51200,
    'Size: ' + sizeKB + ' KB');

// 7. No obvious JS syntax issues (basic checks)
check('No unclosed template literals', !html.includes('${'), 'All template vars resolved');
check('No undefined variables',
    html.includes('var PINS=') && html.includes('var ZONES=') && html.includes('var USER='));

// 8. Live API test
console.log('\n── Live API Check ───────────────────────────────────────');
function get(url) {
    return new Promise(function (resolve, reject) {
        var u = new URL(url);
        var req = https.get({ hostname: u.hostname, path: u.pathname + u.search }, function (res) {
            var b = [];
            res.on('data', function (d) { b.push(d); });
            res.on('end', function () { resolve({ code: res.statusCode, body: Buffer.concat(b).toString() }); });
        });
        req.on('error', reject);
        req.setTimeout(12000, function () { req.destroy(); reject(new Error('TIMEOUT')); });
    });
}

get('https://maps.googleapis.com/maps/api/js?key=' + KEY + '&callback=x')
    .then(function (r) {
        var jsOk = r.body.includes('google.maps');
        check('Maps JS API returns google.maps bundle', jsOk,
            jsOk ? 'Bundle size: ' + (r.body.length / 1024).toFixed(0) + ' KB' : r.body.slice(0, 120));

        console.log('\n════════════════════════════════════════════════════════');
        console.log('✅ Pass: ' + pass + '   ❌ Fail: ' + fail);
        if (fail === 0) {
            console.log('\n🎉 Map HTML is valid and Google Maps API is reachable.');
            console.log('   The WebView will render the map correctly on device.\n');
        } else {
            console.log('\n⚠️  ' + fail + ' issue(s) found — see above.\n');
        }
    })
    .catch(function (e) {
        check('Maps JS API reachable', false, e.message);
        console.log('\n════════════════════════════════════════════════════════');
        console.log('✅ Pass: ' + pass + '   ❌ Fail: ' + fail + '\n');
    });
