import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, BellIcon } from '@heroicons/react/24/solid';
import audioService from '../services/audioService';
import notificationService from '../services/notificationService';

/**
 * NotificationSystem Component
 * Manages in-app toast notifications and browser notifications
 */
const NotificationSystem = ({ notifications = [], onDismiss, onNotificationClick }) => {
    useEffect(() => {
        // Request notification permission on mount
        if (notificationService.getPermission() === 'default') {
            notificationService.requestPermission();
        }
    }, []);

    // Play sound when new SOS/Emergency notification arrives
    useEffect(() => {
        if (!notifications || !Array.isArray(notifications)) return;

        const sosNotifications = notifications.filter(n =>
            n.type === 'sos' || n.type === 'emergency' || n.type?.toLowerCase().includes('emergency')
        );

        const ambulanceNotifications = notifications.filter(n =>
            n.type === 'ambulance'
        );

        const securityNotifications = notifications.filter(n =>
            n.type === 'security'
        );

        const verificationNotifications = notifications.filter(n =>
            n.type === 'verification'
        );

        let soundInterval;

        if (sosNotifications.length > 0) {
            // Play emergency alarm for SOS/Emergency
            audioService.playEmergencyAlarm().catch(err => {
                console.warn('Failed to play emergency alarm:', err);
            });

            // Repeat emergency alarm every 5 seconds
            soundInterval = setInterval(() => {
                audioService.playEmergencyAlarm().catch(err => {
                    console.warn('Failed to repeat emergency alarm:', err);
                });
            }, 5000);

            return () => clearInterval(soundInterval);
        } else if (ambulanceNotifications.length > 0) {
            // Play ambulance siren for ambulance requests
            audioService.playAmbulanceSiren().catch(err => {
                console.warn('Failed to play ambulance siren:', err);
            });

            // Repeat ambulance siren every 7 seconds
            soundInterval = setInterval(() => {
                audioService.playAmbulanceSiren().catch(err => {
                    console.warn('Failed to repeat ambulance siren:', err);
                });
            }, 7000);

            return () => clearInterval(soundInterval);
        } else if (securityNotifications.length > 0) {
            // Play security beep for security alerts
            audioService.playSecurityAlert().catch(err => {
                console.warn('Failed to play security alert:', err);
            });

            // Repeat security beep every 6 seconds
            soundInterval = setInterval(() => {
                audioService.playSecurityAlert().catch(err => {
                    console.warn('Failed to repeat security alert:', err);
                });
            }, 6000);

            return () => clearInterval(soundInterval);
        } else if (verificationNotifications.length > 0) {
            // Play notification sound for verification requests
            audioService.playNotificationSound().catch(err => {
                console.warn('Failed to play notification sound:', err);
            });

            return () => {
                if (soundInterval) clearInterval(soundInterval);
            };
        }

        return () => {
            if (soundInterval) clearInterval(soundInterval);
        };
    }, [notifications]);

    return (
        <div className="fixed top-20 right-4 z-50 space-y-3 max-w-md">
            <AnimatePresence>
                {(notifications || []).map((notification) => (
                    <NotificationToast
                        key={notification.id}
                        notification={notification}
                        onDismiss={() => onDismiss && onDismiss(notification.id)}
                        onClick={() => onNotificationClick && onNotificationClick(notification)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};

/**
 * Individual notification toast
 */
const NotificationToast = ({ notification, onDismiss, onClick }) => {
    const { type, title, message, report } = notification;

    const typeConfig = {
        sos: {
            bg: 'bg-gradient-to-r from-red-600 to-red-700',
            border: 'border-red-500',
            icon: '🚨',
            glow: 'shadow-red-500/50'
        },
        emergency: {
            bg: 'bg-gradient-to-r from-red-600 to-red-700',
            border: 'border-red-500',
            icon: '🚑',
            glow: 'shadow-red-500/50'
        },
        ambulance: {
            bg: 'bg-gradient-to-r from-red-700 to-orange-700',
            border: 'border-red-400',
            icon: '🚑',
            glow: 'shadow-red-500/60'
        },
        security: {
            bg: 'bg-gradient-to-r from-orange-600 to-orange-700',
            border: 'border-orange-500',
            icon: '🛡️',
            glow: 'shadow-orange-500/50'
        },
        verification: {
            bg: 'bg-gradient-to-r from-purple-600 to-purple-700',
            border: 'border-purple-500',
            icon: '📝',
            glow: 'shadow-purple-500/50'
        },
        medical: {
            bg: 'bg-gradient-to-r from-red-600 to-pink-700',
            border: 'border-red-400',
            icon: '🚑',
            glow: 'shadow-red-500/50'
        },
        info: {
            bg: 'bg-gradient-to-r from-blue-600 to-blue-700',
            border: 'border-blue-500',
            icon: 'ℹ️',
            glow: 'shadow-blue-500/50'
        }
    };

    const config = typeConfig[type] || typeConfig.info;

    // Auto-dismiss after 15 seconds (except for SOS/Emergency/Ambulance)
    useEffect(() => {
        if (type !== 'sos' && type !== 'emergency' && type !== 'ambulance') {
            const timer = setTimeout(onDismiss, 15000);
            return () => clearTimeout(timer);
        }
    }, [type, onDismiss]);

    const isCritical = type === 'sos' || type === 'emergency' || type === 'ambulance';

    return (
        <motion.div
            initial={{ opacity: 0, x: 300, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 300, scale: 0.8 }}
            className={`
        relative overflow-hidden rounded-xl border-2 ${config.border}
        ${config.bg} ${config.glow} shadow-2xl
        backdrop-blur-lg cursor-pointer
        ${isCritical ? 'animate-pulse' : ''}
      `}
            onClick={onClick}
        >
            {/* Glass effect overlay */}
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />

            <div className="relative p-4">
                <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="text-3xl flex-shrink-0">
                        {config.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-white font-bold text-lg">{title}</h4>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDismiss();
                                }}
                                className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
                            >
                                <XMarkIcon className="h-5 w-5 text-white" />
                            </button>
                        </div>

                        <p className="text-white/90 text-sm mb-2">{message}</p>

                        {report && (
                            <div className="mt-2 pt-2 border-t border-white/20 space-y-1">
                                {(report.studentName || report.reporterName) && (
                                    <p className="text-white/80 text-xs">
                                        <span className="font-semibold">Student:</span> {report.studentName || report.reporterName}
                                    </p>
                                )}
                                {(report.regNo || report.regNumber) && (
                                    <p className="text-white/80 text-xs">
                                        <span className="font-semibold">Reg No:</span>{' '}
                                        <span className="font-mono">{report.regNo || report.regNumber}</span>
                                    </p>
                                )}
                                {(report.phone || report.reporter?.phone) && (
                                    <p className="text-white/80 text-xs">
                                        <span className="font-semibold">Phone:</span> {report.phone || report.reporter?.phone}
                                    </p>
                                )}
                                {(report.placeName || report.campusZone || report.location) && (
                                    <p className="text-white/80 text-xs">
                                        <span className="font-semibold">📍</span> {report.placeName || report.campusZone || report.location}
                                    </p>
                                )}
                                {(report.hostelName) && (
                                    <p className="text-white/80 text-xs">
                                        <span className="font-semibold">🏠</span> {report.hostelName}{report.roomNumber ? ` — Room ${report.roomNumber}` : ''}
                                    </p>
                                )}
                                {(report.medicalCondition || report.description) && (
                                    <p className="text-white/80 text-xs">
                                        <span className="font-semibold">Condition:</span> {(report.medicalCondition || report.description || '').substring(0, 80)}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="mt-2 text-xs text-white/70 font-semibold">
                            👆 Click to view details
                        </div>
                    </div>
                </div>

                {/* Progress bar for auto-dismiss */}
                {!isCritical && (
                    <motion.div
                        className="absolute bottom-0 left-0 h-1 bg-white/40"
                        initial={{ width: '100%' }}
                        animate={{ width: '0%' }}
                        transition={{ duration: 15, ease: 'linear' }}
                    />
                )}
            </div>
        </motion.div>
    );
};

/**
 * Hook to manage notifications
 */
/**
 * Hook to manage notifications
 *
 * Key behaviours:
 * 1. LOGIN GATE — records the exact login timestamp. Any notification whose
 *    source document was created BEFORE login is silently ignored.
 *    This prevents old reports from popping up every time the admin logs in.
 *
 * 2. DISMISSED PERSISTENCE — dismissed notification IDs are stored in
 *    localStorage. Once dismissed, a notification never reappears even if
 *    the Firestore listener re-fires.
 *
 * 3. STABLE IDs — uses the Firestore document ID (passed as notification.docId)
 *    when available, falling back to a content hash. This ensures the same
 *    real-world event always maps to the same ID.
 */
export const useNotifications = () => {
    const [notifications, setNotifications] = React.useState([]);

    // ── Login timestamp — set once on mount, never changes ─────────────────
    // Any notification whose createdAt is before this time is ignored.
    const loginTimeRef = React.useRef(Date.now());

    // ── Dismissed IDs — persisted across page reloads ──────────────────────
    const dismissedKey = 'admin_dismissed_notifications_v3';

    const getDismissedIds = React.useCallback(() => {
        try {
            const raw = localStorage.getItem(dismissedKey);
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch {
            return new Set();
        }
    }, []);

    const saveDismissedId = React.useCallback((id) => {
        try {
            const ids = getDismissedIds();
            ids.add(id);
            const arr = Array.from(ids).slice(-1000);
            localStorage.setItem(dismissedKey, JSON.stringify(arr));
        } catch { /* ignore */ }
    }, [getDismissedIds]);

    // ── Stable ID — prefer Firestore doc ID, fall back to content hash ──────
    const makeStableId = React.useCallback((notification) => {
        // If caller passes the Firestore document ID, use it directly
        if (notification.docId) return `doc_${notification.docId}`;
        // Fall back: hash of type + title + message (no time bucket — permanent)
        const raw = `${notification.type}|${notification.title}|${(notification.message || '').substring(0, 60)}`;
        let h = 0;
        for (let i = 0; i < raw.length; i++) {
            h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
        }
        return `notif_${Math.abs(h)}`;
    }, []);

    const addNotification = React.useCallback((notification) => {
        // ── LOGIN GATE: skip anything created before this session ────────────
        // notification.createdAtMs should be the document's createdAt in ms.
        // If not provided, we allow it through (manually triggered notifications).
        if (notification.createdAtMs && notification.createdAtMs < loginTimeRef.current) {
            return null; // silently ignore pre-login documents
        }

        const id = makeStableId(notification);

        // Skip if already dismissed
        if (getDismissedIds().has(id)) return id;

        // Skip if already in current list (dedup)
        setNotifications((prev) => {
            if (prev.some(n => n.id === id)) return prev;
            const newNotification = { ...notification, id };

            const isSOS = notification.type === 'sos' || notification.type === 'emergency' ||
                notification.type?.toLowerCase().includes('sos') ||
                notification.type?.toLowerCase().includes('emergency');
            const isAmbulance = notification.type === 'ambulance' ||
                (notification.type === 'medical' && notification.title?.includes('AMBULANCE'));
            const isSecurity = notification.type === 'security';
            const isVerification = notification.type === 'verification';

            if (isAmbulance) {
                audioService.playAmbulanceSiren().catch(() => audioService.playEmergencyAlarm().catch(() => { }));
            } else if (isSOS) {
                audioService.playEmergencyAlarm().catch(() => { });
            } else if (isSecurity) {
                audioService.playSecurityAlert().catch(() => { });
            } else if (isVerification) {
                audioService.playNotificationSound().catch(() => { });
            }

            if (notification.showBrowserNotification !== false) {
                notificationService.showEmergencyAlert(
                    notification.report || {},
                    notification.onBrowserClick
                );
            }

            return [newNotification, ...prev];
        });

        return id;
    }, [makeStableId, getDismissedIds]);

    const dismissNotification = React.useCallback((id) => {
        saveDismissedId(id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, [saveDismissedId]);

    const clearAll = React.useCallback(() => {
        setNotifications((prev) => {
            prev.forEach(n => saveDismissedId(n.id));
            return [];
        });
    }, [saveDismissedId]);

    return {
        notifications,
        addNotification,
        dismissNotification,
        clearAll
    };
};

export default NotificationSystem;
