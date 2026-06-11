import express from 'express';
import { body, validationResult } from 'express-validator';
import { success, error } from '../utils/response.js';
import { googleAuthCallback, googleRegister, verifyGoogleToken } from '../controllers/googleAuthController.js';
import { googleAuthRateLimit } from '../middleware/rateLimiter.js';

const router = express.Router();

// @route   POST /admin/auth/google/callback
// @desc    Google authentication callback - verifies Google ID token and creates/updates user
// @access  Public
router.post(
    '/google/callback',
    googleAuthRateLimit,
    [
        body('idToken').notEmpty().withMessage('Google ID token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await googleAuthCallback(req, res);
        } catch (err) {
            console.error('Google auth callback error:', err);
            error(res, 'Google authentication failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/google/register
// @desc    Register a new user via Google authentication
// @access  Public
router.post(
    '/google/register',
    googleAuthRateLimit,
    [
        body('idToken').notEmpty().withMessage('Google ID token is required'),
        body('fullName').optional().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await googleRegister(req, res);
        } catch (err) {
            console.error('Google registration error:', err);
            error(res, 'Google registration failed. Please try again.', 500);
        }
    }
);

// @route   POST /admin/auth/google/verify
// @desc    Verify Google ID token and get user data
// @access  Public
router.post(
    '/google/verify',
    [
        body('idToken').notEmpty().withMessage('Google ID token is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            await verifyGoogleToken(req, res);
        } catch (err) {
            console.error('Verify Google token error:', err);
            error(res, 'Token verification failed', 500);
        }
    }
);

export default router;