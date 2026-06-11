import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { 
    db, 
    createLog, 
    sendNotificationToTopic, 
    COLLECTIONS, 
    FCM_TOPICS 
} from '../services/firebaseAdmin.js';
import { success, error } from '../utils/response.js';
import { superAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// @route   GET /admin/weather
// @desc    Get weather advisories
// @access  Private/Admin
router.get('/', async (req, res) => {
    try {
        const snapshot = await db.collection(COLLECTIONS.WEATHER_UPDATES)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const advisories = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        success(res, { items: advisories });
    } catch (err) {
        console.error('Get weather advisories error:', err);
        error(res, 'Server error', 500);
    }
});

// @route   GET /admin/weather/latest
// @desc    Get latest weather update
// @access  Public
router.get('/latest', async (req, res) => {
    try {
        const snapshot = await db.collection(COLLECTIONS.WEATHER_UPDATES)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            return success(res, { weather: null });
        }

        const latest = {
            id: snapshot.docs[0].id,
            ...snapshot.docs[0].data()
        };

        success(res, { weather: latest });
    } catch (err) {
        console.error('Get latest weather error:', err);
        error(res, 'Server error', 500);
    }
});

// @route   POST /admin/weather/publish
// @desc    Publish weather alert (SuperAdmin only)
// @access  Private/SuperAdmin
router.post(
    '/publish',
    superAdminAuth,
    [
        body('title').notEmpty().withMessage('Title is required'),
        body('message').notEmpty().withMessage('Message is required'),
        body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { title, message, severity, effectiveFrom, effectiveUntil, location } = req.body;

            const weatherData = {
                title,
                message,
                severity,
                location: location || 'Campus-wide',
                effectiveFrom: effectiveFrom || new Date().toISOString(),
                effectiveUntil: effectiveUntil || null,
                active: true,
                createdBy: req.user.uid,
                createdAt: new Date().toISOString(),
                timestamp: new Date().toISOString(),
            };

            const docRef = await db.collection(COLLECTIONS.WEATHER_UPDATES).add(weatherData);

            // Send FCM notification to all students
            await sendNotificationToTopic(
                FCM_TOPICS.STUDENTS,
                {
                    title: `Weather Alert: ${title}`,
                    body: message,
                },
                {
                    type: 'weather_alert',
                    weatherId: docRef.id,
                    severity,
                }
            );

            // Also notify admins
            await sendNotificationToTopic(
                FCM_TOPICS.ADMINS,
                {
                    title: `Weather Alert Published: ${title}`,
                    body: message,
                },
                {
                    type: 'weather_alert',
                    weatherId: docRef.id,
                }
            );

            // Log action
            await createLog(req.user.uid, req.user.role, 'publish_weather_alert', {
                weatherId: docRef.id,
                severity,
            });

            success(res, {
                weather: {
                    id: docRef.id,
                    ...weatherData,
                }
            }, 201);
        } catch (err) {
            console.error('Publish weather alert error:', err);
            error(res, 'Failed to publish weather alert', 500);
        }
    }
);

// @route   DELETE /admin/weather/:id
// @desc    Delete a weather advisory (SuperAdmin only)
// @access  Private/SuperAdmin
router.delete(
    '/:id',
    superAdminAuth,
    [
        param('id').notEmpty().withMessage('Advisory ID is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const advisoryRef = db.collection(COLLECTIONS.WEATHER_UPDATES).doc(req.params.id);
            const doc = await advisoryRef.get();

            if (!doc.exists) {
                return error(res, 'Weather advisory not found', 404);
            }

            await advisoryRef.update({
                active: false,
                deletedAt: new Date().toISOString(),
            });

            // Log action
            await createLog(req.user.uid, req.user.role, 'delete_weather_alert', {
                weatherId: req.params.id,
            });

            success(res, { message: 'Weather advisory deleted successfully' });
        } catch (err) {
            console.error('Delete weather advisory error:', err);
            error(res, 'Server error', 500);
        }
    }
);

export default router;
