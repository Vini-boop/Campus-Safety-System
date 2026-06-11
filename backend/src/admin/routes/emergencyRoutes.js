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
import { adminAuth, superAdminAuth, securityAuth, medicalAuth } from '../middleware/adminAuth.js';

const router = express.Router();

// @route   POST /admin/emergency/report
// @desc    Create new emergency report (from student/mobile app)
// @access  Public (students can report)
router.post(
    '/report',
    [
        body('category').notEmpty().withMessage('Category is required'),
        body('description').notEmpty().withMessage('Description is required'),
        body('location').notEmpty().withMessage('Location is required'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { category, description, location, reportedBy, urgency = 'medium', images } = req.body;

            const emergencyData = {
                category,
                description,
                location: typeof location === 'string' ? { name: location } : location,
                reportedBy: reportedBy || 'anonymous',
                urgency,
                status: 'pending',
                assignedTo: null,
                assignedToType: null,
                images: images || [],
                timestamp: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            };

            // Save to appropriate collection based on category
            let collectionName = COLLECTIONS.EMERGENCIES;
            let fcmTopic = FCM_TOPICS.ADMINS;

            if (category.toLowerCase().includes('medical') || category.toLowerCase().includes('health')) {
                collectionName = COLLECTIONS.MEDICAL_REQUESTS;
                fcmTopic = FCM_TOPICS.MEDICAL;
            } else if (category.toLowerCase().includes('security') || category.toLowerCase().includes('safety')) {
                collectionName = COLLECTIONS.SECURITY_ALERTS;
                fcmTopic = FCM_TOPICS.SECURITY;
            }

            const docRef = await db.collection(collectionName).add(emergencyData);

            // Send FCM notification
            await sendNotificationToTopic(
                fcmTopic,
                {
                    title: `New ${category} Emergency`,
                    body: description.substring(0, 100),
                },
                {
                    type: 'emergency',
                    emergencyId: docRef.id,
                    category: category,
                    urgency: urgency,
                }
            );

            // Also notify super admins
            if (fcmTopic !== FCM_TOPICS.ADMINS) {
                await sendNotificationToTopic(
                    FCM_TOPICS.ADMINS,
                    {
                        title: `New ${category} Emergency`,
                        body: description.substring(0, 100),
                    },
                    {
                        type: 'emergency',
                        emergencyId: docRef.id,
                        category: category,
                    }
                );
            }

            success(res, {
                emergency: {
                    id: docRef.id,
                    ...emergencyData,
                }
            }, 201);
        } catch (err) {
            console.error('Create emergency error:', err);
            error(res, 'Failed to create emergency report', 500);
        }
    }
);

// @route   GET /admin/emergency/all
// @desc    Get all emergencies (filtered by role)
// @access  Private/Admin
router.get('/all', adminAuth, async (req, res) => {
    try {
        const { status, category, limit = 50, startAfter } = req.query;
        const userRole = req.user.role;

        // Determine which collections to query based on role
        let collections = [];
        
        if (userRole === 'superadmin') {
            collections = [
                COLLECTIONS.EMERGENCIES,
                COLLECTIONS.MEDICAL_REQUESTS,
                COLLECTIONS.SECURITY_ALERTS,
            ];
        } else if (userRole === 'medical') {
            collections = [COLLECTIONS.MEDICAL_REQUESTS];
        } else if (userRole === 'security') {
            collections = [COLLECTIONS.SECURITY_ALERTS];
        }

        let allEmergencies = [];

        for (const collectionName of collections) {
            let query = db.collection(collectionName).orderBy('timestamp', 'desc');

            if (status) {
                query = query.where('status', '==', status);
            }

            if (category) {
                query = query.where('category', '==', category);
            }

            if (startAfter) {
                const startAfterDoc = await db.collection(collectionName).doc(startAfter).get();
                if (startAfterDoc.exists) {
                    query = query.startAfter(startAfterDoc);
                }
            }

            query = query.limit(parseInt(limit));

            const snapshot = await query.get();
            const emergencies = snapshot.docs.map(doc => ({
                id: doc.id,
                collection: collectionName,
                ...doc.data(),
            }));

            allEmergencies = [...allEmergencies, ...emergencies];
        }

        // Sort by timestamp
        allEmergencies.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt || 0);
            const timeB = new Date(b.timestamp || b.createdAt || 0);
            return timeB - timeA;
        });

        success(res, {
            items: allEmergencies,
            total: allEmergencies.length,
        });
    } catch (err) {
        console.error('Get emergencies error:', err);
        error(res, 'Failed to fetch emergencies', 500);
    }
});

// @route   GET /admin/emergency/:id
// @desc    Get emergency by ID
// @access  Private/Admin
router.get('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { collection } = req.query;

        // Try to find in specified collection or search all
        const collections = collection 
            ? [collection] 
            : [COLLECTIONS.EMERGENCIES, COLLECTIONS.MEDICAL_REQUESTS, COLLECTIONS.SECURITY_ALERTS];

        for (const collectionName of collections) {
            const doc = await db.collection(collectionName).doc(id).get();
            if (doc.exists) {
                return success(res, {
                    emergency: {
                        id: doc.id,
                        collection: collectionName,
                        ...doc.data(),
                    }
                });
            }
        }

        error(res, 'Emergency not found', 404);
    } catch (err) {
        console.error('Get emergency error:', err);
        error(res, 'Server error', 500);
    }
});

// @route   PATCH /admin/emergency/assign
// @desc    Assign emergency to security/medical team (SuperAdmin only)
// @access  Private/SuperAdmin
router.patch(
    '/assign',
    superAdminAuth,
    [
        body('emergencyId').notEmpty().withMessage('Emergency ID is required'),
        body('assignedTo').notEmpty().withMessage('Assigned to is required'),
        body('assignedToType').isIn(['security', 'medical']).withMessage('Invalid assignment type'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { emergencyId, assignedTo, assignedToType, collection } = req.body;

            // Determine collection
            const collectionName = collection || 
                (assignedToType === 'medical' ? COLLECTIONS.MEDICAL_REQUESTS : COLLECTIONS.SECURITY_ALERTS);

            const emergencyRef = db.collection(collectionName).doc(emergencyId);
            const emergencyDoc = await emergencyRef.get();

            if (!emergencyDoc.exists) {
                return error(res, 'Emergency not found', 404);
            }

            await emergencyRef.update({
                assignedTo,
                assignedToType,
                status: 'assigned',
                assignedAt: new Date().toISOString(),
            });

            // Log action
            await createLog(req.user.uid, req.user.role, 'assign_emergency', {
                emergencyId,
                assignedTo,
                assignedToType,
            });

            // Send notification
            const topic = assignedToType === 'medical' ? FCM_TOPICS.MEDICAL : FCM_TOPICS.SECURITY;
            await sendNotificationToTopic(
                topic,
                {
                    title: 'Emergency Assigned',
                    body: `A ${emergencyDoc.data().category} emergency has been assigned to you`,
                },
                {
                    type: 'assignment',
                    emergencyId,
                }
            );

            success(res, { message: 'Emergency assigned successfully' });
        } catch (err) {
            console.error('Assign emergency error:', err);
            error(res, 'Failed to assign emergency', 500);
        }
    }
);

// @route   PATCH /admin/emergency/status
// @desc    Update emergency status (Security/Medical)
// @access  Private/Security or Medical
router.patch(
    '/status',
    adminAuth,
    [
        body('emergencyId').notEmpty().withMessage('Emergency ID is required'),
        body('status').isIn(['pending', 'assigned', 'responding', 'resolved', 'closed']).withMessage('Invalid status'),
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return error(res, 'Validation error', 400, errors.array());
            }

            const { emergencyId, status, notes, collection } = req.body;
            const userRole = req.user.role;

            // Determine collection based on role
            let collectionName = collection;
            if (!collectionName) {
                if (userRole === 'medical') {
                    collectionName = COLLECTIONS.MEDICAL_REQUESTS;
                } else if (userRole === 'security') {
                    collectionName = COLLECTIONS.SECURITY_ALERTS;
                } else {
                    collectionName = COLLECTIONS.EMERGENCIES;
                }
            }

            const emergencyRef = db.collection(collectionName).doc(emergencyId);
            const emergencyDoc = await emergencyRef.get();

            if (!emergencyDoc.exists) {
                return error(res, 'Emergency not found', 404);
            }

            const updateData = {
                status,
                updatedAt: new Date().toISOString(),
            };

            if (notes) {
                updateData.notes = notes;
                updateData.lastUpdatedBy = req.user.uid;
            }

            if (status === 'responding') {
                updateData.respondedAt = new Date().toISOString();
                updateData.respondedBy = req.user.uid;
            }

            if (status === 'resolved' || status === 'closed') {
                updateData.resolvedAt = new Date().toISOString();
                updateData.resolvedBy = req.user.uid;
            }

            await emergencyRef.update(updateData);

            // Log action
            await createLog(req.user.uid, req.user.role, 'update_emergency_status', {
                emergencyId,
                status,
                collection: collectionName,
            });

            success(res, { message: 'Emergency status updated successfully' });
        } catch (err) {
            console.error('Update status error:', err);
            error(res, 'Failed to update status', 500);
        }
    }
);

export default router;

