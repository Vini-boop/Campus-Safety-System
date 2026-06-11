import express from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import { success, error } from '../utils/response.js';
import { db } from '../services/firebaseAdmin.js';

const router = express.Router();

// @route   GET /admin/stats
// @desc    Get dashboard statistics
// @access  Private/Admin
router.get('/', adminAuth, async (req, res) => {
    try {
        const alertsCollection = db.collection(process.env.ALERTS_COLLECTION || 'alerts');
        const usersCollection = db.collection(process.env.USERS_COLLECTION || 'users');

        // Get total alerts
        const alertsSnapshot = await alertsCollection.get();
        const totalAlerts = alertsSnapshot.size;
        
        // Get active alerts
        const activeAlertsSnapshot = await alertsCollection.where('active', '==', true).get();
        const activeAlerts = activeAlertsSnapshot.size;

        // Get alerts by severity
        const highAlerts = await alertsCollection.where('severity', '==', 'high').where('active', '==', true).get();
        const mediumAlerts = await alertsCollection.where('severity', '==', 'medium').where('active', '==', true).get();
        const lowAlerts = await alertsCollection.where('severity', '==', 'low').where('active', '==', true).get();

        // Get total users
        const usersSnapshot = await usersCollection.get();
        const totalUsers = usersSnapshot.size;

        // Get recent alerts (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentAlertsSnapshot = await alertsCollection
            .where('createdAt', '>=', sevenDaysAgo.toISOString())
            .get();
        const recentAlerts = recentAlertsSnapshot.size;

        // Calculate weekly trend (last 7 days)
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            const dayAlerts = await alertsCollection
                .where('createdAt', '>=', date.toISOString())
                .where('createdAt', '<', nextDay.toISOString())
                .get();

            weeklyTrend.push({
                date: date.toISOString().split('T')[0],
                count: dayAlerts.size
            });
        }

        success(res, {
            totalAlerts,
            activeAlerts,
            totalUsers,
            recentAlerts,
            alertsBySeverity: {
                high: highAlerts.size,
                medium: mediumAlerts.size,
                low: lowAlerts.size
            },
            weeklyTrend
        });
    } catch (err) {
        console.error('Get stats error:', err);
        error(res, 'Server error');
    }
});

export default router;

