import React, { useState, useEffect, useMemo } from 'react';
import { TruckIcon, MapPinIcon, ArrowPathIcon, CheckCircleIcon, XCircleIcon, SignalIcon } from '@heroicons/react/24/outline';
import { dispatchAmbulance, releaseAmbulance, listenToLocationHistory } from '../services/ambulanceService';
import { formatDistanceToNow } from 'date-fns';

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    available: { dot: 'bg-green-500', badge: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Available', pulse: true },
    dispatched: { dot: 'bg-orange-500', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'Dispatched', pulse: false },
    arrived: { dot: 'bg-blue-500', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'Arrived', pulse: false },
    busy: { dot: 'bg-red-500', badge: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Busy', pulse: false },
};

const GKEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';

// ─── Build Google Maps embed URL centred on focused (or first) ambulance ──────
const buildMapUrl = (ambulances, focusId = null) => {
    const located = ambulances.filter(a => a.latitude && a.longitude);
    if (located.length === 0) return null;
    const focus = focusId ? located.find(a => a.id === focusId) : null;
    const centre = focus || located[0];
    const { latitude: lat, longitude: lng } = centre;
    return `https://www.google.com/maps/embed/v1/place?key=${GKEY}&q=${lat},${lng}&zoom=16&maptype=roadmap`;
};

// ─── Single ambulance row ──────────────────────────────────────────────────────
const AmbulanceRow = ({ amb, selectedReportId, isSelected, onSelect, onDispatch, onRelease, dispatching, dark }) => {
    const cfg = STATUS_CONFIG[amb.status] || STATUS_CONFIG.available;
    const lastUpdated = amb.lastUpdated
        ? formatDistanceToNow(
            amb.lastUpdated.seconds ? new Date(amb.lastUpdated.seconds * 1000) : new Date(amb.lastUpdated),
            { addSuffix: true }
        )
        : 'Never';
    const speed = amb.speed ? `${Math.round(amb.speed * 3.6)} km/h` : null;

    return (
        <div
            onClick={() => onSelect(amb.id)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                ? 'bg-blue-900/20 border-blue-500/40'
                : dark ? 'bg-[#0D1130] border-[#1e2347] hover:border-[#3d4466]' : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
        >
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{amb.vehicleId || amb.id}</p>
                <p className={`text-xs truncate ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{amb.driverName || 'Unassigned'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <p className={`text-[10px] ${dark ? 'text-gray-600' : 'text-gray-400'}`}>Updated {lastUpdated}</p>
                    {speed && <span className="flex items-center gap-1 text-[10px] text-blue-500"><SignalIcon className="w-3 h-3" /> {speed}</span>}
                    {amb.isTracking && <span className="flex items-center gap-1 text-[10px] text-green-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />Live GPS</span>}
                </div>
            </div>
            {amb.latitude && amb.longitude && (
                <div className={`text-[10px] text-right shrink-0 hidden sm:block ${dark ? 'text-gray-600' : 'text-gray-400'}`}>
                    <p>{amb.latitude.toFixed(4)}</p>
                    <p>{amb.longitude.toFixed(4)}</p>
                </div>
            )}
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0 ${cfg.badge}`}>{cfg.label}</span>
            {amb.status === 'available' && selectedReportId && (
                <button onClick={e => { e.stopPropagation(); onDispatch(amb.id, selectedReportId); }} disabled={dispatching === amb.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shrink-0">
                    {dispatching === amb.id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TruckIcon className="w-3.5 h-3.5" />}
                    Dispatch
                </button>
            )}
            {(amb.status === 'dispatched' || amb.status === 'arrived') && (
                <button onClick={e => { e.stopPropagation(); onRelease(amb.id); }} disabled={dispatching === amb.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shrink-0">
                    <CheckCircleIcon className="w-3.5 h-3.5" /> Release
                </button>
            )}
        </div>
    );
};

// ─── Trail summary for focused ambulance ──────────────────────────────────────
const TrailInfo = ({ ambulanceId, dark = true }) => {
    const [trail, setTrail] = useState([]);
    useEffect(() => {
        if (!ambulanceId) return;
        const unsub = listenToLocationHistory(ambulanceId, setTrail);
        return () => unsub();
    }, [ambulanceId]);
    if (!trail.length) return null;
    const last = trail[trail.length - 1];
    return (
        <div className="mx-4 mb-2 p-2.5 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <p className="text-blue-500 text-[10px] font-bold uppercase tracking-wide">Trail — {trail.length} points recorded</p>
            {last && <p className={`text-[10px] mt-0.5 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Latest: {last.latitude?.toFixed(5)}, {last.longitude?.toFixed(5)}{last.speed ? ` · ${Math.round(last.speed * 3.6)} km/h` : ''}</p>}
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const AmbulanceMapPanel = ({ ambulances = [], selectedReportId = null, onDispatchSuccess, dark = true }) => {
    const [dispatching, setDispatching] = useState(null);
    const [focusedId, setFocusedId] = useState(null);
    const [error, setError] = useState('');

    // Rebuilds whenever any ambulance location changes OR focus changes
    const mapUrl = useMemo(
        () => buildMapUrl(ambulances, focusedId),
        [ambulances, focusedId]
    );

    const handleDispatch = async (ambulanceId, reportId) => {
        setDispatching(ambulanceId);
        setError('');
        try {
            await dispatchAmbulance(ambulanceId, reportId);
            onDispatchSuccess?.(`Ambulance ${ambulanceId} dispatched to case.`);
        } catch (e) {
            setError('Failed to dispatch. Check Firestore permissions.');
            console.error(e);
        } finally { setDispatching(null); }
    };

    const handleRelease = async (ambulanceId) => {
        setDispatching(ambulanceId);
        try { await releaseAmbulance(ambulanceId); }
        catch (e) { setError('Failed to release ambulance.'); }
        finally { setDispatching(null); }
    };

    const available = ambulances.filter(a => a.status === 'available').length;
    const dispatched = ambulances.filter(a => a.status === 'dispatched' || a.status === 'arrived').length;
    const live = ambulances.filter(a => a.isTracking).length;

    return (
        <div className={`border rounded-2xl overflow-hidden flex flex-col h-full ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
            {/* Header */}
            <div className={`p-4 border-b flex items-center justify-between shrink-0 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                    <TruckIcon className="w-5 h-5 text-orange-500" />
                    <h2 className={`font-bold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Ambulance Fleet</h2>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-green-500"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {available} available</span>
                    <span className="flex items-center gap-1.5 text-orange-500"><span className="w-2 h-2 rounded-full bg-orange-500" /> {dispatched} en-route</span>
                    {live > 0 && <span className="flex items-center gap-1.5 text-blue-500"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> {live} live GPS</span>}
                </div>
            </div>

            {/* Map */}
            <div className={`relative h-48 shrink-0 ${dark ? 'bg-[#0D1130]' : 'bg-gray-100'}`}>
                {mapUrl ? (
                    <iframe key={mapUrl} title="Ambulance Live Map" src={mapUrl} width="100%" height="100%" style={{ border: 0 }} loading="eager" referrerPolicy="no-referrer" />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2">
                        <MapPinIcon className={`w-10 h-10 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
                        <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No GPS data available</p>
                        <p className={`text-[10px] ${dark ? 'text-gray-600' : 'text-gray-400'}`}>Driver must start tracking on their device</p>
                    </div>
                )}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-[10px] font-bold">LIVE</span>
                </div>
                {focusedId && (
                    <button onClick={() => setFocusedId(null)} className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg hover:bg-black/80">Show All ×</button>
                )}
            </div>

            {focusedId && <TrailInfo ambulanceId={focusedId} dark={dark} />}

            {error && (
                <div className="mx-4 mt-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                    <XCircleIcon className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-red-500 text-xs">{error}</p>
                </div>
            )}
            {selectedReportId && (
                <div className="mx-4 mt-3 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-blue-500 text-xs">🎯 Case selected — click <strong>Dispatch</strong> on an available ambulance.</p>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {ambulances.length === 0 ? (
                    <div className="text-center py-8">
                        <TruckIcon className={`w-8 h-8 mx-auto mb-2 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
                        <p className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No ambulances registered.</p>
                    </div>
                ) : ambulances.map(amb => (
                    <AmbulanceRow
                        key={amb.id}
                        amb={amb}
                        selectedReportId={selectedReportId}
                        isSelected={focusedId === amb.id}
                        onSelect={id => setFocusedId(prev => prev === id ? null : id)}
                        onDispatch={handleDispatch}
                        onRelease={handleRelease}
                        dispatching={dispatching}
                        dark={dark}
                    />
                ))}
            </div>
        </div>
    );
};

export default AmbulanceMapPanel;
