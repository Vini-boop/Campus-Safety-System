/**
 * MedicalEmergenciesPanel.jsx - theme-aware (dark/light)
 */
import { useState, useMemo } from 'react';
import {
    ClockIcon, MapPinIcon, PhoneIcon,
    CheckCircleIcon, HomeIcon, TruckIcon, ArrowPathIcon,
    ExclamationTriangleIcon, IdentificationIcon,
    ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { resolveLocationSync } from '../services/geocodingService';
import { calculateDistance } from '../services/mapsService';

// ─── Theme helper ─────────────────────────────────────────────────────────────
const d = (dark, darkCls, lightCls) => dark ? darkCls : lightCls;

// ─── Status steps ─────────────────────────────────────────────────────────────
const STATUS_STEPS = [
    { key: 'pending', label: 'Requested', icon: '📋' },
    { key: 'acknowledged', label: 'Acknowledged', icon: '✅' },
    { key: 'dispatched', label: 'Dispatched', icon: '🚑' },
    { key: 'en_route', label: 'En Route', icon: '🛣️' },
    { key: 'arrived', label: 'Arrived', icon: '🏥' },
];
const STEP_IDX = { pending: 0, acknowledged: 1, dispatched: 2, en_route: 3, arrived: 4, completed: 4, resolved: 4 };

function normalise(raw) {
    return {
        id: raw.id,
        _src: raw._src || 'ambulance_requests',
        status: raw.status || 'pending',
        priority: raw.priority || 'critical',
        createdAt: raw.createdAt,
        studentName: raw.studentName || raw.name || raw.reporter?.name || raw.reporterName || 'Unknown Student',
        studentEmail: raw.studentEmail || raw.email || raw.reporter?.email || raw.reporterEmail || '',
        regNo: raw.regNo || raw.regNumber || raw.reporter?.regNumber || null,
        phone: raw.phone || raw.reporter?.phone || null,
        isVerified: raw.isRegNumberVerified ?? raw.reporter?.isRegNumberVerified ?? null,
        placeName: raw.placeName || raw.campusZone || raw.locationText || raw.location?.address || null,
        hostelName: raw.hostelName || raw.location?.hostelName || null,
        roomNumber: raw.roomNumber || raw.location?.roomNumber || null,
        coordinates: {
            latitude: raw.coordinates?.latitude || raw.location?.latitude || raw.location?.lat || null,
            longitude: raw.coordinates?.longitude || raw.location?.longitude || raw.location?.lng || null,
        },
        medicalCondition: raw.medicalCondition || raw.description?.replace('🚑 AMBULANCE EMERGENCY: ', '') || '',
        notes: raw.notes || '',
        estimatedArrival: raw.estimatedArrival || null,
    };
}

function timeAgo(val) {
    if (!val) return '-';
    const dt = val.toDate ? val.toDate() : val.seconds ? new Date(val.seconds * 1000) : new Date(val);
    const mins = Math.floor((Date.now() - dt.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

function nearestAmbulance(lat, lng, ambulances) {
    if (!lat || !lng || !ambulances?.length) return null;
    const avail = ambulances.filter(a => a.status === 'available' && a.latitude && a.longitude);
    if (!avail.length) return null;
    let best = null, bestDist = Infinity;
    avail.forEach(a => {
        const dist = calculateDistance(lat, lng, a.latitude, a.longitude);
        if (dist < bestDist) { bestDist = dist; best = { ...a, distanceMeters: Math.round(dist), etaMinutes: Math.max(1, Math.round(dist / 500)) }; }
    });
    return best;
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ status, dark }) {
    const cur = STEP_IDX[status] ?? 0;
    return (
        <div className="flex items-center w-full my-3">
            {STATUS_STEPS.map((s, i) => {
                const done = i < cur, active = i === cur;
                return (
                    <div key={s.key} className="flex-1 flex flex-col items-center relative">
                        {i > 0 && <div className={`absolute left-0 top-3 h-0.5 w-1/2 -translate-x-full ${done || active ? 'bg-green-500' : d(dark, 'bg-[#252A41]', 'bg-gray-200')}`} />}
                        {i < STATUS_STEPS.length - 1 && <div className={`absolute right-0 top-3 h-0.5 w-1/2 translate-x-full ${done ? 'bg-green-500' : d(dark, 'bg-[#252A41]', 'bg-gray-200')}`} />}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] z-10 border-2 transition-all
                            ${done ? 'bg-green-600 border-green-500 text-white'
                                : active ? 'bg-green-600/30 border-green-500 text-green-600 animate-pulse'
                                    : d(dark, 'bg-[#0D1130] border-[#252A41] text-gray-600', 'bg-gray-100 border-gray-300 text-gray-400')}`}>
                            {s.icon}
                        </div>
                        <p className={`text-[8px] font-bold text-center mt-0.5 ${done ? 'text-green-500' : active ? d(dark, 'text-white', 'text-gray-900') : d(dark, 'text-gray-600', 'text-gray-400')}`}>{s.label}</p>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Emergency Card ───────────────────────────────────────────────────────────
function EmergencyCard({ raw, onAcknowledge, onDispatch, ambulances, dark }) {
    const [busy, setBusy] = useState(false);
    const e = useMemo(() => normalise(raw), [raw]);
    const { latitude: lat, longitude: lng } = e.coordinates;

    const locationDisplay = e.placeName ||
        (lat ? resolveLocationSync(lat, lng) : null) ||
        (e.hostelName ? `${e.hostelName}${e.roomNumber ? `, Room ${e.roomNumber}` : ''}` : null) ||
        'Location not provided';

    const nearest = nearestAmbulance(lat, lng, ambulances);
    const isPending = e.status === 'pending';
    const isAcknowledged = e.status === 'acknowledged';
    const isDispatched = ['dispatched', 'en_route'].includes(e.status);
    const isDone = ['arrived', 'completed', 'resolved'].includes(e.status);

    const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

    const fieldBg = d(dark, 'bg-[#0D1130]', 'bg-gray-50 border border-gray-200');
    const fieldLabel = d(dark, 'text-gray-500', 'text-gray-400');
    const fieldVal = d(dark, 'text-white', 'text-gray-900');

    return (
        <div className={`rounded-xl border p-4 transition-all ${isDone ? d(dark, 'border-green-500/20 bg-green-900/10', 'border-green-200 bg-green-50') + ' opacity-80'
                : isDispatched ? d(dark, 'border-yellow-500/30 bg-yellow-900/10', 'border-yellow-200 bg-yellow-50')
                    : d(dark, 'border-red-500/30 bg-gradient-to-br from-red-900/20 to-orange-900/10', 'border-red-200 bg-red-50')
            }`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0 text-white font-bold text-sm">
                        {e.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className={`font-bold text-sm leading-tight ${d(dark, 'text-white', 'text-gray-900')}`}>{e.studentName}</p>
                        {e.studentEmail && <p className={`text-[10px] ${d(dark, 'text-gray-500', 'text-gray-400')}`}>{e.studentEmail}</p>}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase ${isDone ? 'bg-green-500/20 border-green-500/30 text-green-600'
                            : isDispatched ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-600'
                                : isAcknowledged ? 'bg-blue-500/20 border-blue-500/30 text-blue-600'
                                    : 'bg-red-500/20 border-red-500/30 text-red-600 animate-pulse'
                        }`}>{e.status}</span>
                    <span className={`text-[10px] flex items-center gap-1 ${d(dark, 'text-gray-600', 'text-gray-400')}`}>
                        <ClockIcon className="w-3 h-3" />{timeAgo(e.createdAt)}
                    </span>
                </div>
            </div>

            <Stepper status={e.status} dark={dark} />

            {/* Fields */}
            <div className="grid grid-cols-2 gap-2 mb-3">
                {e.regNo && (
                    <div className={`rounded-lg p-2.5 ${fieldBg}`}>
                        <p className={`text-[10px] font-bold uppercase mb-0.5 flex items-center gap-1 ${fieldLabel}`}>
                            <IdentificationIcon className="w-3 h-3" />Reg No.
                        </p>
                        <p className="text-purple-500 text-xs font-mono font-bold">{e.regNo}</p>
                        {e.isVerified !== null && (
                            <p className={`text-[9px] mt-0.5 ${e.isVerified ? 'text-green-500' : 'text-yellow-500'}`}>
                                {e.isVerified ? '✅ Verified' : '⏳ Pending'}
                            </p>
                        )}
                    </div>
                )}
                {e.phone && (
                    <div className={`rounded-lg p-2.5 ${fieldBg}`}>
                        <p className={`text-[10px] font-bold uppercase mb-0.5 flex items-center gap-1 ${fieldLabel}`}>
                            <PhoneIcon className="w-3 h-3" />Phone
                        </p>
                        <a href={`tel:${e.phone}`} className="text-green-600 text-xs font-semibold hover:underline">{e.phone}</a>
                    </div>
                )}
                <div className={`col-span-2 rounded-lg p-2.5 ${fieldBg}`}>
                    <p className={`text-[10px] font-bold uppercase mb-0.5 flex items-center gap-1 ${fieldLabel}`}>
                        <MapPinIcon className="w-3 h-3" />Location
                    </p>
                    <p className={`text-xs font-semibold ${fieldVal}`}>{locationDisplay}</p>
                    {e.hostelName && (
                        <p className={`text-[10px] mt-0.5 flex items-center gap-1 ${d(dark, 'text-gray-500', 'text-gray-400')}`}>
                            <HomeIcon className="w-3 h-3" />{e.hostelName}{e.roomNumber ? ` - Room ${e.roomNumber}` : ''}
                        </p>
                    )}
                </div>
                {e.medicalCondition && (
                    <div className={`col-span-2 rounded-lg p-2.5 ${fieldBg}`}>
                        <p className={`text-[10px] font-bold uppercase mb-0.5 flex items-center gap-1 ${fieldLabel}`}>
                            <ExclamationTriangleIcon className="w-3 h-3 text-orange-500" />Condition
                        </p>
                        <p className="text-orange-600 text-xs leading-relaxed">{e.medicalCondition}</p>
                    </div>
                )}
                {e.notes && (
                    <div className={`col-span-2 rounded-lg p-2.5 ${fieldBg}`}>
                        <p className={`text-[10px] font-bold uppercase mb-0.5 ${fieldLabel}`}>Notes</p>
                        <p className={`text-xs ${d(dark, 'text-gray-300', 'text-gray-600')}`}>{e.notes}</p>
                    </div>
                )}
                {e.estimatedArrival && (
                    <div className="col-span-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                        <p className="text-yellow-600 text-xs font-bold flex items-center gap-1">
                            <TruckIcon className="w-3.5 h-3.5" />🚑 ETA: {e.estimatedArrival}
                        </p>
                    </div>
                )}
            </div>

            {/* Nearest ambulance */}
            {nearest && isPending && (
                <div className="mb-3 p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <p className="text-green-600 text-[10px] font-bold uppercase mb-1">🚑 Nearest Available</p>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs font-semibold ${fieldVal}`}>{nearest.vehicleId || 'AMB-01'}</p>
                            <p className={`text-[10px] ${d(dark, 'text-gray-400', 'text-gray-500')}`}>{nearest.distanceMeters}m · ETA ~{nearest.etaMinutes} min</p>
                        </div>
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-600 text-[10px] font-bold rounded-full border border-green-500/30">Available</span>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className={`flex gap-2 pt-3 border-t ${d(dark, 'border-white/5', 'border-gray-200')}`}>
                {isPending && (
                    <>
                        <button onClick={() => act(() => onAcknowledge?.(raw))} disabled={busy}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-600 text-xs font-bold transition-all disabled:opacity-50">
                            <CheckCircleIcon className="w-4 h-4" />Acknowledge
                        </button>
                        <button onClick={() => act(() => onDispatch?.(raw, nearest))} disabled={busy}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50">
                            {busy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TruckIcon className="w-4 h-4" />}
                            Dispatch 🚑
                        </button>
                    </>
                )}
                {isAcknowledged && (
                    <button onClick={() => act(() => onDispatch?.(raw, nearest))} disabled={busy}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600 hover:bg-red-700 rounded-lg text-white text-xs font-bold transition-all disabled:opacity-50">
                        {busy ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Dispatching...</> : <><TruckIcon className="w-4 h-4" /> Dispatch Ambulance 🚑</>}
                    </button>
                )}
                {isDispatched && (
                    <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <ArrowPathIcon className="w-4 h-4 text-yellow-500 animate-spin" />
                        <span className="text-yellow-600 text-xs font-bold">Ambulance en route...</span>
                    </div>
                )}
                {isDone && (
                    <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <CheckCircleIcon className="w-4 h-4 text-green-600" />
                        <span className="text-green-600 text-xs font-bold">Resolved</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function MedicalEmergenciesPanel({ emergencies = [], onAcknowledge, onDispatch, ambulances = [], dark = true }) {
    const [filter, setFilter] = useState('active');

    const sorted = useMemo(() => {
        const order = { pending: 0, acknowledged: 1, dispatched: 2, en_route: 3, arrived: 4, completed: 5, resolved: 5 };
        return [...emergencies]
            .filter(e => {
                if (filter === 'active') return !['arrived', 'completed', 'resolved'].includes(e.status);
                if (filter === 'resolved') return ['arrived', 'completed', 'resolved'].includes(e.status);
                return true;
            })
            .sort((a, b) => {
                const sa = order[a.status] ?? 9, sb = order[b.status] ?? 9;
                if (sa !== sb) return sa - sb;
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });
    }, [emergencies, filter]);

    const pendingCount = emergencies.filter(e => e.status === 'pending').length;
    const totalActive = emergencies.filter(e => !['arrived', 'completed', 'resolved'].includes(e.status)).length;

    const panelBg = d(dark, 'bg-[#141728] border-[#252A41]', 'bg-white border-gray-200');
    const headerBorder = d(dark, 'border-[#252A41]', 'border-gray-200');
    const titleColor = d(dark, 'text-white', 'text-gray-900');
    const subColor = d(dark, 'text-gray-500', 'text-gray-400');
    const filterBg = d(dark, 'bg-[#0D1130]', 'bg-gray-100');

    if (!emergencies.length) {
        return (
            <div className={`h-full border rounded-2xl flex flex-col items-center justify-center gap-3 text-center p-8 ${panelBg}`}>
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <ShieldCheckIcon className="w-8 h-8 text-green-500" />
                </div>
                <p className={`font-bold text-base ${titleColor}`}>No Active Emergencies</p>
                <p className={`text-sm max-w-xs leading-relaxed ${subColor}`}>
                    When students submit ambulance requests from the mobile app, they appear here in real-time.
                </p>
                <div className={`mt-2 flex items-center gap-2 text-xs ${subColor}`}>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Listening for new requests...
                </div>
            </div>
        );
    }

    return (
        <div className={`h-full flex flex-col border rounded-2xl overflow-hidden ${panelBg}`}>
            {/* Header */}
            <div className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${headerBorder}`}>
                <div className="flex items-center gap-2">
                    <TruckIcon className="w-5 h-5 text-red-500" />
                    <h3 className={`font-bold ${titleColor}`}>Ambulance Requests</h3>
                    {pendingCount > 0 && (
                        <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded-full text-red-500 text-[10px] font-bold animate-pulse">
                            {pendingCount} PENDING
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs ${subColor}`}>{emergencies.length} total</span>
                    <div className={`flex gap-1 rounded-lg p-1 ${filterBg}`}>
                        {[
                            { id: 'active', label: `Active (${totalActive})` },
                            { id: 'resolved', label: 'Resolved' },
                            { id: 'all', label: 'All' },
                        ].map(f => (
                            <button key={f.id} onClick={() => setFilter(f.id)}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${filter === f.id ? 'bg-red-600 text-white' : d(dark, 'text-gray-400 hover:text-white', 'text-gray-500 hover:text-gray-900')}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {sorted.length === 0 ? (
                    <div className={`text-center py-10 text-sm ${subColor}`}>
                        No {filter === 'resolved' ? 'resolved' : 'active'} requests.
                    </div>
                ) : sorted.map(e => (
                    <EmergencyCard key={e.id} raw={e} onAcknowledge={onAcknowledge} onDispatch={onDispatch} ambulances={ambulances} dark={dark} />
                ))}
            </div>
        </div>
    );
}
