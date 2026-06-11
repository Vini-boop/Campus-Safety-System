import React, { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ShieldExclamationIcon,
    ExclamationTriangleIcon,
    BellAlertIcon,
    ClockIcon,
    MagnifyingGlassIcon,
    BellIcon,
    UserCircleIcon,
    MapPinIcon,
    ChevronRightIcon,
    ArrowTrendingUpIcon,
    ChevronDownIcon,
    ArrowRightOnRectangleIcon,
    CheckCircleIcon,
    Squares2X2Icon,
    DocumentTextIcon,
    BookOpenIcon,
    MapIcon,
    UserGroupIcon,
    ChartBarIcon,
    MegaphoneIcon,
    Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellSolid } from '@heroicons/react/24/solid';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, where, setDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import MapModal from '../components/MapModal';
import MediaViewer from '../components/MediaViewer';
import ReportModal from '../components/ReportModal';
import NotificationSystem, { useNotifications } from '../components/NotificationSystem';
import OBBookEnhanced from '../components/OBBookEnhanced';
import { calculateAverageResponseTime, groupReportsByDate, calculateTypeDistribution, calculateStatusDistribution } from '../services/analyticsService';
import { clearSession, getSession } from '../services/authService';
import { exportToCSV, downloadCSV } from '../services/analyticsService';
import { resolveLocationSync } from '../services/geocodingService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

// ─── Theme Token Map (dark / light) ─────────────────────────────────────────
const T = {
    pageBg: { dark: 'bg-[#0A0E27]', light: 'bg-gray-100' },
    sidebarBg: { dark: 'bg-[#0D1130]', light: 'bg-white' },
    sidebarBorder: { dark: 'border-[#1e2347]', light: 'border-gray-200' },
    cardBg: { dark: 'bg-[#141728]', light: 'bg-white' },
    cardBorder: { dark: 'border-[#252A41]', light: 'border-gray-200' },
    cardHover: { dark: 'hover:border-[#3d4466]', light: 'hover:border-gray-300' },
    innerBg: { dark: 'bg-[#1e2347]', light: 'bg-gray-50' },
    deepBg: { dark: 'bg-[#0D1130]', light: 'bg-gray-100' },
    headerBg: { dark: 'bg-[#0D1130]', light: 'bg-white' },
    textPrimary: { dark: 'text-white', light: 'text-gray-900' },
    textSecondary: { dark: 'text-gray-400', light: 'text-gray-500' },
    textMuted: { dark: 'text-gray-500', light: 'text-gray-400' },
    divider: { dark: 'border-[#252A41]', light: 'border-gray-200' },
    dividerInner: { dark: 'border-[#1e2347]', light: 'border-gray-100' },
    inputBg: { dark: 'bg-[#141728] border-[#252A41] text-white placeholder-gray-600', light: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' },
    rowHover: { dark: 'hover:bg-[#1e2347]', light: 'hover:bg-gray-50' },
    tableHead: { dark: 'bg-[#0D1130] text-gray-400', light: 'bg-gray-50 text-gray-500' },
    navHover: { dark: 'text-gray-500 hover:bg-[#1e2347] hover:text-white', light: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900' },
    popoverBg: { dark: 'bg-[#141728] border-[#252A41]', light: 'bg-white border-gray-200' },
    tabInactive: { dark: 'bg-[#1e2347] text-gray-400 hover:text-white', light: 'bg-gray-100 text-gray-500 hover:text-gray-900' },
};
const tok = (key, dark) => T[key]?.[dark ? 'dark' : 'light'] ?? '';

// ─── Theme Context ────────────────────────────────────────────────────────────
const ThemeContext = createContext({ dark: false });
const useTheme = () => useContext(ThemeContext);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, subtitle, badge, icon: Icon, iconBg, badgeColor, showIcon = true }) => {
    const { dark } = useTheme();
    return (
        <div className={`${tok('cardBg', dark)} border ${tok('cardBorder', dark)} ${tok('cardHover', dark)} rounded-2xl p-5 flex flex-col gap-3 transition-colors shadow-sm`}>
            <div className="flex items-center justify-between">
                {showIcon && Icon && (
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
                        <Icon className="w-6 h-6" />
                    </div>
                )}
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

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const { dark } = useTheme();
    const map = {
        urgent: dark ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200',
        high: dark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200',
        medium: dark ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border border-yellow-200',
        low: dark ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200',
        pending: dark ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' : 'bg-gray-100 text-gray-600 border border-gray-300',
        responding: dark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200',
        resolved: dark ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200',
        open: dark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-orange-50 text-orange-700 border border-orange-200',
        closed: dark ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' : 'bg-gray-100 text-gray-600 border border-gray-300',
        approved: dark ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200',
        rejected: dark ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200',
    };
    const key = status?.toLowerCase() || 'pending';
    return (
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[key] || map.pending}`}>
            {status}
        </span>
    );
};

// ─── Type Badge ───────────────────────────────────────────────────────────────
const TypeBadge = ({ type }) => {
    const { dark } = useTheme();
    const map = {
        sos: {
            label: 'SOS',
            cls: dark ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200',
        },
        'emergency/sos': {
            label: 'SOS',
            cls: dark ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200',
        },
        emergency: {
            label: 'EMG',
            cls: dark ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200',
        },
        medical: {
            label: 'MED',
            cls: dark ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200',
        },
        security: {
            label: 'SEC',
            cls: dark ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 border border-purple-200',
        },
    };
    const key = type?.toLowerCase() || '';
    const fallbackLabel = type?.substring(0, 3).toUpperCase() || '???';
    const cfg = map[key] || {
        label: fallbackLabel,
        cls: dark ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-200',
    };
    return (
        <span className={`${cfg.cls} text-xs font-bold px-2 py-1 rounded-lg uppercase tracking-wide`}>
            {cfg.label}
        </span>
    );
};

// ─── Colors for charts ────────────────────────────────────────────────────────
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// ─── Main Component ───────────────────────────────────────────────────────────
const SecurityDashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const session = getSession();

    // Notification system hook - must be called before any usage
    const { notifications, addNotification, dismissNotification, clearAll } = useNotifications();

    // Update OB Log with follow-up
    const handleOBFollowUp = useCallback(async (obLog, notes, actionTaken) => {
        try {
            await updateDoc(doc(db, 'security_ob_logs', obLog.id), {
                followUpNotes: notes,
                actionTaken: actionTaken,
                followedUpAt: new Date().toISOString(),
                followedUpBy: session?.uid || 'admin',
            });
            addNotification({
                type: 'security',
                title: 'OB Follow-up Completed',
                message: `Follow-up added to ${obLog.obNumber}`,
            });
        } catch (error) {
            console.error('Error adding OB follow-up:', error);
            alert('Failed to add follow-up. See console for details.');
        }
    }, [session?.uid, addNotification]);

    // Update OB status
    const handleOBStatusChange = useCallback(async (obLog, newStatus) => {
        try {
            await updateDoc(doc(db, 'security_ob_logs', obLog.id), {
                status: newStatus,
                closedAt: newStatus === 'closed' ? new Date().toISOString() : null,
            });
            addNotification({
                type: 'security',
                title: 'OB Status Updated',
                message: `${obLog.obNumber} marked as ${newStatus}`,
            });
        } catch (error) {
            console.error('Error updating OB status:', error);
        }
    }, [addNotification]);

    // ✅ Student Verification State - MUST BE BEFORE handlers that use them
    const [verificationRequests, setVerificationRequests] = useState([]);
    const [showVerificationPanel, setShowVerificationPanel] = useState(false);
    const [selectedVerification, setSelectedVerification] = useState(null);

    // Handle Student Verification - Approve
    const handleApproveVerification = useCallback(async (verificationRequest) => {
        if (!window.confirm(`Approve verification for ${verificationRequest.regNumber}? This will grant the student full access.`)) return;

        try {
            const userDocRef = doc(db, 'users', verificationRequest.userId);

            // Update user profile with verified status
            await updateDoc(userDocRef, {
                isRegNumberVerified: true,
                verifiedAt: new Date().toISOString(),
                verifiedBy: session?.uid || 'admin',
            });

            // Update verification request status
            await updateDoc(doc(db, 'verification_requests', verificationRequest.id), {
                status: 'approved',
                reviewedAt: new Date().toISOString(),
                reviewedBy: session?.uid || 'admin',
            });

            // Send notification to student
            await addDoc(collection(db, 'notifications'), {
                userId: verificationRequest.userId,
                title: '✅ Registration Verified',
                message: `Your registration number (${verificationRequest.regNumber}) has been verified. You can now submit security reports!`,
                type: 'verification_approved',
                read: false,
                createdAt: serverTimestamp(),
            });

            addNotification({
                type: 'verification',
                title: 'Student Verified',
                message: `${verificationRequest.regNumber} approved successfully`,
            });

            // Close panel if open
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
    }, [session, addNotification, selectedVerification]);

    // Handle Student Verification - Reject
    const handleRejectVerification = useCallback(async (verificationRequest, reason = '') => {
        if (!reason && !window.confirm(`Reject verification for ${verificationRequest.regNumber}? The student will be notified.`)) return;

        try {
            // Update verification request status
            await updateDoc(doc(db, 'verification_requests', verificationRequest.id), {
                status: 'rejected',
                reviewedAt: new Date().toISOString(),
                reviewedBy: session?.uid || 'admin',
                rejectionReason: reason || 'Invalid registration number',
            });

            // Update user profile - mark as not complete so they can resubmit
            await updateDoc(doc(db, 'users', verificationRequest.userId), {
                isProfileComplete: false,
                isRegNumberVerified: false,
            });

            // Send notification to student
            await addDoc(collection(db, 'notifications'), {
                userId: verificationRequest.userId,
                title: '❌ Verification Rejected',
                message: `Your registration number (${verificationRequest.regNumber}) was rejected. Reason: ${reason || 'Invalid registration number'}. Please resubmit with correct information.`,
                type: 'verification_rejected',
                read: false,
                createdAt: serverTimestamp(),
            });

            addNotification({
                type: 'verification',
                title: 'Verification Rejected',
                message: `${verificationRequest.regNumber} rejected`,
            });

            // Close panel if open
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
    }, [session, addNotification, selectedVerification]);
    const handleDeleteAreaAlert = useCallback(async (alertId) => {
        if (!window.confirm('Are you sure you want to delete this area alert?')) return;
        try {
            await deleteDoc(doc(db, 'area_alerts', alertId));
            setActiveAreaAlerts((prev) => prev.filter(a => a.id !== alertId));
            addNotification({
                type: 'security',
                title: 'Area Alert Deleted',
                message: `Area alert deleted successfully.`,
            });
        } catch (error) {
            console.error('Error deleting area alert:', error);
            alert('Failed to delete area alert. See console for details.');
        }
    }, [addNotification]);

    // Real-time listener for active area alerts
    useEffect(() => {
        const q = query(collection(db, 'area_alerts'), where('status', '==', 'active'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setActiveAreaAlerts(alerts);
        }, (err) => {
            console.error('Error fetching area alerts:', err);
        });
        return () => unsub();
    }, []);

    // Real-time listener for OB (Occurrence Book) logs
    useEffect(() => {
        const currentYear = new Date().getFullYear();
        console.log('[OB] Setting up real-time listener for security_ob_logs...');

        // Primary query: entries with year field (all new entries from mobile)
        const q = query(
            collection(db, 'security_ob_logs'),
            where('year', '==', currentYear),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setObLogs(logs);
            console.log(`✅ [OB] Real-time update: ${logs.length} occurrence books for ${currentYear} loaded`);

            // Log each OB entry for debugging
            logs.forEach((log, idx) => {
                if (idx < 3) { // Log first 3 entries
                    console.log(`📘 [OB #${idx + 1}]`, {
                        obNumber: log.obNumber,
                        category: log.category,
                        status: log.status,
                        studentName: log.studentName,
                        year: log.year || 'N/A',
                        createdAt: log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString() : 'N/A'
                    });
                }
            });
        }, (err) => {
            console.error('❌ [OB] Error fetching OB logs:', err);
            console.error('Error details:', err.code, err.message);

            // Fallback: fetch all entries without year filter (catches entries missing year field)
            console.warn('[OB] Falling back to unfiltered query...');
            const fallbackQ = query(
                collection(db, 'security_ob_logs'),
                orderBy('createdAt', 'desc')
            );
            const fallbackUnsub = onSnapshot(fallbackQ, (fallbackSnap) => {
                const fallbackLogs = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                setObLogs(fallbackLogs);
                console.log(`✅ [OB] Fallback: ${fallbackLogs.length} total occurrence books loaded`);
            });
            return () => fallbackUnsub();
        });

        return () => {
            console.log('[OB] Cleaning up real-time listener');
            unsub();
        };
    }, []);

    // Real-time listener for Student Verification Requests
    useEffect(() => {
        console.log('[Verification] Setting up real-time listener for verification_requests...');

        const q = query(
            collection(db, 'verification_requests'),
            orderBy('submittedAt', 'desc')
        );

        const unsub = onSnapshot(q, (snap) => {
            const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setVerificationRequests(requests);
            console.log(`✅ [Verification] Real-time update: ${requests.length} verification requests loaded`);

            // Log pending requests
            const pending = requests.filter(r => r.status === 'pending');
            if (pending.length > 0) {
                console.log(`⏳ [Verification] ${pending.length} pending requests require attention`);
            }
        }, (err) => {
            console.error('❌ [Verification] Error fetching verification requests:', err);
        });

        return () => {
            console.log('[Verification] Cleaning up real-time listener');
            unsub();
        };
    }, []);

    // Memoized logout handler - prevents unnecessary re-creation
    const handleLogout = useCallback(async (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        try {
            await clearSession();
            // ProtectedRoute detects the Firebase signOut and redirects automatically.
            // Fallback: force navigate after a short delay in case ProtectedRoute is slow.
            setTimeout(() => {
                window.location.href = '/login';
            }, 300);
        } catch (err) {
            console.error('Logout error:', err);
            window.location.href = '/login';
        }
    }, []);
    const [activeNav, setActiveNav] = useState('Dashboard');
    const [darkMode, setDarkMode] = useState(false);
    const [showAllReports, setShowAllReports] = useState(false);
    const [allReports, setAllReports] = useState([]);
    const [filteredReports, setFilteredReports] = useState([]);
    const [selectedReports, setSelectedReports] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState(null);
    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [isMediaViewerOpen, setIsMediaViewerOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [alertMode, setAlertMode] = useState(false);
    const [showNotifPanel, setShowNotifPanel] = useState(false);
    const [showTeamModal, setShowTeamModal] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    const [unreadCount, setUnreadCount] = useState(0);
    const [securityTeam, setSecurityTeam] = useState([]);
    const [isLoadingTeam, setIsLoadingTeam] = useState(true);
    const [firebaseConnected, setFirebaseConnected] = useState(true);
    const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date());

    // OB (Occurrence Book) logs
    const [obLogs, setObLogs] = useState([]);
    const [showOBPanel, setShowOBPanel] = useState(false);
    const [selectedOBLog, setSelectedOBLog] = useState(null);
    const [obFollowUpNotes, setObFollowUpNotes] = useState('');

    // Area Alert Broadcasting
    const [showAreaAlertForm, setShowAreaAlertForm] = useState(false);
    const [areaAlertForm, setAreaAlertForm] = useState({
        title: '',
        area: '',
        description: '',
        severity: 'high',
        expiresIn: 60, // minutes
        // Notification display targets
        showOnHomeScreen: true,
        showOnStatusBar: true,
    });
    const [isSubmittingAreaAlert, setIsSubmittingAreaAlert] = useState(false);
    const [activeAreaAlerts, setActiveAreaAlerts] = useState([]);

    // Memoized button handlers to prevent re-renders
    const handleNavClick = useCallback((label) => {
        if (label === 'Homepage') { navigate('/login'); return; }
        setActiveNav(label);
        if (label !== 'Reports') {
            setShowAllReports(false);
            setSelectedReports([]); // Clear selections on navigate
        }
    }, [navigate]);

    const handleToggleAlertMode = useCallback(() => setAlertMode(p => !p), []);

    const handleToggleNotifPanel = useCallback(() => {
        setShowNotifPanel(p => !p);
        setUnreadCount(0);
    }, []);

    const handleCloseNotifPanel = useCallback(() => setShowNotifPanel(false), []);

    const handleToggleProfileMenu = useCallback(() => setIsProfileMenuOpen(p => !p), []);

    const handleCloseProfileMenu = useCallback(() => setIsProfileMenuOpen(false), []);

    const handleSettingsClick = useCallback(() => {
        setActiveNav('Settings');
        setIsProfileMenuOpen(false);
    }, []);

    const handleSupport = useCallback(() => {
        window.location.href = 'mailto:support@campus.edu?subject=Security Dashboard Support';
    }, []);

    // Normalize backend report fields to dashboard-friendly shape
    const normalizeReport = (d, collectionName) => {
        // ── Resolve createdAt to ISO string ──────────────────────────────────
        const resolveDate = (val) => {
            if (!val) return new Date().toISOString();
            // Firestore Timestamp object
            if (val?.toDate) return val.toDate().toISOString();
            // Firestore Timestamp as plain object { seconds, nanoseconds }
            if (val?.seconds) return new Date(val.seconds * 1000).toISOString();
            return String(val);
        };

        // ── Resolve location name ─────────────────────────────────────────────
        const resolveLocationName = () => {
            if (d.campusZone) return d.campusZone;
            if (d.placeName) return d.placeName.replace(/^📍\s*/, '');
            if (d.locationText) return d.locationText;
            if (typeof d.location === 'object' && d.location?.address) return d.location.address;
            if (typeof d.location === 'string') {
                const loc = d.location.trim();
                if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc)) return 'Near Campus Area';
                return loc || 'Unknown';
            }
            return 'Unknown';
        };

        // ── Resolve GPS coords ────────────────────────────────────────────────
        const resolveCoords = () => {
            if (d.coordinates?.latitude) return d.coordinates;
            if (d.locationCoords?.latitude) return d.locationCoords;
            // security_reports stores location as { latitude, longitude, address }
            if (typeof d.location === 'object' && d.location?.latitude) return d.location;
            return null;
        };

        // ── Resolve media URLs ────────────────────────────────────────────────
        // security_reports uses `media` array of { type, url } objects
        const resolveMedia = () => {
            if (d.mediaUrls?.length) return d.mediaUrls;
            if (d.evidenceUrls?.length) return d.evidenceUrls;
            if (d.images?.length) return d.images;
            // media / evidence are arrays of { type, url }
            const arr = d.media || d.evidence || [];
            if (arr.length) return arr.map(m => (typeof m === 'string' ? m : m.url)).filter(Boolean);
            return [];
        };

        // ── Normalise status ──────────────────────────────────────────────────
        // security_reports uses 'reported' - treat same as 'pending' for display
        const normalizeStatus = (s) => {
            if (!s) return 'pending';
            if (s === 'reported') return 'pending';
            return s;
        };

        return {
            id: d.id,
            _collection: collectionName,
            // Type: security_reports uses `category` as the type
            type: d.type || d.reportType || d.category || d.subCategory || 'security',
            description: d.description || d.message || d.summary || '',
            location: resolveLocationName(),
            locationCoords: resolveCoords(),
            locationAccuracy: d.locationAccuracy || null,
            placeName: d.placeName?.replace(/^📍\s*/, '') || d.campusZone || d.locationText || null,
            campusZone: d.campusZone || null,
            campusZoneCategory: d.campusZoneCategory || null,
            // Reporter - security_reports uses studentName/studentEmail
            reporterName: d.reporterName || d.studentName || d.reportedBy || d.reporterId || 'Anonymous',
            reporterEmail: d.reporterEmail || d.studentEmail || '',
            reporterRole: d.reporterRole || null,
            // Verification fields - security_reports uses `regNumber`
            regNo: d.regNo || d.regNumber || null,
            phone: d.phone || d.reporterPhone || null,
            isRegNumberVerified: d.isRegNumberVerified ?? null,
            priority: d.priority || d.urgency || 'medium',
            status: normalizeStatus(d.status),
            createdAt: resolveDate(d.createdAt || d.timestamp),
            updatedAt: resolveDate(d.updatedAt),
            isHighRisk: d.isHighRisk || false,
            notes: d.notes || d.adminResponse || '',
            mediaUrls: resolveMedia(),
            actionNeeded: d.actionNeeded || '',
            hostelName: d.hostelName || '',
            roomNumber: d.roomNumber || '',
            obNumber: d.obNumber || '',
            category: d.category || null,
            categoryLabel: d.categoryLabel || d.category || null,
            assignedTo: d.assignedTo || null,
            resolvedAt: d.resolvedAt ? resolveDate(d.resolvedAt) : null,
            requiresImmediateResponse: d.requiresImmediateResponse || false,
        };
    };

    // Firebase listener - reads from security_alerts + emergencies with real-time updates
    useEffect(() => {
        const collections = ['security_alerts', 'emergencies', 'security_reports'];
        const unsubs = [];
        const dataMap = {};
        // Track per-collection initial load - only notify once ALL collections have
        // completed their first snapshot, preventing pre-login docs from popping up.
        const loadedCollections = new Set();
        const allLoaded = () => loadedCollections.size >= collections.length;

        const rebuildReports = () => {
            const merged = Object.values(dataMap).flat();
            merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setAllReports(merged);
            setIsLoading(false);
        };

        // Helper: extract createdAt as milliseconds from a raw Firestore doc
        const getCreatedAtMs = (raw) => {
            const val = raw.createdAt || raw.timestamp;
            if (!val) return null;
            if (val?.toDate) return val.toDate().getTime();
            if (val?.seconds) return val.seconds * 1000;
            return null;
        };

        collections.forEach(colName => {
            dataMap[colName] = [];
            const q = query(collection(db, colName), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(q, (snap) => {
                console.log(`[Firebase] ${colName} snapshot received: ${snap.docs.length} documents`);

                const isFirstSnapshot = !loadedCollections.has(colName);

                snap.docChanges().forEach(change => {
                    const rawData = { id: change.doc.id, ...change.doc.data() };
                    const r = normalizeReport(rawData, colName);

                    if (change.type === 'added') {
                        // Only notify after all collections have done their first load
                        // AND pass createdAtMs so the login-gate in NotificationSystem
                        // can filter out any doc that existed before this session.
                        if (!isFirstSnapshot || allLoaded()) {
                            const createdAtMs = getCreatedAtMs(change.doc.data());
                            const typeStr = (r.type || '').toLowerCase();

                            let notifType = 'security';
                            if (typeStr.includes('sos') || typeStr.includes('emergency')) {
                                notifType = 'sos';
                            } else if (typeStr.includes('medical')) {
                                notifType = 'medical';
                            }

                            console.log(`[REAL-TIME] Alert Added: Type=${r.type}, NotifType=${notifType}, Reporter=${r.reporterName}, Time=${new Date().toLocaleTimeString()}`);

                            addNotification({
                                type: notifType,
                                title: `🚨 NEW ${r.type?.toUpperCase() || 'SECURITY'} ALERT`,
                                message: `${r.reporterName} reported at ${r.placeName || r.location}`,
                                report: r,
                                createdAtMs,
                                docId: r.id,
                                showBrowserNotification: true,
                                onBrowserClick: () => { setSelectedReport(r); setIsReportModalOpen(true); }
                            });
                            setUnreadCount(p => p + 1);

                            if (notifType === 'sos') {
                                setAlertMode(true);
                            }
                        }
                    } else if (change.type === 'modified') {
                        console.log(`[REAL-TIME] Alert Modified: Type=${r.type}, ID=${r.id}, Status=${r.status}, Time=${new Date().toLocaleTimeString()}`);
                    } else if (change.type === 'removed') {
                        console.log(`[REAL-TIME] Alert Removed: ID=${r.id}, Time=${new Date().toLocaleTimeString()}`);
                    }
                });

                // Rebuild entire report list with latest data
                dataMap[colName] = snap.docs.map(d => normalizeReport({ id: d.id, ...d.data() }, colName));
                rebuildReports();
                setLastUpdatedTime(new Date());
                setFirebaseConnected(true);
                loadedCollections.add(colName);
            }, (error) => {
                console.error(`[ERROR] Firestore listener error for ${colName}:`, error);
                setFirebaseConnected(false);
                setIsLoading(false);
            });
            unsubs.push(unsub);
        });

        return () => unsubs.forEach(u => u());
    }, [addNotification]);

    // Periodic refresh as safety net to ensure latest data
    useEffect(() => {
        const refreshInterval = setInterval(() => {
            console.log(`[REFRESH] Dashboard data check at ${new Date().toLocaleTimeString()}`);
            // Firebase listeners will automatically pull latest data
        }, 30000); // Every 30 seconds

        return () => clearInterval(refreshInterval);
    }, []);

    // Update display time every second for real-time clock
    useEffect(() => {
        const displayInterval = setInterval(() => {
            // Trigger a re-render to update the display time
            setLastUpdatedTime(prev => new Date(prev.getTime())); // Force update
        }, 1000);

        return () => clearInterval(displayInterval);
    }, []);

    // Stats - memoized to prevent unnecessary recalculations
    const stats = useMemo(() => ({
        activeIncidents: allReports.filter(r => r.status !== 'resolved').length,
        highRiskZones: allReports.filter(r => r.isHighRisk).length || 3,
        sosAlerts: allReports.filter(r => r.type?.toLowerCase().includes('sos') || r.type?.toLowerCase().includes('emergency')).length,
        avgResponseTime: calculateAverageResponseTime(allReports),
    }), [allReports]);

    // Team Listener
    useEffect(() => {
        const q = query(collection(db, 'users'), where('role', '==', 'security'));
        const unsub = onSnapshot(q, (snap) => {
            const team = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setSecurityTeam(team);
            setIsLoadingTeam(false);
        }, (err) => {
            console.error("Error fetching team:", err);
            setIsLoadingTeam(false);
        });
        return () => unsub();
    }, []);

    // ─── SYSTEM STATUS CONTROL ───
    const [systemStatus, setSystemStatus] = useState({ securityLevel: 'Low', movementStatus: 'Safe' });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_status', 'general'), (snap) => {
            if (snap.exists()) {
                setSystemStatus(snap.data());
            }
        });
        return () => unsub();
    }, []);

    const updateSystemStatus = useCallback(async (field, value) => {
        console.log(`Attempting to update ${field} to ${value}`);
        console.log("Current User Role:", session?.role);
        console.log("Current User UID:", session?.uid);

        // Optimistic Update
        setSystemStatus(prev => ({ ...prev, [field]: value }));

        try {
            await setDoc(doc(db, 'system_status', 'general'), {
                [field]: value,
                lastUpdated: new Date(),
                updatedBy: session?.uid || 'admin'
            }, { merge: true });
            console.log("System status updated in DB");

            // Notification for critical changes
            if ((field === 'securityLevel' && value === 'High') || (field === 'movementStatus' && value === 'Lockdown')) {
                addNotification({
                    type: 'security',
                    title: 'Global Alert Updated',
                    message: `System ${field} changed to ${value}`
                });
            }
        } catch (error) {
            console.error("Failed to update system status:", error);
            alert("Failed to update system status. See console for details.");
        }
    }, [session?.uid, addNotification]);

    // Send area alert to users
    const sendAreaAlert = useCallback(async () => {
        if (!areaAlertForm.title || !areaAlertForm.area) {
            alert('Please fill in Title and Area');
            return;
        }

        setIsSubmittingAreaAlert(true);
        try {
            console.log('📢 Sending area alert...');
            console.log('Session:', session);
            console.log('User UID:', session?.uid);
            console.log('User role from token:', session?.role);

            const expiryTime = new Date(Date.now() + areaAlertForm.expiresIn * 60000);

            // Save to Firestore - this will trigger the Cloud Function to send FCM push notifications
            const alertDoc = await addDoc(collection(db, 'area_alerts'), {
                title: areaAlertForm.title,
                area: areaAlertForm.area,
                description: areaAlertForm.description,
                severity: areaAlertForm.severity,
                source: 'security', // identifies origin for mobile display
                createdAt: new Date().toISOString(),
                expiresAt: expiryTime.toISOString(),
                createdBy: session?.uid || 'admin',
                createdByName: session?.name || 'Security Admin',
                status: 'active',
                // Notification display targets (for FCM payload)
                notificationTargets: {
                    homeScreen: areaAlertForm.showOnHomeScreen,
                    statusBar: areaAlertForm.showOnStatusBar,
                },
            });

            console.log('✅ Area alert saved to Firestore (ID:', alertDoc.id + ')');
            console.log('🔔 Firebase Cloud Function will automatically send push notifications to all students');

            addNotification({
                type: 'security',
                title: '🚨 Security Alert Broadcast',
                message: `Push notification sent to ALL STUDENTS - ${areaAlertForm.area}: ${areaAlertForm.title}`,
            });

            // Reset form
            setAreaAlertForm({
                title: '',
                area: '',
                description: '',
                severity: 'high',
                expiresIn: 60,
                showOnHomeScreen: true,
                showOnStatusBar: true,
            });
            setShowAreaAlertForm(false);

            console.log('✅ Security alert broadcast successfully');
        } catch (error) {
            console.error('Error sending security alert:', error);
            alert('Failed to send security alert. See console for details.');
        } finally {
            setIsSubmittingAreaAlert(false);
        }
    }, [areaAlertForm, session?.uid, session?.name, addNotification]);

    // Filter
    useEffect(() => {
        let f = [...allReports];
        if (activeTab !== 'all') {
            f = f.filter(r => {
                const t = (r.type || '').toLowerCase();
                const cat = (r.category || '').toLowerCase();
                if (activeTab === 'sos') return t.includes('sos') || t.includes('emergency');
                if (activeTab === 'medical') return t.includes('medical') || cat.includes('medical');
                if (activeTab === 'security') return !t.includes('sos') && !t.includes('emergency') && !t.includes('medical');
                return true;
            });
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            f = f.filter(r =>
                r.reporterName?.toLowerCase().includes(q) ||
                r.location?.toLowerCase().includes(q) ||
                r.placeName?.toLowerCase().includes(q) ||
                r.description?.toLowerCase().includes(q) ||
                r.regNo?.toLowerCase().includes(q) ||
                r.phone?.includes(q) ||
                r.obNumber?.toLowerCase().includes(q) ||
                r.categoryLabel?.toLowerCase().includes(q) ||
                r.type?.toLowerCase().includes(q)
            );
        }
        setFilteredReports(f);
    }, [allReports, activeTab, searchQuery]);

    const handleUpdateStatus = useCallback(async (report, newStatus, notes) => {
        try {
            const colName = report._collection || 'security_alerts';

            // Resolve location name from coordinates if available
            let locationUpdate = {};
            const coords = report.coordinates || report.locationCoords;
            if (coords && !report.placeName) {
                const lat = coords.latitude || coords.lat;
                const lng = coords.longitude || coords.lng;
                if (lat && lng) {
                    const resolvedPlace = resolveLocationSync(lat, lng);
                    if (resolvedPlace) {
                        locationUpdate.placeName = resolvedPlace;
                        console.log(`✅ Resolved location for report ${report.id}: ${resolvedPlace}`);
                    }
                }
            }

            await updateDoc(doc(db, colName, report.id), {
                status: newStatus,
                updatedAt: new Date().toISOString(),
                ...(newStatus === 'resolved' && { resolvedAt: new Date().toISOString() }),
                ...(notes && { notes }),
                ...locationUpdate // Include resolved location if found
            });
        } catch (e) {
            console.error('Error updating status:', e);
        }
    }, []);

    const handleBulkResolve = useCallback(async () => {
        if (!selectedReports.length) return;
        if (!window.confirm(`Are you sure you want to resolve ${selectedReports.length} reports?`)) return;

        try {
            await Promise.all(selectedReports.map(async (id) => {
                const report = allReports.find(r => r.id === id);
                if (report && report.status !== 'resolved') {
                    const colName = report._collection || 'security_alerts';

                    // Resolve location from coordinates
                    let locationUpdate = {};
                    const coords = report.coordinates || report.locationCoords;
                    if (coords && !report.placeName) {
                        const lat = coords.latitude || coords.lat;
                        const lng = coords.longitude || coords.lng;
                        if (lat && lng) {
                            const resolvedPlace = resolveLocationSync(lat, lng);
                            if (resolvedPlace) {
                                locationUpdate.placeName = resolvedPlace;
                                console.log(`✅ Resolved location for report ${id}: ${resolvedPlace}`);
                            }
                        }
                    }

                    await updateDoc(doc(db, colName, id), {
                        status: 'resolved',
                        updatedAt: new Date().toISOString(),
                        resolvedAt: new Date().toISOString(),
                        ...locationUpdate
                    });
                }
            }));
            setSelectedReports([]);
            addNotification({ type: 'security', title: 'Bulk Action', message: `${selectedReports.length} reports marked as resolved.` });
        } catch (e) {
            console.error('Error in bulk resolve:', e);
            alert('Failed to update some reports.');
        }
    }, [selectedReports, allReports, addNotification]);

    const toggleSelectAll = useCallback(() => {
        const visibleIds = filteredReports.filter(r => activeNav === 'Incidents' ? r.status !== 'resolved' : true).map(r => r.id);
        if (selectedReports.length === visibleIds.length && visibleIds.length > 0) {
            setSelectedReports([]);
        } else {
            setSelectedReports(visibleIds);
        }
    }, [filteredReports, activeNav, selectedReports]);

    const toggleSelectReport = useCallback((id, e) => {
        e.stopPropagation();
        setSelectedReports(prev => prev.includes(id) ? prev.filter(rId => rId !== id) : [...prev, id]);
    }, []);

    const handleMarkHighRisk = useCallback(async (report) => {
        try {
            const colName = report._collection || 'security_alerts';
            await updateDoc(doc(db, colName, report.id), {
                isHighRisk: true,
                updatedAt: new Date().toISOString(),
            });
            addNotification({ type: 'security', title: 'High Risk Zone Marked', message: `${report.location} marked as high-risk zone` });
        } catch (e) { console.error(e); }
    }, [addNotification]);

    const handleExportCSV = useCallback(() => {
        const csv = exportToCSV(filteredReports);
        downloadCSV(csv, `security-reports-${new Date().toISOString().split('T')[0]}.csv`);
    }, [filteredReports]);

    const displayedReports = showAllReports ? filteredReports : filteredReports.slice(0, 6);

    const tabs = ['all', 'sos', 'medical', 'security'];

    const nav = [
        { label: 'Dashboard', icon: Squares2X2Icon },
        { label: 'Reports', icon: DocumentTextIcon },
        { label: 'Incidents', icon: ExclamationTriangleIcon },
        { label: 'Map', icon: MapIcon },
        { label: 'Broadcast', icon: MegaphoneIcon },
        { label: 'Settings', icon: Cog6ToothIcon },
    ];

    return (
        <ThemeContext.Provider value={{ dark: darkMode }}>
            <div className={`min-h-screen ${tok('pageBg', darkMode)} flex`}>
                {/* ── Sidebar ── */}
                <aside className={`w-56 ${tok('sidebarBg', darkMode)} border-r ${tok('sidebarBorder', darkMode)} flex flex-col shrink-0`}>
                    {/* Logo */}
                    <div className="p-6 pb-4">
                        <div className="flex flex-col">
                            <span className={`${tok('textPrimary', darkMode)} font-bold text-xl leading-tight tracking-wide`}>Campus Safety</span>
                            <span className="text-purple-400 text-[10px] uppercase tracking-widest font-bold mt-1">Security Dashboard</span>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="flex-1 px-4 py-2 space-y-2">
                        {nav.map(item => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.label}
                                    onClick={() => handleNavClick(item.label)}
                                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[15px] font-semibold transition-all ${activeNav === item.label
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                        : `${tok('navHover', darkMode)}`
                                        }`}
                                >
                                    <Icon className="w-5 h-5 stroke-2" />
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Help */}
                    <div className={`p-4 border-t ${tok('sidebarBorder', darkMode)}`}>
                        <p className={`${tok('textMuted', darkMode)} text-xs mb-3`}>Need Help?</p>
                        <div className={`flex items-center gap-2 ${tok('textSecondary', darkMode)} text-xs`}>
                            <span className="w-2 h-2 rounded-full bg-green-400"></span> Support Online
                        </div>
                        <div className={`flex items-center gap-2 ${tok('textSecondary', darkMode)} text-xs mt-1`}>
                            <span className="w-2 h-2 rounded-full bg-green-400"></span> System Normal
                        </div>
                        <button
                            onClick={handleSupport}
                            className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold py-2 rounded-lg flex items-center justify-between px-3 transition-colors"
                        >
                            Contact Support <span className="bg-purple-800 rounded-full px-1.5 py-0.5">5</span>
                        </button>
                    </div>
                </aside>

                {/* ── Main Content ── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Top Bar */}
                    <header className={`${tok('headerBg', darkMode)} border-b px-6 py-3 flex items-center justify-between shrink-0 relative z-20 transition-all ${alertMode ? 'border-red-500 shadow-lg shadow-red-500/20' : tok('sidebarBorder', darkMode)}`}>
                        <div className="flex items-center gap-3">
                            <h2 className={`${tok('textPrimary', darkMode)} text-lg font-bold`}>{activeNav}</h2>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <MagnifyingGlassIcon className={`absolute left-3 top-2.5 w-4 h-4 ${tok('textMuted', darkMode)}`} />
                                <input
                                    type="text"
                                    placeholder="Search cases..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className={`border pl-9 pr-4 py-2 text-sm rounded-xl w-52 focus:outline-none focus:border-purple-500 ${tok('inputBg', darkMode)}`}
                                />
                            </div>

                            {/* Real-Time Status Indicator */}
                            <div className={`flex items-center gap-2 px-3 py-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-xl text-xs`}>
                                <span className={`w-2 h-2 rounded-full ${firebaseConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></span>
                                <span className={`${firebaseConnected ? 'text-green-400' : 'text-red-400'}`}>
                                    {firebaseConnected ? 'Live' : 'Offline'}
                                </span>
                                <span className={`${tok('textMuted', darkMode)} mx-1`}>•</span>
                                <span className={tok('textSecondary', darkMode)}>
                                    {lastUpdatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            </div>

                            <button
                                onClick={handleToggleAlertMode}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${alertMode ? 'bg-red-600 text-white' : 'bg-red-600/20 text-red-400 border border-red-600/30'
                                    }`}
                            >
                                🔔 ALERT MODE
                            </button>

                            {/* Dark / Light Mode Toggle */}
                            <button
                                onClick={() => setDarkMode(d => !d)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${darkMode ? `${tok('cardBg', darkMode)} ${tok('cardBorder', darkMode)} ${tok('textSecondary', darkMode)} hover:text-white` : 'bg-gray-100 border-gray-200 text-gray-600 hover:text-gray-900'
                                    }`}
                                title="Toggle dark/light mode"
                            >
                                {darkMode ? <><SunIcon className="w-4 h-4" /> Light</> : <><MoonIcon className="w-4 h-4" /> Dark</>}
                            </button>
                            <button
                                onClick={handleExportCSV}
                                className={`flex items-center gap-2 px-3 py-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-xl ${tok('textSecondary', darkMode)} hover:border-purple-500/40 text-xs font-medium transition-colors`}
                                title="Export reports as CSV"
                            >
                                ⬇ Export CSV
                            </button>
                            <div className="relative">
                                <button
                                    onClick={handleToggleNotifPanel}
                                    className={`p-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-xl`}
                                >
                                    <BellSolid className={`w-5 h-5 ${tok('textSecondary', darkMode)}`} />
                                </button>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                                {/* Notification Dropdown */}
                                {showNotifPanel && (
                                    <div className={`absolute right-0 top-10 w-80 ${tok('popoverBg', darkMode)} border rounded-2xl shadow-2xl z-50 overflow-hidden`}>
                                        <div className={`flex items-center justify-between px-4 py-3 border-b ${tok('divider', darkMode)}`}>
                                            <p className={`${tok('textPrimary', darkMode)} text-sm font-bold`}>Notifications</p>
                                            <button onClick={handleCloseNotifPanel} className={`${tok('textMuted', darkMode)} hover:text-white text-xs`}>✕</button>
                                        </div>
                                        <div className="max-h-72 overflow-y-auto">
                                            {notifications.length === 0 ? (
                                                <p className={`${tok('textMuted', darkMode)} text-xs text-center py-6`}>No notifications</p>
                                            ) : notifications.slice(0, 10).map(n => {
                                                const handleNotifClick = () => {
                                                    if (n.report) {
                                                        setSelectedReport(n.report);
                                                        setIsReportModalOpen(true);
                                                    }
                                                    dismissNotification(n.id);
                                                    setShowNotifPanel(false);
                                                };
                                                return (
                                                    <div
                                                        key={n.id}
                                                        onClick={handleNotifClick}
                                                        className={`flex items-start gap-3 px-4 py-3 ${tok('rowHover', darkMode)} cursor-pointer border-b ${tok('dividerInner', darkMode)} transition-colors`}
                                                    >
                                                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.type === 'sos' ? 'bg-red-500' : n.type === 'medical' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`${tok('textPrimary', darkMode)} text-xs font-semibold`}>{n.title}</p>
                                                            <p className={`${tok('textSecondary', darkMode)} text-xs truncate`}>{n.message}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {notifications.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    clearAll();
                                                    setShowNotifPanel(false);
                                                }}
                                                className={`w-full text-xs ${tok('textMuted', darkMode)} hover:text-purple-400 py-2 border-t ${tok('divider', darkMode)} transition-colors`}
                                            >
                                                Clear all
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="relative z-50">
                                <button
                                    onClick={handleToggleProfileMenu}
                                    className={`flex items-center gap-3 px-2 py-1.5 rounded-xl ${tok('rowHover', darkMode)} transition-all group`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-900/20">
                                        {session?.name ? session.name[0] : 'S'}
                                    </div>
                                    <div className="text-left hidden md:block">
                                        <h1 className={`${tok('textPrimary', darkMode)} text-sm font-bold leading-tight`}>Security</h1>
                                        <p className={`${tok('textMuted', darkMode)} text-[10px] uppercase tracking-wider font-semibold`}>Campus Security</p>
                                    </div>
                                    <ChevronDownIcon className={`w-4 h-4 ${tok('textMuted', darkMode)} group-hover:text-white transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Dropdown */}
                                {isProfileMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={handleCloseProfileMenu} />
                                        <div className={`absolute right-0 top-14 w-60 ${tok('popoverBg', darkMode)} border rounded-2xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5`}>
                                            <div className={`p-4 border-b ${tok('divider', darkMode)} ${darkMode ? 'bg-[#1e2347]/50' : 'bg-gray-50'}`}>
                                                <p className={`${tok('textPrimary', darkMode)} text-sm font-bold`}>{session?.name || 'Security Admin'}</p>
                                                <p className={`${tok('textMuted', darkMode)} text-xs truncate`}>{session?.email || 'security@campus.edu'}</p>
                                            </div>
                                            <div className="p-1">
                                                <button
                                                    onClick={handleSettingsClick}
                                                    className={`w-full text-left px-3 py-2 ${tok('textSecondary', darkMode)} ${tok('rowHover', darkMode)} text-xs font-medium rounded-lg transition-colors flex items-center gap-2`}
                                                >
                                                    <UserCircleIcon className="w-4 h-4" />
                                                    Profile Settings
                                                </button>
                                                <button
                                                    onClick={handleLogout}
                                                    className="w-full text-left px-3 py-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
                                                >
                                                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                                                    Sign Out
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </header>

                    {/* Body */}
                    <div className="flex-1 overflow-auto p-6 relative">
                        {/* Content Switcher */}
                        {(() => {
                            switch (activeNav) {
                                case 'Dashboard': return (
                                    <div className="space-y-6">
                                        {/* ── Analytics Overview Section ── */}
                                        <div className="space-y-6">
                                            <div className="flex items-center justify-between">
                                                <h2 className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>Analytics Overview</h2>
                                            </div>

                                            {/* Stat Cards */}
                                            <div className="grid grid-cols-4 gap-4">
                                                <StatCard title="Active Incidents" value={isLoading ? '-' : stats.activeIncidents} subtitle="Last 24 hours" badge="+62" badgeColor="bg-red-500/20 text-red-400 border border-red-500/30" showIcon={false} />
                                                <StatCard title="High-Risk Zones" value={stats.highRiskZones} subtitle="Zones monitored" badge="+1" badgeColor="bg-orange-500/20 text-orange-400 border border-orange-500/30" showIcon={false} />
                                                <StatCard title="SOS Alerts" value={isLoading ? '-' : stats.sosAlerts} subtitle="Today" badge="+5" badgeColor="bg-red-500/20 text-red-400 border border-red-500/30" showIcon={false} />
                                                <StatCard title="Avg Response Time" value={stats.avgResponseTime} subtitle="Target: <5m" badge="+20%" badgeColor="bg-green-500/20 text-green-400 border border-green-500/30" icon={ClockIcon} iconBg="bg-green-500/20 text-green-400" />
                                            </div>

                                            {/* Analytics Charts */}
                                            <div className="grid grid-cols-2 gap-6">
                                                {/* Trend Chart */}
                                                <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-6 h-96`}>
                                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-4`}>Incident Trend (14 Days)</h3>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={groupReportsByDate(allReports, 14)}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#252A41" : "#e5e7eb"} />
                                                            <XAxis
                                                                dataKey="date"
                                                                stroke={darkMode ? "#9ca3af" : "#6b7280"}
                                                                fontSize={11}
                                                                tickFormatter={(str) => str.slice(5)}
                                                            />
                                                            <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} fontSize={11} />
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: darkMode ? '#1e2347' : '#ffffff',
                                                                    border: `1px solid ${darkMode ? '#252A41' : '#e5e7eb'}`,
                                                                    borderRadius: '8px',
                                                                    color: darkMode ? '#fff' : '#000'
                                                                }}
                                                            />
                                                            <Line
                                                                type="monotone"
                                                                dataKey="count"
                                                                stroke="#8b5cf6"
                                                                strokeWidth={2}
                                                                name="Incidents"
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                {/* Type Distribution */}
                                                <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-6 h-96`}>
                                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-4`}>Incident Types</h3>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={calculateTypeDistribution(allReports)}
                                                                cx="50%"
                                                                cy="50%"
                                                                labelLine={false}
                                                                label={({ name, percentage }) => `${name}: ${percentage}%`}
                                                                outerRadius={100}
                                                                fill="#8884d8"
                                                                dataKey="count"
                                                            >
                                                                {calculateTypeDistribution(allReports).map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.name === 'SOS' ? '#ef4444' : '#3b82f6'} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: darkMode ? '#1e2347' : '#ffffff',
                                                                    border: `1px solid ${darkMode ? '#252A41' : '#e5e7eb'}`,
                                                                    borderRadius: '8px',
                                                                    color: darkMode ? '#fff' : '#000'
                                                                }}
                                                            />
                                                            <Legend
                                                                verticalAlign="bottom"
                                                                height={36}
                                                                iconType="circle"
                                                                formatter={(value) => (
                                                                    <span style={{ color: darkMode ? '#fff' : '#000', fontSize: '12px' }}>
                                                                        {value}
                                                                    </span>
                                                                )}
                                                            />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── System Status Control Panel ── */}
                                        <div className={`${tok('innerBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-4 flex items-center justify-between shadow-lg relative overflow-hidden`}>
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${systemStatus.securityLevel === 'High' ? 'bg-red-500/20 animate-pulse' : 'bg-green-500/20'}`}>
                                                    <ShieldExclamationIcon className={`w-7 h-7 ${systemStatus.securityLevel === 'High' ? 'text-red-400' : 'text-green-400'}`} />
                                                </div>
                                                <div>
                                                    <h2 className={`${tok('textPrimary', darkMode)} font-bold text-lg`}>System Status Control</h2>
                                                    <p className={`${tok('textSecondary', darkMode)} text-xs`}>Global Safety Level Broadcasting to Mobile App</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 relative z-10">
                                                {/* Security Level Control */}
                                                <div className="flex flex-col">
                                                    <label className={`${tok('textMuted', darkMode)} text-[10px] uppercase font-bold mb-1`}>Security Level</label>
                                                    <div className={`flex items-center rounded-lg p-1 border ${tok('cardBorder', darkMode)} ${tok('deepBg', darkMode)}`}>
                                                        {['Low', 'Medium', 'High'].map(level => (
                                                            <button
                                                                key={level}
                                                                onClick={() => updateSystemStatus('securityLevel', level)}
                                                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${systemStatus.securityLevel === level
                                                                    ? (level === 'High' ? 'bg-red-600 text-white shadow-lg shadow-red-500/30' :
                                                                        level === 'Medium' ? 'bg-orange-500 text-white' : 'bg-green-500 text-white')
                                                                    : `${tok('textMuted', darkMode)} hover:text-white ${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-200'}`
                                                                    }`}
                                                            >
                                                                {level}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Movement Status Control */}
                                                <div className="flex flex-col">
                                                    <label className={`${tok('textMuted', darkMode)} text-[10px] uppercase font-bold mb-1`}>Movement Status</label>
                                                    <div className={`flex items-center rounded-lg p-1 border ${tok('cardBorder', darkMode)} ${tok('deepBg', darkMode)}`}>
                                                        {['Safe', 'Caution', 'Lockdown'].map(status => (
                                                            <button
                                                                key={status}
                                                                onClick={() => updateSystemStatus('movementStatus', status)}
                                                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${systemStatus.movementStatus === status
                                                                    ? (status === 'Lockdown' ? 'bg-red-600 text-white shadow-lg shadow-red-500/30' :
                                                                        status === 'Caution' ? 'bg-yellow-500 text-white' : 'bg-green-500 text-white')
                                                                    : `${tok('textMuted', darkMode)} hover:text-white ${darkMode ? 'hover:bg-[#1e2347]' : 'hover:bg-gray-200'}`
                                                                    }`}
                                                            >
                                                                {status}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className={`col-span-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5`}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <h2 className={`${tok('textPrimary', darkMode)} font-bold text-base`}>Recent Reports</h2>
                                                    <button onClick={() => setActiveNav('Reports')} className="text-xs text-purple-400 border border-purple-500/30 px-3 py-1 rounded-lg hover:bg-purple-500/10">View All</button>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className={`${tok('textMuted', darkMode)} text-xs border-b ${tok('divider', darkMode)}`}>
                                                                <th className="text-left pb-3 font-medium">Type</th>
                                                                <th className="text-left pb-3 font-medium">Location</th>
                                                                <th className="text-left pb-3 font-medium">Status</th>
                                                                <th className="text-left pb-3 font-medium">Priority</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className={`divide-y ${tok('dividerInner', darkMode)}`}>
                                                            {displayedReports.map(r => (
                                                                <tr key={r.id} className={`${tok('rowHover', darkMode)} cursor-pointer`} onClick={() => { setSelectedReport(r); setIsReportModalOpen(true); }}>
                                                                    <td className="py-3"><TypeBadge type={r.type} /></td>
                                                                    <td className="py-3">
                                                                        <p className={`${tok('textPrimary', darkMode)} text-xs`}>{r.location}</p>
                                                                        <p className={`${tok('textMuted', darkMode)} text-[10px]`}>{r.reporterName}</p>
                                                                    </td>
                                                                    <td className="py-3"><StatusBadge status={r.status} /></td>
                                                                    <td className="py-3"><StatusBadge status={r.priority} /></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5`}>
                                                <div className="flex items-center justify-between mb-4"><h2 className={`${tok('textPrimary', darkMode)} font-bold text-base`}>Emergency</h2><button onClick={() => { setActiveTab('sos'); setActiveNav('Reports'); }} className="text-xs text-purple-400">View All</button></div>
                                                <div className="space-y-3">
                                                    {allReports.filter(r => r.status !== 'resolved' && (r.type?.toLowerCase().includes('sos') || r.type?.toLowerCase().includes('emergency') || r.priority === 'critical')).slice(0, 4).map(r => (
                                                        <div key={r.id} onClick={() => { setSelectedReport(r); setIsReportModalOpen(true); }} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${darkMode ? 'bg-[#1e2347] hover:bg-[#252A41]' : 'bg-gray-50 hover:bg-gray-100'}`}>
                                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-600 text-white text-xs font-bold">SOS</div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`${tok('textPrimary', darkMode)} text-xs font-semibold truncate`}>{r.type}</p>
                                                                <p className={`${tok('textSecondary', darkMode)} text-[10px] truncate`}>{r.location}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className={`col-span-2 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5`}>
                                                <div className="flex items-center justify-between mb-4"><h2 className={`${tok('textPrimary', darkMode)} font-bold text-base`}>Live Map Preview</h2><button onClick={() => setActiveNav('Map')} className="text-xs text-purple-400">Expand Map</button></div>
                                                <div className={`${tok('deepBg', darkMode)} rounded-xl h-36 flex items-center justify-center relative overflow-hidden`}>
                                                    {(() => {
                                                        const GKEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';
                                                        const r = allReports.find(r => r.locationCoords?.latitude);
                                                        const lat = r?.locationCoords?.latitude ?? 0.035611;
                                                        const lng = r?.locationCoords?.longitude ?? 36.284968;
                                                        return (
                                                            <iframe
                                                                title="Map Preview"
                                                                src={`https://www.google.com/maps/embed/v1/place?key=${GKEY}&q=${lat},${lng}&zoom=15&maptype=roadmap`}
                                                                className="w-full h-full"
                                                                style={{ border: 0 }}
                                                                loading="lazy"
                                                                allowFullScreen
                                                                referrerPolicy="no-referrer-when-downgrade"
                                                            />
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <h2 className={`${tok('textPrimary', darkMode)} font-bold text-base`}>Security Team</h2>
                                                    <button onClick={() => setActiveNav('Teams')} className="text-xs text-purple-400">View All</button>
                                                </div>
                                                <p className={`${tok('textSecondary', darkMode)} text-xs mb-4`}>{securityTeam.filter(m => m.status === 'on_duty').length} Personnel On-Duty</p>
                                                {(isLoadingTeam ? [] : securityTeam).slice(0, 3).map(m => (
                                                    <div key={m.id} className="flex items-center gap-3 mb-3">
                                                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs">{m.name ? m.name[0] : '?'}</div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`${tok('textPrimary', darkMode)} text-xs truncate`}>{m.name}</p>
                                                            <p className={`${tok('textMuted', darkMode)} text-[10px] capitalize`}>{m.status?.replace('_', ' ')}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );

                                case 'Reports':
                                case 'Incidents': {
                                    const isIncidents = activeNav === 'Incidents';
                                    // Incidents = unresolved only; Reports = full history
                                    const visibleRows = isIncidents
                                        ? filteredReports.filter(r => r.status !== 'resolved')
                                        : filteredReports;
                                    const pendingCount = visibleRows.filter(r => r.status === 'pending').length;
                                    const respondingCount = visibleRows.filter(r => r.status === 'responding').length;
                                    const resolvedCount = filteredReports.filter(r => r.status === 'resolved').length;
                                    const sosCount = visibleRows.filter(r => (r.type || '').toLowerCase().includes('sos') || (r.type || '').toLowerCase().includes('emergency')).length;
                                    return (
                                        <div className="space-y-5">
                                            {/* Header */}
                                            <div className="flex items-center justify-between flex-wrap gap-3">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isIncidents ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                                                        {isIncidents ? <ExclamationTriangleIcon className="w-6 h-6 text-red-400" /> : <DocumentTextIcon className="w-6 h-6 text-blue-400" />}
                                                    </div>
                                                    <div>
                                                        <h2 className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>
                                                            {isIncidents ? 'Active Incidents' : 'Reports History'}
                                                        </h2>
                                                        <p className={`${tok('textSecondary', darkMode)} text-xs mt-0.5`}>
                                                            {isIncidents
                                                                ? 'Unresolved reports requiring attention'
                                                                : 'Complete history - all reports including resolved'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {tabs.map(tab => (
                                                        <button key={tab} onClick={() => setActiveTab(tab)}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${activeTab === tab ? 'bg-purple-600 text-white' : `${tok('tabInactive', darkMode)}`}`}>
                                                            {tab === 'all' ? 'All Types' : tab.toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Stats */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                {[
                                                    { label: 'SOS / Emergency', count: sosCount, color: 'bg-red-500' },
                                                    { label: 'Pending', count: pendingCount, color: 'bg-orange-400' },
                                                    { label: 'Responding', count: respondingCount, color: 'bg-blue-400' },
                                                    { label: isIncidents ? 'Total Resolved' : 'Resolved', count: resolvedCount, color: 'bg-green-400' },
                                                ].map(s => (
                                                    <div key={s.label} className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-xl px-4 py-3 flex items-center gap-3`}>
                                                        <span className={`w-2.5 h-2.5 rounded-full ${s.color} shrink-0`}></span>
                                                        <div>
                                                            <p className={`${tok('textSecondary', darkMode)} text-[10px] uppercase font-semibold`}>{s.label}</p>
                                                            <p className={`${tok('textPrimary', darkMode)} font-bold text-lg leading-tight`}>{s.count}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Bulk action */}
                                            {selectedReports.length > 0 && (
                                                <div className="flex items-center justify-between bg-purple-600/20 border border-purple-500 rounded-xl px-4 py-2.5">
                                                    <p className="text-purple-300 text-sm font-bold">{selectedReports.length} selected</p>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={handleBulkResolve} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors">✓ Resolve All</button>
                                                        <button onClick={() => setSelectedReports([])} className={`${tok('textSecondary', darkMode)} hover:text-purple-400 text-xs`}>Cancel</button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Table */}
                                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl overflow-hidden`}>
                                                {isLoading ? (
                                                    <div className="p-10 text-center">
                                                        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                                                        <p className={`${tok('textSecondary', darkMode)} text-sm`}>Loading reports...</p>
                                                    </div>
                                                ) : visibleRows.length === 0 ? (
                                                    <div className="p-12 text-center">
                                                        <p className="text-4xl mb-3">{isIncidents ? '✅' : '📭'}</p>
                                                        <p className={`${tok('textPrimary', darkMode)} font-semibold text-base`}>
                                                            {isIncidents ? 'No active incidents' : 'No reports found'}
                                                        </p>
                                                        <p className={`${tok('textSecondary', darkMode)} text-sm mt-1`}>
                                                            {isIncidents ? 'All incidents have been resolved.' : searchQuery ? 'Try a different search or filter.' : 'Reports from the mobile app will appear here.'}
                                                        </p>
                                                        {isIncidents && resolvedCount > 0 && (
                                                            <button onClick={() => setActiveNav('Reports')}
                                                                className="mt-4 px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-xl hover:bg-purple-600/30 transition-colors">
                                                                View {resolvedCount} resolved in History →
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm min-w-[820px]">
                                                            <thead className={`${tok('tableHead', darkMode)} sticky top-0 z-10`}>
                                                                <tr>
                                                                    <th className="px-4 py-3 text-left w-10">
                                                                        <input type="checkbox" className="w-4 h-4 accent-purple-600 rounded"
                                                                            checked={selectedReports.length > 0 && selectedReports.length === visibleRows.length}
                                                                            onChange={toggleSelectAll} />
                                                                    </th>
                                                                    {['Type', 'Location & Reg No.', 'Reporter', 'Time', 'Status', 'Priority', 'Actions'].map(h => (
                                                                        <th key={h} className={`text-left px-4 py-3 font-semibold ${tok('textSecondary', darkMode)} text-xs uppercase tracking-wider whitespace-nowrap`}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className={`divide-y ${tok('dividerInner', darkMode)}`}>
                                                                {visibleRows.map(r => {
                                                                    const isPanelOpen = selectedReport?.id === r.id && isReportModalOpen;
                                                                    const isSOS = (r.type || '').toLowerCase().includes('sos') || (r.type || '').toLowerCase().includes('emergency');
                                                                    const isResolved = r.status === 'resolved';
                                                                    return (
                                                                        <tr key={r.id}
                                                                            onClick={() => { setSelectedReport(r); setIsReportModalOpen(true); }}
                                                                            className={`cursor-pointer transition-all border-l-2 ${isPanelOpen ? (darkMode ? 'bg-purple-900/20 border-l-purple-500' : 'bg-purple-100 border-l-purple-500')
                                                                                : isSOS && !isResolved ? `border-l-red-500 ${tok('rowHover', darkMode)}`
                                                                                    : isResolved ? `border-l-green-700/40 opacity-70 hover:opacity-100 ${tok('rowHover', darkMode)}`
                                                                                        : `border-l-transparent ${tok('rowHover', darkMode)}`
                                                                                } ${selectedReports.includes(r.id) ? (darkMode ? 'bg-purple-900/10' : 'bg-purple-50') : ''}`}
                                                                        >
                                                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                                                <input type="checkbox" className="w-4 h-4 accent-purple-600 rounded"
                                                                                    checked={selectedReports.includes(r.id)}
                                                                                    onChange={e => toggleSelectReport(r.id, e)} />
                                                                            </td>
                                                                            <td className="px-4 py-3">
                                                                                <div className="flex flex-col gap-1">
                                                                                    <TypeBadge type={r.type} />
                                                                                    {r.categoryLabel && r.categoryLabel !== r.type && (
                                                                                        <span className={`text-[10px] ${tok('textMuted', darkMode)} leading-tight`}>{r.categoryLabel}</span>
                                                                                    )}
                                                                                    {r.isHighRisk && <span className="text-[10px] text-red-400 font-bold">⚠ High Risk</span>}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3 max-w-[180px]">
                                                                                <p className={`${tok('textPrimary', darkMode)} text-xs font-medium truncate`} title={r.placeName || r.location || 'Unknown'}>
                                                                                    📍 {r.placeName || r.location || 'Unknown'}
                                                                                </p>
                                                                                {r.regNo && (
                                                                                    <span className="text-purple-400 text-[10px] font-mono bg-purple-500/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">{r.regNo}</span>
                                                                                )}
                                                                                {r.obNumber && (
                                                                                    <p className={`${tok('textMuted', darkMode)} text-[10px] mt-0.5`}>OB: {r.obNumber}</p>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3 max-w-[150px]">
                                                                                <p className={`${tok('textPrimary', darkMode)} text-xs font-medium truncate`}>{r.reporterName || 'Anonymous'}</p>
                                                                                {r.phone && <p className={`${tok('textSecondary', darkMode)} text-[10px] mt-0.5`}>📞 {r.phone}</p>}
                                                                                {r.reporterEmail && <p className={`${tok('textMuted', darkMode)} text-[10px] truncate`}>{r.reporterEmail}</p>}
                                                                            </td>
                                                                            <td className={`px-4 py-3 ${tok('textSecondary', darkMode)} text-xs whitespace-nowrap`}>
                                                                                <p>{r.createdAt ? new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                                                                                {isResolved && r.resolvedAt && (
                                                                                    <p className="text-green-600 text-[10px] mt-0.5">
                                                                                        ✓ {new Date(r.resolvedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                                    </p>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                                                                            <td className="px-4 py-3"><StatusBadge status={r.priority} /></td>
                                                                            <td className="px-4 py-3">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    {!isResolved && (
                                                                                        <button title="Mark Resolved"
                                                                                            onClick={e => { e.stopPropagation(); handleUpdateStatus(r, 'resolved'); }}
                                                                                            className="p-1.5 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-colors text-xs">
                                                                                            ✓
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        onClick={e => { e.stopPropagation(); setSelectedReport(r); setIsReportModalOpen(true); }}
                                                                                        className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors font-semibold whitespace-nowrap ${isPanelOpen ? 'bg-purple-600 text-white' : `${darkMode ? 'bg-[#1e2347] hover:bg-purple-600/30' : 'bg-gray-100 hover:bg-purple-100'} ${tok('textSecondary', darkMode)} hover:text-purple-600`
                                                                                            }`}>
                                                                                        {isPanelOpen ? '← Open' : 'View →'}
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                            {visibleRows.length > 0 && (
                                                <p className={`${tok('textMuted', darkMode)} text-xs text-right`}>
                                                    {visibleRows.length} {isIncidents ? 'active incident' : 'report'}{visibleRows.length !== 1 ? 's' : ''}
                                                    {!isIncidents && resolvedCount > 0 && ` · ${resolvedCount} resolved`}
                                                </p>
                                            )}
                                        </div>
                                    );
                                }

                                case 'OB Book': return (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center shrink-0">
                                                    <BookOpenIcon className="w-6 h-6 text-blue-400" />
                                                </div>
                                                <h2 className="text-white text-2xl font-bold">Occurrence Book (OB)</h2>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-400 text-sm">{obLogs.length} entries in {new Date().getFullYear()}</span>
                                                <button
                                                    onClick={() => setShowOBPanel(!showOBPanel)}
                                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                                >
                                                    {showOBPanel ? 'Hide Panel' : 'Show Panel'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* OB Stats */}
                                        <div className="grid grid-cols-4 gap-4">
                                            <StatCard
                                                title="Total OB Entries"
                                                value={obLogs.length}
                                                subtitle={`Year ${new Date().getFullYear()}`}
                                                badge="All"
                                                badgeColor="bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                icon={BellAlertIcon}
                                                iconBg="bg-blue-500/20 text-blue-400"
                                            />
                                            <StatCard
                                                title="Open Cases"
                                                value={obLogs.filter(l => l.status === 'open').length}
                                                subtitle="Requires action"
                                                badge="Active"
                                                badgeColor="bg-orange-500/20 text-orange-400 border border-orange-500/30"
                                                icon={ExclamationTriangleIcon}
                                                iconBg="bg-orange-500/20 text-orange-400"
                                            />
                                            <StatCard
                                                title="Follow-ups Done"
                                                value={obLogs.filter(l => l.followUpNotes).length}
                                                subtitle="Actions taken"
                                                badge="Done"
                                                badgeColor="bg-green-500/20 text-green-400 border border-green-500/30"
                                                icon={CheckCircleIcon}
                                                iconBg="bg-green-500/20 text-green-400"
                                            />
                                            <StatCard
                                                title="Closed Cases"
                                                value={obLogs.filter(l => l.status === 'closed').length}
                                                subtitle="Resolved"
                                                badge="Closed"
                                                badgeColor="bg-gray-500/20 text-gray-400 border border-gray-500/30"
                                                icon={ShieldExclamationIcon}
                                                iconBg="bg-gray-500/20 text-gray-400"
                                            />
                                        </div>

                                        {/* OB Entries Table */}
                                        <div className="bg-[#141728] border border-[#252A41] rounded-2xl overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-[#1e2347]">
                                                    <tr>
                                                        {['OB Number', 'Category', 'Summary', 'Location', 'Student', 'Contact', 'Date', 'Time', 'Status', 'Actions'].map(h => (
                                                            <th key={h} className="text-left px-4 py-4 font-medium text-gray-400">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#1e2347]">
                                                    {obLogs.map(log => (
                                                        <tr
                                                            key={log.id}
                                                            className={`hover:bg-[#1e2347/50] cursor-pointer transition-colors ${selectedOBLog?.id === log.id ? 'bg-purple-900/10' : ''}`}
                                                            onClick={() => setSelectedOBLog(log)}
                                                        >
                                                            <td className="px-4 py-4">
                                                                <span className="text-white font-mono text-xs font-bold bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">
                                                                    {log.obNumber}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <TypeBadge type={log.category || 'security'} />
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <p className="text-white text-xs truncate max-w-[200px]" title={log.summary}>{log.summary}</p>
                                                                {log.followUpNotes && (
                                                                    <p className="text-green-400 text-[10px] mt-1 flex items-center gap-1">
                                                                        <CheckCircleIcon className="w-3 h-3" /> Followed up
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-300">
                                                                <div className="space-y-1">
                                                                    <p className="text-white truncate max-w-[150px]">{log.hostelName || 'Unknown'}</p>
                                                                    <p className="text-gray-500 text-[10px]">Room: {log.roomNumber || 'N/A'}</p>
                                                                    {log.location?.latitude && log.location?.longitude && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const mapReport = {
                                                                                    reporterName: log.studentName || 'Unknown',
                                                                                    type: log.reportType || 'security',
                                                                                    placeName: log.placeName || log.locationText || log.location?.address,
                                                                                    locationAccuracy: log.locationAccuracy || null,
                                                                                    locationCoords: {
                                                                                        latitude: log.location?.latitude || log.coordinates?.latitude,
                                                                                        longitude: log.location?.longitude || log.coordinates?.longitude,
                                                                                        address: log.location?.address || `${log.hostelName || 'Campus'} - ${log.roomNumber || 'Unknown'}`
                                                                                    }
                                                                                };
                                                                                setSelectedReport(mapReport);
                                                                                setIsMapModalOpen(true);
                                                                            }}
                                                                            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1"
                                                                        >
                                                                            <MapPinIcon className="w-3 h-3" />
                                                                            View on Map
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-300">
                                                                <div className="space-y-1">
                                                                    <p className="text-white text-xs">{log.studentName || 'Anonymous'}</p>
                                                                    <p className="text-gray-500 text-[10px] truncate max-w-[120px]" title={log.studentEmail}>{log.studentEmail || 'N/A'}</p>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-300">
                                                                <div className="space-y-1">
                                                                    <p className="text-white text-xs">{log.phone || 'N/A'}</p>
                                                                    <p className="text-gray-500 text-[10px]">{log.priority ? log.priority.toUpperCase() : 'MEDIUM'}</p>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-400 whitespace-nowrap">
                                                                <div className="space-y-1">
                                                                    {log.timestamp && (
                                                                        <p className="text-white text-xs">
                                                                            {new Date(log.timestamp.seconds * 1000).toLocaleDateString([], {
                                                                                month: 'short',
                                                                                day: 'numeric',
                                                                                year: 'numeric'
                                                                            })}
                                                                        </p>
                                                                    ) || '-'}
                                                                    {log.createdAt && (
                                                                        <p className="text-gray-500 text-[10px]">
                                                                            {new Date(log.createdAt.seconds * 1000).toLocaleTimeString([], {
                                                                                hour: '2-digit',
                                                                                minute: '2-digit'
                                                                            })}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-400 whitespace-nowrap">
                                                                {log.timestamp && (
                                                                    <p className="text-white text-xs">
                                                                        {new Date(log.timestamp.seconds * 1000).toLocaleTimeString([], {
                                                                            hour: '2-digit',
                                                                            minute: '2-digit'
                                                                        })}
                                                                    </p>
                                                                ) || '-'}
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <select
                                                                    value={log.status || 'open'}
                                                                    onChange={(e) => handleOBStatusChange(log, e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="bg-[#0D1130] border border-[#252A41] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-purple-500"
                                                                >
                                                                    <option value="open">Open</option>
                                                                    <option value="in_progress">In Progress</option>
                                                                    <option value="closed">Closed</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedOBLog(log);
                                                                            setObFollowUpNotes(log.followUpNotes || '');
                                                                        }}
                                                                        className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-1"
                                                                    >
                                                                        <CheckCircleIcon className="w-3 h-3" />
                                                                        Follow Up
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            // Find related report
                                                                            const relatedReport = allReports.find(r => r.reportId === log.reportId);
                                                                            if (relatedReport) {
                                                                                setSelectedReport(relatedReport);
                                                                                setIsReportModalOpen(true);
                                                                            }
                                                                        }}
                                                                        className="text-xs px-3 py-1.5 bg-[#1e2347] hover:bg-[#252A41] text-gray-300 rounded-lg transition-colors"
                                                                    >
                                                                        View Report
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {obLogs.length === 0 && (
                                                <div className="p-8 text-center text-gray-500">
                                                    No OB entries for {new Date().getFullYear()} yet.
                                                </div>
                                            )}
                                        </div>

                                        {/* OB Follow-up Panel */}
                                        {selectedOBLog && showOBPanel && (
                                            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                                <div className="bg-[#141728] border border-[#252A41] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                                                    <div className="sticky top-0 bg-[#141728] border-b border-[#252A41] p-5 flex items-center justify-between">
                                                        <div>
                                                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                                                📘 {selectedOBLog.obNumber}
                                                            </h3>
                                                            <p className="text-gray-400 text-xs mt-1">Occurrence Book Follow-up</p>
                                                        </div>
                                                        <button
                                                            onClick={() => { setSelectedOBLog(null); setObFollowUpNotes(''); }}
                                                            className="text-gray-500 hover:text-white p-2 rounded-lg transition-colors"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>

                                                    <div className="p-5 space-y-4">
                                                        {/* Incident Details */}
                                                        <div className="bg-[#1e2347] rounded-xl p-4 space-y-3">
                                                            <h4 className="text-white font-semibold text-sm">📋 Incident Details</h4>
                                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                                <div>
                                                                    <p className="text-gray-500">Category</p>
                                                                    <p className="text-white">{selectedOBLog.category || 'Security'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Status</p>
                                                                    <StatusBadge status={selectedOBLog.status || 'open'} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Priority</p>
                                                                    <p className={`text-white font-semibold uppercase ${selectedOBLog.priority === 'high' ? 'text-red-400' :
                                                                        selectedOBLog.priority === 'medium' ? 'text-orange-400' : 'text-green-400'
                                                                        }`}>
                                                                        {selectedOBLog.priority || 'MEDIUM'}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">OB Number</p>
                                                                    <p className="text-white font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/30 inline-block">
                                                                        {selectedOBLog.obNumber}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Report ID</p>
                                                                    <p className="text-white font-mono text-xs">{selectedOBLog.reportId || 'N/A'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Date & Time</p>
                                                                    <p className="text-white">
                                                                        {selectedOBLog.timestamp ? new Date(selectedOBLog.timestamp.seconds * 1000).toLocaleString() :
                                                                            selectedOBLog.createdAt ? new Date(selectedOBLog.createdAt.seconds * 1000).toLocaleString() : 'N/A'}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Location</p>
                                                                    <p className="text-white">{selectedOBLog.hostelName} - {selectedOBLog.roomNumber}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Coordinates</p>
                                                                    <p className="text-white font-mono text-xs bg-[#0D1130] px-2 py-1 rounded">
                                                                        {selectedOBLog.coordinates?.latitude?.toFixed(6) || selectedOBLog.location?.latitude?.toFixed(6) || '0.000000'},
                                                                        {selectedOBLog.coordinates?.longitude?.toFixed(6) || selectedOBLog.location?.longitude?.toFixed(6) || '0.000000'}
                                                                    </p>
                                                                </div>
                                                                <div className="col-span-2">
                                                                    <p className="text-gray-500">Address</p>
                                                                    <p className="text-white">{selectedOBLog.location?.address || selectedOBLog.hostelName || 'Campus Area'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Student</p>
                                                                    <p className="text-white font-medium">{selectedOBLog.studentName}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Email</p>
                                                                    <a href={`mailto:${selectedOBLog.studentEmail}`} className="text-blue-400 hover:underline">
                                                                        {selectedOBLog.studentEmail || 'N/A'}
                                                                    </a>
                                                                </div>
                                                                <div>
                                                                    <p className="text-gray-500">Student ID</p>
                                                                    <p className="text-white font-mono text-xs">{selectedOBLog.studentId || 'N/A'}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500 text-xs mb-1">Summary</p>
                                                                <p className="text-white text-sm bg-[#0D1130] p-2 rounded">{selectedOBLog.summary}</p>
                                                            </div>
                                                            {selectedOBLog.description && (
                                                                <div>
                                                                    <p className="text-gray-500 text-xs mb-1">Full Description</p>
                                                                    <p className="text-white text-sm bg-[#0D1130] p-3 rounded whitespace-pre-wrap">{selectedOBLog.description}</p>
                                                                </div>
                                                            )}

                                                            {/* Admin Response Section */}
                                                            {selectedOBLog.adminResponse && (
                                                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 space-y-2">
                                                                    <h4 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                                                                        📨 Admin Response
                                                                    </h4>
                                                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                                                        <div>
                                                                            <p className="text-gray-500">Action Required</p>
                                                                            <p className="text-white capitalize">{selectedOBLog.adminResponse.action || 'none'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-gray-500">Updated By</p>
                                                                            <p className="text-white">{selectedOBLog.adminResponse.updatedBy || 'Admin'}</p>
                                                                        </div>
                                                                        <div className="col-span-2">
                                                                            <p className="text-gray-500">Message</p>
                                                                            <p className="text-white bg-[#0D1130] p-2 rounded">{selectedOBLog.adminResponse.message}</p>
                                                                        </div>
                                                                        <div className="col-span-2">
                                                                            <p className="text-gray-500">Updated At</p>
                                                                            <p className="text-white">
                                                                                {selectedOBLog.adminResponse.updatedAt ?
                                                                                    new Date(selectedOBLog.adminResponse.updatedAt.seconds * 1000).toLocaleString() : 'N/A'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Assigned To Section */}
                                                            {selectedOBLog.assignedTo && (
                                                                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                                                                    <p className="text-purple-400 font-semibold text-xs mb-1">👮 Assigned To</p>
                                                                    <p className="text-white text-sm">{selectedOBLog.assignedTo}</p>
                                                                </div>
                                                            )}

                                                            <button
                                                                onClick={() => {
                                                                    const mapReport = {
                                                                        reporterName: selectedOBLog.studentName || 'Unknown',
                                                                        type: selectedOBLog.reportType || 'security',
                                                                        placeName: selectedOBLog.placeName || selectedOBLog.locationText || selectedOBLog.location?.address,
                                                                        locationAccuracy: selectedOBLog.locationAccuracy || null,
                                                                        locationCoords: {
                                                                            latitude: selectedOBLog.location?.latitude || selectedOBLog.coordinates?.latitude || 0,
                                                                            longitude: selectedOBLog.location?.longitude || selectedOBLog.coordinates?.longitude || 0,
                                                                            address: selectedOBLog.location?.address || `${selectedOBLog.hostelName || 'Campus'} - ${selectedOBLog.roomNumber || 'Unknown'}`
                                                                        }
                                                                    };
                                                                    setSelectedReport(mapReport);
                                                                    setIsMapModalOpen(true);
                                                                }}
                                                                className="w-full mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                                            >
                                                                <MapPinIcon className="w-4 h-4" />
                                                                Open Location on Map
                                                            </button>
                                                        </div>

                                                        {/* Previous Follow-ups */}
                                                        {selectedOBLog.followUpNotes && (
                                                            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                                                                <h4 className="text-green-400 font-semibold text-sm mb-2 flex items-center gap-2">
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                    Previous Follow-up
                                                                </h4>
                                                                <p className="text-green-100 text-sm whitespace-pre-wrap">{selectedOBLog.followUpNotes}</p>
                                                                {selectedOBLog.followedUpAt && (
                                                                    <p className="text-green-500 text-xs mt-2">
                                                                        {new Date(selectedOBLog.followedUpAt).toLocaleString()}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Add Follow-up Form */}
                                                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                                                            <h4 className="text-purple-400 font-semibold text-sm mb-3">Add Follow-up / Action Taken</h4>
                                                            <textarea
                                                                value={obFollowUpNotes}
                                                                onChange={(e) => setObFollowUpNotes(e.target.value)}
                                                                placeholder="Enter follow-up notes, actions taken, investigation updates, etc..."
                                                                rows={5}
                                                                className="w-full px-3 py-2 bg-[#0D1130] border border-[#252A41] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none text-sm"
                                                            />
                                                            <div className="flex gap-2 mt-3">
                                                                <button
                                                                    onClick={() => handleOBFollowUp(selectedOBLog, obFollowUpNotes, 'Investigation ongoing')}
                                                                    disabled={!obFollowUpNotes.trim()}
                                                                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors text-sm"
                                                                >
                                                                    Save Follow-up
                                                                </button>
                                                                <button
                                                                    onClick={() => handleOBStatusChange(selectedOBLog, 'closed')}
                                                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
                                                                >
                                                                    Mark as Closed
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Link to Original Report */}
                                                        {allReports.find(r => r.reportId === selectedOBLog.reportId) && (
                                                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                                                <h4 className="text-blue-400 font-semibold text-sm mb-2">Original Report</h4>
                                                                <button
                                                                    onClick={() => {
                                                                        const report = allReports.find(r => r.reportId === selectedOBLog.reportId);
                                                                        if (report) {
                                                                            setSelectedReport(report);
                                                                            setIsReportModalOpen(true);
                                                                        }
                                                                    }}
                                                                    className="text-blue-400 hover:text-blue-300 text-sm underline"
                                                                >
                                                                    View Full Security Report →
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="sticky bottom-0 bg-[#141728] border-t border-[#252A41] p-5">
                                                        <button
                                                            onClick={() => { setSelectedOBLog(null); setObFollowUpNotes(''); }}
                                                            className="w-full bg-[#1e2347] hover:bg-[#252A41] text-white font-semibold py-2.5 rounded-lg transition-colors"
                                                        >
                                                            Close
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );

                                case 'Verifications': return (
                                    <div className="space-y-6">
                                        {/* Header */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center shrink-0">
                                                    <CheckCircleIcon className="w-6 h-6 text-green-400" />
                                                </div>
                                                <h2 className="text-white text-2xl font-bold">Student Verifications</h2>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-400 text-sm">
                                                    {verificationRequests.filter(r => r.status === 'pending').length} pending
                                                </span>
                                                <button
                                                    onClick={() => setShowVerificationPanel(!showVerificationPanel)}
                                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
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
                                                badgeColor="bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                icon={BellAlertIcon}
                                                iconBg="bg-blue-500/20 text-blue-400"
                                            />
                                            <StatCard
                                                title="Pending Review"
                                                value={verificationRequests.filter(r => r.status === 'pending').length}
                                                subtitle="Requires attention"
                                                badge="Active"
                                                badgeColor="bg-orange-500/20 text-orange-400 border border-orange-500/30"
                                                icon={ExclamationTriangleIcon}
                                                iconBg="bg-orange-500/20 text-orange-400"
                                            />
                                            <StatCard
                                                title="Approved"
                                                value={verificationRequests.filter(r => r.status === 'approved').length}
                                                subtitle="Verified students"
                                                badge="Done"
                                                badgeColor="bg-green-500/20 text-green-400 border border-green-500/30"
                                                icon={CheckCircleIcon}
                                                iconBg="bg-green-500/20 text-green-400"
                                            />
                                            <StatCard
                                                title="Rejected"
                                                value={verificationRequests.filter(r => r.status === 'rejected').length}
                                                subtitle="Invalid submissions"
                                                badge="Closed"
                                                badgeColor="bg-gray-500/20 text-gray-400 border border-gray-500/30"
                                                icon={ShieldExclamationIcon}
                                                iconBg="bg-gray-500/20 text-gray-400"
                                            />
                                        </div>

                                        {/* Verification Requests Table */}
                                        <div className="bg-[#141728] border border-[#252A41] rounded-2xl overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-[#1e2347]">
                                                    <tr>
                                                        {['Reg Number', 'Student Email', 'Phone', 'School', 'Submitted', 'Status', 'Actions'].map(h => (
                                                            <th key={h} className="text-left px-4 py-4 font-medium text-gray-400">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#1e2347]">
                                                    {verificationRequests.map(req => (
                                                        <tr
                                                            key={req.id}
                                                            className={`hover:bg-[#1e2347/50] cursor-pointer transition-colors ${selectedVerification?.id === req.id ? 'bg-purple-900/10' : ''}`}
                                                            onClick={() => setSelectedVerification(req)}
                                                        >
                                                            <td className="px-4 py-4">
                                                                <span className="text-white font-mono text-xs font-bold bg-purple-500/20 text-purple-400 px-2 py-1 rounded border border-purple-500/30">
                                                                    {req.regNumber}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-300">
                                                                <p className="text-white text-xs">{req.studentEmail || 'N/A'}</p>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-300">
                                                                <p className="text-white text-xs">{req.phoneNumber || 'N/A'}</p>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-300">
                                                                <p className="text-white text-xs">{req.school || 'Laikipia University'}</p>
                                                            </td>
                                                            <td className="px-4 py-4 text-gray-400 whitespace-nowrap">
                                                                {req.submittedAt && (
                                                                    <p className="text-white text-xs">
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
                                                                        if (e.target.value === 'approved') {
                                                                            handleApproveVerification(req);
                                                                        } else if (e.target.value === 'rejected') {
                                                                            const reason = window.prompt('Enter rejection reason:');
                                                                            if (reason) handleRejectVerification(req, reason);
                                                                        }
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="bg-[#0D1130] border border-[#252A41] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-purple-500"
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
                                                                            if (reason !== null) {
                                                                                handleRejectVerification(req, reason || 'Invalid registration number');
                                                                            }
                                                                        }}
                                                                        disabled={req.status !== 'pending'}
                                                                        className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1"
                                                                    >
                                                                        <ShieldExclamationIcon className="w-3 h-3" />
                                                                        Reject
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {verificationRequests.length === 0 && (
                                                        <tr>
                                                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                                No verification requests found.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Detail Panel */}
                                        {selectedVerification && showVerificationPanel && (
                                            <div className="fixed inset-y-0 right-0 w-[600px] bg-[#141728] border-l border-[#252A41] shadow-2xl z-50 overflow-y-auto">
                                                {/* Panel Header */}
                                                <div className="sticky top-0 bg-[#141728] border-b border-[#252A41] p-5 flex items-center justify-between">
                                                    <div>
                                                        <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                                            ✅ Verification Request
                                                        </h3>
                                                        <p className="text-gray-400 text-xs mt-1">Review and approve/reject</p>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSelectedVerification(null); }}
                                                        className="text-gray-500 hover:text-white p-2 rounded-lg transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                <div className="p-5 space-y-4">
                                                    {/* Request Details */}
                                                    <div className="bg-[#1e2347] rounded-xl p-4 space-y-3">
                                                        <h4 className="text-white font-semibold text-sm">📋 Request Information</h4>
                                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                                            <div>
                                                                <p className="text-gray-500">Registration Number</p>
                                                                <p className="text-white font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded inline-block">
                                                                    {selectedVerification.regNumber}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500">Status</p>
                                                                <p className={`text-white font-semibold uppercase ${selectedVerification.status === 'pending' ? 'text-orange-400' :
                                                                    selectedVerification.status === 'approved' ? 'text-green-400' : 'text-red-400'
                                                                    }`}>
                                                                    {selectedVerification.status}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500">Student Email</p>
                                                                <a href={`mailto:${selectedVerification.studentEmail}`} className="text-blue-400 hover:underline">
                                                                    {selectedVerification.studentEmail || 'N/A'}
                                                                </a>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500">Phone Number</p>
                                                                <p className="text-white">{selectedVerification.phoneNumber || 'N/A'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500">School</p>
                                                                <p className="text-white">{selectedVerification.school || 'Laikipia University'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-gray-500">Submitted At</p>
                                                                <p className="text-white">
                                                                    {selectedVerification.submittedAt ?
                                                                        new Date(selectedVerification.submittedAt.seconds * 1000).toLocaleString() : 'N/A'}
                                                                </p>
                                                            </div>
                                                            {selectedVerification.reviewedAt && (
                                                                <div>
                                                                    <p className="text-gray-500">Reviewed At</p>
                                                                    <p className="text-white">
                                                                        {new Date(selectedVerification.reviewedAt).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {selectedVerification.reviewedBy && (
                                                                <div>
                                                                    <p className="text-gray-500">Reviewed By</p>
                                                                    <p className="text-white">{selectedVerification.reviewedBy}</p>
                                                                </div>
                                                            )}
                                                            {selectedVerification.rejectionReason && (
                                                                <div className="col-span-2">
                                                                    <p className="text-gray-500">Rejection Reason</p>
                                                                    <p className="text-white bg-red-500/10 border border-red-500/30 rounded p-2">{selectedVerification.rejectionReason}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Action Buttons */}
                                                    {selectedVerification.status === 'pending' && (
                                                        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                                                            <h4 className="text-purple-400 font-semibold text-sm mb-3">⚡ Quick Actions</h4>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleApproveVerification(selectedVerification)}
                                                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                    Approve Verification
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        const reason = window.prompt('Enter rejection reason (optional):');
                                                                        if (reason !== null) {
                                                                            handleRejectVerification(selectedVerification, reason || 'Invalid registration number');
                                                                        }
                                                                    }}
                                                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                                >
                                                                    <ShieldExclamationIcon className="w-4 h-4" />
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Instructions */}
                                                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                                        <h4 className="text-blue-400 font-semibold text-sm mb-2">ℹ️ Verification Process</h4>
                                                        <ul className="text-blue-100 text-xs space-y-1 list-disc list-inside">
                                                            <li>Verify the registration number format matches university standards</li>
                                                            <li>Cross-check with student database if available</li>
                                                            <li>Approve to grant student full access to submit reports</li>
                                                            <li>Reject with reason if registration number is invalid</li>
                                                            <li>Student will be notified of your decision via email</li>
                                                        </ul>
                                                    </div>
                                                </div>

                                                <div className="sticky bottom-0 bg-[#141728] border-t border-[#252A41] p-5">
                                                    <button
                                                        onClick={() => { setSelectedVerification(null); }}
                                                        className="w-full bg-[#1e2347] hover:bg-[#252A41] text-white font-semibold py-2.5 rounded-lg transition-colors"
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );

                                case 'Map': return (
                                    <div className="h-full flex gap-4">
                                        <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto pr-2">
                                            <div>
                                                <h2 className={`${tok('textPrimary', darkMode)} text-xl font-bold`}>Incident Map</h2>
                                                <p className={`${tok('textSecondary', darkMode)} text-xs mt-0.5`}>Click a report to zoom to exact location</p>
                                            </div>
                                            {allReports.filter(r => r.locationCoords && (r.type?.toLowerCase().includes('sos') || r.type?.toLowerCase().includes('emergency'))).length > 0 && (
                                                <div>
                                                    <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">Active Emergencies</p>
                                                    {allReports.filter(r => r.locationCoords && (r.type?.toLowerCase().includes('sos') || r.type?.toLowerCase().includes('emergency'))).map(r => (
                                                        <div key={r.id} onClick={() => setSelectedReport(r)}
                                                            className={`border-2 p-3 rounded-xl cursor-pointer transition-all mb-2 ${selectedReport?.id === r.id ? 'border-red-400 bg-red-500/20' : 'border-red-500/60 bg-red-500/10 hover:border-red-400'}`}>
                                                            <div className="flex justify-between items-start mb-1">
                                                                <span className="text-red-400 text-xs font-bold">SOS EMERGENCY</span>
                                                                <span className={`${tok('textMuted', darkMode)} text-[10px]`}>{r.createdAt ? new Date(r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                            </div>
                                                            <p className={`${tok('textPrimary', darkMode)} text-sm font-semibold truncate`}>{r.reporterName || 'Unknown'}</p>
                                                            <p className="text-red-300 text-xs truncate">{r.placeName || r.location || 'Location unknown'}</p>
                                                            {r.locationCoords && <p className={`${tok('textMuted', darkMode)} text-[10px] font-mono mt-0.5`}>{r.locationCoords.latitude?.toFixed(6)}, {r.locationCoords.longitude?.toFixed(6)}{r.locationAccuracy ? ` +/-${r.locationAccuracy}` : ''}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <p className={`${tok('textMuted', darkMode)} text-[10px] font-bold uppercase tracking-wider`}>All Reports with GPS</p>
                                            {allReports.filter(r => r.locationCoords && !r.type?.toLowerCase().includes('sos') && !r.type?.toLowerCase().includes('emergency')).map(r => (
                                                <div key={r.id} onClick={() => setSelectedReport(r)}
                                                    className={`${tok('cardBg', darkMode)} border p-3 rounded-xl cursor-pointer transition-colors ${selectedReport?.id === r.id ? 'border-purple-500' : `${tok('cardBorder', darkMode)} hover:border-purple-500/50`}`}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <TypeBadge type={r.type} />
                                                        <span className={`${tok('textMuted', darkMode)} text-[10px]`}>{r.createdAt ? new Date(r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                    </div>
                                                    <p className={`${tok('textPrimary', darkMode)} text-sm font-medium truncate`}>{r.placeName || r.location || 'Unknown'}</p>
                                                    <p className={`${tok('textSecondary', darkMode)} text-xs mt-0.5 truncate`}>{r.description}</p>
                                                    {r.locationCoords && <p className={`${tok('textMuted', darkMode)} text-[10px] font-mono mt-0.5`}>{r.locationCoords.latitude?.toFixed(5)}, {r.locationCoords.longitude?.toFixed(5)}</p>}
                                                </div>
                                            ))}
                                            {allReports.filter(r => r.locationCoords).length === 0 && <p className={`${tok('textSecondary', darkMode)} text-sm`}>No reports with GPS data yet.</p>}
                                        </div>

                                        <div className={`flex-1 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl overflow-hidden relative`}>
                                            {(() => {
                                                const GKEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyAFez_RmaGv2mPlfAwWf1ovWYh-cmQMWow';
                                                const CAMPUS_LAT = 0.035611;
                                                const CAMPUS_LNG = 36.284968;
                                                const pins = allReports.filter(r => r.locationCoords?.latitude).map(r => ({
                                                    lat: r.locationCoords.latitude, lng: r.locationCoords.longitude,
                                                    label: r.reporterName || 'Unknown',
                                                    desc: r.placeName || r.location || '',
                                                    accuracy: r.locationAccuracy || null,
                                                    isSOS: !!(r.type?.toLowerCase().includes('sos') || r.type?.toLowerCase().includes('emergency')),
                                                    isSelected: selectedReport?.id === r.id,
                                                }));
                                                const focusLat = selectedReport?.locationCoords?.latitude ?? CAMPUS_LAT;
                                                const focusLng = selectedReport?.locationCoords?.longitude ?? CAMPUS_LNG;
                                                const zoom = selectedReport?.locationCoords ? 18 : 15;
                                                const pinsJson = JSON.stringify(pins);
                                                const mapHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style></head><body><div id="map"></div><script>var PINS=${pinsJson};function initMap(){var map=new google.maps.Map(document.getElementById('map'),{center:{lat:${focusLat},lng:${focusLng}},zoom:${zoom},mapTypeId:'roadmap',gestureHandling:'greedy',mapTypeControl:true,streetViewControl:false});var iw=new google.maps.InfoWindow();PINS.forEach(function(p){var m=new google.maps.Marker({position:{lat:p.lat,lng:p.lng},map:map,title:p.label,zIndex:p.isSOS?999:1,icon:{path:google.maps.SymbolPath.CIRCLE,scale:p.isSOS?14:10,fillColor:p.isSOS?'#DC2626':p.isSelected?'#7C3AED':'#EA580C',fillOpacity:1,strokeColor:'#fff',strokeWeight:p.isSOS?3:2},animation:p.isSOS?google.maps.Animation.BOUNCE:null});if(p.isSOS&&p.accuracy){new google.maps.Circle({map:map,center:{lat:p.lat,lng:p.lng},radius:parseFloat(p.accuracy)||30,strokeColor:'#DC2626',strokeOpacity:0.6,strokeWeight:1,fillColor:'#DC2626',fillOpacity:0.08});}m.addListener('click',function(){iw.setContent('<div style="font-family:sans-serif;min-width:180px;padding:4px"><b style="color:'+(p.isSOS?'#DC2626':'#1e40af')+'">'+(p.isSOS?'SOS EMERGENCY':'Incident')+'</b><br><b>'+p.label+'</b><br><span style="color:#555">'+p.desc+'</span><br><code style="font-size:11px">'+p.lat.toFixed(6)+', '+p.lng.toFixed(6)+'</code>'+(p.accuracy?'<br><span style="font-size:11px;color:#888">Accuracy: +/-'+p.accuracy+'</span>':'')+'</div>');iw.open(map,m);});if(p.isSelected){google.maps.event.trigger(m,'click');}});}window.gm_authFailure=function(){document.getElementById('map').innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#c00;font-family:sans-serif">Google Maps API key error</div>';};<\/script><script src="https://maps.googleapis.com/maps/api/js?key=${GKEY}&callback=initMap&loading=async" async defer><\/script></body></html>`;
                                                return <iframe key={`map-${selectedReport?.id || 'all'}-${pins.length}`} title="Security Incident Map" srcDoc={mapHtml} width="100%" height="100%" style={{ border: 0, minHeight: '500px' }} sandbox="allow-scripts allow-same-origin" />;
                                            })()}
                                            {selectedReport?.locationCoords && (
                                                <div className={`absolute top-3 left-3 ${darkMode ? 'bg-[#0D1130]/90' : 'bg-white/95'} backdrop-blur-sm border ${tok('cardBorder', darkMode)} rounded-xl p-3 max-w-xs shadow-lg`}>
                                                    <p className={`${tok('textPrimary', darkMode)} text-xs font-bold mb-1`}>{selectedReport.type?.toLowerCase().includes('sos') ? 'SOS EMERGENCY' : 'Selected Incident'}</p>
                                                    <p className={`${tok('textPrimary', darkMode)} text-xs`}>{selectedReport.reporterName}</p>
                                                    <p className={`${tok('textSecondary', darkMode)} text-xs`}>{selectedReport.placeName || selectedReport.location}</p>
                                                    <p className={`${tok('textMuted', darkMode)} text-[10px] font-mono mt-1`}>{selectedReport.locationCoords.latitude?.toFixed(6)}, {selectedReport.locationCoords.longitude?.toFixed(6)}{selectedReport.locationAccuracy ? ` +/-${selectedReport.locationAccuracy}` : ''}</p>
                                                    <a href={`https://www.google.com/maps?q=${selectedReport.locationCoords.latitude},${selectedReport.locationCoords.longitude}&z=18`} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-semibold">
                                                        <MapPinIcon className="w-3 h-3" /> Open in Google Maps
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );

                                case 'Teams': return (
                                    <div className="space-y-6">
                                        <h2 className="text-white text-2xl font-bold">Security Teams</h2>
                                        <div className="grid grid-cols-3 gap-6">
                                            {securityTeam.map(m => (
                                                <div key={m.id} className="bg-[#141728] border border-[#252A41] p-6 rounded-2xl flex items-center gap-4">
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                                                        {m.name ? m.name[0] : '?'}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-white font-bold text-lg">{m.name}</h3>
                                                        <p className="text-gray-400 text-sm">{m.department || 'Security'}</p>
                                                        <div className={`mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-${m.status === 'on_duty' ? 'green' : 'gray'}-500/20 text-${m.status === 'on_duty' ? 'green' : 'gray'}-400`}>
                                                            ● {m.status ? m.status.replace('_', ' ') : 'Unknown'}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );

                                case 'Analytics':
                                    const typeDist = calculateTypeDistribution(allReports);
                                    const trendData = groupReportsByDate(allReports, 14); // 2 weeks
                                    const statusDist = calculateStatusDistribution(allReports);
                                    return (
                                        <div className="space-y-6">
                                            <h2 className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>Detailed Analytics</h2>
                                            <div className="grid grid-cols-4 gap-4">
                                                <StatCard title="Total Reports" value={allReports.length} subtitle="All time" badge="" badgeColor="" icon={ShieldExclamationIcon} iconBg="bg-blue-500/20 text-blue-400" />
                                                <StatCard title="Resolved" value={allReports.filter(r => r.status === 'resolved').length} subtitle="Cases closed" badge="100%" badgeColor="text-green-400 bg-green-500/10 border border-green-500/30" icon={ArrowTrendingUpIcon} iconBg="bg-green-500/20 text-green-400" />
                                                <StatCard title="Avg Response" value={stats.avgResponseTime} subtitle="Target: <5m" badge="OK" badgeColor="text-green-400 bg-green-500/10 border border-green-500/30" icon={ClockIcon} iconBg="bg-purple-500/20 text-purple-400" />
                                                <StatCard title="High Risk" value={stats.highRiskZones} subtitle="Zones monitored" badge="Alert" badgeColor="text-red-400 bg-red-500/10 border border-red-500/30" icon={ExclamationTriangleIcon} iconBg="bg-orange-500/20 text-orange-400" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                {/* Trend Chart */}
                                                <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-6 h-96`}>
                                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-4`}>Incident Trend (14 Days)</h3>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={trendData}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#252A41" : "#e5e7eb"} />
                                                            <XAxis
                                                                dataKey="date"
                                                                stroke={darkMode ? "#9ca3af" : "#6b7280"}
                                                                fontSize={11}
                                                                tickFormatter={(str) => str.slice(5)}
                                                            />
                                                            <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} fontSize={11} />
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: darkMode ? '#1e2347' : '#ffffff',
                                                                    border: `1px solid ${darkMode ? '#252A41' : '#e5e7eb'}`,
                                                                    borderRadius: '8px',
                                                                    color: darkMode ? '#fff' : '#000'
                                                                }}
                                                            />
                                                            <Line
                                                                type="monotone"
                                                                dataKey="count"
                                                                stroke="#8b5cf6"
                                                                strokeWidth={2}
                                                                name="Incidents"
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                {/* Type Distribution */}
                                                <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-6 h-96`}>
                                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold mb-4`}>Incident Types</h3>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={typeDist}
                                                                cx="50%"
                                                                cy="50%"
                                                                labelLine={false}
                                                                label={({ name, percentage }) => `${name}: ${percentage}%`}
                                                                outerRadius={100}
                                                                fill="#8884d8"
                                                                dataKey="count"
                                                            >
                                                                {typeDist.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.name === 'SOS' ? '#ef4444' : '#3b82f6'} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: darkMode ? '#1e2347' : '#ffffff',
                                                                    border: `1px solid ${darkMode ? '#252A41' : '#e5e7eb'}`,
                                                                    borderRadius: '8px',
                                                                    color: darkMode ? '#fff' : '#000'
                                                                }}
                                                            />
                                                            <Legend
                                                                verticalAlign="bottom"
                                                                height={36}
                                                                iconType="circle"
                                                                formatter={(value) => (
                                                                    <span style={{ color: darkMode ? '#fff' : '#000', fontSize: '12px' }}>
                                                                        {value}
                                                                    </span>
                                                                )}
                                                            />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>
                                    );

                                case 'Broadcast': {
                                    const CAMPUS_ZONES_ADMIN = [
                                        { name: 'Table Land', category: 'Residential Area' },
                                        { name: 'Jaffa', category: 'Residential Area' },
                                        { name: 'Alexander Hostels', category: 'Residential Area' },
                                        { name: 'Shamenei', category: 'Residential Area' },
                                        { name: 'Ndoro A Hostels', category: 'Residential Area' },
                                        { name: 'Cherika Junction', category: 'Shopping Center' },
                                        { name: 'Nyumba Tatu', category: 'Shopping Center' },
                                        { name: 'Two Brothers', category: 'Residential Area' },
                                        { name: 'Comrades', category: 'Residential Area' },
                                        { name: 'Tairi Mbili', category: 'Residential Area' },
                                        { name: 'Karuga', category: 'Small Town' },
                                        { name: 'Gavana', category: 'Residential Area' },
                                        { name: 'Security Department', category: 'Security' },
                                        { name: 'Dean of Students Office', category: 'Admin' },
                                        { name: 'Registrar Office', category: 'Admin' },
                                        { name: 'University Hospital', category: 'Medical' },
                                        { name: 'LU Radio', category: 'Communication' },
                                        { name: 'Farm Department', category: 'Landmark' },
                                        { name: 'Mandela Hall', category: 'Hostel' },
                                        { name: 'Sabaki Hostel', category: 'Hostel' },
                                        { name: 'Ngarenarok Hostel', category: 'Hostel' },
                                        { name: 'Malewa Hostel', category: 'Hostel' },
                                        { name: 'Chania Hostel', category: 'Hostel' },
                                        { name: 'Nyando Hostel', category: 'Hostel' },
                                        { name: 'Niger Hostel', category: 'Hostel' },
                                        { name: 'Lake Chacha', category: 'Landmark' },
                                        { name: 'New Library', category: 'Academic' },
                                        { name: 'Vision 2030', category: 'Academic' },
                                        { name: 'Computing & Informatics', category: 'Academic' },
                                        { name: 'Comp Lab', category: 'Academic' },
                                        { name: 'Pavilion', category: 'Landmark' },
                                        { name: 'Football Pitch A', category: 'Sports' },
                                    ];
                                    const catEmoji = {};
                                    const zonesByCat = CAMPUS_ZONES_ADMIN.reduce((acc, z) => { if (!acc[z.category]) acc[z.category] = []; acc[z.category].push(z.name); return acc; }, {});
                                    return (
                                        <div className="max-w-2xl mx-auto space-y-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center shrink-0">
                                                    <MegaphoneIcon className="w-7 h-7 text-orange-400" />
                                                </div>
                                                <div>
                                                    <h2 className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>Send Area Alert</h2>
                                                    <p className={`${tok('textSecondary', darkMode)} text-sm mt-1`}>Broadcast a security alert to all students. Select a campus zone and configure where it appears on their phones.</p>
                                                </div>
                                            </div>
                                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-6 space-y-5`}>
                                                <div>
                                                    <label className={`block ${tok('textPrimary', darkMode)} text-sm font-semibold mb-2`}>Alert Title *</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., Security Incident, Suspicious Activity"
                                                        value={areaAlertForm.title}
                                                        onChange={(e) => setAreaAlertForm({ ...areaAlertForm, title: e.target.value })}
                                                        className={`w-full px-4 py-2.5 ${tok('inputBg', darkMode)} rounded-xl focus:outline-none focus:border-purple-500 text-sm`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={`block ${tok('textPrimary', darkMode)} text-sm font-semibold mb-1`}>
                                                        Area / Location *
                                                        <span className={`ml-2 ${tok('textMuted', darkMode)} text-xs font-normal`}>- select a campus zone</span>
                                                    </label>
                                                    <select
                                                        value={areaAlertForm.area}
                                                        onChange={(e) => setAreaAlertForm({ ...areaAlertForm, area: e.target.value })}
                                                        className={`w-full px-4 py-2.5 ${tok('inputBg', darkMode)} rounded-xl focus:outline-none focus:border-purple-500 text-sm cursor-pointer`}
                                                    >
                                                        <option value="">Select a campus zone...</option>
                                                        <option value="All Campus">All Campus (broadcast everywhere)</option>
                                                        {Object.entries(zonesByCat).map(([cat, names]) => (
                                                            <optgroup key={cat} label={`${catEmoji[cat] || '📍'} ${cat}`}>
                                                                {names.map(name => (
                                                                    <option key={name} value={name}>{name}</option>
                                                                ))}
                                                            </optgroup>
                                                        ))}
                                                    </select>
                                                    {areaAlertForm.area && (
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className="text-xs bg-purple-500/20 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-full font-semibold">{areaAlertForm.area}</span>
                                                            <button type="button" onClick={() => setAreaAlertForm({ ...areaAlertForm, area: '' })} className={`${tok('textMuted', darkMode)} hover:text-purple-400 text-xs`}>✕ clear</button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className={`block ${tok('textPrimary', darkMode)} text-sm font-semibold mb-2`}>Description</label>
                                                    <textarea
                                                        placeholder="Provide more details about the alert..."
                                                        value={areaAlertForm.description}
                                                        onChange={(e) => setAreaAlertForm({ ...areaAlertForm, description: e.target.value })}
                                                        rows={3}
                                                        className={`w-full px-4 py-2.5 ${tok('inputBg', darkMode)} rounded-xl focus:outline-none focus:border-purple-500 resize-none text-sm`}
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={`block ${tok('textPrimary', darkMode)} text-sm font-semibold mb-2`}>Severity</label>
                                                        <select value={areaAlertForm.severity} onChange={(e) => setAreaAlertForm({ ...areaAlertForm, severity: e.target.value })} className={`w-full px-4 py-2.5 ${tok('inputBg', darkMode)} rounded-xl focus:outline-none focus:border-purple-500 text-sm`}>
                                                            <option value="low">Low</option>
                                                            <option value="medium">Medium</option>
                                                            <option value="high">High</option>
                                                            <option value="critical">Critical</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className={`block ${tok('textPrimary', darkMode)} text-sm font-semibold mb-2`}>Expires In</label>
                                                        <select value={areaAlertForm.expiresIn} onChange={(e) => setAreaAlertForm({ ...areaAlertForm, expiresIn: parseInt(e.target.value) })} className={`w-full px-4 py-2.5 ${tok('inputBg', darkMode)} rounded-xl focus:outline-none focus:border-purple-500 text-sm`}>
                                                            <option value={30}>30 minutes</option>
                                                            <option value={60}>1 hour</option>
                                                            <option value={120}>2 hours</option>
                                                            <option value={240}>4 hours</option>
                                                            <option value={480}>8 hours</option>
                                                            <option value={720}>12 hours</option>
                                                            <option value={1440}>24 hours</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Notification Display Targets */}
                                                <div className={`bg-gradient-to-r ${darkMode ? 'from-purple-900/20 to-blue-900/20' : 'from-purple-100 to-blue-100'} border border-purple-500/30 rounded-xl p-4`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className={`${tok('textPrimary', darkMode)} font-bold text-sm`}>Where to show on students' phones</h4>
                                                        <div className="flex gap-2">
                                                            <button type="button" onClick={() => setAreaAlertForm({ ...areaAlertForm, showOnHomeScreen: true, showOnStatusBar: true })} className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold px-2.5 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg transition-colors">✓ All</button>
                                                            <button type="button" onClick={() => setAreaAlertForm({ ...areaAlertForm, showOnHomeScreen: false, showOnStatusBar: false })} className={`text-[11px] ${tok('textSecondary', darkMode)} hover:text-purple-400 font-semibold px-2.5 py-1 ${darkMode ? 'bg-gray-500/10 border-gray-500/30' : 'bg-gray-200 border-gray-300'} border rounded-lg transition-colors`}>✗ None</button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { key: 'showOnHomeScreen', label: 'Home Screen', desc: 'Banner on phone home screen' },
                                                            { key: 'showOnStatusBar', label: 'Status Bar', desc: 'Icon in top status bar' },
                                                        ].map(({ key, label, desc }) => (
                                                            <label key={key} className={`flex items-center gap-3 ${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-lg p-3 cursor-pointer hover:border-purple-500/50 transition-colors`}>
                                                                <input type="checkbox" checked={areaAlertForm[key]} onChange={(e) => setAreaAlertForm({ ...areaAlertForm, [key]: e.target.checked })} className="w-4 h-4 accent-purple-600 shrink-0" />
                                                                <div>
                                                                    <span className={`${tok('textPrimary', darkMode)} text-sm font-semibold`}>{label}</span>
                                                                    <p className={`${tok('textMuted', darkMode)} text-xs`}>{desc}</p>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                                {/* Live preview */}
                                                {areaAlertForm.title && areaAlertForm.area && (
                                                    <div className={`rounded-xl p-4 border ${areaAlertForm.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' : areaAlertForm.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' : areaAlertForm.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                                                        <p className={`${tok('textMuted', darkMode)} text-[10px] uppercase font-bold mb-2`}>Preview - what students will see</p>
                                                        <p className={`${tok('textPrimary', darkMode)} font-bold text-sm`}>Security Alert: {areaAlertForm.area}</p>
                                                        <p className={`${tok('textSecondary', darkMode)} text-xs mt-1`}>{areaAlertForm.title}{areaAlertForm.description ? ' - ' + areaAlertForm.description : ''}</p>
                                                        <p className={`${tok('textMuted', darkMode)} text-[10px] mt-2`}>
                                                            Expires in {areaAlertForm.expiresIn >= 60 ? `${areaAlertForm.expiresIn / 60}h` : `${areaAlertForm.expiresIn}min`}
                                                            {' · '}
                                                            {[areaAlertForm.showOnHomeScreen && 'Home Screen', areaAlertForm.showOnStatusBar && 'Status Bar'].filter(Boolean).join(' · ')}
                                                        </p>
                                                    </div>
                                                )}
                                                <button onClick={sendAreaAlert} disabled={isSubmittingAreaAlert || !areaAlertForm.title || !areaAlertForm.area} className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:opacity-40 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-sm">
                                                    {isSubmittingAreaAlert ? 'Broadcasting...' : 'Broadcast to All Students'}
                                                </button>
                                            </div>
                                            {/* Active area alerts */}
                                            {activeAreaAlerts.length > 0 && (
                                                <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-5`}>
                                                    <h3 className={`${tok('textPrimary', darkMode)} font-bold text-sm mb-3 flex items-center gap-2`}>
                                                        Active Area Alerts
                                                        <span className="ml-auto text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-bold">{activeAreaAlerts.length} live</span>
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {activeAreaAlerts.map(a => (
                                                            <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border ${a.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' : a.severity === 'high' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`${tok('textPrimary', darkMode)} text-xs font-bold`}>{a.title}</p>
                                                                    <p className={`${tok('textSecondary', darkMode)} text-[10px] mt-0.5`}>{a.area}{a.expiresAt && <span className={`ml-2 ${tok('textMuted', darkMode)}`}>· expires {new Date(a.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</p>
                                                                    {a.description && <p className={`${tok('textMuted', darkMode)} text-[10px] mt-0.5`}>{a.description}</p>}
                                                                </div>
                                                                <button onClick={() => handleDeleteAreaAlert(a.id)} className={`shrink-0 p-1.5 ${darkMode ? 'bg-gray-500/20 hover:bg-red-500/20 text-gray-400' : 'bg-gray-200 hover:bg-red-100 text-gray-600'} hover:text-red-400 rounded-lg transition-colors text-xs`} title="Delete">✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                case 'Settings': return (
                                    <div className="max-w-2xl mx-auto space-y-6">
                                        <h2 className={`${tok('textPrimary', darkMode)} text-2xl font-bold`}>Settings</h2>
                                        <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl p-6 space-y-6`}>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className={`${tok('textPrimary', darkMode)} font-semibold`}>Notifications</h3>
                                                    <p className={`${tok('textSecondary', darkMode)} text-sm`}>Receive browser alerts for new reports</p>
                                                </div>
                                                <div className="w-12 h-6 bg-purple-600 rounded-full relative cursor-pointer"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div></div>
                                            </div>
                                            <div className={`border-t ${tok('divider', darkMode)} pt-6`}>
                                                <h3 className={`${tok('textPrimary', darkMode)} font-semibold mb-4`}>Account</h3>
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}><UserCircleIcon className="w-10 h-10" /></div>
                                                    <div>
                                                        <p className={`${tok('textPrimary', darkMode)} font-medium`}>{session?.name || 'Admin User'}</p>
                                                        <p className={`${tok('textMuted', darkMode)} text-sm`}>{session?.email || 'admin@campus.edu'}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                                default: return null;
                            }
                        })()}
                    </div >
                </div >

                {/* Modals */}
                < MapModal report={selectedReport} isOpen={isMapModalOpen} onClose={() => setIsMapModalOpen(false)} dark={darkMode} />
                <MediaViewer mediaUrls={selectedReport?.mediaUrls || []} isOpen={isMediaViewerOpen} onClose={() => setIsMediaViewerOpen(false)} />
                <ReportModal
                    report={selectedReport}
                    isOpen={isReportModalOpen}
                    onClose={() => setIsReportModalOpen(false)}
                    onUpdateStatus={handleUpdateStatus}
                    onMarkHighRisk={handleMarkHighRisk}
                    dark={darkMode}
                />
                <NotificationSystem
                    notifications={notifications}
                    onDismiss={dismissNotification}
                    onNotificationClick={n => {
                        if (n.report) { setSelectedReport(n.report); setIsReportModalOpen(true); }
                        dismissNotification(n.id);
                        setUnreadCount(p => Math.max(0, p - 1));
                    }}
                />

                {/* Team Modal */}
                {
                    showTeamModal && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className={`${tok('cardBg', darkMode)} border ${tok('cardBorder', darkMode)} rounded-2xl shadow-2xl w-full max-w-md`}>
                                <div className={`flex items-center justify-between p-5 border-b ${tok('divider', darkMode)}`}>
                                    <h2 className={`${tok('textPrimary', darkMode)} font-bold text-lg`}>Security Team</h2>
                                    <button onClick={() => setShowTeamModal(false)} className={`${tok('textMuted', darkMode)} hover:text-purple-400 p-1 rounded-lg transition-colors`}>✕</button>
                                </div>
                                <div className="p-5 space-y-3">
                                    <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
                                        {securityTeam.map(member => (
                                            <div key={member.id} className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-[#1e2347]' : 'bg-gray-50'}`}>
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                                    {member.name ? member.name.split(' ').map(n => n[0]).join('') : '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`${tok('textPrimary', darkMode)} text-sm font-semibold`}>{member.name}</p>
                                                    <p className={`${tok('textMuted', darkMode)} text-xs`}>{member.department || 'General Security'}</p>
                                                    <p className={`${tok('textFaint', darkMode) || tok('textMuted', darkMode)} text-[10px]`}>{member.email}</p>
                                                </div>
                                                <span className={`text-xs font-semibold ${member.status === 'on_duty' ? 'text-green-400' : member.status === 'patrolling' ? 'text-blue-400' : 'text-gray-400'}`}>
                                                    ● {member.status ? member.status.replace('_', ' ') : 'Offline'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-5 pt-0">
                                    <button
                                        onClick={() => setShowTeamModal(false)}
                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >
        </ThemeContext.Provider >
    );
};

export default SecurityDashboard;
