import React, { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
    ExclamationTriangleIcon, ShieldExclamationIcon,
    CheckCircleIcon, ArrowPathIcon, BellAlertIcon,
} from '@heroicons/react/24/outline';
import { resolveAlert, createHealthAlert, broadcastAdvisory } from '../services/riskService';


// ─── Severity config ───────────────────────────────────────────────────────────
const SEV = {
    Critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' },
    High: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', dot: 'bg-orange-500' },
    Medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
    Low: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', dot: 'bg-blue-500' },
};

// ─── Custom tooltip for chart ─────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label, dark = true }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className={`border rounded-xl p-3 text-xs shadow-xl ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
            <p className={`font-bold mb-1 ${dark ? 'text-white' : 'text-gray-900'}`}>{label}</p>
            <p className="text-blue-500">Total: <span className="font-bold">{payload[0]?.value}</span></p>
            {payload[1]?.value > 0 && <p className="text-red-500">Critical: <span className="font-bold">{payload[1]?.value}</span></p>}
        </div>
    );
};

// ─── Outbreak alert card ───────────────────────────────────────────────────────
const OutbreakCard = ({ outbreak, onCreateAlert, creating, dark }) => {
    const sev = SEV[outbreak.severity] || SEV.Medium;
    return (
        <div className={`p-3 rounded-xl border ${sev.bg} ${sev.border}`}>
            <div className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${sev.dot}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-bold ${sev.text}`}>{outbreak.label}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.bg} ${sev.border} ${sev.text}`}>
                            {outbreak.severity}
                        </span>
                    </div>
                    <p className="text-gray-400 text-xs mt-0.5">
                        <strong className={dark ? 'text-white' : 'text-gray-900'}>{outbreak.count}</strong> cases · {outbreak.topLocation}
                    </p>
                </div>
            </div>
            <button
                onClick={() => onCreateAlert(outbreak)}
                disabled={creating === outbreak.keyword}
                className={`mt-2 w-full py-1.5 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${dark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
                {creating === outbreak.keyword
                    ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    : <BellAlertIcon className="w-3.5 h-3.5" />}
                Create Health Alert
            </button>
        </div>
    );
};

// ─── Active alert banner ───────────────────────────────────────────────────────
const ActiveAlertBanner = ({ alert, onResolve, resolving }) => {
    const sev = SEV[alert.severity] || SEV.Medium;
    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${sev.bg} ${sev.border}`}>
            <ExclamationTriangleIcon className={`w-5 h-5 shrink-0 ${sev.text}`} />
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${sev.text}`}>{alert.title}</p>
                <p className="text-gray-400 text-xs truncate">{alert.casesDetected} cases · {alert.location}</p>
            </div>
            <button
                onClick={() => onResolve(alert.id)}
                disabled={resolving === alert.id}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
                {resolving === alert.id
                    ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircleIcon className="w-3.5 h-3.5" />}
                Resolve
            </button>
        </div>
    );
};

// ─── Advisory Broadcast Form ───────────────────────────────────────────────────
// Writes to health_advisories. Mobile app subscribes to that collection
// and triggers a local push notification for every new active advisory.
const AdvisoryBroadcastForm = ({ session, dark = true }) => {
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState('warning');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    // Notification display targets
    const [notificationTargets, setNotificationTargets] = useState({
        showOnHomeScreen: true,
        showOnStatusBar: true,
        showOnNotificationShade: true,
        showOnLockScreen: true,
        showInNotificationCenter: true,
    });

    const handleSend = async () => {
        if (!message.trim()) return;
        setSending(true);
        try {
            await broadcastAdvisory(message.trim(), severity, session?.uid, notificationTargets);
            setMessage('');
            setSent(true);
            setTimeout(() => setSent(false), 3000);
        } catch (e) {
            console.error('Advisory broadcast failed:', e);
        } finally {
            setSending(false);
        }
    };

    const severities = [
        { value: 'info', label: 'Info', color: 'bg-blue-600/30 border-blue-500/50 text-blue-300' },
        { value: 'warning', label: 'Warning', color: 'bg-yellow-600/30 border-yellow-500/50 text-yellow-300' },
        { value: 'critical', label: 'Critical', color: 'bg-red-600/30 border-red-500/50 text-red-300' },
    ];

    return (
        <div className={`border border-indigo-500/20 rounded-2xl p-5 ${dark ? 'bg-[#141728]' : 'bg-white'}`}>
            <div className="flex items-center gap-2 mb-4">
                <BellAlertIcon className="w-5 h-5 text-indigo-500" />
                <h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Broadcast Health Advisory</h3>
                <span className="ml-auto text-[10px] px-2 py-0.5 bg-indigo-500/20 text-indigo-500 border border-indigo-500/30 rounded-full font-bold">ALL STUDENTS</span>
            </div>
            <div className="flex gap-2 mb-3">
                {severities.map(s => (
                    <button key={s.value} onClick={() => setSeverity(s.value)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${severity === s.value ? s.color : dark ? 'border-[#252A41] text-gray-500 hover:text-gray-300' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                        {s.label}
                    </button>
                ))}
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Type a health advisory message for all students..."
                rows={3}
                className={`w-full border focus:border-indigo-500/50 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none mb-3 ${dark ? 'bg-[#0D1130] border-[#252A41] text-white placeholder-gray-600' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'}`}
            />
            <div className={`border border-indigo-500/30 rounded-xl p-3 mb-3 ${dark ? 'bg-gradient-to-r from-indigo-900/20 to-purple-900/20' : 'bg-indigo-50'}`}>
                <h4 className={`font-bold text-xs mb-2 flex items-center gap-1 ${dark ? 'text-white' : 'text-gray-900'}`}>📱 Notification Display Targets</h4>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { key: 'showOnHomeScreen', label: '🏠 Home Screen' },
                        { key: 'showOnStatusBar', label: '📶 Status Bar' },
                        { key: 'showOnNotificationShade', label: '🔔 Shade' },
                        { key: 'showOnLockScreen', label: '🔒 Lock Screen' },
                    ].map(({ key, label }) => (
                        <label key={key} className={`flex items-center gap-2 border rounded-lg p-2 cursor-pointer hover:border-indigo-500/50 transition-colors ${dark ? 'bg-[#0D1130] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                            <input type="checkbox" checked={notificationTargets[key]} onChange={e => setNotificationTargets({ ...notificationTargets, [key]: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-600" />
                            <span className={`text-[10px] font-semibold ${dark ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                        </label>
                    ))}
                    <label className={`flex items-center gap-2 border rounded-lg p-2 cursor-pointer hover:border-indigo-500/50 transition-colors col-span-2 ${dark ? 'bg-[#0D1130] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                        <input type="checkbox" checked={notificationTargets.showInNotificationCenter} onChange={e => setNotificationTargets({ ...notificationTargets, showInNotificationCenter: e.target.checked })} className="w-3.5 h-3.5 accent-indigo-600" />
                        <span className={`text-[10px] font-semibold ${dark ? 'text-white' : 'text-gray-700'}`}>🛎️ App Notification Center</span>
                    </label>
                </div>
            </div>
            <button onClick={handleSend} disabled={sending || !message.trim()}
                className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2">
                {sending ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Broadcasting...</>
                    : sent ? '✅ Advisory Sent!'
                        : <><BellAlertIcon className="w-4 h-4" /> Broadcast to All Students</>}
            </button>
        </div>
    );

};

// ─── Main Component ────────────────────────────────────────────────────────────
const RiskDashboardPanel = ({ chartData = [], outbreaks = [], healthAlerts = [], session, dark = true }) => {
    const [resolving, setResolving] = useState(null);
    const [creating, setCreating] = useState(null);

    const handleResolve = async (alertId) => {
        setResolving(alertId);
        try { await resolveAlert(alertId); }
        catch (e) { console.error(e); }
        finally { setResolving(null); }
    };

    const handleCreateAlert = async (outbreak) => {
        setCreating(outbreak.keyword);
        try {
            await createHealthAlert({
                title: `${outbreak.label} Outbreak Warning`,
                severity: outbreak.severity,
                location: outbreak.topLocation,
                casesDetected: outbreak.count,
                keyword: outbreak.keyword,
            }, session?.uid);
        } catch (e) { console.error(e); }
        finally { setCreating(null); }
    };

    const maxVal = Math.max(...chartData.map(d => d.count), 1);

    return (
        <div className="space-y-5">
            {/* Active health alerts */}
            {healthAlerts.length > 0 && (
                <div className={`border rounded-2xl p-5 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <ShieldExclamationIcon className="w-5 h-5 text-red-500" />
                        <h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Active Health Alerts</h3>
                        <span className="ml-auto text-[10px] px-2 py-0.5 bg-red-500/20 text-red-500 border border-red-500/30 rounded-full font-bold">{healthAlerts.length} active</span>
                    </div>
                    <div className="space-y-2">
                        {healthAlerts.map(alert => <ActiveAlertBanner key={alert.id} alert={alert} onResolve={handleResolve} resolving={resolving} />)}
                    </div>
                </div>
            )}

            {/* Weekly trend chart */}
            <div className={`border rounded-2xl p-5 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Weekly Illness Trend</h3>
                    <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Last 7 days</span>
                </div>
                {chartData.every(d => d.count === 0) ? (
                    <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
                        <CheckCircleIcon className="w-8 h-8 text-green-600" />
                        <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>No medical reports this week</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={chartData} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#1e2347' : '#e5e7eb'} vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: dark ? '#6b7280' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v.split(',')[0]} />
                            <YAxis tick={{ fill: dark ? '#6b7280' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip dark={dark} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Reports">
                                {chartData.map((entry, i) => (
                                    <Cell key={i} fill={entry.count === maxVal ? '#3b82f6' : dark ? '#1e2347' : '#e5e7eb'} />
                                ))}
                            </Bar>
                            <Bar dataKey="critical" radius={[4, 4, 0, 0]} fill="#ef4444" name="Critical" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
                <div className="flex items-center gap-4 mt-2">
                    <span className={`flex items-center gap-1.5 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}><span className="w-3 h-3 rounded bg-blue-500 inline-block" />Total</span>
                    <span className={`flex items-center gap-1.5 text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}><span className="w-3 h-3 rounded bg-red-500 inline-block" />Critical</span>
                </div>
            </div>

            {/* Detected outbreaks */}
            {outbreaks.length > 0 && (
                <div className={`border rounded-2xl p-5 ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <ExclamationTriangleIcon className="w-5 h-5 text-orange-500" />
                        <h3 className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Detected Clusters</h3>
                        <span className="ml-auto text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded-full font-bold">{outbreaks.length} pattern{outbreaks.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                        {outbreaks.map(ob => <OutbreakCard key={ob.keyword} outbreak={ob} onCreateAlert={handleCreateAlert} creating={creating} dark={dark} />)}
                    </div>
                </div>
            )}

            {outbreaks.length === 0 && healthAlerts.length === 0 && (
                <div className={`border rounded-2xl p-8 text-center ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
                    <CheckCircleIcon className="w-10 h-10 text-green-600 mx-auto mb-2" />
                    <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>No Outbreaks Detected</p>
                    <p className={`text-sm mt-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>All illness patterns are within normal range.</p>
                </div>
            )}

            <AdvisoryBroadcastForm session={session} dark={dark} />
        </div>
    );
};

export default RiskDashboardPanel;
