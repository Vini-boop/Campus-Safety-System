/**
 * Enhanced Notification System - Production Ready
 * 
 * Features:
 * - Emergency (SOS) alerts with flashing + looping sound
 * - Normal incident reports with single beep
 * - Real-time Firebase listeners
 * - Browser push notifications
 * - Interactive notification center
 * - Persistent alerts requiring acknowledgment
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { BellIcon, XMarkIcon, ExclamationTriangleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellSolid } from '@heroicons/react/24/solid';

// ─── Sound Configuration ──────────────────────────────────────────────────────

// Emergency alarm sound (looping) - SOS Morse Code
const EMERGENCY_SOUND_URL = '/sounds/Sos-morse-code.mp3';
// Normal notification sound (single play)
const NORMAL_SOUND_URL = '/sounds/Alarm-beeping-sound.mp3';

// ─── Notification Types ───────────────────────────────────────────────────────

const NOTIFICATION_TYPE = {
  EMERGENCY: 'emergency',
  NORMAL: 'normal'
};

// ─── Sound Manager Class ──────────────────────────────────────────────────────

class SoundManager {
  constructor() {
    this.emergencyAudio = null;
    this.normalAudio = null;
    this.isEmergencyPlaying = false;
  }

  // Initialize audio elements
  initialize() {
    if (!this.emergencyAudio) {
      this.emergencyAudio = new Audio(EMERGENCY_SOUND_URL);
      this.emergencyAudio.loop = true;
      this.emergencyAudio.volume = 1.0; // Maximum volume for emergencies

      this.emergencyAudio.onerror = () => {
        console.error('❌ Emergency sound failed to load');
      };
    }

    if (!this.normalAudio) {
      this.normalAudio = new Audio(NORMAL_SOUND_URL);
      this.normalAudio.loop = false;
      this.normalAudio.volume = 0.5; // Medium volume for normal

      this.normalAudio.onerror = () => {
        console.error('❌ Normal sound failed to load');
      };
    }
  }

  // Play emergency sound (loops continuously)
  playEmergency() {
    try {
      this.initialize();

      if (this.emergencyAudio.paused || this.emergencyAudio.ended) {
        this.emergencyAudio.currentTime = 0;
        this.emergencyAudio.play();
        this.isEmergencyPlaying = true;
        console.log('🔊 Emergency alarm playing');
      }
    } catch (error) {
      console.error('❌ Error playing emergency sound:', error);
      // Fallback: browser may block autoplay
      this.triggerFallbackAlert();
    }
  }

  // Stop emergency sound
  stopEmergency() {
    try {
      if (this.emergencyAudio && !this.emergencyAudio.paused) {
        this.emergencyAudio.pause();
        this.emergencyAudio.currentTime = 0;
        this.isEmergencyPlaying = false;
        console.log('🔇 Emergency alarm stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping emergency sound:', error);
    }
  }

  // Play normal notification sound (once)
  playNormal() {
    try {
      this.initialize();

      if (this.normalAudio) {
        this.normalAudio.currentTime = 0;
        this.normalAudio.play();
        console.log('🔔 Normal notification played');
      }
    } catch (error) {
      console.error('❌ Error playing normal sound:', error);
    }
  }

  // Fallback alert if sound fails
  triggerFallbackAlert() {
    // Visual fallback using browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚨 EMERGENCY ALERT', {
        body: 'Critical incident reported - immediate attention required',
        icon: '/alert-icon.png',
        requireInteraction: true,
        vibrate: [500, 200, 500, 200, 500]
      });
    }
  }

  // Stop all sounds
  stopAll() {
    this.stopEmergency();

    if (this.normalAudio && !this.normalAudio.paused) {
      this.normalAudio.pause();
      this.normalAudio.currentTime = 0;
    }
  }
}

// Singleton instance
const soundManager = new SoundManager();

// ─── Notification Hook ────────────────────────────────────────────────────────

export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

  // Track notified IDs to prevent duplicates
  const notifiedIDs = useRef(new Set());
  const emergencyNotifiedIDs = useRef(new Set());

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Send browser push notification
  const sendBrowserNotification = useCallback((notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const isEmergency = notification.type === NOTIFICATION_TYPE.EMERGENCY;

      new Notification(isEmergency ? '🚨 EMERGENCY ALERT' : '📋 New Report', {
        body: `${notification.placeName || 'Unknown location'}`,
        icon: isEmergency ? '/emergency-icon.png' : '/notification-icon.png',
        badge: '/badge-icon.png',
        vibrate: isEmergency ? [500, 200, 500, 200, 500] : [200],
        requireInteraction: isEmergency,
        tag: notification.id, // Prevent duplicate notifications
        data: notification // Click handler data
      });
    }
  }, []);

  // Trigger emergency notification
  const triggerEmergencyNotification = useCallback((report) => {
    console.log('🚨 TRIGGERING EMERGENCY NOTIFICATION:', report);

    // Add to emergency alerts
    const emergencyAlert = {
      ...report,
      id: report.id,
      type: NOTIFICATION_TYPE.EMERGENCY,
      title: '🚨 EMERGENCY ALERT',
      message: report.description || `Incident at ${report.placeName}`,
      timestamp: report.createdAt?.toDate ? report.createdAt.toDate() : new Date(),
      acknowledged: false
    };

    setEmergencyAlerts(prev => [emergencyAlert, ...prev]);
    setIsEmergencyMode(true);
    setShowEmergencyModal(true);

    // Play emergency sound (loops)
    soundManager.playEmergency();

    // Browser notification
    sendBrowserNotification(emergencyAlert);

    // Flash document title
    const originalTitle = document.title;
    let flashCount = 0;
    const flashInterval = setInterval(() => {
      document.title = flashCount % 2 === 0 ? '🚨 EMERGENCY!' : originalTitle;
      flashCount++;

      // Stop flashing after 30 seconds or when acknowledged
      if (flashCount > 30) {
        clearInterval(flashInterval);
        document.title = originalTitle;
      }
    }, 1000);

    // Store interval ID for cleanup
    emergencyAlert.flashInterval = flashInterval;

    return emergencyAlert;
  }, [sendBrowserNotification]);

  // Trigger normal notification
  const triggerNormalNotification = useCallback((report) => {
    console.log('📋 TRIGGERING NORMAL NOTIFICATION:', report);

    const notification = {
      ...report,
      id: report.id,
      type: NOTIFICATION_TYPE.NORMAL,
      title: 'New Incident Report',
      message: report.description || `Report from ${report.placeName}`,
      timestamp: report.createdAt?.toDate ? report.createdAt.toDate() : new Date(),
      read: false
    };

    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);

    // Play normal sound (once)
    soundManager.playNormal();

    // Browser notification
    sendBrowserNotification(notification);

    return notification;
  }, [sendBrowserNotification]);

  // Acknowledge emergency (stops sound + flashing)
  const acknowledgeEmergency = useCallback((alertId) => {
    console.log('✅ ACKNOWLEDGING EMERGENCY:', alertId);

    // Stop emergency sound
    soundManager.stopEmergency();

    // Stop title flashing
    const alert = emergencyAlerts.find(a => a.id === alertId);
    if (alert?.flashInterval) {
      clearInterval(alert.flashInterval);
    }

    // Update alert status
    setEmergencyAlerts(prev =>
      prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a)
    );

    // Exit emergency mode if no unacknowledged alerts remain
    setTimeout(() => {
      const hasUnacknowledged = emergencyAlerts.some(a => a.id !== alertId && !a.acknowledged);
      if (!hasUnacknowledged) {
        setIsEmergencyMode(false);
        document.title = 'Security Dashboard';
      }
    }, 100);
  }, [emergencyAlerts]);

  // View emergency report
  const viewEmergency = useCallback((alertId) => {
    acknowledgeEmergency(alertId);
    // Navigate to report or open details
    console.log('Viewing emergency:', alertId);
  }, [acknowledgeEmergency]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Remove emergency alert
  const removeEmergencyAlert = useCallback((alertId) => {
    setEmergencyAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Process incoming report
  const processReport = useCallback((report) => {
    // Prevent duplicate notifications
    if (notifiedIDs.current.has(report.id)) {
      return;
    }

    notifiedIDs.current.add(report.id);

    // Determine notification type
    const isEmergency =
      report.type === 'SOS' ||
      report.type === 'emergency' ||
      report.priority === 'high' ||
      report.priority === 'critical';

    if (isEmergency) {
      // Check if already notified as emergency
      if (!emergencyNotifiedIDs.current.has(report.id)) {
        emergencyNotifiedIDs.current.add(report.id);
        triggerEmergencyNotification(report);
      }
    } else {
      triggerNormalNotification(report);
    }
  }, [triggerEmergencyNotification, triggerNormalNotification]);

  // Real-time Firebase listener
  useEffect(() => {
    console.log('🔔 Setting up real-time notification listeners...');

    // Listen to security_alerts
    const alertsQuery = query(
      collection(db, 'security_alerts'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribeAlerts = onSnapshot(alertsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const report = { id: change.doc.id, ...change.doc.data() };
          processReport(report);
        }
      });
    }, (error) => {
      console.error('❌ Alerts listener error:', error);
    });

    // Listen to emergencies
    const emergenciesQuery = query(
      collection(db, 'emergencies'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribeEmergencies = onSnapshot(emergenciesQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const report = { id: change.doc.id, ...change.doc.data(), priority: 'high' };
          processReport(report);
        }
      });
    }, (error) => {
      console.error('❌ Emergencies listener error:', error);
    });

    // Listen to security_reports
    const reportsQuery = query(
      collection(db, 'security_reports'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const report = { id: change.doc.id, ...change.doc.data() };
          processReport(report);
        }
      });
    }, (error) => {
      console.error('❌ Reports listener error:', error);
    });

    // Cleanup
    return () => {
      console.log('🔇 Cleaning up notification listeners');
      unsubscribeAlerts();
      unsubscribeEmergencies();
      unsubscribeReports();
      soundManager.stopAll();
    };
  }, [processReport]);

  // Calculate unread emergency count
  const unacknowledgedEmergencyCount = useMemo(() => {
    return emergencyAlerts.filter(a => !a.acknowledged).length;
  }, [emergencyAlerts]);

  return {
    // State
    notifications,
    emergencyAlerts,
    unreadCount,
    isEmergencyMode,
    showDropdown,
    showEmergencyModal,
    unacknowledgedEmergencyCount,

    // Actions
    setShowDropdown,
    setShowEmergencyModal,
    acknowledgeEmergency,
    viewEmergency,
    markAsRead,
    clearAll,
    removeEmergencyAlert,

    // Sound control
    stopEmergencySound: () => soundManager.stopEmergency(),
    playTestSound: () => soundManager.playNormal()
  };
};

// ─── Alert Bell Component (with flashing) ─────────────────────────────────────

export const AlertBell = ({ onClick, hasEmergency, unacknowledgedCount }) => {
  return (
    <div className="relative">
      {/* Flashing indicator for emergency */}
      {hasEmergency && (
        <div className="absolute -inset-2 bg-red-500 rounded-full animate-ping opacity-75" />
      )}

      {/* Bell icon */}
      <button
        onClick={onClick}
        className={`relative p-3 rounded-xl transition-all ${hasEmergency
            ? 'bg-red-500 hover:bg-red-600 animate-pulse'
            : 'bg-[#1e2347] hover:bg-[#252A41]'
          }`}
      >
        {hasEmergency ? (
          <ExclamationTriangleIcon className="w-6 h-6 text-white" />
        ) : (
          <BellIcon className="w-6 h-6 text-gray-400" />
        )}

        {/* Unread count badge */}
        {unacknowledgedCount > 0 && (
          <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${hasEmergency ? 'bg-white text-red-600' : 'bg-red-500 text-white'
            }`}>
            {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
          </span>
        )}
      </button>
    </div>
  );
};

// ─── Notification Dropdown Component ──────────────────────────────────────────

export const NotificationDropdown = ({
  notifications,
  unreadCount,
  onMarkAsRead,
  onClearAll,
  onClose
}) => {
  if (notifications.length === 0) {
    return (
      <div className="absolute right-0 mt-2 w-96 bg-[#141728] border border-[#252A41] rounded-2xl shadow-2xl overflow-hidden z-50">
        <div className="p-8 text-center">
          <BellIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-white text-lg font-semibold">No Notifications</p>
          <p className="text-gray-500 text-sm mt-2">You're all caught up!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 mt-2 w-96 max-h-[600px] bg-[#141728] border border-[#252A41] rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col">
      {/* Header */}
      <div className="bg-[#1e2347] px-4 py-3 flex items-center justify-between border-b border-[#252A41]">
        <h3 className="text-white font-bold text-sm">
          Notifications ({unreadCount} unread)
        </h3>
        <button
          onClick={onClearAll}
          className="text-gray-400 hover:text-white text-xs"
        >
          Clear All
        </button>
      </div>

      {/* List (scrollable) */}
      <div className="flex-1 overflow-y-auto">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`p-4 border-b border-[#252A41] hover:bg-[#1e2347] cursor-pointer transition-colors ${!notification.read ? 'bg-purple-500/5' : ''
              }`}
            onClick={() => onMarkAsRead(notification.id)}
          >
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!notification.read ? 'bg-purple-500' : 'bg-gray-600'
                }`} />

              <div className="flex-1">
                <p className="text-white text-sm font-semibold">
                  {notification.title}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  {notification.message}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-gray-500 text-[10px]">
                    {new Date(notification.timestamp).toLocaleString()}
                  </span>
                  {notification.type === 'emergency' && (
                    <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded text-[9px] font-semibold">
                      SOS
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Emergency Modal Component ────────────────────────────────────────────────

export const EmergencyModal = ({
  alert,
  onAcknowledge,
  onViewReport,
  onClose
}) => {
  if (!alert) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#141728] border-2 border-red-500 rounded-2xl shadow-2xl w-full max-w-lg animate-pulse-slow">
        {/* Header - Flashing */}
        <div className="bg-gradient-to-r from-red-600 via-red-500 to-red-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="w-8 h-8 text-white animate-pulse" />
            <h2 className="text-white font-bold text-xl">🚨 EMERGENCY ALERT</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-2"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Location */}
          <div className="bg-[#0D1130] rounded-xl p-4">
            <p className="text-gray-400 text-xs uppercase font-bold mb-2">
              📍 Location
            </p>
            <p className="text-white text-lg font-semibold">
              {alert.placeName || 'Unknown Location'}
            </p>
          </div>

          {/* Description */}
          {alert.description && (
            <div className="bg-[#0D1130] rounded-xl p-4">
              <p className="text-gray-400 text-xs uppercase font-bold mb-2">
                📝 Details
              </p>
              <p className="text-white text-sm">
                {alert.description}
              </p>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <ClockIcon className="w-4 h-4" />
            <span>
              {new Date(alert.timestamp).toLocaleString()}
            </span>
            <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold animate-pulse">
              LIVE
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              ✓ Acknowledge
            </button>
            <button
              onClick={() => onViewReport(alert.id)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              📋 View Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Emergency Banner Component ───────────────────────────────────────────────

export const EmergencyBanner = ({ alerts, onAcknowledge }) => {
  if (alerts.length === 0) return null;

  const unacknowledged = alerts.filter(a => !a.acknowledged);
  if (unacknowledged.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[99] bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white px-6 py-3 shadow-lg animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 animate-pulse" />
          <span className="font-bold text-lg">
            🚨 EMERGENCY ALERT{unacknowledged.length > 1 ? 'S' : ''}
          </span>
          {unacknowledged.length > 0 && unacknowledged.map(alert => (
            <span key={alert.id} className="bg-white/20 px-3 py-1 rounded text-sm">
              {alert.placeName}
            </span>
          ))}
        </div>

        <button
          onClick={() => onAcknowledge(unacknowledged[0].id)}
          className="bg-white text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
};

// ─── Main Notification System Component ───────────────────────────────────────

const NotificationSystem = () => {
  const {
    notifications,
    emergencyAlerts,
    unreadCount,
    isEmergencyMode,
    showDropdown,
    showEmergencyModal,
    unacknowledgedEmergencyCount,
    setShowDropdown,
    setShowEmergencyModal,
    acknowledgeEmergency,
    viewEmergency,
    markAsRead,
    clearAll,
    removeEmergencyAlert
  } = useNotifications();

  const currentEmergency = emergencyAlerts.find(a => !a.acknowledged);

  return (
    <>
      {/* Alert Bell */}
      <div className="relative">
        <AlertBell
          onClick={() => setShowDropdown(!showDropdown)}
          hasEmergency={isEmergencyMode}
          unacknowledgedCount={unacknowledgedEmergencyCount + unreadCount}
        />

        {/* Notification Dropdown */}
        {showDropdown && (
          <NotificationDropdown
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={markAsRead}
            onClearAll={clearAll}
            onClose={() => setShowDropdown(false)}
          />
        )}
      </div>

      {/* Emergency Banner */}
      <EmergencyBanner
        alerts={emergencyAlerts}
        onAcknowledge={acknowledgeEmergency}
      />

      {/* Emergency Modal */}
      {showEmergencyModal && currentEmergency && (
        <EmergencyModal
          alert={currentEmergency}
          onAcknowledge={acknowledgeEmergency}
          onViewReport={viewEmergency}
          onClose={() => setShowEmergencyModal(false)}
        />
      )}
    </>
  );
};

export default NotificationSystem;
