import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    UsersIcon, ExclamationTriangleIcon, MapPinIcon,
    ClockIcon, ShieldCheckIcon, HeartIcon, ChartBarIcon,
    ArrowTrendingUpIcon, DocumentTextIcon, ArrowLeftOnRectangleIcon,
    MagnifyingGlassIcon, CpuChipIcon, ServerStackIcon,
    ClipboardDocumentListIcon, XMarkIcon, CheckCircleIcon,
    ArrowPathIcon, UserCircleIcon, BellAlertIcon,
    ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellSolid } from '@heroicons/react/24/solid';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import {
    collection, query, orderBy, onSnapshot,
    doc, updateDoc, serverTimestamp, addDoc, limit
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { lookupCampusZone, findNearestZone, resolveLocationSync } from '../services/geocodingService';
import NotificationSystem, { useNotifications } from '../components/NotificationSystem';
import notificationService from '../services/notificationService';
import { clearSession, getSession } from '../services/authService';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// ─── Theme tokens (dark / light) ──────────────────────────────────────────────
const T = {
    pageBg: { dark: 'bg-[#0A0E27]', light: 'bg-gray-100' },
    sidebarBg: { dark: 'bg-[#0D1130]', light: 'bg-white' },
    sidebarBorder: { dark: 'border-[#1e2347]', light: 'border-gray-200' },
    headerBg: { dark: 'bg-[#0D1130]', light: 'bg-white' },
    cardBg: { dark: 'bg-[#141728]', light: 'bg-white' },
    cardBorder: { dark: 'border-[#252A41]', light: 'border-gray-200' },
    innerBg: { dark: 'bg-[#1e2347]', light: 'bg-gray-50' },
    deepBg: { dark: 'bg-[#0D1130]', light: 'bg-gray-100' },
    divider: { dark: 'border-[#252A41]', light: 'border-gray-200' },
    dividerInner: { dark: 'border-[#1e2347]', light: 'border-gray-100' },
    textPrimary: { dark: 'text-white', light: 'text-gray-900' },
    textSecondary: { dark: 'text-gray-400', light: 'text-gray-600' },
    textMuted: { dark: 'text-gray-500', light: 'text-gray-500' },
    navHover: { dark: 'text-gray-500 hover:bg-[#1e2347] hover:text-white', light: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900' },
    popoverBg: { dark: 'bg-[#141728] border-[#252A41]', light: 'bg-white border-gray-200' },
    inputBg: { dark: 'bg-[#141728] border-[#252A41] text-white placeholder-gray-500', light: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' },
};
const tok = (key, dark) => T[key]?.[dark ? 'dark' : 'light'] ?? '';

// ─── Theme context ────────────────────────────────────────────────────────────
const ThemeContext = createContext({ dark: false });
const useTheme = () => useContext(ThemeContext);

// ─── Resolve a report's location to a human-readable name ────────────────────
// Checks: campusZone field → placeName field → coordinates lookup → raw location string
function resolveReportLocation(report) {
    // 1. Prefer pre-resolved campus zone name
    if (report.campusZone) return report.campusZone;
    if (report.placeName && !report.placeName.includes(',')) return report.placeName.replace(/^📍\s*/, '');

    // 2. Try coordinate lookup
    const lat = report.coordinates?.latitude ?? report.latitude;
    const lng = report.coordinates?.longitude ?? report.longitude;
    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        const zone = lookupCampusZone(lat, lng);
        if (zone) return zone;
        const near = findNearestZone(lat, lng);
        if (near) return `Near ${near.name} (~${Math.round(near.distance)}m)`;
    }

    // 3. Fall back to stored location string (strip raw coords if present)
    const loc = report.location || report.placeName || '';
    // If it looks like raw coordinates (e.g. "-0.0358, 36.0683"), replace with "Near Campus Area"
    if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc.trim())) return 'Near Campus Area';
    return loc || '-';
}

const GKEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';

const buildLiveMapHtml = (reports) => {
    // Laikipia University default coords
    const centerLat = 0.038165;
    const centerLng = 36.284242;

    // Extract valid markers
    const markers = reports
        .filter(r => r.status !== 'resolved')
        .map(r => {
            let lat = r.latitude || r.locationCoords?.latitude || r.coordinates?.latitude;
            let lng = r.longitude || r.locationCoords?.longitude || r.coordinates?.longitude;
            if (!lat || !lng) return null;

            lat = parseFloat(lat);
            lng = parseFloat(lng);
            if (isNaN(lat) || isNaN(lng) || Math.abs(lat) < 0.0001) return null;

            const isSOS = r.type?.toLowerCase().includes('sos') || r.type?.toLowerCase().includes('emergency') || r.priority === 'critical';
            const color = isSOS ? '#ef4444' : (r.type?.toLowerCase().includes('security') ? '#3b82f6' : '#ec4899');

            return {
                id: r.id,
                lat, lng,
                title: (r.type || 'Incident').replace(/'/g, "\\'"),
                color,
                isSOS
            };
        })
        .filter(Boolean);

    const markerJs = markers.map(m => `
        var m_${m.id.replace(/[^a-zA-Z0-9]/g, '')} = new google.maps.Marker({
            position: {lat: ${m.lat}, lng: ${m.lng}},
            map: map,
            title: '${m.title}',
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: ${m.isSOS ? 12 : 9},
                fillColor: '${m.color}',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            }
        });
        ${m.isSOS ? `
        new google.maps.Circle({
            map: map, center: {lat: ${m.lat}, lng: ${m.lng}}, radius: 35,
            strokeColor: '${m.color}', strokeOpacity: 0.5, strokeWeight: 1,
            fillColor: '${m.color}', fillOpacity: 0.2
        });` : ''}
    `).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
    html,body,#map{margin:0;padding:0;width:100%;height:100%;background-color:#0D1130;}
</style>
</head>
<body>
<div id="map"></div>
<script>
function initMap() {
    var map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: ${centerLat}, lng: ${centerLng} },
        zoom: 16,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
        styles: [
            {elementType:"geometry",stylers:[{color:"#1A1D2E"}]},
            {elementType:"labels.text.stroke",stylers:[{color:"#1A1D2E"}]},
            {elementType:"labels.text.fill",stylers:[{color:"#746855"}]},
            {featureType:"administrative.locality",elementType:"labels.text.fill",stylers:[{color:"#d59563"}]},
            {featureType:"poi",elementType:"labels.text.fill",stylers:[{color:"#d59563"}]},
            {featureType:"poi.park",elementType:"geometry",stylers:[{color:"#252A41"}]},
            {featureType:"poi.park",elementType:"labels.text.fill",stylers:[{color:"#6b9a76"}]},
            {featureType:"road",elementType:"geometry",stylers:[{color:"#252A41"}]},
            {featureType:"road",elementType:"geometry.stroke",stylers:[{color:"#212a37"}]},
            {featureType:"road",elementType:"labels.text.fill",stylers:[{color:"#9ca5b3"}]},
            {featureType:"road.highway",elementType:"geometry",stylers:[{color:"#3d4466"}]},
            {featureType:"road.highway",elementType:"geometry.stroke",stylers:[{color:"#1f2835"}]},
            {featureType:"road.highway",elementType:"labels.text.fill",stylers:[{color:"#f3d19c"}]},
            {featureType:"water",elementType:"geometry",stylers:[{color:"#0D1130"}]},
            {featureType:"water",elementType:"labels.text.fill",stylers:[{color:"#515c6d"}]},
            {featureType:"water",elementType:"labels.text.stroke",stylers:[{color:"#17263c"}]}
        ]
    });
    ${markerJs}
}
window.gm_authFailure = function() {
    document.getElementById('map').innerHTML = '<div style="color:red;padding:20px;text-align:center;font-family:sans-serif;font-size:12px;">Google Maps API key error. Please check your configuration.</div>';
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${GKEY}&callback=initMap&loading=async" async defer></script>
</body>
</html>`;
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, subtitle, badge, badgeColor, icon: Icon, iconBg, pulse }) => {
    const { dark } = useTheme();
    return (
        <div className={`${tok('cardBg', dark)} border ${tok('cardBorder', dark)} rounded-2xl p-5 flex flex-col gap-3 transition-colors shadow-sm`}>
            <div className="flex items-center justify-between">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
                    <Icon className={`w-6 h-6 ${dark ? 'text-white' : 'text-gray-900'} ${pulse ? 'animate-pulse' : ''}`} />
                </div>
                {badge && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${badgeColor}`}>
                        {badge}
                    </span>
                )}
            </div>
            <div>
                <p className={`${tok('textSecondary', dark)} text-xs font-bold uppercase tracking-wider`}>{title}</p>
                <p className={`${tok('textPrimary', dark)} text-3xl font-bold mt-1.5`}>{value}</p>
                {subtitle && <p className={`${tok('textMuted', dark)} text-xs mt-1 font-semibold`}>{subtitle}</p>}
            </div>
        </div>
    );
};

// ─── Status / Priority Badges ─────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const map = {
        pending: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        responding: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        resolved: 'bg-green-500/20 text-green-400 border-green-500/30',
        online: 'bg-green-500/20 text-green-400 border-green-500/30',
        offline: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        on_duty: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        patrolling: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        available: 'bg-green-500/20 text-green-400 border-green-500/30',
        busy: 'bg-red-500/20 text-red-400 border-red-500/30',
        on_call: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    };
    const key = status?.toLowerCase()?.replace(' ', '_') || 'pending';
    return (
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${map[key] || map.pending}`}>
            {status?.replace(/_/g, ' ') || 'Unknown'}
        </span>
    );
};

const PriorityBadge = ({ priority }) => {
    const map = {
        critical: 'bg-red-500/20 text-red-400 border-red-500/30',
        high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        low: 'bg-green-500/20 text-green-400 border-green-500/30',
    };
    const key = priority?.toLowerCase() || 'low';
    return (
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border uppercase ${map[key] || map.low}`}>
            {priority || 'Low'}
        </span>
    );
};

// ─── Mini SVG Sparkline ───────────────────────────────────────────────────────
const MiniChart = ({ points = [10, 25, 15, 40, 30, 55, 42], color = '#6366f1' }) => {
    const max = Math.max(...points, 1);
    const w = 200, h = 60;
    const pts = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - (p / max) * h}`).join(' ');
    return (
        <svg width="100%" height="60" viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
            <defs>
                <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={`M0,${h} ${pts} L${w},${h} Z`} fill={`url(#grad-${color})`} />
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

// ─── Incident Detail Panel ────────────────────────────────────────────────────
const IncidentPanel = ({ report, onClose, onResolve, session, resolving }) => {
    if (!report) return null;
    const { dark } = useTheme();
    const isCrit = report.priority === 'critical';
    return (
        <div className={`${tok('cardBg', dark)} border rounded-2xl p-5 h-full overflow-y-auto flex flex-col gap-4 ${isCrit ? 'border-red-500/40' : tok('cardBorder', dark)}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className={`w-5 h-5 ${isCrit ? 'text-red-400' : 'text-orange-400'}`} />
                    <h3 className={`${tok('textPrimary', dark)} font-bold text-sm`}>Incident #{report.id.slice(-6).toUpperCase()}</h3>
                </div>
                <button onClick={onClose} className={`${tok('textMuted', dark)} hover:text-indigo-400 transition-colors`}>
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className={`${tok('innerBg', dark)} rounded-xl p-3`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1.5`}>Priority</p>
                    <PriorityBadge priority={report.priority} />
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1.5`}>Status</p>
                    <StatusBadge status={report.status} />
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Type</p>
                    <p className={`${tok('textPrimary', dark)} font-bold`}>{report.type || '-'}</p>
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Location</p>
                    <p className={`${tok('textPrimary', dark)} font-medium`}>{resolveReportLocation(report)}</p>
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Description</p>
                    <p className={`${dark ? 'text-gray-200' : 'text-gray-700'} text-sm`}>{report.description || '-'}</p>
                </div>
                {report.reporterName && (
                    <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                        <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Reporter</p>
                        <p className={`${tok('textPrimary', dark)} text-sm`}>{report.reporterName}</p>
                    </div>
                )}
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Reported At</p>
                    <p className={`${tok('textPrimary', dark)} text-sm`}>
                        {report.createdAt?.seconds
                            ? new Date(report.createdAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '-'}
                    </p>
                </div>
            </div>

            {report.status !== 'resolved' && (
                <button
                    onClick={() => onResolve(report.id)}
                    disabled={resolving === report.id}
                    className="mt-auto w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {resolving === report.id
                        ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        : <CheckCircleIcon className="w-4 h-4" />}
                    Mark as Resolved
                </button>
            )}
        </div>
    );
};

// ─── Verification Detail Panel ────────────────────────────────────────────────
const VerificationPanel = ({ verification, onClose, onApprove, onReject, session }) => {
    if (!verification) return null;
    const { dark } = useTheme();
    const isPending = verification.status === 'pending';
    return (
        <div className={`${tok('cardBg', dark)} border rounded-2xl p-5 h-full overflow-y-auto flex flex-col gap-4 ${isPending ? 'border-purple-500/40' : tok('cardBorder', dark)}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <CheckCircleIcon className={`w-5 h-5 ${isPending ? 'text-purple-400' : 'text-green-400'}`} />
                    <h3 className={`${tok('textPrimary', dark)} font-bold text-sm`}>Verification Request</h3>
                </div>
                <button onClick={onClose} className={`${tok('textMuted', dark)} hover:text-indigo-400 transition-colors`}>
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1.5`}>Status</p>
                    <StatusBadge status={verification.status} />
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Registration Number</p>
                    <p className={`${tok('textPrimary', dark)} font-bold font-mono text-lg`}>{verification.regNo || verification.regNumber || '-'}</p>
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Student Email</p>
                    <p className={`${tok('textPrimary', dark)} text-sm`}>{verification.studentEmail || verification.email || '-'}</p>
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Phone Number</p>
                    <p className={`${tok('textPrimary', dark)} text-sm`}>{verification.phone || verification.phoneNumber || '-'}</p>
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>School</p>
                    <p className={`${tok('textPrimary', dark)} text-sm`}>{verification.school || 'Laikipia University'}</p>
                </div>
                <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Submitted At</p>
                    <p className={`${tok('textPrimary', dark)} text-sm`}>
                        {verification.submittedAt?.seconds
                            ? new Date(verification.submittedAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : verification.createdAt?.seconds
                                ? new Date(verification.createdAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                : '-'}
                    </p>
                </div>
                {verification.reviewedAt && (
                    <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                        <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Reviewed At</p>
                        <p className={`${tok('textPrimary', dark)} text-sm`}>
                            {new Date(verification.reviewedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                )}
                {verification.rejectionReason && (
                    <div className={`${tok('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                        <p className={`${tok('textSecondary', dark)} text-xs mb-1`}>Rejection Reason</p>
                        <p className={`${dark ? 'text-red-300' : 'text-red-700'} text-sm`}>{verification.rejectionReason}</p>
                    </div>
                )}
            </div>

            {isPending && (
                <div className="mt-auto flex gap-2">
                    <button
                        onClick={() => onApprove(verification)}
                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        <CheckCircleIcon className="w-4 h-4" />
                        Approve
                    </button>
                    <button
                        onClick={() => {
                            const reason = window.prompt('Enter rejection reason (optional):');
                            if (reason !== null) onReject(verification, reason || 'Invalid registration number');
                        }}
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        <XMarkIcon className="w-4 h-4" />
                        Reject
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
    { label: 'Overview', icon: ChartBarIcon },
    { label: 'User Management', icon: UsersIcon },
    { label: 'Verifications', icon: CheckCircleIcon }, // ✅ Student Reg No. Verifications
    { label: 'Audit Logs', icon: ClipboardDocumentListIcon },
    { label: 'Global Map', icon: MapPinIcon },
    { label: 'Settings', icon: MagnifyingGlassIcon },
];

// ─── Role dot colors ──────────────────────────────────────────────────────────
const roleDot = {
    super_admin: 'bg-indigo-500',
    security_admin: 'bg-purple-500',
    medical_admin: 'bg-red-500',
    security: 'bg-blue-500',
    doctor: 'bg-pink-500',
    ambulance: 'bg-orange-500',
    student: 'bg-gray-400',
};

// ─── Map marker colors ────────────────────────────────────────────────────────
const markerColor = (type) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('medical') || t.includes('injury') || t === 'sos') return 'bg-red-500';
    if (t.includes('security') || t.includes('theft') || t.includes('assault')) return 'bg-blue-500';
    return 'bg-orange-500';
};

// ─── Write audit log ──────────────────────────────────────────────────────────
const writeAuditLog = async (adminId, adminEmail, action, targetId) => {
    try {
        await addDoc(collection(db, 'audit_logs'), {
            adminId,
            adminEmail,
            action,
            targetId,
            timestamp: serverTimestamp(),
        });
    } catch { /* silent */ }
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const SuperAdminDashboard = () => {
    const navigate = useNavigate();
    const { notifications, addNotification, dismissNotification } = useNotifications();

    // UI
    const [activeNav, setActiveNav] = useState('Overview');
    const [darkMode, setDarkMode] = useState(false);
    const [search, setSearch] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('All');
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [resolving, setResolving] = useState(null);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    // Data
    const [session, setSession] = useState(null);
    const [allReports, setAllReports] = useState([]);
    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({ totalReports: 0, resolvedToday: 0, activeSecUnits: 0, activeMedUnits: 0 });

    // Student Verification Requests
    const [verificationRequests, setVerificationRequests] = useState([]);
    const [showVerificationPanel, setShowVerificationPanel] = useState(false);
    const [selectedVerification, setSelectedVerification] = useState(null);

    // System health (simulated + live counts)
    const [uptime] = useState(() => {
        const h = Math.floor(Math.random() * 24) + 1;
        return `${h}h ${Math.floor(Math.random() * 60)}m`;
    });

    const notifiedIds = useRef(new Set());
    const isFirstLoad = useRef(true);

    // ── Auth Guard ──────────────────────────────────────────────────────────
    useEffect(() => {
        const sess = getSession();
        if (!sess || sess.role !== 'super_admin') {
            navigate('/login', { replace: true });
            return;
        }
        setSession(sess);
    }, []);

    // ── Request Browser Notification Permission ────────────────────────────
    useEffect(() => {
        // Request permission on dashboard mount
        if (notificationService.getPermission() === 'default') {
            notificationService.requestPermission();
        }
    }, []);

    const handleLogout = async () => {
        await clearSession();
        setTimeout(() => { window.location.href = '/login'; }, 300);
    };

    // Profile dropdown handlers
    const handleToggleProfileMenu = () => setIsProfileMenuOpen(prev => !prev);
    const handleCloseProfileMenu = () => setIsProfileMenuOpen(false);
    const handleSettingsClick = () => {
        setIsProfileMenuOpen(false);
        setActiveNav('Settings');
    };

    // ── Reports Listener ────────────────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, 'security_alerts'), orderBy('createdAt', 'desc'));
        let reportsLoaded = false;
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllReports(data);
            setStats(prev => ({
                ...prev,
                totalReports: data.length,
                resolvedToday: data.filter(r => r.status === 'resolved').length,
            }));

            // Real-time notifications for new incidents - only after initial load
            if (reportsLoaded) {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const raw = change.doc.data();
                        const r = { id: change.doc.id, ...raw };
                        if (!notifiedIds.current.has(r.id)) {
                            notifiedIds.current.add(r.id);
                            const isCrit = r.priority === 'critical';
                            const val = raw.createdAt;
                            const createdAtMs = val?.toDate ? val.toDate().getTime() : val?.seconds ? val.seconds * 1000 : null;
                            addNotification({
                                type: isCrit ? 'sos' : 'security',
                                title: isCrit ? '🚨 Critical Incident Reported' : '⚠️ New Incident Reported',
                                message: `${r.type || 'Incident'} at ${resolveReportLocation(r)} · Priority: ${r.priority || 'unknown'}`,
                                report: r,
                                createdAtMs,
                                docId: r.id,
                            });
                        }
                    }
                });
            }

            reportsLoaded = true;
            setIsLoading(false);
        });
    }, [addNotification]);

    // ── Users Listener ──────────────────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, 'users'));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setUsers(data);
            const sec = data.filter(u => u.role === 'security' && ['on_duty', 'patrolling'].includes(u.status)).length;
            const med = data.filter(u => ['ambulance', 'doctor'].includes(u.role) && ['available', 'on_call'].includes(u.status)).length;
            setStats(prev => ({ ...prev, activeSecUnits: sec, activeMedUnits: med }));
        });
    }, []);

    // ── Audit Logs Listener ─────────────────────────────────────────────────
    useEffect(() => {
        const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(20));
        return onSnapshot(q, (snapshot) => {
            setAuditLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, []);

    // ── Student Verification Requests Listener ──────────────────────────────
    useEffect(() => {
        const q = query(collection(db, 'verification_requests'), orderBy('submittedAt', 'desc'));
        let verificationsLoaded = false;
        const unsub = onSnapshot(q, (snap) => {
            const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setVerificationRequests(requests);
            console.log(`✅ [Verification] ${requests.length} verification requests loaded`);

            // Real-time notifications for NEW pending verifications - only after initial load
            if (verificationsLoaded) {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const raw = change.doc.data();
                        const req = { id: change.doc.id, ...raw };
                        if (req.status === 'pending') {
                            const val = raw.submittedAt || raw.createdAt;
                            const createdAtMs = val?.toDate ? val.toDate().getTime() : val?.seconds ? val.seconds * 1000 : null;
                            addNotification({
                                type: 'verification',
                                title: '📝 New Verification Request',
                                message: `${req.regNo || req.regNumber || 'Student'} submitted verification request`,
                                report: req, // Pass as 'report' so NotificationSystem can display details
                                createdAtMs,
                                docId: req.id,
                                showBrowserNotification: true,
                            });
                        }
                    }
                });
            }

            verificationsLoaded = true;
        }, (err) => {
            console.error('❌ [Verification] Error fetching verification requests:', err);
        });
        return () => unsub();
    }, [addNotification]);

    // ── Resolve Incident ────────────────────────────────────────────────────
    const handleResolve = async (reportId) => {
        setResolving(reportId);
        try {
            await updateDoc(doc(db, 'security_alerts', reportId), {
                status: 'resolved',
                resolvedAt: serverTimestamp(),
            });
            await writeAuditLog(session?.uid, session?.email, 'Resolved Incident', reportId);
            setSelectedIncident(prev => prev?.id === reportId ? { ...prev, status: 'resolved' } : prev);
        } catch (e) {
            console.error('Resolve failed:', e);
        } finally {
            setResolving(null);
        }
    };

    // ── Handle Student Verification - Approve ───────────────────────────────
    const handleApproveVerification = async (verificationRequest) => {
        // Support both field name conventions (regNo from mobile, regNumber from older submissions)
        const regNo = verificationRequest.regNo || verificationRequest.regNumber || 'N/A';
        const phone = verificationRequest.phone || verificationRequest.phoneNumber || 'N/A';

        if (!window.confirm(`Approve verification for ${regNo}?\nThis will grant the student full access.`)) return;

        try {
            const userDocRef = doc(db, 'users', verificationRequest.userId);

            // Update user document - these are the fields the mobile app checks
            await updateDoc(userDocRef, {
                isApproved: true,
                isVerified: true,
                isRegNumberVerified: true,
                verificationStatus: 'approved',
                isProfileComplete: true,
                regNo,
                phone,
                verifiedAt: new Date().toISOString(),
                verifiedBy: session?.uid || 'admin',
            });

            // Update verification request
            await updateDoc(doc(db, 'verification_requests', verificationRequest.id), {
                status: 'approved',
                reviewedAt: new Date().toISOString(),
                reviewedBy: session?.uid || 'admin',
            });

            // Notify student
            await addDoc(collection(db, 'notifications'), {
                userId: verificationRequest.userId,
                title: '✅ Registration Verified',
                message: `Your registration number (${regNo}) has been verified and approved. You now have full access!`,
                type: 'verification_approved',
                read: false,
                createdAt: serverTimestamp(),
            });

            addNotification({
                type: 'verification',
                title: 'Student Approved',
                message: `${regNo} approved - student has full access`,
            });

            await writeAuditLog(session?.uid, session?.email, 'Approved Student Verification', regNo);

            if (selectedVerification?.id === verificationRequest.id) {
                setSelectedVerification(null);
            }
        } catch (error) {
            console.error('Error approving verification:', error);
            addNotification({
                type: 'error',
                title: 'Approval Failed',
                message: 'Failed to approve verification. Please try again.',
            });
        }
    };

    // ── Handle Student Verification - Reject ────────────────────────────────
    const handleRejectVerification = async (verificationRequest, reason = '') => {
        const regNo = verificationRequest.regNo || verificationRequest.regNumber || 'N/A';

        if (!reason && !window.confirm(`Reject verification for ${regNo}?\nThe student will be notified.`)) return;

        try {
            // Update verification request
            await updateDoc(doc(db, 'verification_requests', verificationRequest.id), {
                status: 'rejected',
                reviewedAt: new Date().toISOString(),
                reviewedBy: session?.uid || 'admin',
                rejectionReason: reason || 'Invalid registration number',
            });

            // Update user - allow resubmission
            await updateDoc(doc(db, 'users', verificationRequest.userId), {
                isApproved: false,
                isVerified: false,
                isRegNumberVerified: false,
                verificationStatus: 'rejected',
                isProfileComplete: false,
            });

            // Notify student
            await addDoc(collection(db, 'notifications'), {
                userId: verificationRequest.userId,
                title: '❌ Verification Rejected',
                message: `Your registration number (${regNo}) was rejected. Reason: ${reason || 'Invalid registration number'}. Please resubmit with correct information.`,
                type: 'verification_rejected',
                read: false,
                createdAt: serverTimestamp(),
            });

            addNotification({
                type: 'verification',
                title: 'Verification Rejected',
                message: `${regNo} rejected`,
            });

            await writeAuditLog(session?.uid, session?.email, 'Rejected Student Verification', regNo);

            if (selectedVerification?.id === verificationRequest.id) {
                setSelectedVerification(null);
            }
        } catch (error) {
            console.error('Error rejecting verification:', error);
            addNotification({
                type: 'error',
                title: 'Rejection Failed',
                message: 'Failed to reject verification. Please try again.',
            });
        }
    };

    // ── Derived ─────────────────────────────────────────────────────────────
    const onlineUsers = users.filter(u => u.status && u.status !== 'offline').slice(0, 8);
    const totalActiveUsers = users.filter(u => u.status && u.status !== 'offline').length;

    const filteredReports = allReports.filter(r => {
        const matchPriority = priorityFilter === 'All' || r.priority?.toLowerCase() === priorityFilter.toLowerCase();
        const matchSearch = !search ||
            r.type?.toLowerCase().includes(search.toLowerCase()) ||
            r.location?.toLowerCase().includes(search.toLowerCase()) ||
            resolveReportLocation(r).toLowerCase().includes(search.toLowerCase()) ||
            r.description?.toLowerCase().includes(search.toLowerCase());
        return matchPriority && matchSearch;
    });

    const recentReports = filteredReports.slice(0, 10);
    const activityPoints = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const dayStart = new Date(d.setHours(0, 0, 0, 0)).getTime();
        return allReports.filter(r => {
            if (!r.createdAt?.seconds) return false;
            const ts = r.createdAt.seconds * 1000;
            return ts >= dayStart && ts < dayStart + 86400000;
        }).length;
    });

    // Chart Data Generation
    const activityChartData = activityPoints.map((val, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return { name: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), incidents: val };
    });

    const incidentTypeData = [
        { name: 'Medical', value: allReports.filter(r => ['Medical', 'Injury', 'Illness', 'SOS'].includes(r.type)).length || 1, color: '#ec4899' },
        { name: 'Security', value: allReports.filter(r => ['Security', 'Theft', 'Assault'].includes(r.type)).length || 1, color: '#3b82f6' },
        { name: 'Other', value: allReports.filter(r => !['Medical', 'Injury', 'Illness', 'SOS', 'Security', 'Theft', 'Assault'].includes(r.type)).length || 1, color: '#10b981' }
    ];

    const systemHealthData = [
        { name: 'Resolved', value: stats.resolvedToday || 1, color: '#eab308' },
        { name: 'Unresolved', value: allReports.filter(r => r.status !== 'resolved').length || 0, color: '#1e293b' }
    ];

    const simulatedUserGrowth = [
        { name: 'W1', users: 120 }, { name: 'W2', users: 132 }, { name: 'W3', users: 145 }, { name: 'W4', users: Math.max(150, users.length) }
    ];

    const simulatedEngagement = Array.from({ length: 10 }, (_, i) => ({
        name: `T-${9 - i}`,
        active: Math.floor(Math.random() * 20) + 50 + (i * 2)
    }));

    // ══════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════
    return (
        <ThemeContext.Provider value={{ dark: darkMode }}>
            <div className={`flex h-screen ${tok('pageBg', darkMode)} ${darkMode ? 'text-white' : 'text-gray-900'} font-sans overflow-hidden`}>

                {/* ════ SIDEBAR ════════════════════════════════════════════════ */}
                <aside className={`w-64 ${tok('sidebarBg', darkMode)} border-r ${tok('sidebarBorder', darkMode)} flex flex-col shrink-0`}>
                    {/* Logo */}
                    <div className={`p-6 flex flex-col gap-1 border-b ${tok('sidebarBorder', darkMode)}`}>
                        <h1 className={`text-xl font-bold tracking-tight ${tok('textPrimary', darkMode)}`}>Campus Safety</h1>
                        <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest">Super Admin Dashboard</p>
                    </div>



                    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                        {NAV_ITEMS.map(item => (
                            <button key={item.label} onClick={() => setActiveNav(item.label)}
                                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeNav === item.label
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                    : tok('navHover', darkMode)
                                    }`}>
                                <item.icon className="w-5 h-5 stroke-2" />
                                <span className="text-[15px] font-semibold">{item.label}</span>
                            </button>
                        ))}
                    </nav>

                    {/* Stats summary at bottom */}
                    <div className={`p-4 border-t ${tok('sidebarBorder', darkMode)} space-y-2`}>
                        <div className="flex items-center justify-between text-xs">
                            <span className={tok('textMuted', darkMode)}>Active incidents</span>
                            <span className={`font-bold ${allReports.filter(r => r.status !== 'resolved').length > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {allReports.filter(r => r.status !== 'resolved').length}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={tok('textMuted', darkMode)}>Online users</span>
                            <span className="text-green-400 font-bold">{totalActiveUsers}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className={tok('textMuted', darkMode)}>System uptime</span>
                            <span className="text-indigo-400 font-bold">{uptime}</span>
                        </div>
                    </div>
                </aside>

                {/* ════ MAIN ══════════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Header */}
                    <header className={`${tok('headerBg', darkMode)} border-b ${tok('sidebarBorder', darkMode)} px-6 py-3 flex items-center justify-between shrink-0 z-20`}>
                        <div className="flex items-center gap-3">
                            <h2 className={`${tok('textPrimary', darkMode)} text-lg font-bold`}>
                                {activeNav === 'Overview' ? 'System Overview' :
                                    activeNav === 'Audit Logs' ? 'Audit Log' :
                                        activeNav === 'System Health' ? 'System Health' :
                                            activeNav === 'User Management' ? 'User Management' :
                                                activeNav}
                            </h2>
                            {isLoading && <ArrowPathIcon className="w-4 h-4 text-gray-500 animate-spin" />}
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Search - visible on overview */}
                            {(activeNav === 'Overview' || activeNav === 'User Management') && (
                                <div className="relative hidden md:block">
                                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="text" placeholder={activeNav === 'Overview' ? 'Search incidents...' : 'Search users...'}
                                        value={search} onChange={e => setSearch(e.target.value)}
                                        className={`border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500/50 w-48 ${tok('inputBg', darkMode)}`} />
                                </div>
                            )}
                            <span className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 text-xs font-bold">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />LIVE
                            </span>

                            {/* Dark / Light toggle */}
                            <button
                                onClick={() => setDarkMode(d => !d)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${darkMode ? 'bg-[#1e2347] border-[#252A41] text-gray-300 hover:text-white' : 'bg-gray-100 border-gray-200 text-gray-700 hover:text-gray-900'}`}
                                title="Toggle dark/light mode"
                            >
                                {darkMode ? <><SunIcon className="w-4 h-4" /> Light</> : <><MoonIcon className="w-4 h-4" /> Dark</>}
                            </button>

                            {/* Profile Dropdown */}
                            <div className="relative z-50">
                                <button
                                    onClick={handleToggleProfileMenu}
                                    className={`flex items-center gap-3 px-2 py-1.5 rounded-xl transition-all group ${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-100'}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-900/20">
                                        {session?.name ? session.name[0] : 'S'}
                                    </div>
                                    <div className="text-left hidden md:block">
                                        <h1 className={`${tok('textPrimary', darkMode)} text-sm font-bold leading-tight`}>Super Admin</h1>
                                        <p className={`${tok('textMuted', darkMode)} text-[10px] uppercase tracking-wider font-semibold`}>AdminCore</p>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 ${tok('textMuted', darkMode)} group-hover:text-indigo-400 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Dropdown */}
                                {isProfileMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={handleCloseProfileMenu} />
                                        <div className={`absolute right-0 top-14 w-60 ${tok('popoverBg', darkMode)} border rounded-2xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5 pointer-events-auto`}>
                                            <div className={`p-4 border-b ${tok('divider', darkMode)} ${darkMode ? 'bg-[#1e2347]/50' : 'bg-gray-50'}`}>
                                                <p className={`${tok('textPrimary', darkMode)} text-sm font-bold`}>{session?.name || 'Super Admin'}</p>
                                                <p className={`${tok('textMuted', darkMode)} text-xs truncate`}>{session?.email || 'admin@campus.edu'}</p>
                                            </div>
                                            <div className="p-1 space-y-1">
                                                <button
                                                    onClick={handleSettingsClick}
                                                    className={`w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${darkMode ? 'text-gray-300 hover:bg-[#1e2347] hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
                                                >
                                                    <UserCircleIcon className="w-4 h-4" />
                                                    Profile Settings
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleLogout();
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-red-500 hover:bg-red-500/10 hover:text-red-600 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 border-t pt-3 mt-1 cursor-pointer ${darkMode ? 'border-[#252A41]' : 'border-gray-200'}`}
                                                >
                                                    <ArrowLeftOnRectangleIcon className="w-4 h-4" />
                                                    Log Out
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="relative">
                                <BellSolid className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
                                {notifications.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
                            </div>
                        </div>
                    </header>

                    {/* Body */}
                    <div className="flex-1 overflow-auto p-6 space-y-6">

                        {/* ══ OVERVIEW ══════════════════════════════════════════ */}
                        {activeNav === 'Overview' && (<>
                            {/* ══ PREMIUM ANALYTICS DASHBOARD ══ */}
                            <div className="space-y-6 mb-6">
                                {/* TOP ROW: Welcome Card (2/3) + Mini Cards (1/3) */}
                                <div className="grid grid-cols-3 gap-6">
                                    {/* Welcome Card */}
                                    <div className={`col-span-2 bg-gradient-to-br ${darkMode ? 'from-[#0D1130] via-[#141728] to-[#1a1e3b]' : 'from-white via-gray-50 to-gray-100'} border ${tok('cardBorder', darkMode)} rounded-2xl p-8 flex items-center relative overflow-hidden shadow-lg`}>
                                        <div className="relative z-10 w-2/3">
                                            <p className="text-indigo-400 font-semibold mb-1 text-sm tracking-wide">Welcome back</p>
                                            <h2 className={`${tok('textPrimary', darkMode)} text-3xl font-bold mb-8`}>{session?.name || 'Super Admin'}!</h2>

                                            <div className="flex gap-12">
                                                <div>
                                                    <p className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>{stats.totalReports}</p>
                                                    <p className={`${tok('textSecondary', darkMode)} text-xs mb-2 mt-1`}>Total Incidents</p>
                                                    <div className={`w-24 h-1 ${darkMode ? 'bg-[#1e2347]' : 'bg-gray-200'} rounded-full overflow-hidden`}><div className="h-full bg-green-500 w-3/4"></div></div>
                                                </div>
                                                <div>
                                                    <p className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>{totalActiveUsers}</p>
                                                    <p className={`${tok('textSecondary', darkMode)} text-xs mb-2 mt-1`}>Active Users</p>
                                                    <div className={`w-24 h-1 ${darkMode ? 'bg-[#1e2347]' : 'bg-gray-200'} rounded-full overflow-hidden`}><div className="h-full bg-orange-500 w-1/2"></div></div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Abstract Graphic representing the illustration */}
                                        <div className="absolute right-0 top-0 bottom-0 w-1/3 pointer-events-none">
                                            <div className="absolute right-[-10%] top-[-10%] w-64 h-64 bg-indigo-500/20 rounded-full blur-[60px]"></div>
                                            <div className="absolute right-[20%] bottom-[-20%] w-48 h-48 bg-purple-500/20 rounded-full blur-[50px]"></div>
                                            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0zIDNoMTh2MThIM3oiIG9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-50"></div>
                                        </div>
                                    </div>

                                    {/* Mini Cards 2x2 */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Card 1: Active Users (Area) */}
                                        <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-4 flex flex-col justify-between shadow-sm relative overflow-hidden`}>
                                            <div className="relative z-10">
                                                <p className={`${tok('textPrimary', darkMode)} text-lg font-bold`}>{totalActiveUsers}</p>
                                                <p className={`${tok('textMuted', darkMode)} text-[10px]`}>Active Users</p>
                                            </div>
                                            <div className="h-14 mt-2 -mx-4 -mb-4 relative z-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={simulatedUserGrowth}>
                                                        <defs><linearGradient id="colorU" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} /><stop offset="95%" stopColor="#ec4899" stopOpacity={0} /></linearGradient></defs>
                                                        <Area type="monotone" dataKey="users" stroke="#ec4899" strokeWidth={2} fillOpacity={1} fill="url(#colorU)" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        {/* Card 2: Total Users (Line) */}
                                        <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-4 flex flex-col justify-between shadow-sm`}>
                                            <div>
                                                <p className={`${tok('textPrimary', darkMode)} text-lg font-bold`}>{users.length}</p>
                                                <p className={`${tok('textMuted', darkMode)} text-[10px]`}>Total Users</p>
                                            </div>
                                            <div className="h-10 mt-2 -mx-2 -mb-1">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={simulatedUserGrowth}><Line type="monotone" dataKey="users" stroke="#10b981" strokeWidth={2} dot={false} /></LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        {/* Card 3: Resolved (Bar) */}
                                        <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-4 flex flex-col justify-between shadow-sm`}>
                                            <div>
                                                <p className={`${tok('textPrimary', darkMode)} text-lg font-bold`}>{stats.resolvedToday}</p>
                                                <p className={`${tok('textMuted', darkMode)} text-[10px]`}>Resolved Cases</p>
                                            </div>
                                            <div className="h-10 mt-2 -mx-2 -mb-1">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={activityChartData}><Bar dataKey="incidents" fill="#a855f7" radius={[2, 2, 0, 0]} /></BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                        {/* Card 4: Unresolved (Line) */}
                                        <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-4 flex flex-col justify-between shadow-sm`}>
                                            <div>
                                                <p className={`${tok('textPrimary', darkMode)} text-lg font-bold`}>{allReports.filter(r => r.status !== 'resolved').length}</p>
                                                <p className={`${tok('textMuted', darkMode)} text-[10px]`}>Unresolved</p>
                                            </div>
                                            <div className="h-10 mt-2 -mx-2 -mb-1">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={activityChartData}><Line type="step" dataKey="incidents" stroke="#ef4444" strokeWidth={2} dot={{ r: 2, fill: '#ef4444' }} /></LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* BOTTOM ROW: 3 Charts */}
                                <div className="grid grid-cols-3 gap-6">
                                    {/* Monthly/Weekly Revenue -> Activity Trend (Bar) */}
                                    <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 shadow-sm`}>
                                        <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-4 text-sm text-center`}>7-Day Activity Trend</h3>
                                        <div className="h-48">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={activityChartData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e2347' : '#e5e7eb'} vertical={false} />
                                                    <XAxis dataKey="name" stroke={darkMode ? '#6b7280' : '#6b7280'} fontSize={10} tickLine={false} axisLine={false} />
                                                    <YAxis stroke={darkMode ? '#6b7280' : '#6b7280'} fontSize={10} tickLine={false} axisLine={false} />
                                                    <Tooltip cursor={{ fill: darkMode ? '#1e2347' : '#f3f4f6' }} contentStyle={{ backgroundColor: darkMode ? '#0D1130' : '#ffffff', borderColor: darkMode ? '#252A41' : '#e5e7eb', borderRadius: '8px', color: darkMode ? '#fff' : '#111827' }} itemStyle={{ color: darkMode ? '#fff' : '#111827' }} />
                                                    <Bar dataKey="incidents" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={20} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className={`${tok('textMuted', darkMode)} text-[10px] text-center mt-3 uppercase tracking-wider`}>Incidents reported per day</p>
                                    </div>

                                    {/* Device Type -> Incident Categories (Donut) */}
                                    <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 shadow-sm flex flex-col items-center relative`}>
                                        <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-2 text-sm text-center self-start w-full`}>Incident Types</h3>
                                        <div className="h-40 w-full relative mt-2">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={incidentTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                                                        {incidentTypeData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0D1130' : '#ffffff', borderColor: darkMode ? '#252A41' : '#e5e7eb', borderRadius: '8px', fontSize: '12px', color: darkMode ? '#fff' : '#111827' }} itemStyle={{ color: darkMode ? '#fff' : '#111827' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            {/* Center Text */}
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>{allReports.length}</span>
                                                <span className={`${tok('textMuted', darkMode)} text-[10px] uppercase tracking-wider`}>Total</span>
                                            </div>
                                        </div>
                                        {/* Legend */}
                                        <div className="w-full mt-4 space-y-2.5 px-2">
                                            {incidentTypeData.map(item => (
                                                <div key={item.name} className="flex justify-between items-center text-xs">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }}></span>
                                                        <span className={`${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.name}</span>
                                                    </div>
                                                    <span className={`${tok('textSecondary', darkMode)} font-mono`}>{item.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Total Accounts -> System Engagement (Area) */}
                                    <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 shadow-sm flex flex-col justify-between overflow-hidden relative`}>
                                        <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-1">
                                                <h3 className={`${tok('textPrimary', darkMode)} font-bold text-3xl`}>{stats.totalReports + users.length}</h3>
                                                <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">↑ 12.5%</span>
                                            </div>
                                            <p className={`${tok('textSecondary', darkMode)} text-xs uppercase tracking-wider`}>System Interactions</p>
                                        </div>
                                        <div className="h-40 -mx-6 -mb-6 relative z-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={simulatedEngagement}>
                                                    <defs><linearGradient id="colorEngage" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#eab308" stopOpacity={0.4} /><stop offset="95%" stopColor="#eab308" stopOpacity={0} /></linearGradient></defs>
                                                    <Area type="monotone" dataKey="active" stroke="#eab308" strokeWidth={3} fillOpacity={1} fill="url(#colorEngage)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Map + Sidebar grid */}
                            <div className="grid grid-cols-3 gap-6" style={{ minHeight: '380px' }}>
                                {/* Campus Liability Map */}
                                <div className={`col-span-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 flex flex-col`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className={`${tok('textPrimary', darkMode)} font-bold`}>Campus Liability Map</h2>
                                        <div className="flex gap-2 text-xs">
                                            <span className={`flex items-center gap-1.5 ${tok('textSecondary', darkMode)}`}><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Medical</span>
                                            <span className={`flex items-center gap-1.5 ${tok('textSecondary', darkMode)}`}><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Security</span>
                                            <span className={`flex items-center gap-1.5 ${tok('textSecondary', darkMode)}`}><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />Emergency</span>
                                        </div>
                                    </div>
                                    <div className={`flex-1 ${tok('deepBg', darkMode)} rounded-xl relative overflow-hidden min-h-[240px]`}>
                                        <iframe
                                            srcDoc={buildLiveMapHtml(allReports)}
                                            width="100%"
                                            height="100%"
                                            style={{ border: 0 }}
                                            sandbox="allow-scripts allow-same-origin"
                                            title="Live Campus Map"
                                        />
                                        {/* Overlay elements */}
                                        <div className={`absolute bottom-3 left-3 backdrop-blur-md border px-3 py-1.5 rounded-lg pointer-events-none ${darkMode ? 'bg-[#141728]/80 border-[#252A41]' : 'bg-white/90 border-gray-200'}`}>
                                            <p className={`text-[10px] font-medium tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{allReports.filter(r => r.status !== 'resolved' && (r.latitude || r.locationCoords?.latitude || r.coordinates?.latitude)).length} live markers</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Network Activity & Role Distribution */}
                                <div className="flex flex-col gap-6">
                                    {/* Network Activity */}
                                    <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 flex flex-col flex-1 min-h-[250px]`}>
                                        <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-3`}>Network Activity</h3>
                                        <p className={`${tok('textSecondary', darkMode)} text-xs font-semibold uppercase tracking-wide mb-2`}>Active Personnel</p>
                                        <div className="flex-1 overflow-y-auto space-y-2">
                                            {onlineUsers.length === 0 && <p className="text-gray-500 text-xs">No active users.</p>}
                                            {onlineUsers.map(u => (
                                                <div key={u.id} className="flex items-center gap-2.5">
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${roleDot[u.role] || 'bg-gray-600'}`}>
                                                        {u.name?.[0] || '?'}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`${tok('textPrimary', darkMode)} text-xs font-medium truncate`}>{u.name || 'Unknown'}</p>
                                                        <p className={`${tok('textMuted', darkMode)} text-[9px]`}>{u.role?.replace('_', ' ')} · {u.status}</p>
                                                    </div>
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${u.status === 'offline' ? 'bg-gray-500' : 'bg-green-500 animate-pulse'}`} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Role Distribution (Moved from System Health) */}
                                    <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 flex flex-col shrink-0`}>
                                        <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-4`}>Role Distribution</h3>
                                        <div className="space-y-2.5">
                                            {['student', 'security', 'doctor', 'ambulance', 'security_admin'].map(role => {
                                                const count = users.filter(u => u.role === role).length;
                                                const pct = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
                                                return (
                                                    <div key={role} className="flex items-center gap-3">
                                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${roleDot[role] || 'bg-gray-500'}`} />
                                                        <span className={`${darkMode ? 'text-gray-300' : 'text-gray-700'} text-[11px] capitalize w-20 truncate`}>{role.replace(/_/g, ' ')}</span>
                                                        <div className={`flex-1 ${darkMode ? 'bg-[#252A41]' : 'bg-gray-200'} rounded-full h-1.5`}>
                                                            <div className={`h-1.5 rounded-full ${roleDot[role] || 'bg-gray-500'}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className={`${tok('textSecondary', darkMode)} text-[10px] w-6 text-right font-mono`}>{count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Incidents table + detail panel */}
                            <div className="grid grid-cols-3 gap-6">
                                <div className={`col-span-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl overflow-hidden`}>
                                    <div className={`p-4 border-b ${tok('divider', darkMode)} flex items-center justify-between`}>
                                        <h3 className={`${tok('textPrimary', darkMode)} font-bold`}>Recent Global Incidents</h3>
                                        <div className="flex gap-1.5">
                                            {['All', 'critical', 'high', 'moderate', 'low'].map(f => (
                                                <button key={f} onClick={() => setPriorityFilter(f === 'All' ? 'All' : f)}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all capitalize ${priorityFilter === f || (f === 'All' && priorityFilter === 'All') ? 'bg-indigo-600 text-white' : (darkMode ? 'text-gray-400 hover:text-white hover:bg-[#1e2347]' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')}`}>
                                                    {f}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className={`${tok('deepBg', darkMode)} ${tok('textSecondary', darkMode)} text-xs uppercase sticky top-0`}>
                                                <tr>
                                                    <th className="p-3">ID</th>
                                                    <th className="p-3">Type</th>
                                                    <th className="p-3">Location</th>
                                                    <th className="p-3">Priority</th>
                                                    <th className="p-3">Status</th>
                                                    <th className="p-3">Time</th>
                                                </tr>
                                            </thead>
                                            <tbody className={`divide-y ${tok('dividerInner', darkMode)} text-sm`}>
                                                {recentReports.map(r => (
                                                    <tr key={r.id}
                                                        onClick={() => setSelectedIncident(r)}
                                                        className={`${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-50'} transition-colors cursor-pointer border-l-2 border-transparent hover:border-l-indigo-500`}>
                                                        <td className={`p-3 ${tok('textMuted', darkMode)} font-mono text-[11px]`}>#{r.id.slice(-6).toUpperCase()}</td>
                                                        <td className={`p-3 ${tok('textPrimary', darkMode)} font-medium text-xs`}>{r.type || '-'}</td>
                                                        <td className={`p-3 ${tok('textSecondary', darkMode)} text-xs truncate max-w-[100px]`}>{resolveReportLocation(r)}</td>
                                                        <td className="p-3"><PriorityBadge priority={r.priority} /></td>
                                                        <td className="p-3"><StatusBadge status={r.status} /></td>
                                                        <td className={`p-3 ${tok('textMuted', darkMode)} text-[11px] whitespace-nowrap`}>
                                                            {r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {recentReports.length === 0 && (
                                                    <tr><td colSpan="6" className={`p-8 text-center ${tok('textMuted', darkMode)} text-sm`}>
                                                        {isLoading ? 'Loading...' : 'No incidents match the filter.'}
                                                    </td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Incident detail panel */}
                                <div className="h-[400px]">
                                    {selectedIncident
                                        ? <IncidentPanel report={selectedIncident} onClose={() => setSelectedIncident(null)} onResolve={handleResolve} session={session} resolving={resolving} />
                                        : <div className={`h-full ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl flex flex-col items-center justify-center gap-3 text-center p-6`}>
                                            <ExclamationTriangleIcon className={`w-10 h-10 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                                            <p className={`${tok('textSecondary', darkMode)} font-medium text-sm`}>No incident selected</p>
                                            <p className={`${tok('textMuted', darkMode)} text-xs`}>Click a row or map marker to view details.</p>
                                        </div>
                                    }
                                </div>
                            </div>
                        </>)}



                        {/* ══ USER MANAGEMENT ════════════════════════════════════ */}
                        {activeNav === 'User Management' && (
                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl overflow-hidden`}>
                                <div className={`p-4 border-b ${tok('divider', darkMode)}`}>
                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold`}>All Users ({users.length})</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className={`${tok('deepBg', darkMode)} ${tok('textSecondary', darkMode)} text-xs uppercase sticky top-0`}>
                                            <tr>
                                                <th className="p-4">User</th>
                                                <th className="p-4">Email</th>
                                                <th className="p-4">Role</th>
                                                <th className="p-4">Status</th>
                                                <th className="p-4">Location</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${tok('dividerInner', darkMode)} text-sm`}>
                                            {users
                                                .filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
                                                .map(u => (
                                                    <tr key={u.id} className={`${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-50'} transition-colors`}>
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${roleDot[u.role] || 'bg-gray-600'}`}>
                                                                    {u.name?.[0] || '?'}
                                                                </div>
                                                                <span className={`${tok('textPrimary', darkMode)} font-medium text-xs`}>{u.name || 'Unknown'}</span>
                                                            </div>
                                                        </td>
                                                        <td className={`p-4 ${tok('textSecondary', darkMode)} text-xs`}>{u.email || '-'}</td>
                                                        <td className="p-4">
                                                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleDot[u.role] ? `bg-${u.role.includes('admin') ? 'indigo' : 'gray'}-500/20 text-${u.role.includes('admin') ? 'indigo' : 'gray'}-400 border-${u.role.includes('admin') ? 'indigo' : 'gray'}-500/30` : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                                                                {u.role?.replace(/_/g, ' ') || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4"><StatusBadge status={u.status || 'offline'} /></td>
                                                        <td className={`p-4 ${tok('textMuted', darkMode)} text-xs`}>{u.location || '-'}</td>
                                                    </tr>
                                                ))}
                                            {users.length === 0 && (
                                                <tr><td colSpan="5" className={`p-8 text-center ${tok('textMuted', darkMode)} text-sm`}>
                                                    {isLoading ? 'Loading users...' : 'No users found.'}
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ══ VERIFICATIONS ════════════════════════════════════ */}
                        {activeNav === 'Verifications' && (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center shrink-0">
                                            <CheckCircleIcon className="w-6 h-6 text-green-400" />
                                        </div>
                                        <h2 className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>Student Verifications</h2>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-gray-400 text-sm">
                                            {verificationRequests.filter(r => r.status === 'pending').length} pending
                                        </span>
                                        <button
                                            onClick={() => setShowVerificationPanel(!showVerificationPanel)}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                        >
                                            {showVerificationPanel ? 'Hide Panel' : 'Show Panel'}
                                        </button>
                                    </div>
                                </div>

                                {/* Stats Cards */}
                                <div className="grid grid-cols-4 gap-4">
                                    <StatCard
                                        title="Total Requests"
                                        value={verificationRequests.length}
                                        subtitle="All time submissions"
                                        badge="Total"
                                        badgeColor="bg-blue-500/20 text-blue-400"
                                        icon={CheckCircleIcon}
                                        iconBg="bg-blue-600"
                                    />
                                    <StatCard
                                        title="Pending Review"
                                        value={verificationRequests.filter(r => r.status === 'pending').length}
                                        subtitle="Requires attention"
                                        badge="Active"
                                        badgeColor="bg-orange-500/20 text-orange-400"
                                        icon={ExclamationTriangleIcon}
                                        iconBg="bg-orange-600"
                                    />
                                    <StatCard
                                        title="Approved"
                                        value={verificationRequests.filter(r => r.status === 'approved').length}
                                        subtitle="Verified students"
                                        badge="Done"
                                        badgeColor="bg-green-500/20 text-green-400"
                                        icon={CheckCircleIcon}
                                        iconBg="bg-green-600"
                                    />
                                    <StatCard
                                        title="Rejected"
                                        value={verificationRequests.filter(r => r.status === 'rejected').length}
                                        subtitle="Invalid submissions"
                                        badge="Closed"
                                        badgeColor="bg-gray-500/20 text-gray-400"
                                        icon={XMarkIcon}
                                        iconBg="bg-gray-600"
                                    />
                                </div>

                                {/* Verification Requests Table + Detail Panel */}
                                <div className="grid grid-cols-3 gap-6">
                                    {/* Table */}
                                    <div className={`col-span-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl overflow-hidden`}>
                                        <table className="w-full text-sm">
                                            <thead className={tok('innerBg', darkMode)}>
                                                <tr>
                                                    {['Reg Number', 'Student Email', 'Phone', 'School', 'Submitted', 'Status', 'Actions'].map(h => (
                                                        <th key={h} className={`text-left px-4 py-4 font-medium ${tok('textSecondary', darkMode)}`}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className={`divide-y ${tok('dividerInner', darkMode)}`}>
                                                {verificationRequests.map(req => (
                                                    <tr
                                                        key={req.id}
                                                        className={`cursor-pointer transition-colors ${darkMode ? 'hover:bg-[#1e2347]/50' : 'hover:bg-gray-50'} ${selectedVerification?.id === req.id ? (darkMode ? 'bg-purple-900/10' : 'bg-purple-50') : ''}`}
                                                        onClick={() => setSelectedVerification(req)}
                                                    >
                                                        <td className="px-4 py-4">
                                                            <span className="text-white font-mono text-xs font-bold bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">
                                                                {req.regNo || req.regNumber || '-'}
                                                            </span>
                                                        </td>
                                                        <td className={`px-4 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                                            <p className={`${tok('textPrimary', darkMode)} text-xs`}>{req.studentEmail || 'N/A'}</p>
                                                        </td>
                                                        <td className={`px-4 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                                            <p className={`${tok('textPrimary', darkMode)} text-xs`}>{req.phone || req.phoneNumber || 'N/A'}</p>
                                                        </td>
                                                        <td className={`px-4 py-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                                            <p className={`${tok('textPrimary', darkMode)} text-xs`}>{req.school || 'Laikipia University'}</p>
                                                        </td>
                                                        <td className={`px-4 py-4 ${tok('textSecondary', darkMode)} whitespace-nowrap`}>
                                                            {req.submittedAt && (
                                                                <p className={`${tok('textPrimary', darkMode)} text-xs`}>
                                                                    {new Date(req.submittedAt.seconds * 1000).toLocaleDateString([], {
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                        year: 'numeric'
                                                                    })}
                                                                </p>
                                                            ) || '-'}
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <select
                                                                value={req.status || 'pending'}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    if (e.target.value === 'approved') handleApproveVerification(req);
                                                                    else if (e.target.value === 'rejected') {
                                                                        const reason = window.prompt('Enter rejection reason:');
                                                                        if (reason) handleRejectVerification(req, reason);
                                                                    }
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`border text-xs rounded px-2 py-1 focus:outline-none focus:border-purple-500 ${tok('inputBg', darkMode)}`}
                                                            >
                                                                <option value="pending">⏳ Pending</option>
                                                                <option value="approved">✅ Approved</option>
                                                                <option value="rejected">❌ Rejected</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleApproveVerification(req);
                                                                    }}
                                                                    disabled={req.status !== 'pending'}
                                                                    className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1"
                                                                >
                                                                    <CheckCircleIcon className="w-3 h-3" />
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const reason = window.prompt('Enter rejection reason (optional):');
                                                                        if (reason !== null) handleRejectVerification(req, reason || 'Invalid registration number');
                                                                    }}
                                                                    disabled={req.status !== 'pending'}
                                                                    className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1"
                                                                >
                                                                    <XMarkIcon className="w-3 h-3" />
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {verificationRequests.length === 0 && (
                                                    <tr>
                                                        <td colSpan={7} className={`px-4 py-8 text-center ${tok('textMuted', darkMode)}`}>
                                                            No verification requests found.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Detail Panel */}
                                    {showVerificationPanel && (
                                        <div className="col-span-1">
                                            {selectedVerification ? (
                                                <VerificationPanel
                                                    verification={selectedVerification}
                                                    onClose={() => setSelectedVerification(null)}
                                                    onApprove={handleApproveVerification}
                                                    onReject={handleRejectVerification}
                                                    session={session}
                                                />
                                            ) : (
                                                <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-8 h-full flex items-center justify-center`}>
                                                    <div className="text-center">
                                                        <UserCircleIcon className={`w-16 h-16 mx-auto mb-3 ${tok('textMuted', darkMode)}`} />
                                                        <p className={`${tok('textSecondary', darkMode)} text-sm`}>
                                                            Select a verification request to view details
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ══ AUDIT LOGS ═════════════════════════════════════════ */}
                        {activeNav === 'Audit Logs' && (
                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl overflow-hidden`}>
                                <div className={`p-4 border-b ${tok('divider', darkMode)} flex items-center gap-2`}>
                                    <ClipboardDocumentListIcon className="w-5 h-5 text-indigo-400" />
                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold`}>System Audit Log</h3>
                                    <span className={`ml-auto text-xs ${tok('textMuted', darkMode)}`}>Last {auditLogs.length} actions</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className={`${tok('deepBg', darkMode)} ${tok('textSecondary', darkMode)} text-xs uppercase sticky top-0`}>
                                            <tr>
                                                <th className="p-4">Admin</th>
                                                <th className="p-4">Action</th>
                                                <th className="p-4">Target ID</th>
                                                <th className="p-4">Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${tok('dividerInner', darkMode)} text-sm`}>
                                            {auditLogs.map(log => (
                                                <tr key={log.id} className={`${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-50'} transition-colors`}>
                                                    <td className="p-4">
                                                        <p className={`${tok('textPrimary', darkMode)} text-xs font-medium`}>{log.adminEmail || log.adminId || '-'}</p>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="px-2 py-1 bg-indigo-500/10 text-indigo-300 rounded-lg text-xs font-medium border border-indigo-500/20">
                                                            {log.action || '-'}
                                                        </span>
                                                    </td>
                                                    <td className={`p-4 ${tok('textMuted', darkMode)} font-mono text-[11px]`}>{log.targetId?.slice(-12) || '-'}</td>
                                                    <td className={`p-4 ${tok('textMuted', darkMode)} text-[11px]`}>
                                                        {log.timestamp?.seconds
                                                            ? new Date(log.timestamp.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                                            : 'Just now'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {auditLogs.length === 0 && (
                                                <tr><td colSpan="4" className={`p-8 text-center ${tok('textMuted', darkMode)} text-sm`}>
                                                    No audit log entries yet. Actions will appear here automatically.
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ══ GLOBAL MAP ════════════════════════════════════════ */}
                        {activeNav === 'Global Map' && (
                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5 h-[calc(100vh-180px)] flex flex-col`}>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold`}>Campus Incident Map</h3>
                                    <div className="flex gap-3 text-xs">
                                        <span className={`flex items-center gap-1.5 ${tok('textSecondary', darkMode)}`}><span className="w-2.5 h-2.5 rounded-full bg-red-500" />Medical ({allReports.filter(r => ['Medical', 'Injury', 'Illness', 'SOS'].includes(r.type)).length})</span>
                                        <span className={`flex items-center gap-1.5 ${tok('textSecondary', darkMode)}`}><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Security ({allReports.filter(r => r.type === 'Security' || r.type === 'Theft' || r.type === 'Assault').length})</span>
                                        <span className={`flex items-center gap-1.5 ${tok('textSecondary', darkMode)}`}><span className="w-2.5 h-2.5 rounded-full bg-orange-500" />Other</span>
                                    </div>
                                </div>
                                <div className={`flex-1 ${tok('deepBg', darkMode)} rounded-xl relative overflow-hidden`}>
                                    <div className="absolute inset-0 opacity-5" style={{
                                        backgroundImage: 'linear-gradient(#6366f1 1px,transparent 1px),linear-gradient(90deg,#6366f1 1px,transparent 1px)',
                                        backgroundSize: '50px 50px'
                                    }} />
                                    {allReports.filter(r => r.status !== 'resolved').map((r, i) => (
                                        <div key={r.id}
                                            onClick={() => setSelectedIncident(r)}
                                            title={`${r.type}: ${resolveReportLocation(r)}`}
                                            className={`absolute group cursor-pointer`}
                                            style={{ top: `${10 + ((i * 37) % 80)}%`, left: `${8 + ((i * 61) % 84)}%` }}>
                                            <div className={`w-4 h-4 rounded-full border-2 border-white/30 shadow-xl ${markerColor(r.type)} ${r.priority === 'critical' ? 'animate-ping' : 'animate-pulse'}`} />
                                            <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block border rounded-lg px-2 py-1 text-[10px] whitespace-nowrap shadow-xl z-10 ${darkMode ? 'bg-[#141728] border-[#252A41] text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
                                                {r.type} · {resolveReportLocation(r)}
                                            </div>
                                        </div>
                                    ))}
                                    <p className={`absolute bottom-2 right-2 text-[10px] ${tok('textMuted', darkMode)}`}>Live Incident Map · {allReports.filter(r => r.status !== 'resolved').length} active</p>
                                </div>
                            </div>
                        )}

                        {/* ══ SETTINGS PLACEHOLDER ══════════════════════════════ */}
                        {activeNav === 'Settings' && (
                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-10 text-center`}>
                                <CpuChipIcon className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                                <p className={`${tok('textPrimary', darkMode)} font-bold text-lg`}>System Settings</p>
                                <p className={`${tok('textMuted', darkMode)} text-sm mt-1`}>Configuration options will be available here.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Notification System */}
                <NotificationSystem
                    notifications={notifications}
                    onDismiss={dismissNotification}
                    onNotificationClick={n => {
                        if (n.type === 'verification' && n.report) {
                            // Navigate to Verifications tab and show the verification details
                            setActiveNav('Verifications');
                            setSelectedVerification(n.report);
                            setShowVerificationPanel(true);
                            dismissNotification(n.id);
                        } else if (n.report) {
                            // Handle other report types (incidents)
                            setSelectedIncident(n.report);
                            setActiveNav('Overview');
                            dismissNotification(n.id);
                        }
                    }}
                />
            </div>
        </ThemeContext.Provider>
    );
};

export default SuperAdminDashboard;
