/**
 * Notification Service
 * Manages browser push notifications for real-time alerts
 */

class NotificationService {
    constructor() {
        this.permission = 'default';
        this.isSupported = 'Notification' in window;
    }

    /**
     * Request notification permission from user
     * @returns {Promise<string>} Permission status: 'granted', 'denied', or 'default'
     */
    async requestPermission() {
        if (!this.isSupported) {
            console.warn('Browser notifications not supported');
            return 'denied';
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            return permission;
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return 'denied';
        }
    }

    /**
     * Show a browser notification
     * @param {string} title - Notification title
     * @param {Object} options - Notification options
     * @returns {Notification|null}
     */
    show(title, options = {}) {
        if (!this.isSupported || this.permission !== 'granted') {
            return null;
        }

        try {
            const notification = new Notification(title, {
                icon: '/icons/alert-icon.png',
                badge: '/icons/badge-icon.png',
                vibrate: [200, 100, 200],
                requireInteraction: true,
                ...options,
            });

            // Auto-close after 10 seconds if not interacted with
            setTimeout(() => {
                notification.close();
            }, 10000);

            return notification;
        } catch (error) {
            console.error('Error showing notification:', error);
            return null;
        }
    }

    /**
     * Show emergency alert notification
     * @param {Object} report - Report data
     * @param {Function} onClick - Click handler
     */
    showEmergencyAlert(report, onClick) {
        const notification = this.show(`🚨 ${report.type?.toUpperCase() || 'EMERGENCY'} ALERT`, {
            body: `${report.reporterName || 'Unknown'} - ${report.location || 'Unknown location'}\n${report.description?.substring(0, 100) || 'No description'}`,
            tag: `emergency-${report.id}`,
            requireInteraction: true,
            data: { reportId: report.id },
        });

        if (notification && onClick) {
            notification.onclick = () => {
                onClick(report);
                notification.close();
                window.focus();
            };
        }

        return notification;
    }

    /**
     * Show status update notification
     * @param {Object} report - Report data
     * @param {string} newStatus - New status
     */
    showStatusUpdate(report, newStatus) {
        const statusEmoji = {
            pending: '⏳',
            responding: '🚨',
            resolved: '✅',
        };

        return this.show('Report Status Updated', {
            body: `${statusEmoji[newStatus] || ''} Report #${report.id?.substring(0, 8)} is now ${newStatus}`,
            tag: `status-${report.id}`,
            requireInteraction: false,
        });
    }

    /**
     * Check if notifications are enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.isSupported && this.permission === 'granted';
    }

    /**
     * Get current permission status
     * @returns {string}
     */
    getPermission() {
        if (!this.isSupported) return 'denied';
        return Notification.permission;
    }
}

// Export singleton instance
const notificationService = new NotificationService();

export default notificationService;
