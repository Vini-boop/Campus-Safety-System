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
import { medicalAuth, superAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// @route   GET /admin/medical/requests
// @desc    Get all medical requests
// @access  Private/Medical or SuperAdmin
router.get('/requests', medicalAuth, async (req, res) => {
    try {
        const { status, urgency, limit = 50, startAfter } = req.query;

        let query = db.collection(COLLECTIONS.MEDICAL_REQUESTS)
            .orderBy('timestamp', 'desc');

        if (status) {
            query = query.where('status', '==', status);
        }

        if (urgency) {
            query = query.where('urgency', '==', urgency);
        }

        if (startAfter) {
            const startAfterDoc = await db.collection(COLLECTIONS.MEDICAL_REQUESTS).doc(startAfter).get();
            if (startAfterDoc.exists) {
                query = query.startAfter(startAfterDoc);
            }
        }

        query = query.limit(parseInt(limit));

        const snapshot = await query.get();
        const requests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        success(res, {
            items: requests,
            total: requests.length,
        });
    } catch (err) {
        console.error('Get medical requests error:', err);
        error(res, 'Failed to fetch medical requests', 500);
    }
});

// @route   PATCH /admin/medical/respond
// @desc    Medical team responds to a request
// @access  Private/Medical
router.patch(
    '/respond',
    medicalAuth,
    [
        body('requestId').notEmpty().withMessage('Request ID is required'),
        body('status').isIn(['pending', 'assigned', 'responding', 'resolved', 'closed']).withMessage('Invalid status'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { requestId, status, notes, treatmentDetails, assignedStaff } = req.body;

            const requestRef = db.collection(COLLECTIONS.MEDICAL_REQUESTS).doc(requestId);
            const requestDoc = await requestRef.get();

            if (!requestDoc.exists) {
                return error(res, 'Medical request not found', 404);
            }

            const updateData = {
                status,
                updatedAt: new Date().toISOString(),
                lastUpdatedBy: req.user.uid,
            };

            if (notes) {
                updateData.notes = notes;
            }

            if (treatmentDetails) {
                updateData.treatmentDetails = treatmentDetails;
            }

            if (assignedStaff) {
                updateData.assignedStaff = assignedStaff;
                updateData.assignedAt = new Date().toISOString();
            }

            if (status === 'responding') {
                updateData.respondedAt = new Date().toISOString();
                updateData.respondedBy = req.user.uid;
            }

            if (status === 'resolved' || status === 'closed') {
                updateData.resolvedAt = new Date().toISOString();
                updateData.resolvedBy = req.user.uid;
            }

            await requestRef.update(updateData);

            // Log action
            await createLog(req.user.uid, req.user.role, 'medical_respond', {
                requestId,
                status,
            });

            success(res, { message: 'Response recorded successfully' });
        } catch (err) {
            console.error('Medical respond error:', err);
            error(res, 'Failed to record response', 500);
        }
    }
);

// @route   POST /admin/medical/send-advice
// @desc    Send medical advice/alert to students (Medical or SuperAdmin)
// @access  Private/Medical or SuperAdmin
router.post(
    '/send-advice',
    medicalAuth,
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

            // Save to notifications collection
            const notificationData = {
                title,
                message,
                type: 'medical_advice',
                priority,
                targetAudience,
                sentBy: req.user.uid,
                sentAt: new Date().toISOString(),
                timestamp: new Date().toISOString(),
            };

            const notificationRef = await db.collection(COLLECTIONS.NOTIFICATIONS).add(notificationData);

            // Send FCM notification
            const topic = targetAudience === 'students' ? FCM_TOPICS.STUDENTS : FCM_TOPICS.ADMINS;
            await sendNotificationToTopic(
                topic,
                {
                    title: `Medical Alert: ${title}`,
                    body: message,
                },
                {
                    type: 'medical_advice',
                    notificationId: notificationRef.id,
                    priority,
                }
            );

            // Log action
            await createLog(req.user.uid, req.user.role, 'send_medical_advice', {
                notificationId: notificationRef.id,
                targetAudience,
            });

            success(res, {
                notification: {
                    id: notificationRef.id,
                    ...notificationData,
                }
            }, 201);
        } catch (err) {
            console.error('Send medical advice error:', err);
            error(res, 'Failed to send medical advice', 500);
        }
    }
);

export default router;

