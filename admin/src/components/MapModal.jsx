import React from 'react';
import { XMarkIcon, MapPinIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

const GKEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';

/**
 * MapModal — shows the exact location of an incident on Google Maps.
 * Handles all coordinate formats used across the app:
 *   report.locationCoords.latitude / longitude
 *   report.location.latitude / longitude
 *   report.coordinates.latitude / longitude
 *   report.latitude / report.longitude (top-level)
 */
const MapModal = ({ report, isOpen, onClose, dark = true }) => {
    if (!isOpen || !report) return null;

    // ── Resolve coordinates from any format ──────────────────────────────────
    const resolveCoords = () => {
        const src = [
            report.locationCoords,
            report.location,
            report.coordinates,
            report,
        ];
        for (const s of src) {
            if (!s) continue;
            const lat = s.latitude ?? s.lat;
            const lng = s.longitude ?? s.lng;
            if (lat && lng && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001) {
                return { lat: parseFloat(lat), lng: parseFloat(lng) };
            }
        }
        return null;
    };

    const coords = resolveCoords();
    const hasCoords = !!coords;

    // ── Resolve display name ──────────────────────────────────────────────────
    const displayName =
        report.placeName ||
        report.campusZone ||
        report.locationText ||
        (typeof report.location === 'string' ? report.location : null) ||
        report.location?.address ||
        (hasCoords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Unknown location');

    const reporterName = report.reporterName || report.studentName || report.reportedBy || 'Unknown';
    const accuracy = report.locationAccuracy || report.accuracy || null;
    const isSOS = !!(report.type?.toLowerCase().includes('sos') || report.type?.toLowerCase().includes('emergency'));

    // ── Build Google Maps JS API HTML with precise marker ─────────────────────
    const buildMapHtml = () => {
        if (!hasCoords) return null;
        const { lat, lng } = coords;
        const accRadius = accuracy ? parseFloat(accuracy) : 0;

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
</head>
<body>
<div id="map"></div>
<script>
function initMap() {
  var pos = { lat: ${lat}, lng: ${lng} };
  var map = new google.maps.Map(document.getElementById('map'), {
    center: pos, zoom: 18,
    mapTypeId: 'roadmap',
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    gestureHandling: 'greedy'
  });

  // Accuracy circle
  ${accRadius > 0 ? `
  new google.maps.Circle({
    map: map, center: pos, radius: ${accRadius},
    strokeColor: '${isSOS ? '#DC2626' : '#2563EB'}',
    strokeOpacity: 0.7, strokeWeight: 1.5,
    fillColor: '${isSOS ? '#DC2626' : '#2563EB'}', fillOpacity: 0.1
  });` : ''}

  // Precise marker
  var marker = new google.maps.Marker({
    position: pos, map: map,
    title: '${reporterName.replace(/'/g, "\\'")} — ${displayName.replace(/'/g, "\\'")}',
    animation: google.maps.Animation.DROP,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: '${isSOS ? '#DC2626' : '#2563EB'}',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3
    }
  });

  // Auto-open info window
  var iw = new google.maps.InfoWindow({
    content: '<div style="font-family:sans-serif;padding:6px 2px;min-width:200px">' +
      '<div style="font-weight:800;color:${isSOS ? '#DC2626' : '#1e40af'};font-size:14px;margin-bottom:6px">' +
      '${isSOS ? '🚨 SOS EMERGENCY' : '📍 Incident Location'}' +
      '</div>' +
      '<div style="font-weight:700;font-size:13px;margin-bottom:3px">${reporterName.replace(/'/g, "\\'")}</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:6px">${displayName.replace(/'/g, "\\'")}</div>' +
      '<div style="font-size:11px;color:#888;font-family:monospace;margin-bottom:3px">' +
      '${lat.toFixed(6)}, ${lng.toFixed(6)}' +
      '</div>' +
      ${accRadius > 0 ? `'<div style="font-size:11px;color:#888">GPS accuracy: ±${accRadius}m</div>' +` : ''}
      '</div>'
  });
  iw.open(map, marker);
}
window.gm_authFailure = function() {
  document.getElementById('map').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#c00;font-family:sans-serif;font-size:14px;padding:20px;text-align:center">⚠️ Google Maps API key error</div>';
};
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${GKEY}&callback=initMap&loading=async" async defer></script>
</body>
</html>`;
    };

    const mapHtml = buildMapHtml();
    const googleMapsUrl = hasCoords
        ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=18`
        : `https://www.google.com/maps/search/${encodeURIComponent(displayName)}`;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className={`${dark ? 'bg-[#1A1D2E]' : 'bg-white'} rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border ${dark ? 'border-gray-700' : 'border-gray-200'}`}>

                {/* Header */}
                <div className={`flex items-center justify-between p-5 border-b flex-shrink-0 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                        <h2 className={`text-xl font-bold flex items-center gap-2 ${isSOS ? (dark ? 'text-red-400' : 'text-red-700') : (dark ? 'text-gray-50' : 'text-gray-900')}`}>
                            <MapPinIcon className="w-5 h-5" />
                            {isSOS ? '🚨 SOS Emergency Location' : 'Incident Location'}
                        </h2>
                        <p className={`${dark ? 'text-gray-400' : 'text-gray-600'} text-sm mt-0.5`}>{reporterName} — {displayName}</p>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                        <XMarkIcon className={`h-6 w-6 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
                    </button>
                </div>

                {/* Map */}
                <div className="flex-1 relative" style={{ minHeight: '420px' }}>
                    {hasCoords && mapHtml ? (
                        <iframe
                            key={`modal-${coords.lat}-${coords.lng}`}
                            title="Incident Location Map"
                            srcDoc={mapHtml}
                            width="100%"
                            height="100%"
                            style={{ border: 0, minHeight: '420px', display: 'block' }}
                            sandbox="allow-scripts allow-same-origin"
                        />
                    ) : (
                        <div className={`h-64 flex flex-col items-center justify-center gap-3 ${dark ? 'bg-[#252A41]' : 'bg-gray-50'}`}>
                            <MapPinIcon className={`w-12 h-12 ${dark ? 'text-gray-600' : 'text-gray-400'}`} />
                            <p className={`${dark ? 'text-gray-400' : 'text-gray-700'} text-sm`}>No GPS coordinates for this report.</p>
                            <p className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-xs`}>{displayName}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className={`px-5 py-4 border-t flex items-center justify-between gap-3 flex-shrink-0 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                        {hasCoords ? (
                            <div className="space-y-0.5">
                                <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-500'}`}>Exact GPS Coordinates</p>
                                <p className={`${dark ? 'text-white' : 'text-gray-900'} font-mono text-sm`}>
                                    {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                                </p>
                                {accuracy && (
                                    <p className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-xs`}>Accuracy: ±{accuracy}</p>
                                )}
                            </div>
                        ) : (
                            <p className={`${dark ? 'text-gray-500' : 'text-gray-600'} text-sm`}>No coordinates on record</p>
                        )}
                    </div>
                    <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors ${isSOS ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        Open in Google Maps
                    </a>
                </div>
            </div>
        </div>
    );
};

export default MapModal;
