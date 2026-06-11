import express from 'express';
import { query, param, validationResult } from 'express-validator';
import { adminAuth } from '../middleware/adminAuth.js';
import { success, error } from '../utils/response.js';
import { db } from '../services/firebaseAdmin.js';

const router = express.Router();

// @route   GET /admin/users
// @desc    Get all users with pagination
// @access  Private/Admin
router.get(
    '/',
    adminAuth,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
        query('pageToken').optional().isString(),
        query('role').optional().isString(),
        query('search').optional().isString()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            let query = db.collection(process.env.USERS_COLLECTION || 'users');

            // Apply filters
            if (req.query.role) {
                query = query.where('role', '==', req.query.role);
            }

            const limit = req.query.limit || 20;
            let snapshot;

            if (req.query.pageToken) {
                const lastDoc = await db.collection(process.env.USERS_COLLECTION || 'users')
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

            const users = [];
            snapshot.forEach(doc => {
                const userData = doc.data();
                // Filter by search term if provided
                if (req.query.search) {
                    const searchLower = req.query.search.toLowerCase();
                    const matchesSearch = 
                        userData.email?.toLowerCase().includes(searchLower) ||
                        userData.name?.toLowerCase().includes(searchLower);
                    if (!matchesSearch) return;
                }
                users.push({
                    id: doc.id,
                    ...userData
                });
            });

            let nextPageToken = null;
            if (users.length === limit) {
                nextPageToken = users[users.length - 1].id;
            }

            success(res, {
                items: users,
                nextPageToken,
                total: users.length
            });
        } catch (err) {
            console.error('Get users error:', err);
            error(res, 'Server error');
        }
    }
);

// @route   GET /admin/users/:id
// @desc    Get a single user by ID
// @access  Private/Admin
router.get(
    '/:id',
    adminAuth,
    [
        param('id').notEmpty().withMessage('User ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const doc = await db.collection(process.env.USERS_COLLECTION || 'users')
                .doc(req.params.id)
                .get();

            if (!doc.exists) {
                return error(res, 'User not found', 404);
            }

            success(res, {
                id: doc.id,
                ...doc.data()
            });
        } catch (err) {
            console.error('Get user error:', err);
            error(res, 'Server error');
        }
    }
);

export default router;

