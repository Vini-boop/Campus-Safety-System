import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { adminAuth } from '../middleware/adminAuth.js';
import { success, error } from '../utils/response.js';
import { db } from '../services/firebaseAdmin.js';

const router = express.Router();

// @route   POST /admin/alerts
// @desc    Create a new alert
// @access  Private/Admin
router.post(
    '/',
    adminAuth,
    [
        body('title').notEmpty().withMessage('Title is required'),
        body('message').notEmpty().withMessage('Message is required'),
        body('severity').isIn(['low', 'medium', 'high']).withMessage('Invalid severity'),
        body('location').isObject().withMessage('Location must be an object'),
        body('location.name').notEmpty().withMessage('Location name is required'),
        body('location.lat').isNumeric().withMessage('Latitude must be a number'),
        body('location.lng').isNumeric().withMessage('Longitude must be a number'),
        body('startsAt').isISO8601().withMessage('Invalid start date'),
        body('endsAt').isISO8601().withMessage('Invalid end date'),
        body('tags').optional().isArray().withMessage('Tags must be an array'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const alertData = {
                ...req.body,
                createdBy: req.user.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                active: true
            };

            const docRef = await db.collection(process.env.ALERTS_COLLECTION || 'alerts').add(alertData);

            success(res, { id: docRef.id, ...alertData }, 201);
        } catch (err) {
            console.error('Create alert error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   GET /admin/alerts
// @desc    Get all alerts with pagination and filters
// @access  Private/Admin
router.get(
    '/',
    adminAuth,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('pageToken').optional().isString(),
        query('severity').optional().isIn(['low', 'medium', 'high']),
        query('activeOnly').optional().isBoolean().toBoolean(),
        query('tag').optional().isString()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            let query = db.collection(process.env.ALERTS_COLLECTION || 'alerts');

            // Apply filters
            if (req.query.severity) {
                query = query.where('severity', '==', req.query.severity);
            }

            if (req.query.activeOnly) {
                query = query.where('active', '==', true);
            }

            if (req.query.tag) {
                query = query.where('tags', 'array-contains', req.query.tag);
            }

            // Apply pagination
            const limit = req.query.limit || 20;
            let snapshot;

            if (req.query.pageToken) {
                const lastDoc = await db.collection(process.env.ALERTS_COLLECTION || 'alerts')
                    .doc(req.query.pageToken)
                    .get();

                snapshot = await query
                    .orderBy('createdAt', 'desc')
                    .startAfter(lastDoc)
                    .limit(limit)
                    .get();
            } else {
                snapshot = await query
                    .orderBy('createdAt', 'desc')
                    .limit(limit)
                    .get();
            }

            const alerts = [];
            snapshot.forEach(doc => {
                alerts.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            // Get the last document for next page token
            let nextPageToken = null;
            if (alerts.length === limit) {
                nextPageToken = alerts[alerts.length - 1].id;
            }

            success(res, {
                items: alerts,
                nextPageToken,
                total: alerts.length
            });
        } catch (err) {
            console.error('Get alerts error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   GET /admin/alerts/:id
// @desc    Get a single alert by ID
// @access  Private/Admin
router.get(
    '/:id',
    adminAuth,
    [
        param('id').notEmpty().withMessage('Alert ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const doc = await db.collection(process.env.ALERTS_COLLECTION || 'alerts')
                .doc(req.params.id)
                .get();

            if (!doc.exists) {
                return error(res, 'Alert not found', 404);
            }

            success(res, {
                id: doc.id,
                ...doc.data()
            });
        } catch (err) {
            console.error('Get alert error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   PUT /admin/alerts/:id
// @desc    Update an alert
// @access  Private/Admin
router.put(
    '/:id',
    adminAuth,
    [
        param('id').notEmpty().withMessage('Alert ID is required'),
        body('title').optional().notEmpty().withMessage('Title cannot be empty'),
        body('message').optional().notEmpty().withMessage('Message cannot be empty'),
        body('severity').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid severity'),
        body('location').optional().isObject().withMessage('Location must be an object'),
        body('location.name').optional().notEmpty().withMessage('Location name cannot be empty'),
        body('location.lat').optional().isNumeric().withMessage('Latitude must be a number'),
        body('location.lng').optional().isNumeric().withMessage('Longitude must be a number'),
        body('startsAt').optional().isISO8601().withMessage('Invalid start date'),
        body('endsAt').optional().isISO8601().withMessage('Invalid end date'),
        body('tags').optional().isArray().withMessage('Tags must be an array'),
        body('active').optional().isBoolean().withMessage('Active must be a boolean')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const alertRef = db.collection(process.env.ALERTS_COLLECTION || 'alerts')
                .doc(req.params.id);

            const doc = await alertRef.get();

            if (!doc.exists) {
                return error(res, 'Alert not found', 404);
            }

            const updateData = {
                ...req.body,
                updatedAt: new Date().toISOString()
            };

            await alertRef.update(updateData);

            const updatedDoc = await alertRef.get();

            success(res, {
                id: updatedDoc.id,
                ...updatedDoc.data()
            });
        } catch (err) {
            console.error('Update alert error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   DELETE /admin/alerts/:id
// @desc    Delete an alert
// @access  Private/Admin
router.delete(
    '/:id',
    adminAuth,
    [
        param('id').notEmpty().withMessage('Alert ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const alertRef = db.collection(process.env.ALERTS_COLLECTION || 'alerts')
                .doc(req.params.id);

            const doc = await alertRef.get();

            if (!doc.exists) {
                return error(res, 'Alert not found', 404);
            }

            await alertRef.delete();

            success(res, { message: 'Alert deleted successfully' });
        } catch (err) {
            console.error('Delete alert error:', err);
            error(res, 'Server error');
        }
    }
);

export default router;