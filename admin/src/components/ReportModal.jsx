import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon,
    MapPinIcon,
    ClockIcon,
    UserCircleIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    PhoneIcon,
    IdentificationIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    PhotoIcon,
    CalendarDaysIcon,
    TagIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow, format } from 'date-fns';

// ─── Field Row ────────────────────────────────────────────────────────────────
const Field = ({ label, value, mono = false, accent = false, icon: Icon, dark = true }) => {
    if (!value && value !== 0) return null;
    return (
        <div className="flex flex-col gap-0.5">
            <span className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-[11px] uppercase tracking-wider font-semibold flex items-center gap-1`}>
                {Icon && <Icon className="w-3 h-3" />}
                {label}
            </span>
            <span className={`text-sm break-words ${mono ? 'font-mono' : ''} ${accent ? (dark ? 'text-purple-300 font-bold' : 'text-purple-700 font-bold') : (dark ? 'text-white' : 'text-gray-900')}`}>
                {value}
            </span>
        </div>
    );
};

// ─── Section ──────────────────────────────────────────────────────────────────
const Section = ({ title, icon: Icon, iconColor = 'text-purple-400', children, dark = true }) => (
    <div className={`${dark ? 'bg-[#0D1130] border-[#1e2347]' : 'bg-gray-50 border-gray-200'} rounded-xl p-4 space-y-3 border`}>
        <h3 className={`text-sm font-bold flex items-center gap-2 ${iconColor}`}>
            {Icon && <Icon className="w-4 h-4" />}
            {title}
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {children}
        </div>
    </div>
);

// ─── Status pill ──────────────────────────────────────────────────────────────
const StatusPill = ({ status, dark = true }) => {
    const map = {
        pending: dark ? 'bg-gray-500/20 text-gray-300 border-gray-500/30' : 'bg-gray-100 text-gray-700 border-gray-200',
        responding: dark ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-blue-50 text-blue-700 border-blue-200',
        resolved: dark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200',
        urgent: dark ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200',
        high: dark ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-orange-50 text-orange-700 border-orange-200',
        medium: dark ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border-yellow-200',
        low: dark ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200',
        critical: dark ? 'bg-red-600/30 text-red-200 border-red-600/40' : 'bg-red-100 text-red-800 border-red-200',
    };
    const key = status?.toLowerCase() || 'pending';
    return (
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border uppercase ${map[key] || map.pending}`}>
            {status || 'pending'}
        </span>
    );
};

// ─── Type pill ────────────────────────────────────────────────────────────────
const TypePill = ({ type }) => {
    const t = type?.toLowerCase() || '';
    const isSOS = t.includes('sos') || t.includes('emergency');
    const isMed = t.includes('medical');
    const bg = isSOS ? 'bg-red-600' : isMed ? 'bg-blue-600' : 'bg-purple-600';
    return (
        <span className={`${bg} text-white text-xs font-bold px-3 py-1 rounded-lg uppercase`}>
            {type || 'Report'}
        </span>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ReportModal = ({ report, isOpen, onClose, onUpdateStatus, onMarkHighRisk, dark = true }) => {
    const [notes, setNotes] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusChange = async (newStatus) => {
        setIsUpdating(true);
        await onUpdateStatus(report, newStatus, notes);
        setIsUpdating(false);
        setNotes('');
    };

    const handleMarkHighRisk = async () => {
        if (confirm('Mark this area as high-risk? This will notify users approaching this zone.')) {
            await onMarkHighRisk(report);
        }
    };

    const getDate = () => {
        if (!report?.createdAt) return null;
        return report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
    };

    const date = report ? getDate() : null;

    return (
        <AnimatePresence>
            {isOpen && report && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        onClick={onClose}
                    />

                    {/* Sidebar drawer */}
                    <motion.div
                        key="drawer"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className={`fixed right-0 top-0 h-full w-full max-w-xl z-50 flex flex-col shadow-2xl border-l ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}
                    >
                        {/* ── Header ── */}
                        <div className={`flex items-start justify-between px-5 py-4 border-b shrink-0 ${dark ? 'border-[#252A41]' : 'border-gray-200'}`}>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <TypePill type={report.type} />
                                    <StatusPill status={report.status} dark={dark} />
                                    {report.priority && report.priority !== report.status && (
                                        <StatusPill status={report.priority} dark={dark} />
                                    )}
                                    {report.isHighRisk && (
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border uppercase ${dark ? 'bg-red-600/30 text-red-300 border-red-600/40' : 'bg-red-100 text-red-800 border-red-200'}`}>
                                            ⚠ High Risk
                                        </span>
                                    )}
                                </div>
                                <p className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-xs font-mono`}>
                                    ID: {report.id?.substring(0, 16)}…
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className={`p-1.5 rounded-lg transition-colors shrink-0 ml-3 ${dark ? 'hover:bg-[#252A41]' : 'hover:bg-gray-100'}`}
                            >
                                <XMarkIcon className={`h-5 w-5 ${dark ? 'text-gray-400' : 'text-gray-500'}`} />
                            </button>
                        </div>

                        {/* ── Scrollable body ── */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                            {/* Timestamp banner */}
                            {date && (
                                <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${dark ? 'bg-[#0D1130] border-[#1e2347]' : 'bg-gray-50 border-gray-200'}`}>
                                    <CalendarDaysIcon className={`w-4 h-4 shrink-0 ${dark ? 'text-gray-500' : 'text-gray-500'}`} />
                                    <div>
                                        <p className={`${dark ? 'text-white' : 'text-gray-900'} text-sm font-semibold`}>
                                            {format(date, 'dd MMM yyyy, HH:mm:ss')}
                                        </p>
                                        <p className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-xs`}>
                                            {formatDistanceToNow(date, { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Reporter */}
                            <Section title="Reporter" icon={UserCircleIcon} iconColor="text-blue-400" dark={dark}>
                                <Field label="Full Name" value={report.reporterName || report.studentName || 'Anonymous'} icon={UserCircleIcon} dark={dark} />
                                <Field label="Email" value={report.reporterEmail || report.studentEmail} icon={EnvelopeIcon} dark={dark} />
                                <Field label="Reg No." value={report.regNo || report.regNumber} mono accent icon={IdentificationIcon} dark={dark} />
                                <Field label="Phone" value={report.phone || report.reporterPhone} icon={PhoneIcon} dark={dark} />
                                <Field label="Role" value={report.reporterRole} dark={dark} />
                                <Field
                                    label="Reg Verified"
                                    value={
                                        report.isRegNumberVerified === true ? '✅ Verified' :
                                            report.isRegNumberVerified === false ? '⏳ Pending' :
                                                (report.regNo ? '⏳ Pending' : undefined)
                                    }
                                    dark={dark}
                                />
                            </Section>

                            {/* Location */}
                            <Section title="Location" icon={MapPinIcon} iconColor="text-green-400" dark={dark}>
                                <div className="col-span-2">
                                    <span className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-[11px] uppercase tracking-wider font-semibold`}>Campus Zone</span>
                                    <p className={`${dark ? 'text-green-300' : 'text-green-700'} font-bold text-base mt-0.5`}>
                                        📍 {report.placeName || report.campusZone || report.location || 'Not provided'}
                                    </p>
                                    {report.campusZoneCategory && (
                                        <p className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-xs mt-0.5`}>{report.campusZoneCategory}</p>
                                    )}
                                </div>
                                {report.locationCoords?.latitude && (
                                    <div className="col-span-2">
                                        <span className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-[11px] uppercase tracking-wider font-semibold`}>GPS Coordinates</span>
                                        <p className={`${dark ? 'text-gray-400' : 'text-gray-600'} font-mono text-xs mt-0.5`}>
                                            {Number(report.locationCoords.latitude).toFixed(6)}, {Number(report.locationCoords.longitude).toFixed(6)}
                                        </p>
                                    </div>
                                )}
                                {report.locationAccuracy && (
                                    <Field label="GPS Accuracy" value={report.locationAccuracy} dark={dark} />
                                )}
                            </Section>

                            {/* Incident Details */}
                            <Section title="Incident Details" icon={DocumentTextIcon} iconColor="text-yellow-400" dark={dark}>
                                <Field label="Category" value={report.categoryLabel || report.category} icon={TagIcon} dark={dark} />
                                <Field label="Sub-category" value={report.subCategory} dark={dark} />
                                <Field label="Hostel" value={report.hostelName} dark={dark} />
                                <Field label="Room" value={report.roomNumber} dark={dark} />
                                <Field label="OB Number" value={report.obNumber} mono dark={dark} />
                                <Field label="Assigned To" value={report.assignedTo} dark={dark} />
                                {report.description && (
                                    <div className="col-span-2">
                                        <span className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-[11px] uppercase tracking-wider font-semibold`}>Description</span>
                                        <p className={`${dark ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 leading-relaxed whitespace-pre-wrap`}>
                                            {report.description}
                                        </p>
                                    </div>
                                )}
                            </Section>

                            {/* Action Needed */}
                            {report.actionNeeded && (
                                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
                                    <h3 className="text-orange-400 text-sm font-bold flex items-center gap-2 mb-2">
                                        <ExclamationTriangleIcon className="w-4 h-4" />
                                        Action Needed
                                    </h3>
                                    <p className="text-orange-200 text-sm">{report.actionNeeded}</p>
                                </div>
                            )}

                            {/* Resolution */}
                            {(report.notes || report.resolvedAt) && (
                                <Section title="Resolution" icon={CheckCircleIcon} iconColor="text-green-400" dark={dark}>
                                    {report.resolvedAt && (
                                        <Field
                                            label="Resolved At"
                                            value={format(new Date(report.resolvedAt), 'dd MMM yyyy, HH:mm')}
                                            icon={ClockIcon}
                                            dark={dark}
                                        />
                                    )}
                                    {report.notes && (
                                        <div className="col-span-2">
                                            <span className={`${dark ? 'text-gray-500' : 'text-gray-500'} text-[11px] uppercase tracking-wider font-semibold`}>Notes</span>
                                            <p className={`${dark ? 'text-gray-200' : 'text-gray-800'} text-sm mt-1 whitespace-pre-wrap`}>{report.notes}</p>
                                        </div>
                                    )}
                                </Section>
                            )}

                            {/* Media Evidence */}
                            {report.mediaUrls?.length > 0 && (
                                <div className={`${dark ? 'bg-[#0D1130] border-[#1e2347]' : 'bg-gray-50 border-gray-200'} rounded-xl p-4 border`}>
                                    <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 mb-3">
                                        <PhotoIcon className="w-4 h-4" />
                                        Evidence ({report.mediaUrls.length} file{report.mediaUrls.length !== 1 ? 's' : ''})
                                    </h3>
                                    <div className="grid grid-cols-3 gap-2">
                                        {report.mediaUrls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                className={`aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity block ${dark ? 'bg-[#1e2347]' : 'bg-white border border-gray-200'}`}>
                                                <img src={url} alt={`Evidence ${i + 1}`}
                                                    className="w-full h-full object-cover"
                                                    onError={e => { e.target.style.display = 'none'; }}
                                                />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Add notes textarea (only when not resolved) */}
                            {report.status !== 'resolved' && (
                                <div>
                                    <label className={`block ${dark ? 'text-gray-400' : 'text-gray-600'} text-xs font-semibold uppercase tracking-wider mb-2`}>
                                        Add Notes (optional)
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Add notes about this status update..."
                                        className={`w-full px-3 py-2.5 border text-sm rounded-xl focus:border-purple-500 focus:outline-none resize-none ${dark ? 'bg-[#0D1130] border-[#252A41] text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                                        rows={3}
                                    />
                                </div>
                            )}
                        </div>

                        {/* ── Footer actions ── */}
                        <div className={`px-5 py-4 border-t shrink-0 space-y-2 ${dark ? 'border-[#252A41]' : 'border-gray-200'}`}>
                            <div className="flex flex-wrap gap-2">
                                {report.status === 'pending' && (
                                    <button
                                        onClick={() => handleStatusChange('responding')}
                                        disabled={isUpdating}
                                        className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
                                    >
                                        {isUpdating ? 'Updating…' : '🚨 Mark Responding'}
                                    </button>
                                )}
                                {report.status === 'responding' && (
                                    <button
                                        onClick={() => handleStatusChange('resolved')}
                                        disabled={isUpdating}
                                        className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
                                    >
                                        {isUpdating ? 'Updating…' : '✅ Mark Resolved'}
                                    </button>
                                )}
                                {report.status !== 'resolved' && (
                                    <button
                                        onClick={handleMarkHighRisk}
                                        className={`px-4 py-2.5 border text-sm font-bold rounded-xl transition-colors ${dark ? 'bg-red-600/20 hover:bg-red-600 border-red-600/40 text-red-300 hover:text-white' : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700'}`}
                                    >
                                        ⚠ High Risk
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className={`px-4 py-2.5 text-sm font-bold rounded-xl transition-colors ${dark ? 'bg-[#252A41] hover:bg-[#1e2347] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
                                >
                                    Close
                                </button>
                            </div>
                            {report.status === 'resolved' && (
                                <p className={`${dark ? 'text-green-400' : 'text-green-700'} text-xs text-center flex items-center justify-center gap-1`}>
                                    <CheckCircleIcon className="w-3.5 h-3.5" /> This report has been resolved
                                </p>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ReportModal;
