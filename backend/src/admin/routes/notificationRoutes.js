import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { adminAuth } from '../middleware/adminAuth.js';
import { success, error } from '../utils/response.js';
import { db } from '../services/firebaseAdmin.js';

const router = express.Router();

// @route   GET /admin/notifications
// @desc    Get all notifications
// @access  Private/Admin
router.get(
    '/',
    adminAuth,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('read').optional().isBoolean().toBoolean()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            let query = db.collection(process.env.NOTIFICATIONS_COLLECTION || 'notifications');

            if (req.query.read !== undefined) {
                query = query.where('read', '==', req.query.read);
            }

            const limit = req.query.limit || 20;
            const snapshot = await query
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            success(res, {
                items: notifications,
                total: notifications.length
            });
        } catch (err) {
            console.error('Get notifications error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   POST /admin/notifications
// @desc    Create a notification
// @access  Private/Admin
router.post(
    '/',
    adminAuth,
    [
        body('title').notEmpty().withMessage('Title is required'),
        body('message').notEmpty().withMessage('Message is required'),
        body('type').isIn(['info', 'warning', 'error', 'success']).withMessage('Invalid notification type'),
        body('targetUsers').optional().isArray().withMessage('Target users must be an array')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const notificationData = {
                ...req.body,
                createdBy: req.user.id,
                createdAt: new Date().toISOString(),
                read: false
            };

            const docRef = await db.collection(process.env.NOTIFICATIONS_COLLECTION || 'notifications')
                .add(notificationData);

            success(res, { id: docRef.id, ...notificationData }, 201);
        } catch (err) {
            console.error('Create notification error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   PUT /admin/notifications/:id/read
// @desc    Mark notification as read
// @access  Private/Admin
router.put(
    '/:id/read',
    adminAuth,
    [
        param('id').notEmpty().withMessage('Notification ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const notificationRef = db.collection(process.env.NOTIFICATIONS_COLLECTION || 'notifications')
                .doc(req.params.id);

            const doc = await notificationRef.get();
            if (!doc.exists) {
                return error(res, 'Notification not found', 404);
            }

            await notificationRef.update({
                read: true,
                readAt: new Date().toISOString()
            });

            const updatedDoc = await notificationRef.get();
            success(res, {
                id: updatedDoc.id,
                ...updatedDoc.data()
            });
        } catch (err) {
            console.error('Mark notification read error:', err);
            error(res, 'Server error');
        }
    }
);

export default router;

