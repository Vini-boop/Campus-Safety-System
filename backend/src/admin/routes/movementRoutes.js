import express from 'express';
import { query, param, validationResult } from 'express-validator';
import { adminAuth } from '../middleware/adminAuth.js';
import { success, error } from '../utils/response.js';
import { db } from '../services/firebaseAdmin.js';

const router = express.Router();

// @route   GET /admin/movements
// @desc    Get movement patterns/analytics
// @access  Private/Admin
router.get(
    '/',
    adminAuth,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('zone').optional().isString(),
        query('startDate').optional().isISO8601(),
        query('endDate').optional().isISO8601()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            let query = db.collection(process.env.MOVEMENTS_COLLECTION || 'movements');

            // Apply filters
            if (req.query.zone) {
                query = query.where('zone', '==', req.query.zone);
            }

            if (req.query.startDate) {
                query = query.where('timestamp', '>=', req.query.startDate);
            }

            if (req.query.endDate) {
                query = query.where('timestamp', '<=', req.query.endDate);
            }

            const limit = req.query.limit || 50;
            const snapshot = await query
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            const movements = [];
            snapshot.forEach(doc => {
                movements.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            success(res, {
                items: movements,
                total: movements.length
            });
        } catch (err) {
            console.error('Get movements error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   GET /admin/movements/stats
// @desc    Get movement statistics
// @access  Private/Admin
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const movementsCollection = db.collection(process.env.MOVEMENTS_COLLECTION || 'movements');
        
        // Get total movements in last 24 hours
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const recentMovements = await movementsCollection
            .where('timestamp', '>=', yesterday.toISOString())
            .get();

        // Group by zone
        const zoneStats = {};
        recentMovements.forEach(doc => {
            const data = doc.data();
            const zone = data.zone || 'unknown';
            zoneStats[zone] = (zoneStats[zone] || 0) + 1;
        });

        success(res, {
            totalMovements24h: recentMovements.size,
            zoneStats
        });
    } catch (err) {
        console.error('Get movement stats error:', err);
        error(res, 'Server error');
    }
});

export default router;

