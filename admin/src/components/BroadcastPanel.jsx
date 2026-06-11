/**
 * BroadcastPanel.jsx
 * Full-width desktop broadcast panel for the Medical Dashboard.
 * Left column: compose form. Right column: active broadcasts.
 * Location dropdown uses the same CAMPUS_ZONES as placeIntelligenceService.ts
 */
import { useState, useEffect } from 'react';
import {
    BellAlertIcon, ArrowPathIcon, CheckCircleIcon,
    ExclamationTriangleIcon, XMarkIcon, ClockIcon,
    MapPinIcon, UserGroupIcon, FunnelIcon, MegaphoneIcon,
} from '@heroicons/react/24/outline';
import {
    broadcastAdvisory, listenToAdvisories, expireAdvisory,
} from '../services/riskService';

// ─── Campus zones (mirrors mobile/services/placeIntelligenceService.ts) ───────
const CAMPUS_ZONES = [
    // External
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
    // Admin & Safety
    { name: 'Security Department', category: 'Security' },
    { name: 'Dean of Students Office', category: 'Admin' },
    { name: 'Registrar Office', category: 'Admin' },
    { name: 'University Hospital', category: 'Medical' },
    { name: 'LU Radio', category: 'Communication' },
    { name: 'Farm Department', category: 'Landmark' },
    // Hostels
    { name: 'Mandela Hall', category: 'Hostel' },
    { name: 'Sabaki Hostel', category: 'Hostel' },
    { name: 'Ngarenarok Hostel', category: 'Hostel' },
    { name: 'Malewa Hostel', category: 'Hostel' },
    { name: 'Chania Hostel', category: 'Hostel' },
    { name: 'Nyando Hostel', category: 'Hostel' },
    { name: 'Niger Hostel', category: 'Hostel' },
    { name: 'Lake Chacha', category: 'Landmark' },
    // Academic
    { name: 'New Library', category: 'Academic' },
    { name: 'Vision 2030', category: 'Academic' },
    { name: 'Computing & Informatics', category: 'Academic' },
    { name: 'Comp Lab', category: 'Academic' },
    { name: 'Pavilion', category: 'Landmark' },
    { name: 'Football Pitch A', category: 'Sports' },
];

const CATEGORY_EMOJI = {
    'Residential Area': '🏘️', 'Shopping Center': '🛒', 'Small Town': '🏙️',
    'Security': '🛡️', 'Admin': '🏛️', 'Medical': '🏥', 'Communication': '📡',
    'Landmark': '📍', 'Hostel': '🏠', 'Academic': '📚', 'Sports': '⚽',
};

const ZONES_BY_CATEGORY = CAMPUS_ZONES.reduce((acc, z) => {
    if (!acc[z.category]) acc[z.category] = [];
    acc[z.category].push(z.name);
    return acc;
}, {});

// ─── Severity config ──────────────────────────────────────────────────────────
const SEV = {
    info: { label: 'Info', icon: '💡', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', btn: 'bg-blue-600' },
    warning: { label: 'Warning', icon: '⚠️', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', btn: 'bg-yellow-600' },
    critical: { label: 'Critical', icon: '🚨', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', btn: 'bg-red-600' },
};

// ─── Quick templates ──────────────────────────────────────────────────────────
const TEMPLATES = [
    { severity: 'warning', text: '⚠️ Many cases of Typhoid reported. Avoid street food. Eat properly cooked meals.' },
    { severity: 'warning', text: '⚠️ Flu cases rising on campus. Wash hands frequently. Wear a mask if coughing.' },
    { severity: 'critical', text: '🚨 Cholera outbreak suspected. Drink ONLY boiled/bottled water. Report any diarrhea to the clinic.' },
    { severity: 'info', text: '💡 Free health checkup at campus clinic this week. Monday–Friday, 9AM–4PM.' },
    { severity: 'warning', text: '⚠️ Food poisoning reported from Cafeteria B. Avoid eating there until further notice.' },
    { severity: 'info', text: '💡 COVID-19 boosters available at campus clinic. Bring your student ID.' },
    { severity: 'critical', text: '🚨 Meningitis alert. Seek immediate medical attention if you have severe headache, stiff neck, or fever.' },
];

// ─── Active alert card ────────────────────────────────────────────────────────
function AlertCard({ alert, onExpire, expiring, dark }) {
    const sev = SEV[alert.severity] || SEV.info;
    const ts = alert.createdAt?.seconds
        ? new Date(alert.createdAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Just now';
    const expiresTs = alert.expiresAt?.seconds
        ? new Date(alert.expiresAt.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : null;

    return (
        <div className={`rounded-xl border p-4 ${sev.bg} ${sev.border} transition-all`}>
            <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">{sev.icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.bg} ${sev.border} ${sev.text}`}>
                            {sev.label.toUpperCase()}
                        </span>
                        {alert.targetLocation && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                <MapPinIcon className="w-3 h-3" />{alert.targetLocation}
                            </span>
                        )}
                        {alert.targetAudience === 'all' && (
                            <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                                <UserGroupIcon className="w-3 h-3" />All Students
                            </span>
                        )}
                        <span className="text-gray-600 text-[10px] ml-auto">{ts}</span>
                    </div>
                    <p className={`text-sm leading-relaxed ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{alert.message}</p>
                    {expiresTs && (
                        <p className="text-gray-600 text-[10px] mt-1.5 flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />Expires {expiresTs}
                        </p>
                    )}
                </div>
                <button
                    onClick={() => onExpire(alert.id)}
                    disabled={expiring === alert.id}
                    className="shrink-0 p-1.5 bg-gray-500/20 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                    title="Expire this alert"
                >
                    {expiring === alert.id
                        ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        : <XMarkIcon className="w-3.5 h-3.5" />}
                </button>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BroadcastPanel({ session, outbreaks = [], dark = true }) {
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('warning');
    const [targetAudience, setTargetAudience] = useState('all');
    const [targetLocation, setTargetLocation] = useState('');
    const [expiresIn, setExpiresIn] = useState('24');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [activeAlerts, setActiveAlerts] = useState([]);
    const [expiring, setExpiring] = useState(null);
    const [showTemplates, setShowTemplates] = useState(false);

    useEffect(() => {
        const unsub = listenToAdvisories(setActiveAlerts);
        return () => unsub();
    }, []);

    const handleSend = async () => {
        if (!message.trim()) {
            alert('Please enter a message');
            return;
        }

        if (targetAudience === 'location' && !targetLocation) {
            alert('Please select a target location');
            return;
        }

        setSending(true);
        try {
            console.log('📢 Broadcasting health advisory:', {
                message: message.trim(),
                severity,
                targetAudience,
                targetLocation: targetAudience === 'location' ? targetLocation : null,
                expiresIn: expiresIn + ' hours',
            });

            await broadcastAdvisory(message.trim(), severity, session?.uid, {
                targetAudience,
                targetLocation: targetAudience === 'location' ? targetLocation : null,
                expiresAt: new Date(Date.now() + parseInt(expiresIn) * 3600000),
            });

            console.log('✅ Health advisory broadcast successfully');
            setMessage('');
            setTargetLocation('');
            setSent(true);
            setTimeout(() => setSent(false), 4000);
        } catch (e) {
            console.error('❌ Broadcast failed:', e);
            const errorMessage = e?.message || 'Unknown error';

            if (errorMessage.includes('permission') || errorMessage.includes('PERMISSION_DENIED')) {
                alert('Permission denied. Please ensure you have medical admin privileges.');
            } else if (errorMessage.includes('network')) {
                alert('Network error. Please check your internet connection and try again.');
            } else {
                alert(`Failed to send broadcast: ${errorMessage}\n\nPlease try again or contact support.`);
            }
        } finally {
            setSending(false);
        }
    };

    const handleExpire = async (id) => {
        setExpiring(id);
        try { await expireAdvisory(id); }
        catch (e) { console.error('Expire failed:', e); }
        finally { setExpiring(null); }
    };

    const applyTemplate = (t) => {
        setMessage(t.text);
        setSeverity(t.severity);
        setShowTemplates(false);
    };

    const sev = SEV[severity] || SEV.warning;
    const canSend = message.trim().length > 0 && message.length <= 500 &&
        (targetAudience === 'all' || targetLocation);

    return (
        // Two-column desktop layout: compose (left) + active alerts (right)
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">

            {/* ── LEFT: Compose ── */}
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                        <MegaphoneIcon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className={`font-bold text-base ${dark ? 'text-white' : 'text-gray-900'}`}>Compose Broadcast</h3>
                        <p className="text-gray-500 text-xs">Send a health advisory to students in real-time</p>
                    </div>
                </div>

                {/* Severity */}
                <div className={`border rounded-2xl p-4 space-y-3 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Severity Level</p>
                    <div className="grid grid-cols-3 gap-2">
                        {Object.entries(SEV).map(([key, cfg]) => (
                            <button key={key} onClick={() => setSeverity(key)}
                                className={`py-2.5 rounded-xl text-sm font-bold border transition-all flex items-center justify-center gap-2 ${severity === key
                                    ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                                    : 'border-[#252A41] text-gray-500 hover:text-gray-300 hover:border-gray-500'
                                    }`}>
                                {cfg.icon} {cfg.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Target audience + location */}
                <div className={`border rounded-2xl p-4 space-y-3 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Target Audience</p>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setTargetAudience('all')}
                            className={`py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${targetAudience === 'all'
                                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                : 'border-[#252A41] text-gray-500 hover:text-gray-300'
                                }`}>
                            <UserGroupIcon className="w-4 h-4" /> All Students
                        </button>
                        <button onClick={() => setTargetAudience('location')}
                            className={`py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${targetAudience === 'location'
                                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                : 'border-[#252A41] text-gray-500 hover:text-gray-300'
                                }`}>
                            <MapPinIcon className="w-4 h-4" /> Specific Zone
                        </button>
                    </div>

                    {/* Location dropdown */}
                    {targetAudience === 'location' && (
                        <div className="space-y-2">
                            <select value={targetLocation} onChange={e => setTargetLocation(e.target.value)}
                                className={`w-full border focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm focus:outline-none cursor-pointer ${dark ? 'bg-[#0D1130] border-[#252A41] text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                <option value="">📍 Select a campus zone…</option>
                                <option value="All Campus">🏫 All Campus (broadcast everywhere)</option>
                                {Object.entries(ZONES_BY_CATEGORY).map(([cat, names]) => (
                                    <optgroup key={cat} label={`${CATEGORY_EMOJI[cat] || '📍'} ${cat}`}>
                                        {names.map(name => <option key={name} value={name}>{name}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                            {targetLocation && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-2.5 py-1 rounded-full font-semibold">
                                        📍 {targetLocation}
                                    </span>
                                    <button onClick={() => setTargetLocation('')} className="text-gray-500 hover:text-gray-300 text-xs">✕ clear</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Expiry + templates row */}
                <div className={`border rounded-2xl p-4 space-y-3 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                            <ClockIcon className="w-4 h-4 text-gray-500 shrink-0" />
                            <span className="text-gray-400 text-xs whitespace-nowrap">Auto-expire:</span>
                            <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                                className={`flex-1 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500 ${dark ? 'bg-[#0D1130] border-[#252A41] text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                <option value="6">6 hours</option>
                                <option value="12">12 hours</option>
                                <option value="24">24 hours</option>
                                <option value="48">48 hours</option>
                                <option value="72">3 days</option>
                                <option value="168">1 week</option>
                            </select>
                        </div>
                        <button onClick={() => setShowTemplates(v => !v)}
                            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                            <FunnelIcon className="w-3.5 h-3.5" />
                            {showTemplates ? 'Hide' : 'Templates'}
                        </button>
                    </div>

                    {showTemplates && (
                        <div className="space-y-1.5 pt-1">
                            <p className="text-gray-500 text-[10px] font-semibold uppercase">Quick Templates</p>
                            {TEMPLATES.map((t, i) => {
                                const cfg = SEV[t.severity];
                                return (
                                    <button key={i} onClick={() => applyTemplate(t)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs ${cfg.bg} ${cfg.border} border transition-all hover:opacity-80`}>
                                        <span className={cfg.text}>{t.text}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Outbreak suggestions */}
                {outbreaks.length > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                        <p className="text-orange-400 text-xs font-bold uppercase mb-2">🦠 Suggested from Detected Outbreaks</p>
                        <div className="space-y-1.5">
                            {outbreaks.slice(0, 3).map((ob, i) => (
                                <button key={i} onClick={() => {
                                    setMessage(`⚠️ ${ob.label} alert: ${ob.count} cases reported at ${ob.topLocation}. Please take precautions and visit the clinic if you have symptoms.`);
                                    setSeverity(ob.severity === 'Critical' ? 'critical' : 'warning');
                                }}
                                    className="w-full text-left px-3 py-2 bg-orange-500/10 rounded-lg text-xs text-orange-300 hover:bg-orange-500/20 transition-colors">
                                    <span className="font-bold">{ob.label}</span>: {ob.count} cases · {ob.topLocation}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message textarea */}
                <div className={`border rounded-2xl p-4 space-y-3 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Message</p>
                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                        placeholder="Type your health advisory message for students…"
                        rows={5}
                        className={`w-full border focus:border-indigo-500 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none leading-relaxed ${dark ? 'bg-[#0D1130] border-[#252A41] text-white placeholder-gray-600' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
                    />
                    <div className="flex items-center justify-between">
                        <span className={`text-xs ${message.length > 450 ? 'text-orange-500' : dark ? 'text-gray-600' : 'text-gray-400'}`}>{message.length}/500 chars</span>
                        <span className={`text-xs ${dark ? 'text-gray-600' : 'text-gray-400'}`}>📱 Push notification + 🏠 Home screen banner</span>
                    </div>
                </div>

                {/* Preview */}
                {message.trim() && (
                    <div className={`rounded-2xl border p-4 ${sev.bg} ${sev.border}`}>
                        <p className="text-gray-400 text-[10px] font-bold uppercase mb-2">Preview — what students will see</p>
                        <div className="flex items-start gap-2">
                            <span className="text-lg">{sev.icon}</span>
                            <div>
                                <p className={`text-xs font-bold ${sev.text} mb-1`}>
                                    Campus Health Advisory
                                    {targetAudience === 'location' && targetLocation ? ` · ${targetLocation}` : ''}
                                </p>
                                <p className={`text-sm leading-relaxed ${dark ? 'text-gray-200' : 'text-gray-800'}`}>{message}</p>
                                <p className="text-gray-500 text-[10px] mt-1.5">
                                    Expires in {expiresIn}h · {targetAudience === 'all' ? 'All students' : targetLocation || 'Selected zone'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={sending || !canSend}
                    className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${sent
                        ? 'bg-green-600 text-white shadow-green-500/20'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white disabled:opacity-40 shadow-indigo-500/20'
                        }`}>
                    {sending
                        ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Broadcasting to students…</>
                        : sent
                            ? <><CheckCircleIcon className="w-5 h-5" /> Sent successfully!</>
                            : <><BellAlertIcon className="w-5 h-5" /> Broadcast to {targetAudience === 'all' ? 'All Students' : targetLocation || 'Selected Zone'}</>}
                </button>
            </div>

            {/* ── RIGHT: Active broadcasts ── */}
            <div className="flex flex-col gap-4 overflow-hidden">
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />
                        <h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Active Broadcasts</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${activeAlerts.length > 0
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 animate-pulse'
                            : 'bg-gray-500/20 text-gray-500 border-gray-500/30'
                            }`}>
                            {activeAlerts.length} active
                        </span>
                    </div>
                    <span className="text-gray-600 text-xs flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Real-time
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {activeAlerts.length === 0 ? (
                        <div className={`h-full flex flex-col items-center justify-center gap-3 text-center py-16 rounded-2xl border ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                            <CheckCircleIcon className="w-12 h-12 text-green-600/50" />
                            <p className={`font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>No Active Broadcasts</p>
                            <p className="text-gray-500 text-sm max-w-xs">All clear — no current health advisories. Use the form to send one.</p>
                        </div>
                    ) : (
                        activeAlerts.map(alert => (
                            <AlertCard
                                key={alert.id}
                                alert={alert}
                                onExpire={handleExpire}
                                expiring={expiring}
                                dark={dark}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
