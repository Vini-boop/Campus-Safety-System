import React, { useState, useEffect, useRef, useMemo, createContext, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ”€”€”€ Theme Context ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const ThemeContext = createContext({ dark: false });
const useTheme = () => useContext(ThemeContext);

// Theme token maps "” dark / light
const T = {
    // Page backgrounds
    pageBg: { dark: 'bg-[#0A0E27]', light: 'bg-gray-100' },
    sidebarBg: { dark: 'bg-[#0D1130]', light: 'bg-white' },
    sidebarBorder: { dark: 'border-[#1e2347]', light: 'border-gray-200' },
    cardBg: { dark: 'bg-[#141728]', light: 'bg-white' },
    cardBorder: { dark: 'border-[#252A41]', light: 'border-gray-200' },
    innerBg: { dark: 'bg-[#1e2347]', light: 'bg-gray-50' },
    deepBg: { dark: 'bg-[#0D1130]', light: 'bg-gray-100' },
    headerBg: { dark: 'bg-[#0D1130]/80', light: 'bg-white/90' },
    // Text
    textPrimary: { dark: 'text-white', light: 'text-gray-900' },
    textSecondary: { dark: 'text-gray-400', light: 'text-gray-500' },
    textMuted: { dark: 'text-gray-500', light: 'text-gray-400' },
    textFaint: { dark: 'text-gray-600', light: 'text-gray-300' },
    // Nav
    navActive: { dark: 'bg-red-600/20 text-red-400 border border-red-500/30', light: 'bg-red-50 text-red-600 border border-red-200' },
    navHover: { dark: 'hover:bg-[#1e2347] text-gray-400 hover:text-white', light: 'hover:bg-gray-100 text-gray-500 hover:text-gray-900' },
    // Input
    inputBg: { dark: 'bg-[#0D1130] border-[#252A41] text-white placeholder-gray-600', light: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' },
    // Divider
    divider: { dark: 'border-[#252A41]', light: 'border-gray-200' },
    // Hover rows
    rowHover: { dark: 'hover:bg-[#1e2347]', light: 'hover:bg-gray-50' },
    rowSelected: { dark: 'bg-red-900/20', light: 'bg-red-50' },
    rowPending: { dark: 'bg-red-950/10', light: 'bg-red-50/60' },
    tableHead: { dark: 'bg-[#0D1130] text-gray-400', light: 'bg-gray-50 text-gray-500' },
    // Popover
    popoverBg: { dark: 'bg-[#141728] border-[#252A41]', light: 'bg-white border-gray-200' },
};

// Helper: pick dark or light class
const t = (token, dark) => T[token]?.[dark ? 'dark' : 'light'] ?? '';
import {
    DocumentTextIcon, ExclamationCircleIcon, TruckIcon,
    ClockIcon, MagnifyingGlassIcon, UserCircleIcon,
    MapPinIcon, HeartIcon, PhoneIcon, CheckCircleIcon,
    ArrowPathIcon, ArrowLeftOnRectangleIcon, ChatBubbleLeftRightIcon,
    ChartBarIcon, ShieldExclamationIcon, ExclamationTriangleIcon,
    BellAlertIcon, UserPlusIcon, MegaphoneIcon,
    ChevronDownIcon, SunIcon, MoonIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellSolid, ChatBubbleLeftIcon } from '@heroicons/react/24/solid';
import {
    collection, query, orderBy, onSnapshot,
    doc, updateDoc, where, serverTimestamp, getDocs
} from 'firebase/firestore';
import { db } from '../services/firebase';
import NotificationSystem, { useNotifications } from '../components/NotificationSystem';
import notificationService from '../services/notificationService';
import AmbulanceMapPanel from '../components/AmbulanceMapPanel';
import MedicalChatPanel from '../components/MedicalChatPanel';
import BroadcastPanel from '../components/BroadcastPanel';
import RiskDashboardPanel from '../components/RiskDashboardPanel';
import MedicalEmergenciesPanel from '../components/MedicalEmergenciesPanel';
import MapModal from '../components/MapModal';
import { calculateAverageResponseTime } from '../services/analyticsService';
import { listenToAmbulances } from '../services/ambulanceService';
import { listenToHealthAlerts, detectOutbreaks, groupByDay, dispatchAmbulance } from '../services/riskService';
import { listenToMedicalEmergencies, getLocationName } from '../services/medicalEmergencyService';

import { clearSession, getSession } from '../services/authService';

// ”€”€”€ Stat Card ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const StatCard = ({ title, value, subtitle, badge, badgeColor, icon: Icon, iconBg, pulse }) => {
    const { dark } = useTheme();
    let finalBadgeColor = badgeColor;
    if (!dark && badgeColor) {
        if (badgeColor.includes('text-red-400')) finalBadgeColor = 'bg-red-50 text-red-700';
        else if (badgeColor.includes('text-green-400')) finalBadgeColor = 'bg-green-50 text-green-700';
        else if (badgeColor.includes('text-orange-400')) finalBadgeColor = 'bg-orange-50 text-orange-700';
    }
    return (
        <div className={`${t('cardBg', dark)} border ${t('cardBorder', dark)} rounded-2xl p-5 flex flex-col gap-3 hover:border-opacity-80 transition-colors`}>
            <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
                    <Icon className={`w-5 h-5 text-white ${pulse ? 'animate-pulse' : ''}`} />
                </div>
                {badge && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${finalBadgeColor}`}>{badge}</span>}
            </div>
            <div>
                <p className={`${t('textSecondary', dark)} text-sm`}>{title}</p>
                <p className={`${t('textPrimary', dark)} text-3xl font-bold mt-1`}>{value}</p>
                {subtitle && <p className={`${t('textMuted', dark)} text-xs mt-1`}>{subtitle}</p>}
            </div>
        </div>
    );
};

// ”€”€”€ Status Badge ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const StatusBadge = ({ status }) => {
    const { dark } = useTheme();
    const map = {
        pending: dark ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' : 'bg-gray-100 text-gray-700 border border-gray-200',
        reviewed: dark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200',
        responding: dark ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border border-yellow-200',
        dispatched: dark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200',
        ambulance_dispatched: dark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200',
        escalated: dark ? 'bg-red-600/20 text-red-400 border border-red-600/30' : 'bg-red-50 text-red-700 border border-red-200',
        resolved: dark ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200',
    };
    const key = status?.toLowerCase() || 'pending';
    return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[key] || map.pending}`}>
            {status ? status.replace(/_/g, ' ') : 'Pending'}
        </span>
    );
};

// ”€”€”€ Priority Badge ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const PriorityBadge = ({ priority }) => {
    const { dark } = useTheme();
    const map = {
        critical: dark ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200',
        urgent: dark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200',
        medium: dark ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border border-yellow-200',
        low: dark ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200',
    };
    const key = priority?.toLowerCase() || 'low';
    return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[key] || map.low}`}>
            {priority || 'Normal'}
        </span>
    );
};

// ”€”€”€ Type Badge ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const TypeBadge = ({ type }) => {
    const { dark } = useTheme();
    const map = {
        medical: dark ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200',
        injury: dark ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200',
        illness: dark ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200',
        sos: dark ? 'bg-red-600/20 text-red-500 border-red-600/30' : 'bg-red-100 text-red-700 border border-red-200',
    };
    const key = type?.toLowerCase() || '';
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${map[key] || (dark ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' : 'bg-gray-100 text-gray-700 border border-gray-200')}`}>
            {type || 'General'}
        </span>
    );
};

// ”€”€”€ Dispatch Stepper ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const DISPATCH_STEPS = [
    { key: 'pending', label: 'Requested', icon: '📋' },
    { key: 'reviewed', label: 'Triage', icon: '🩺' },
    { key: 'ambulance_dispatched', label: 'Dispatched', icon: '🚑' },
    { key: 'resolved', label: 'Arrived', icon: '✅' },
];
const STEP_ORDER = ['pending', 'reviewed', 'responding', 'ambulance_dispatched', 'dispatched', 'resolved'];
const getStepIndex = (status) => {
    const idx = STEP_ORDER.indexOf(status);
    // map responding/dispatched †’ ambulance_dispatched step
    if (status === 'responding') return 1;
    if (status === 'dispatched') return 2;
    return idx === -1 ? 0 : idx;
};

const DispatchStepper = ({ status }) => {
    const { dark } = useTheme();
    const current = getStepIndex(status);
    return (
        <div className="flex items-center gap-1 w-full">
            {DISPATCH_STEPS.map((step, i) => {
                const done = i < current;
                const active = i === current || (status === 'responding' && i === 1) || ((status === 'dispatched' || status === 'ambulance_dispatched') && i === 2);
                return (
                    <div key={step.key} className="flex-1 flex flex-col items-center gap-1 relative">
                        {i > 0 && (
                            <div className={`absolute left-0 top-3 h-0.5 w-1/2 -translate-x-full ${done || active ? 'bg-blue-500' : dark ? 'bg-[#252A41]' : 'bg-gray-200'}`} />
                        )}
                        {i < DISPATCH_STEPS.length - 1 && (
                            <div className={`absolute right-0 top-3 h-0.5 w-1/2 translate-x-full ${done ? 'bg-blue-500' : dark ? 'bg-[#252A41]' : 'bg-gray-200'}`} />
                        )}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] z-10 border-2 transition-all ${done ? 'bg-blue-600 border-blue-500 text-white' :
                            active ? 'bg-blue-600/30 border-blue-500 text-blue-300 animate-pulse' :
                                dark ? 'bg-[#0D1130] border-[#252A41] text-gray-600' : 'bg-gray-100 border-gray-300 text-gray-400'
                            }`}>
                            {step.icon}
                        </div>
                        <p className={`text-[9px] font-bold text-center leading-tight ${done ? 'text-blue-400' : active ? (dark ? 'text-white' : 'text-gray-900') : (dark ? 'text-gray-600' : 'text-gray-400')
                            }`}>{step.label}</p>
                    </div>
                );
            })}
        </div>
    );
};

const PatientPanel = ({ patient, onClose, onStatusUpdate, onOpenMap, onDispatch, onAssignDoctor, doctors, onOpenChat }) => {
    const { dark } = useTheme();
    const [updating, setUpdating] = useState(false);
    const [dispatching, setDispatching] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [selectedDocId, setSelectedDocId] = useState('');
    const [eta, setEta] = useState('10"“15 min');
    if (!patient) return null;

    const isCritical = patient.priority === 'critical' || patient.type === 'SOS';
    const isDispatched = ['ambulance_dispatched', 'dispatched', 'resolved'].includes(patient.status);

    const statusActions = [
        { label: 'Mark Triage', status: 'reviewed', color: 'bg-blue-600 hover:bg-blue-700' },
        { label: 'Mark Responding', status: 'responding', color: 'bg-yellow-600 hover:bg-yellow-700' },
        { label: 'Mark Resolved', status: 'resolved', color: 'bg-green-600 hover:bg-green-700' },
    ].filter(a => a.status !== patient.status && !(a.status === 'responding' && isDispatched));

    const handleStatus = async (s) => {
        setUpdating(true);
        try { await onStatusUpdate(patient.id, s); }
        finally { setUpdating(false); }
    };

    const handleDispatch = async () => {
        setDispatching(true);
        try { await onDispatch(patient.id, eta); }
        finally { setDispatching(false); }
    };

    return (
        <div className={`${t('cardBg', dark)} border rounded-2xl p-5 h-full overflow-y-auto flex flex-col gap-4 ${isCritical ? 'border-red-500/40' : t('cardBorder', dark)}`}>
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg ${isCritical ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-pink-500 to-red-600'}`}>
                        {(patient.studentName || patient.reporterName)?.split(' ').map(n => n[0]).join('') || 'P'}
                    </div>
                    <div className="flex-1">
                        <p className={`${t('textPrimary', dark)} font-bold text-base`}>{patient.studentName || patient.reporterName || 'Unknown'}</p>
                        <p className={`${t('textSecondary', dark)} text-xs`}>{patient.location || '"”'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onOpenChat} className={`p-2 rounded-lg transition-colors ${dark ? 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 text-blue-600'}`}>
                        <ChatBubbleLeftIcon className="w-4 h-4" />
                    </button>
                    {(patient.latitude || patient.locationCoords || patient.coordinates?.latitude) && (
                        <button onClick={() => onOpenMap(patient)} className={`p-2 rounded-lg transition-colors ${dark ? 'bg-green-600/20 hover:bg-green-600/40 text-green-400' : 'bg-green-50 hover:bg-green-100 text-green-600'}`}>
                            <MapPinIcon className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={onClose} className={`p-2 ${t('textMuted', dark)} hover:text-red-400 transition-colors`}><span className="text-lg leading-none">✖</span></button>
                </div>
            </div>

            {isCritical && (
                <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${dark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'}`}>
                    <ExclamationTriangleIcon className={`w-4 h-4 shrink-0 ${dark ? 'text-red-400' : 'text-red-600'}`} />
                    <p className={`text-xs font-bold ${dark ? 'text-red-300' : 'text-red-700'}`}>CRITICAL "” Immediate attention required</p>
                </div>
            )}

            {/* Dispatch Stepper */}
            <div className={`${t('innerBg', dark)} rounded-xl p-3`}>
                <p className={`${t('textSecondary', dark)} text-xs mb-3`}>Response Progress</p>
                <DispatchStepper status={patient.status} />
                {patient.estimatedArrival && (
                    <p className="text-center text-blue-400 text-xs mt-2 font-bold">🚑 ETA: {patient.estimatedArrival}</p>
                )}
                {patient.ambulanceDispatchedAt && (
                    <p className={`text-center ${t('textMuted', dark)} text-[10px] mt-1`}>
                        Dispatched {new Date(patient.ambulanceDispatchedAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            {/* Description */}
            <div className={`${t('innerBg', dark)} rounded-xl p-3`}>
                <p className={`${t('textSecondary', dark)} text-xs mb-1`}>Symptoms / Description</p>
                <p className={`${t('textPrimary', dark)} text-sm`}>{patient.medicalCondition || patient.description || '-'}</p>
            </div>

            {/* Grid info */}
            <div className="grid grid-cols-2 gap-2">
                <div className={`${t('innerBg', dark)} rounded-xl p-3`}>
                    <p className={`${t('textSecondary', dark)} text-xs mb-1.5`}>Priority</p>
                    <PriorityBadge priority={patient.priority} />
                </div>
                <div className={`${t('innerBg', dark)} rounded-xl p-3`}>
                    <p className={`${t('textSecondary', dark)} text-xs mb-1.5`}>Status</p>
                    <StatusBadge status={patient.status} />
                </div>
                <div className={`${t('innerBg', dark)} rounded-xl p-3 col-span-2`}>
                    <p className={`${t('textSecondary', dark)} text-xs mb-1`}>Reported</p>
                    <p className={`${t('textPrimary', dark)} text-sm font-bold`}>
                        {patient.createdAt
                            ? new Date(patient.createdAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Just now'}
                    </p>
                </div>
            </div>

            {/* Doctor Assignment */}
            <div className={`${t('innerBg', dark)} rounded-xl p-3 border ${dark ? 'border-indigo-500/20' : 'border-indigo-200'}`}>
                <div className="flex items-center justify-between mb-2">
                    <p className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${dark ? 'text-indigo-300' : 'text-indigo-600'}`}><UserPlusIcon className="w-4 h-4" /> Assigned Doctor</p>
                    {patient.assignedDoctorName && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${dark ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-700'}`}>Assigned</span>}
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedDocId}
                        onChange={e => setSelectedDocId(e.target.value)}
                        className={`flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 ${dark ? 'bg-[#0D1130] border-[#252A41] text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                        <option value="">{patient.assignedDoctorName || 'Select Doctor...'}</option>
                        {doctors?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <button
                        onClick={async () => {
                            if (!selectedDocId) return;
                            setAssigning(true);
                            const docData = doctors.find(d => d.id === selectedDocId);
                            await onAssignDoctor(patient.id, selectedDocId, docData?.name);
                            setAssigning(false);
                            setSelectedDocId('');
                        }}
                        disabled={assigning || !selectedDocId}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                        {assigning ? '...' : 'Assign'}
                    </button>
                </div>
            </div>

            {/* Dispatch Ambulance */}
            {!isDispatched && (
                <div className={`border rounded-xl p-3 flex flex-col gap-2 ${dark ? 'border-orange-500/30 bg-orange-500/5' : 'border-orange-200 bg-orange-50'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wide ${dark ? 'text-orange-400' : 'text-orange-700'}`}>Dispatch Ambulance</p>
                    <div className="flex items-center gap-2">
                        <ClockIcon className="w-4 h-4 text-gray-500 shrink-0" />
                        <input
                            type="text"
                            value={eta}
                            onChange={e => setEta(e.target.value)}
                            placeholder="Estimated arrival..."
                            className={`flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50 ${dark ? 'bg-[#0D1130] border-[#252A41] text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                        />
                    </div>
                    <button
                        onClick={handleDispatch}
                        disabled={dispatching}
                        className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        {dispatching
                            ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Dispatching...</>
                            : <><TruckIcon className="w-4 h-4" /> Dispatch Ambulance 🚑</>}
                    </button>
                </div>
            )}

            {/* Status actions */}
            {statusActions.length > 0 && (
                <div className={`border-t ${t('divider', dark)} pt-3`}>
                    <p className={`${t('textMuted', dark)} text-xs font-semibold uppercase tracking-wide mb-2`}>Update Status</p>
                    <div className="flex flex-col gap-2">
                        {statusActions.map(a => (
                            <button
                                key={a.status}
                                onClick={() => handleStatus(a.status)}
                                disabled={updating}
                                className={`w-full py-2 ${a.color} text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}
                            >
                                {updating ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : a.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};



// ”€”€”€ Nav item list ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€

const HEALTH_ADVISORY_STATIC = {
    title: 'Typhoid Alert',
    desc: 'Multiple cases detected this week. Avoid street food and drink clean water.',
};

// ”€”€”€ Main Dashboard Component ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
const MedicalDashboard = () => {
    const navigate = useNavigate();
    const { notifications, addNotification, dismissNotification, clearAll } = useNotifications();

    // UI State
    const [darkMode, setDarkMode] = useState(false);
    const [activeNav, setActiveNav] = useState('Dashboard');
    const [filterTab, setFilterTab] = useState('All');
    const [search, setSearch] = useState('');
    const [rightPanel, setRightPanel] = useState('incidents');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [mapTarget, setMapTarget] = useState(null);
    const [showBellPopover, setShowBellPopover] = useState(false);
    const [geoMapExpanded, setGeoMapExpanded] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const geoMapRef = useRef(null);

    // Profile Menu Handlers
    const handleToggleProfileMenu = useCallback(() => {
        setIsProfileMenuOpen(prev => !prev);
    }, []);

    const handleCloseProfileMenu = useCallback(() => {
        setIsProfileMenuOpen(false);
    }, []);

    const handleSettingsClick = useCallback(() => {
        setIsProfileMenuOpen(false);
        setActiveNav('Settings');
    }, []);

    const handleLogout = useCallback(() => {
        clearSession();
        navigate('/login');
    }, [navigate]);

    // Data State
    const [reports, setReports] = useState([]);
    const [medicalEmergencies, setMedicalEmergencies] = useState([]);
    const [ambulances, setAmbulances] = useState([]);
    const [healthAlerts, setHealthAlerts] = useState([]);
    const [outbreaks, setOutbreaks] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({ newReports: 0, urgentCases: 0, ambulancesAvailable: 0, avgResponseTime: '' });
    const [session, setSession] = useState(null);

    const notifiedIds = useRef(new Set());
    const isFirstLoad = useRef(true);
    const alertedKeys = useRef(new Set());

    // -- Data loaders ---------------------------------------------------------
    useEffect(() => {
        // Session
        setSession(getSession());

        // Request browser notification permission
        if (notificationService.getPermission() === 'default') {
            notificationService.requestPermission().then(permission => {
                console.log('📢 Notification permission:', permission);
            });
        }

        // ambulance_requests (primary -- new mobile flow)
        const qAmb = query(collection(db, 'ambulance_requests'), orderBy('createdAt', 'desc'));
        const unsubAmb = onSnapshot(qAmb, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, _src: 'ambulance_requests', ...d.data() }));

            // Notify for NEW pending requests using docChanges (only 'added' type after first load)
            if (!isFirstLoad.current) {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const e = { id: change.doc.id, _src: 'ambulance_requests', ...change.doc.data() };
                        console.log('🆕 New ambulance request detected:', {
                            id: e.id,
                            status: e.status,
                            studentName: e.studentName,
                            alreadyNotified: notifiedIds.current.has(e.id)
                        });

                        if (e.status === 'pending' && !notifiedIds.current.has(e.id)) {
                            const createdAtMs = e.createdAt?.seconds ? e.createdAt.seconds * 1000 : Date.now();
                            console.log('🔔 Triggering ambulance notification for:', e.id);

                            addNotification({
                                type: 'ambulance',
                                title: '🚑 AMBULANCE REQUEST',
                                message: `${e.studentName || 'Student'} - ${e.placeName || e.hostelName || 'Unknown location'}`,
                                report: e,
                                docId: e.id,
                                createdAtMs,
                                showBrowserNotification: true,
                            });

                            console.log('✅ Ambulance notification added to queue');
                            notifiedIds.current.add(e.id);
                        }
                    }
                });
            } else {
                console.log('⏭️ Skipping notifications on first load (loading existing requests)');
            }

            setMedicalEmergencies(prev => {
                // Remove medical_reports entries that match ambulance_requests by studentId + timestamp
                const mrOnly = prev.filter(e => {
                    if (e._src !== 'medical_reports') return false;
                    // Check if this medical_report matches any ambulance_request
                    const isDuplicate = items.some(a =>
                        a.studentId === e.studentId &&
                        Math.abs((a.createdAt?.seconds ?? 0) - (e.createdAt?.seconds ?? 0)) < 5 // Within 5 seconds
                    );
                    return !isDuplicate;
                });
                const merged = [...items, ...mrOnly].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
                return merged;
            });

            // Mark first load as complete
            if (isFirstLoad.current) {
                isFirstLoad.current = false;
                console.log('📋 Initial ambulance requests loaded:', items.length);
            }

            setIsLoading(false);
        }, (err) => { console.warn('ambulance_requests listener:', err.message); setIsLoading(false); });

        // medical_reports (secondary -- legacy / doctor chat reports)
        const qMed = query(collection(db, 'medical_reports'), orderBy('createdAt', 'desc'));
        const unsubMed = onSnapshot(qMed, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, _src: 'medical_reports', ...d.data() }));
            setMedicalEmergencies(prev => {
                const ambOnly = prev.filter(e => e._src === 'ambulance_requests');
                // Filter out medical_reports that match ambulance_requests by studentId + timestamp
                const mrOnly = items.filter(e => {
                    const isDuplicate = ambOnly.some(a =>
                        a.studentId === e.studentId &&
                        Math.abs((a.createdAt?.seconds ?? 0) - (e.createdAt?.seconds ?? 0)) < 5 // Within 5 seconds
                    );
                    return !isDuplicate;
                });
                return [...ambOnly, ...mrOnly].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
            });
        }, (err) => console.warn('medical_reports listener:', err.message));

        // Ambulances fleet
        const unsubFleet = listenToAmbulances((ambs) => {
            setAmbulances(ambs);
            setStats(prev => ({ ...prev, ambulancesAvailable: ambs.filter(a => a.status === 'available').length }));
        });

        // Health alerts
        const unsubHealth = listenToHealthAlerts((alerts) => setHealthAlerts(alerts));

        // Doctors (users with role=doctor)
        const qDocs = query(collection(db, 'users'), where('role', '==', 'doctor'));
        const unsubDocs = onSnapshot(qDocs, (snap) => {
            setDoctors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => { });

    }, []);


    // ”€”€ Nav sidebar action handler ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const handleNavClick = (label) => {
        setActiveNav(label);
        setSelectedPatient(null);
    };

    // ”€”€ Status Update "” writes to the correct collection ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const handleStatusUpdate = async (reportId, newStatus) => {
        // Find the report to get its source collection
        const report = medicalEmergencies.find(e => e.id === reportId);
        const col = report?._src || 'ambulance_requests';
        const updateData = { status: newStatus, updatedAt: serverTimestamp() };
        if (newStatus === 'resolved') updateData.resolvedAt = serverTimestamp();
        await updateDoc(doc(db, col, reportId), updateData);
        setSelectedPatient(prev => prev?.id === reportId ? { ...prev, status: newStatus } : prev);
        setMedicalEmergencies(prev => prev.map(e => e.id === reportId ? { ...e, status: newStatus } : e));
    };

    // ”€”€ Ambulance Dispatch (from PatientPanel) ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const handleDispatch = async (reportId, eta) => {
        await dispatchAmbulance(reportId, null, eta);
        setSelectedPatient(prev =>
            prev?.id === reportId
                ? { ...prev, status: 'ambulance_dispatched', estimatedArrival: eta }
                : prev
        );
        addNotification({ type: 'medical', title: '🚑 Ambulance Dispatched', message: `ETA ${eta}` });
    };

    // ”€”€ Doctor Assignment ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const handleAssignDoctor = async (reportId, doctorId, doctorName) => {
        const report = medicalEmergencies.find(e => e.id === reportId);
        const col = report?._src || 'ambulance_requests';
        await updateDoc(doc(db, col, reportId), {
            assignedDoctorId: doctorId, assignedDoctorName: doctorName, updatedAt: serverTimestamp()
        });
        setSelectedPatient(prev => prev?.id === reportId ? { ...prev, assignedDoctorId: doctorId, assignedDoctorName: doctorName } : prev);
        setMedicalEmergencies(prev => prev.map(e => e.id === reportId ? { ...e, assignedDoctorId: doctorId, assignedDoctorName: doctorName } : e));
        addNotification({ type: 'info', title: '👨‍⚕️ Doctor Assigned', message: `Dr. ${doctorName || 'Unknown'} assigned.` });
    };

    // ”€”€ Emergency Acknowledge ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const handleEmergencyAcknowledge = async (emergency) => {
        try {
            const col = emergency._src || 'ambulance_requests';
            await updateDoc(doc(db, col, emergency.id), {
                status: 'acknowledged',
                acknowledgedAt: serverTimestamp(),
            });
            setMedicalEmergencies(prev => prev.map(e => e.id === emergency.id ? { ...e, status: 'acknowledged' } : e));
            addNotification({ type: 'info', title: '✅ Acknowledged', message: `Request from ${emergency.studentName || 'student'} acknowledged.` });
        } catch (e) { console.error('Acknowledge error:', e); }
    };

    // ”€”€ Emergency Dispatch ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const handleEmergencyDispatch = async (emergency, nearest) => {
        try {
            const col = emergency._src || 'ambulance_requests';
            const eta = nearest ? `~${nearest.etaMinutes} min` : '10"“15 min';
            await updateDoc(doc(db, col, emergency.id), {
                status: 'dispatched',
                dispatchedAt: serverTimestamp(),
                estimatedArrival: eta,
                ...(nearest ? { assignedAmbulanceId: nearest.id, assignedVehicleId: nearest.vehicleId } : {}),
            });
            setMedicalEmergencies(prev => prev.map(e =>
                e.id === emergency.id ? { ...e, status: 'dispatched', estimatedArrival: eta } : e
            ));
            addNotification({
                type: 'medical',
                title: '🚑 Ambulance Dispatched',
                message: `En route to ${emergency.placeName || emergency.hostelName || 'location'} · ETA ${eta}`,
            });
        } catch (e) { console.error('Dispatch error:', e); }
    };


    // ”€”€ Derived ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const filteredReports = useMemo(() => reports.filter(r => {
        const matchTab =
            filterTab === 'All' ? true :
                filterTab === 'Critical' ? r.priority === 'critical' :
                    filterTab === 'Urgent' ? r.priority === 'urgent' :
                        filterTab === 'Pending' ? r.status === 'pending' :
                            filterTab === 'Resolved' ? r.status === 'resolved' : true;

        const matchSearch = !search ||
            r.reporterName?.toLowerCase().includes(search.toLowerCase()) ||
            r.location?.toLowerCase().includes(search.toLowerCase()) ||
            r.description?.toLowerCase().includes(search.toLowerCase());

        return matchTab && matchSearch;
    }), [reports, filterTab, search]);

    const alertBadge = healthAlerts.length + outbreaks.length;
    const emergencyCount = medicalEmergencies.filter(e => e.status === 'pending').length;

    // ”€”€ Nav items with counts ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const NAV = [
        { label: 'Dashboard', icon: DocumentTextIcon, badge: null },
        { label: 'Emergencies', icon: ExclamationCircleIcon, badge: emergencyCount || null },
        { label: 'Ambulances', icon: TruckIcon, badge: ambulances.filter(a => a.status === 'dispatched').length || null },
        { label: 'Doctors', icon: UserCircleIcon, badge: null },
        { label: 'Broadcast', icon: MegaphoneIcon, badge: null },
        { label: 'Risk', icon: ChartBarIcon, badge: alertBadge || null },
        { label: 'Settings', icon: MagnifyingGlassIcon, badge: null },
    ];

    // ”€”€ Render the active section (full-width, no split) ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€
    const renderSection = () => {
        switch (activeNav) {
            case 'Dashboard':
                return (
                    <div className="space-y-6">
                        {/* Stat cards "” driven by medicalEmergencies (ambulance requests) */}
                        <div className="grid grid-cols-4 gap-4">
                            <StatCard
                                title="Total Requests"
                                value={medicalEmergencies.length}
                                subtitle="All ambulance requests"
                                badge={medicalEmergencies.filter(e => e.status === 'pending').length > 0 ? `${medicalEmergencies.filter(e => e.status === 'pending').length} pending` : 'Clear'}
                                badgeColor={medicalEmergencies.filter(e => e.status === 'pending').length > 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}
                                icon={DocumentTextIcon} iconBg="bg-blue-600"
                                pulse={medicalEmergencies.filter(e => e.status === 'pending').length > 0}
                            />
                            <StatCard
                                title="Pending"
                                value={medicalEmergencies.filter(e => e.status === 'pending').length}
                                subtitle="Awaiting response"
                                badge={medicalEmergencies.filter(e => e.status === 'pending').length > 0 ? 'Urgent' : 'None'}
                                badgeColor={medicalEmergencies.filter(e => e.status === 'pending').length > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-green-500/10 text-green-400'}
                                icon={ExclamationCircleIcon} iconBg="bg-red-600"
                                pulse={medicalEmergencies.filter(e => e.status === 'pending').length > 0}
                            />
                            <StatCard
                                title="Ambulances"
                                value={`${stats.ambulancesAvailable}/${ambulances.length}`}
                                subtitle="Fleet available"
                                badge="Live"
                                badgeColor="bg-green-500/10 text-green-400"
                                icon={TruckIcon} iconBg="bg-green-600"
                            />
                            <StatCard
                                title="Resolved"
                                value={medicalEmergencies.filter(e => ['arrived', 'completed', 'resolved'].includes(e.status)).length}
                                subtitle="Completed today"
                                badge="Done"
                                badgeColor="bg-green-500/10 text-green-400"
                                icon={ChartBarIcon} iconBg="bg-purple-600"
                            />
                        </div>

                        {/* Ambulance Requests table "” real-time from Firestore */}
                        <div className={`grid gap-6 ${selectedPatient ? 'grid-cols-3' : 'grid-cols-1'}`}>
                            <div className={`${selectedPatient ? 'col-span-2' : 'col-span-1'} ${t('cardBg', darkMode)} border ${t('cardBorder', darkMode)} rounded-2xl flex flex-col overflow-hidden`} style={{ minHeight: 400 }}>
                                {/* Table header */}
                                <div className={`p-5 border-b ${t('cardBorder', darkMode)} flex items-center justify-between shrink-0`}>
                                    <div className="flex items-center gap-3">
                                        <TruckIcon className="w-5 h-5 text-red-500" />
                                        <h2 className={`${t('textPrimary', darkMode)} font-bold`}>Ambulance Requests</h2>
                                        <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />LIVE
                                        </span>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {['All', 'Pending', 'Dispatched', 'Resolved'].map(t => (
                                            <button key={t} onClick={() => setFilterTab(t)}
                                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${filterTab === t ? 'bg-red-600 text-white' : (darkMode ? 'text-gray-400 hover:text-white hover:bg-[#1e2347]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100')}`}>
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Table body */}
                                <div className="flex-1 overflow-auto">
                                    {medicalEmergencies.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
                                            <TruckIcon className={`w-12 h-12 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                                            <p className={`${t('textSecondary', darkMode)} font-semibold`}>No ambulance requests yet</p>
                                            <p className={`${t('textMuted', darkMode)} text-xs max-w-xs`}>When students submit ambulance requests from the mobile app, they appear here in real-time.</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead className={`${t('tableHead', darkMode)} text-xs uppercase sticky top-0 z-10`}>
                                                <tr>
                                                    <th className="p-4 font-medium">Student</th>
                                                    <th className="p-4 font-medium">Reg No.</th>
                                                    <th className="p-4 font-medium">Phone</th>
                                                    <th className="p-4 font-medium">Location</th>
                                                    <th className="p-4 font-medium">Condition</th>
                                                    <th className="p-4 font-medium">Status</th>
                                                    <th className="p-4 font-medium">Time</th>
                                                </tr>
                                            </thead>
                                            <tbody className={`divide-y ${t('divider', darkMode)} text-sm`}>
                                                {medicalEmergencies
                                                    .filter(e => {
                                                        if (filterTab === 'Pending') return e.status === 'pending';
                                                        if (filterTab === 'Dispatched') return ['dispatched', 'en_route', 'acknowledged'].includes(e.status);
                                                        if (filterTab === 'Resolved') return ['arrived', 'completed', 'resolved'].includes(e.status);
                                                        return true;
                                                    })
                                                    .map(e => {
                                                        // Normalise fields "” same logic as MedicalEmergenciesPanel
                                                        const name = e.studentName || e.name || e.reporter?.name || e.reporterName || 'Unknown';
                                                        const regNo = e.regNo || e.regNumber || e.reporter?.regNumber || null;
                                                        const phone = e.phone || e.reporter?.phone || null;
                                                        const location = e.placeName || e.campusZone || e.locationText || e.location?.address || '"”';
                                                        const hostel = e.hostelName ? `${e.hostelName}${e.roomNumber ? ` Rm ${e.roomNumber}` : ''}` : null;
                                                        const condition = (e.medicalCondition || e.description || '').replace('🚑 AMBULANCE EMERGENCY: ', '');
                                                        const ts = e.createdAt?.toDate ? e.createdAt.toDate() : e.createdAt?.seconds ? new Date(e.createdAt.seconds * 1000) : null;
                                                        const isPending = e.status === 'pending';
                                                        const isSelected = selectedPatient?.id === e.id;

                                                        return (
                                                            <tr key={e.id}
                                                                onClick={() => setSelectedPatient(e)}
                                                                className={`cursor-pointer transition-all border-l-2 ${isSelected ? `${t('rowSelected', darkMode)} border-l-red-500` :
                                                                    isPending ? `border-l-red-600 ${t('rowHover', darkMode)} ${t('rowPending', darkMode)}` :
                                                                        `border-l-transparent ${t('rowHover', darkMode)}`
                                                                    }`}>
                                                                {/* Student */}
                                                                <td className="p-4">
                                                                    <p className={`${t('textPrimary', darkMode)} font-semibold text-sm`}>{name}</p>
                                                                    {e.studentEmail && <p className={`${t('textMuted', darkMode)} text-[10px]`}>{e.studentEmail}</p>}
                                                                </td>
                                                                {/* Reg No */}
                                                                <td className="p-4">
                                                                    {regNo
                                                                        ? <span className={`font-mono text-xs px-2 py-0.5 rounded ${darkMode ? 'text-purple-300 bg-purple-500/10' : 'text-purple-700 bg-purple-50'}`}>{regNo}</span>
                                                                        : <span className="text-gray-400 text-xs">-</span>}
                                                                </td>
                                                                {/* Phone */}
                                                                <td className="p-4">
                                                                    {phone
                                                                        ? <a href={`tel:${phone}`} onClick={ev => ev.stopPropagation()} className={`text-xs ${darkMode ? 'text-green-300 hover:text-green-200' : 'text-green-600 hover:text-green-700'}`}>{phone}</a>
                                                                        : <span className="text-gray-400 text-xs">-</span>}
                                                                </td>
                                                                {/* Location */}
                                                                <td className="p-4">
                                                                    <div className="flex items-center gap-1.5">
                                                                        {(e.latitude || e.coordinates?.latitude || e.locationCoords) ? (
                                                                            <button
                                                                                onClick={() => setMapTarget(e)}
                                                                                className={`flex-shrink-0 p-1 rounded transition-colors ${darkMode ? 'hover:bg-green-600/20 text-green-400' : 'hover:bg-green-50 text-green-600'}`}
                                                                                title="View on map"
                                                                            >
                                                                                <MapPinIcon className="w-4 h-4" />
                                                                            </button>
                                                                        ) : (
                                                                            <MapPinIcon className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                                                                        )}
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className={`${t('textPrimary', darkMode)} text-xs font-medium truncate`}>{location}</p>
                                                                            {hostel && <p className={`${t('textMuted', darkMode)} text-[10px] truncate`}>{hostel}</p>}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                {/* Condition */}
                                                                <td className="p-4 max-w-[160px]">
                                                                    <p className="text-orange-500 text-xs truncate" title={condition}>{condition || '"”'}</p>
                                                                </td>
                                                                {/* Condition */}
                                                                <td className="p-4">
                                                                    {/* Status */}
                                                                </td>
                                                                {/* Time */}
                                                                <td className={`p-4 ${t('textMuted', darkMode)} text-xs whitespace-nowrap`}>
                                                                    {ts ? ts.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '"”'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Detail panel "” slides in when a row is clicked */}
                            {selectedPatient && (
                                <PatientPanel
                                    patient={selectedPatient}
                                    onClose={() => setSelectedPatient(null)}
                                    onStatusUpdate={handleStatusUpdate}
                                    onOpenMap={(r) => setMapTarget(r)}
                                    onDispatch={handleDispatch}
                                    onAssignDoctor={handleAssignDoctor}
                                    doctors={doctors}
                                    onOpenChat={() => setActiveNav('Doctors')}
                                />
                            )}
                        </div>
                    </div>
                );

            case 'Emergencies':
                return (
                    <div className="h-full">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center shrink-0">
                                    <TruckIcon className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Ambulance Requests</h2>
                                    <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Real-time student emergency requests "” {emergencyCount} pending</p>
                                </div>
                            </div>
                        </div>
                        <MedicalEmergenciesPanel
                            emergencies={medicalEmergencies}
                            onAcknowledge={handleEmergencyAcknowledge}
                            onDispatch={handleEmergencyDispatch}
                            ambulances={ambulances}
                            dark={darkMode}
                        />
                    </div>
                );

            case 'Ambulances':
                return (
                    <div className="h-full flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center shrink-0">
                                <TruckIcon className="w-6 h-6 text-green-400" />
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Ambulance Fleet</h2>
                                <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{stats.ambulancesAvailable} available  {ambulances.filter(a => a.status === 'dispatched').length} dispatched</p>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <AmbulanceMapPanel
                                ambulances={ambulances}
                                selectedReportId={null}
                                onDispatchSuccess={(msg) => addNotification({ type: 'medical', title: ' Dispatched', message: msg })}
                                dark={darkMode}
                            />
                        </div>
                    </div>
                );

            case 'Doctors':
                return (
                    <div className="h-full flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0">
                                <ChatBubbleLeftRightIcon className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Doctor Chat</h2>
                                <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Live consultations between students and campus doctors</p>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <MedicalChatPanel session={session} dark={darkMode} />
                        </div>
                    </div>
                );

            case 'Broadcast':
                return (
                    <div className="h-full flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center shrink-0">
                                <MegaphoneIcon className="w-7 h-7 text-orange-400" />
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Broadcast Health Advisory</h2>
                                <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Send health alerts and advisories to all students</p>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                            <BroadcastPanel session={session} outbreaks={outbreaks} dark={darkMode} />
                        </div>
                    </div>
                );

            case 'Risk':
                return (
                    <div className="h-full flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center shrink-0">
                                <ChartBarIcon className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Risk Dashboard</h2>
                                <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{alertBadge} active alert{alertBadge !== 1 ? 's' : ''}  {outbreaks.length} outbreak cluster{outbreaks.length !== 1 ? 's' : ''} detected</p>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                            <RiskDashboardPanel reports={reports} healthAlerts={healthAlerts} outbreaks={outbreaks} dark={darkMode} />
                        </div>
                    </div>
                );

            case 'Settings':
                return (
                    <div className="max-w-xl space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gray-500/20 flex items-center justify-center shrink-0">
                                <MagnifyingGlassIcon className="w-6 h-6 text-gray-400" />
                            </div>
                            <h2 className={`${t('textPrimary', darkMode)} text-2xl font-bold`}>Settings</h2>
                        </div>
                        <div className={`${t('cardBg', darkMode)} border ${t('cardBorder', darkMode)} rounded-2xl p-6 space-y-4`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`${t('textPrimary', darkMode)} font-semibold`}>Notifications</p>
                                    <p className={`${t('textSecondary', darkMode)} text-sm`}>Browser alerts for new reports</p>
                                </div>
                                <div className="w-12 h-6 bg-red-600 rounded-full relative cursor-pointer"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" /></div>
                            </div>
                            <div className={`border-t ${t('divider', darkMode)} pt-4`}>
                                <div className="flex items-center justify-between mb-3">
                                    <p className={`${t('textPrimary', darkMode)} font-semibold`}>Appearance</p>
                                </div>
                                <button onClick={() => setDarkMode(d => !d)}
                                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all ${darkMode ? 'bg-[#1e2347] border-[#252A41] text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}>
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-[#0D1130]">{darkMode ? <MoonIcon className="w-5 h-5 text-indigo-400" /> : <SunIcon className="w-5 h-5 text-orange-500" />}</span>
                                    <div className="text-left">
                                        <p className="font-semibold text-sm">{darkMode ? 'Dark Mode' : 'Light Mode'}</p>
                                        <p className={`text-xs ${t('textSecondary', darkMode)}`}>Click to switch to {darkMode ? 'light' : 'dark'} mode</p>
                                    </div>
                                    <div className={`ml-auto w-10 h-5 rounded-full relative transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${darkMode ? 'right-0.5' : 'left-0.5'}`} />
                                    </div>
                                </button>
                            </div>
                            <div className={`border-t ${t('divider', darkMode)} pt-4`}>
                                <p className={`${t('textPrimary', darkMode)} font-semibold mb-3`}>Account</p>
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-red-600 flex items-center justify-center text-white text-xl font-bold">{session?.name?.[0] || 'M'}</div>
                                    <div>
                                        <p className={`${t('textPrimary', darkMode)} font-medium`}>{session?.name || 'Medical Admin'}</p>
                                        <p className={`${t('textMuted', darkMode)} text-sm`}>{session?.email || 'medical@campus.edu'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <ThemeContext.Provider value={{ dark: darkMode }}>
            <div className={`flex h-screen ${t('pageBg', darkMode)} ${darkMode ? 'text-white' : 'text-gray-900'} font-sans overflow-hidden`}>

                {/* •••• SIDEBAR •••••••••••••••••••••••••••••••••••••••••••••••••••• */}
                <aside className={`w-56 ${t('sidebarBg', darkMode)} border-r ${t('sidebarBorder', darkMode)} flex flex-col shrink-0`}>
                    {/* Logo */}
                    <div className={`p-6 flex flex-col gap-1 border-b ${t('sidebarBorder', darkMode)}`}>
                        <h1 className={`text-xl font-bold tracking-tight ${t('textPrimary', darkMode)}`}>Campus Safety</h1>
                        {/* Medical cross badge */}
                        <div className="mt-3 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/40 shrink-0">
                                <div className="relative w-4 h-4 flex items-center justify-center">
                                    <div className="absolute w-1.5 h-4 bg-white rounded-sm" />
                                    <div className="absolute w-4 h-1.5 bg-white rounded-sm" />
                                </div>
                            </div>
                            <span className={`text-sm font-bold tracking-wide ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Medical Center</span>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                        {NAV.map(item => (
                            <button
                                key={item.label}
                                onClick={() => handleNavClick(item.label)}
                                className={`w-full flex items-center justify-between gap-4 px-4 py-3 rounded-xl transition-all ${activeNav === item.label
                                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                                    : darkMode ? 'text-gray-500 hover:bg-[#1e2347] hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <item.icon className="w-5 h-5 stroke-2" />
                                    <span className="text-[15px] font-semibold">{item.label}</span>
                                </div>
                                {item.badge > 0 && (
                                    <span className="px-2 py-1 bg-white text-red-600 text-[10px] font-bold rounded-lg animate-pulse">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>

                    {/* Emergency line */}
                    <div className={`p-4 border-t ${t('sidebarBorder', darkMode)} space-y-3`}>
                        {healthAlerts.length > 0 && (
                            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl">
                                <ShieldExclamationIcon className="w-4 h-4 text-red-400 shrink-0" />
                                <p className="text-red-300 text-xs font-bold">{healthAlerts.length} active alert{healthAlerts.length !== 1 ? 's' : ''}</p>
                            </div>
                        )}
                        <div className={`${t('cardBg', darkMode)} rounded-xl p-3 border ${t('cardBorder', darkMode)} flex items-center gap-3`}>
                            <div className="p-2 bg-red-500/20 rounded-lg"><PhoneIcon className="w-4 h-4 text-red-400" /></div>
                            <div>
                                <p className={`text-xs ${t('textSecondary', darkMode)}`}>Emergency Line</p>
                                <p className={`text-sm font-bold ${t('textPrimary', darkMode)}`}>911 / Ext 102</p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* •••• MAIN CONTENT •••••••••••••••••••••••••••••••••••••••••••••• */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Header */}
                    <header className={`${t('headerBg', darkMode)} backdrop-blur border-b ${t('sidebarBorder', darkMode)} px-6 py-3 flex items-center justify-between shrink-0 z-20`}>
                        <div className="flex items-center gap-3">
                            <h2 className={`${t('textPrimary', darkMode)} text-lg font-bold`}>{activeNav}</h2>
                            {healthAlerts.length > 0 && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-bold animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                    {healthAlerts.length} ALERT{healthAlerts.length !== 1 ? 'S' : ''}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Search "” only on Dashboard */}
                            {activeNav === 'Dashboard' && (
                                <div className="relative">
                                    <MagnifyingGlassIcon className={`w-4 h-4 ${t('textMuted', darkMode)} absolute left-3 top-1/2 -translate-y-1/2`} />
                                    <input type="text" placeholder="Search reports..." value={search} onChange={e => setSearch(e.target.value)}
                                        className={`border rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-red-500/50 w-48 ${darkMode ? 'bg-[#141728] border-[#252A41] text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`} />
                                </div>
                            )}

                            {/* Dark / Light toggle */}
                            <button
                                onClick={() => setDarkMode(d => !d)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${darkMode ? 'bg-[#1e2347] border-[#252A41] text-gray-300 hover:text-white' : 'bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-900'}`}
                                title="Toggle dark/light mode"
                            >
                                {darkMode ? <><SunIcon className="w-4 h-4" /> Light</> : <><MoonIcon className="w-4 h-4" /> Dark</>}
                            </button>

                            <span className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-bold">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />LIVE
                            </span>

                            {/* Bell */}
                            <div className="relative">
                                <button onClick={() => setShowBellPopover(p => !p)} className="relative focus:outline-none">
                                    <BellSolid className={`w-5 h-5 ${t('textSecondary', darkMode)} hover:text-red-400 transition-colors`} />
                                    {stats.newReports > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
                                </button>
                                {showBellPopover && (
                                    <div className={`absolute right-0 top-8 w-64 ${t('popoverBg', darkMode)} border rounded-xl shadow-2xl z-50 overflow-hidden`}>
                                        <div className={`px-4 py-3 border-b ${t('divider', darkMode)} flex items-center justify-between`}>
                                            <p className={`${t('textPrimary', darkMode)} text-sm font-bold`}>Notifications</p>
                                            <button onClick={() => setShowBellPopover(false)} className={`${t('textMuted', darkMode)} hover:text-red-400 text-xs`}>✖</button>
                                        </div>
                                        {notifications.length === 0
                                            ? <div className={`p-4 text-center ${t('textMuted', darkMode)} text-xs`}>No new notifications</div>
                                            : <div className={`max-h-60 overflow-y-auto divide-y ${t('divider', darkMode)}`}>
                                                {notifications.slice(0, 5).map(n => (
                                                    <button key={n.id} onClick={() => {
                                                        if (n.type === 'ambulance' || n.type === 'emergency' || (n.type === 'medical' && n.title?.includes('AMBULANCE'))) {
                                                            setActiveNav('Emergencies');
                                                        } else if (n.report) {
                                                            setSelectedPatient(n.report);
                                                            setActiveNav('Dashboard');
                                                        }
                                                        dismissNotification(n.id);
                                                        setShowBellPopover(false);
                                                    }}
                                                        className={`w-full text-left px-4 py-3 ${t('rowHover', darkMode)} transition-colors`}>
                                                        <p className={`${t('textPrimary', darkMode)} text-xs font-bold truncate`}>{n.title}</p>
                                                        <p className={`${t('textSecondary', darkMode)} text-[11px] truncate mt-0.5`}>{n.message}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Profile */}
                            <div className="relative z-50">
                                <button onClick={handleToggleProfileMenu} className={`flex items-center gap-2 px-2 py-1.5 rounded-xl ${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-100'} transition-all`}>
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-red-600 flex items-center justify-center text-white font-bold text-sm">
                                        {session?.name?.[0] || 'M'}
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 ${t('textMuted', darkMode)} transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isProfileMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={handleCloseProfileMenu} />
                                        <div className={`absolute right-0 top-12 w-52 ${t('popoverBg', darkMode)} border rounded-2xl shadow-2xl z-50 overflow-hidden`}>
                                            <div className={`p-4 border-b ${t('divider', darkMode)}`}>
                                                <p className={`${t('textPrimary', darkMode)} text-sm font-bold`}>{session?.name || 'Medical Admin'}</p>
                                                <p className={`${t('textMuted', darkMode)} text-xs truncate`}>{session?.email}</p>
                                            </div>
                                            <div className="p-1">
                                                <button onClick={handleSettingsClick} className={`w-full text-left px-3 py-2 ${t('textSecondary', darkMode)} ${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-100'} text-xs font-medium rounded-lg transition-colors flex items-center gap-2`}>
                                                    <UserCircleIcon className="w-4 h-4" /> Profile Settings
                                                </button>
                                                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 text-xs font-medium rounded-lg transition-colors flex items-center gap-2">
                                                    <ArrowLeftOnRectangleIcon className="w-4 h-4" /> Sign Out
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Body "” full-width section per nav item */}
                    <div className="flex-1 overflow-auto p-6">
                        {renderSection()}
                    </div>
                </div>

                {/* Map modal */}
                {mapTarget && <MapModal report={mapTarget} isOpen={!!mapTarget} onClose={() => setMapTarget(null)} />}

                <NotificationSystem
                    notifications={notifications}
                    onDismiss={dismissNotification}
                    onNotificationClick={n => {
                        // Ambulance/medical emergency †’ go to Emergencies tab
                        if (n.type === 'ambulance' || n.type === 'emergency' ||
                            (n.type === 'medical' && n.title?.includes('AMBULANCE'))) {
                            setActiveNav('Emergencies');
                            if (n.report) {
                                setSelectedPatient(n.report);
                            }
                        } else if (n.report) {
                            setSelectedPatient(n.report);
                            setActiveNav('Dashboard');
                        }
                        dismissNotification(n.id);
                    }}
                />
            </div>
        </ThemeContext.Provider>
    );
};

export default MedicalDashboard;



