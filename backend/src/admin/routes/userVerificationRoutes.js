import express from 'express';
import { body, validationResult } from 'express-validator';
import { success, error } from '../utils/response.js';
import { verifyUserCredentials, checkUserAccess, getUserProfile } from '../controllers/userVerificationController.js';
import { authRateLimit } from '../middleware/rateLimiter.js';

const router = express.Router();

// @route   POST /admin/auth/verify-credentials
// @desc    Verify user credentials and check access rights to Home Screen
// @access  Public
router.post(
    '/verify-credentials',
    authRateLimit,
    [
        body('idToken').notEmpty().withMessage('ID token is required for verification')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await verifyUserCredentials(req, res);
        } catch (err) {
            console.error('Verify user credentials error:', err);
            error(res, 'Verification failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/check-access
// @desc    Check if user has access to specific screens/features
// @access  Public
router.post(
    '/check-access',
    authRateLimit,
    [
        body('idToken').notEmpty().withMessage('ID token is required'),
        body('screen').notEmpty().withMessage('Screen name is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await checkUserAccess(req, res);
        } catch (err) {
            console.error('Check user access error:', err);
            error(res, 'Access check failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/profile
// @desc    Get complete user profile with access rights
// @access  Public
router.post(
    '/profile',
    authRateLimit,
    [
        body('idToken').notEmpty().withMessage('ID token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await getUserProfile(req, res);
        } catch (err) {
            console.error('Get user profile error:', err);
            error(res, 'Profile retrieval failed. Please try again.', 500);
        }
    }
);

export default router;