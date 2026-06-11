import express from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { adminAuth } from '../middleware/adminAuth.js';
import { success, error } from '../utils/response.js';
import { db } from '../services/firebaseAdmin.js';

const router = express.Router();

// @route   GET /admin/reports
// @desc    Get all incident reports
// @access  Private/Admin
router.get(
    '/',
    adminAuth,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('status').optional().isString(),
        query('category').optional().isString(),
        query('search').optional().isString(),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            let query = db.collection(process.env.REPORTS_COLLECTION || 'reports');

            if (req.query.status) {
                query = query.where('status', '==', req.query.status);
            }

            if (req.query.category) {
                query = query.where('category', '==', req.query.category);
            }

            const limit = req.query.limit || 50;
            const snapshot = await query
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            const reports = [];
            snapshot.forEach((doc) => {
                const reportData = doc.data();
                // Filter by search term if provided
                if (req.query.search) {
                    const searchLower = req.query.search.toLowerCase();
                    const matchesSearch =
                        reportData.title?.toLowerCase().includes(searchLower) ||
                        reportData.description?.toLowerCase().includes(searchLower) ||
                        reportData.message?.toLowerCase().includes(searchLower);
                    if (!matchesSearch) return;
                }
                reports.push({
                    id: doc.id,
                    ...reportData,
                });
            });

            success(res, {
                items: reports,
                total: reports.length,
            });
        } catch (err) {
            console.error('Get reports error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   GET /admin/reports/:id
// @desc    Get a single report by ID
// @access  Private/Admin
router.get(
    '/:id',
    adminAuth,
    [param('id').notEmpty().withMessage('Report ID is required')],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const doc = await db.collection(process.env.REPORTS_COLLECTION || 'reports')
                .doc(req.params.id)
                .get();

            if (!doc.exists) {
                return error(res, 'Report not found', 404);
            }

            success(res, {
                id: doc.id,
                ...doc.data(),
            });
        } catch (err) {
            console.error('Get report error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   PUT /admin/reports/:id/status
// @desc    Update report status
// @access  Private/Admin
router.put(
    '/:id/status',
    adminAuth,
    [
        param('id').notEmpty().withMessage('Report ID is required'),
        body('status').isIn(['pending', 'reviewed', 'action_taken', 'resolved']).withMessage('Invalid status'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const reportRef = db.collection(process.env.REPORTS_COLLECTION || 'reports')
                .doc(req.params.id);

            const doc = await reportRef.get();
            if (!doc.exists) {
                return error(res, 'Report not found', 404);
            }

            const updateData = {
                status: req.body.status,
                updatedAt: new Date().toISOString(),
                updatedBy: req.user.id,
                ...(req.body.notes && { notes: req.body.notes }),
            };

            await reportRef.update(updateData);
            const updatedDoc = await reportRef.get();

            success(res, {
                id: updatedDoc.id,
                ...updatedDoc.data(),
            });
        } catch (err) {
            console.error('Update report status error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   POST /admin/reports/:id/assign
// @desc    Assign report to a team/user
// @access  Private/Admin
router.post(
    '/:id/assign',
    adminAuth,
    [
        param('id').notEmpty().withMessage('Report ID is required'),
        body('assigneeId').notEmpty().withMessage('Assignee ID is required'),
        body('assigneeType').optional().isIn(['security', 'medical', 'other']),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const reportRef = db.collection(process.env.REPORTS_COLLECTION || 'reports')
                .doc(req.params.id);

            const doc = await reportRef.get();
            if (!doc.exists) {
                return error(res, 'Report not found', 404);
            }

            await reportRef.update({
                assignedTo: req.body.assigneeId,
                assigneeType: req.body.assigneeType || 'other',
                assignedAt: new Date().toISOString(),
                assignedBy: req.user.id,
                updatedAt: new Date().toISOString(),
            });

            const updatedDoc = await reportRef.get();
            success(res, {
                id: updatedDoc.id,
                ...updatedDoc.data(),
            });
        } catch (err) {
            console.error('Assign report error:', err);
            error(res, 'Server error');
        }
    }
);

export default router;

