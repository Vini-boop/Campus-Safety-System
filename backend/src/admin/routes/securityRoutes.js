import express from 'express';
import { body, validationResult } from 'express-validator';
import { 
    db, 
    createLog, 
    sendNotificationToTopic, 
    COLLECTIONS, 
    FCM_TOPICS 
} from '../services/firebaseAdmin.js';
import { success, error } from '../utils/response.js';
import { securityAuth, superAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// @route   GET /admin/security/incidents
// @desc    Get all security incidents
// @access  Private/Security or SuperAdmin
router.get('/incidents', securityAuth, async (req, res) => {
    try {
        const { status, limit = 50, startAfter } = req.query;

        let query = db.collection(COLLECTIONS.SECURITY_ALERTS)
            .orderBy('timestamp', 'desc');

        if (status) {
            query = query.where('status', '==', status);
        }

        if (startAfter) {
            const startAfterDoc = await db.collection(COLLECTIONS.SECURITY_ALERTS).doc(startAfter).get();
            if (startAfterDoc.exists) {
                query = query.startAfter(startAfterDoc);
            }
        }

        query = query.limit(parseInt(limit));

        const snapshot = await query.get();
        const incidents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        success(res, {
            items: incidents,
            total: incidents.length,
        });
    } catch (err) {
        console.error('Get security incidents error:', err);
        error(res, 'Failed to fetch security incidents', 500);
    }
});

// @route   PATCH /admin/security/respond
// @desc    Security team responds to an incident
// @access  Private/Security
router.patch(
    '/respond',
    securityAuth,
    [
        body('incidentId').notEmpty().withMessage('Incident ID is required'),
        body('status').isIn(['responding', 'resolved', 'closed']).withMessage('Invalid status'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { incidentId, status, notes, responseDetails } = req.body;

            const incidentRef = db.collection(COLLECTIONS.SECURITY_ALERTS).doc(incidentId);
            const incidentDoc = await incidentRef.get();

            if (!incidentDoc.exists) {
                return error(res, 'Incident not found', 404);
            }

            const updateData = {
                status,
                updatedAt: new Date().toISOString(),
                lastUpdatedBy: req.user.uid,
            };

            if (notes) {
                updateData.notes = notes;
            }

            if (responseDetails) {
                updateData.responseDetails = responseDetails;
            }

            if (status === 'responding') {
                updateData.respondedAt = new Date().toISOString();
                updateData.respondedBy = req.user.uid;
            }

            if (status === 'resolved' || status === 'closed') {
                updateData.resolvedAt = new Date().toISOString();
                updateData.resolvedBy = req.user.uid;
            }

            await incidentRef.update(updateData);

            // Log action
            await createLog(req.user.uid, req.user.role, 'security_respond', {
                incidentId,
                status,
            });

            success(res, { message: 'Response recorded successfully' });
        } catch (err) {
            console.error('Security respond error:', err);
            error(res, 'Failed to record response', 500);
        }
    }
);

// @route   POST /admin/security/send-alert
// @desc    Send security alert to students (Security or SuperAdmin)
// @access  Private/Security or SuperAdmin
router.post(
    '/send-alert',
    securityAuth,
    [
        body('title').notEmpty().withMessage('Title is required'),
        body('message').notEmpty().withMessage('Message is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { title, message, priority = 'medium', targetAudience = 'students' } = req.body;

            // Save alert to Firestore
            const alertData = {
                title,
                message,
                priority,
                targetAudience,
                sentBy: req.user.uid,
                sentAt: new Date().toISOString(),
                timestamp: new Date().toISOString(),
            };

            const alertRef = await db.collection(COLLECTIONS.SECURITY_ALERTS).add(alertData);

            // Send FCM notification
            const topic = targetAudience === 'students' ? FCM_TOPICS.STUDENTS : FCM_TOPICS.ADMINS;
            await sendNotificationToTopic(
                topic,
                {
                    title: `Security Alert: ${title}`,
                    body: message,
                },
                {
                    type: 'security_alert',
                    alertId: alertRef.id,
                    priority,
                }
            );

            // Log action
            await createLog(req.user.uid, req.user.role, 'send_security_alert', {
                alertId: alertRef.id,
                targetAudience,
            });

            success(res, {
                alert: {
                    id: alertRef.id,
                    ...alertData,
                }
            }, 201);
        } catch (err) {
            console.error('Send security alert error:', err);
            error(res, 'Failed to send alert', 500);
        }
    }
);

export default router;

