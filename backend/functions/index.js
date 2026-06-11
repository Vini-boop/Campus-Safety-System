/**
 * Firebase Cloud Functions — Campus Safety & Medical Emergency Notification Engine
 *
 * SECURITY/MEDICAL INCIDENT APIs (HTTPS):
 *  1. createIncident              → Create security/medical incidents
 *  2. uploadEvidence              → Upload media files
 *  3. updateIncidentStatus        → Update incident status (security staff only)
 *  4. sendEmergencyNotification   → Send emergency alerts
 *
 * MEDICAL EMERGENCY TRIGGERS:
 *  1. incident_reports/{reportId}        onCreate  → notify medical for ambulance requests
 *  2. medical_reports/{reportId}         onCreate  → notify medical officers
 *  3. medical_reports/{reportId}         onUpdate  → notify student (status/dispatch changes)
 *  4. ambulance_dispatches/{dispatchId}  onCreate  → notify driver
 *  5. medical_chats/{chatId}/messages/{msgId} onCreate → notify other participant
 *  6. health_advisories/{advisoryId}    onCreate  → broadcast to all students
 *  7. area_alerts/{alertId}             onCreate  → security area alerts
 *
 * EXISTING TRIGGERS (backward compatibility):
 *  - onNewReport           (reports collection → security)
 *  - notifyStatusChange    (reports status update → reporter)
 *  - cleanupOldReports     (scheduled cleanup)
 *  - cleanupLocationHistory (ambulance location cleanup)
 *  - onAmbulanceLocationUpdated (GPS proximity alerts)
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Helper: Verify Firebase auth token
async function verifyAuthToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing or invalid authorization header');
  }
  const token = authHeader.split('Bearer ')[1];
  return await admin.auth().verifyIdToken(token);
}

// Helper: Send push notification
async function sendNotification(tokens, title, body, data = {}) {
  const message = {
    notification: { title, body },
    data: data || {},
    tokens,
  };

  try {
    const response = await admin.messaging().sendMulticast(message);
    console.log(`Notification sent: ${response.successCount} successful, ${response.failureCount} failed`);
    return response;
  } catch (error) {
    console.error('Error sending notification:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send notification');
  }
}

// Helper: Get security staff tokens
async function getSecurityStaffTokens() {
  const usersSnapshot = await db
    .collection('users')
    .where('role', '==', 'security')
    .where('fcmToken', '!=', null)
    .get();

  return usersSnapshot.docs.map(doc => doc.data().fcmToken).filter(Boolean);
}

// Helper: Get user's FCM token
async function getUserFcmToken(userId) {
  const userDoc = await db.collection('users').doc(userId).get();
  return userDoc.data()?.fcmToken || null;
}

// ─── Helper: fetch a single user's FCM tokens ──────────────────────────────────
async function getTokensForUser(userId) {
  const doc = await db.collection('users').doc(userId).get();
  if (!doc.exists) return [];
  const data = doc.data();
  const tokens = [];
  if (data.fcmToken) tokens.push(data.fcmToken);
  if (data.fcmTokens) tokens.push(...data.fcmTokens);
  return [...new Set(tokens)].filter(Boolean);
}

// ─── Helper: fetch FCM tokens for a role (or roles) ───────────────────────────
async function getTokensForRoles(roles) {
  const snap = await db.collection('users').where('role', 'in', roles).get();
  const tokens = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.fcmToken) tokens.push(d.fcmToken);
    if (d.fcmTokens) tokens.push(...d.fcmTokens);
  });
  return [...new Set(tokens)].filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY/MEDICAL INCIDENT APIs (HTTPS)
// ═══════════════════════════════════════════════════════════════════════════════

// API 1: Create Incident
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const corsHandler = cors({ origin: true });

exports.createIncident = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // Verify authentication
      const decodedToken = await verifyAuthToken(req.headers.authorization);
      const userId = decodedToken.uid;

      // Validate request body
      const {
        type,
        category,
        medicalSubType,
        description,
        hostelName,
        roomNumber,
        location,
        reporterId,
        reporterName,
        reporterEmail,
        mediaUrls = []
      } = req.body;

      // Required fields validation
      if (!type || !description || !location || !reporterId || !reporterName) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Type-specific validation
      if (type === 'security' && !category) {
        res.status(400).json({ error: 'Security incidents require a category' });
        return;
      }

      if (type === 'medical' && !medicalSubType) {
        res.status(400).json({ error: 'Medical incidents require a sub-type' });
        return;
      }

      // Verify reporter matches authenticated user
      if (reporterId !== userId) {
        res.status(403).json({ error: 'Reporter ID does not match authenticated user' });
        return;
      }

      // Determine priority
      let priority = 'medium';
      if (type === 'medical' && medicalSubType === 'ambulance') {
        priority = 'critical';
      } else if (type === 'security' && (category === 'assault' || category === 'harassment')) {
        priority = 'high';
      }

      // Create incident document
      const incidentRef = db.collection('incident_reports').doc();
      const incidentId = incidentRef.id;

      const incidentData = {
        id: incidentId,
        type,
        category: category || null,
        medicalSubType: medicalSubType || null,
        description,
        location,
        hostelName: hostelName || '',
        roomNumber: roomNumber || '',
        reporter: {
          id: reporterId,
          name: reporterName,
          email: reporterEmail,
          role: 'student'
        },
        evidence: {
          files: mediaUrls.map((url, index) => ({
            url,
            type: url.includes('image') ? 'image' : 'video',
            name: `file_${index + 1}`,
            size: 0,
            uploadedAt: admin.firestore.Timestamp.now()
          })),
          count: mediaUrls.length
        },
        status: 'pending',
        priority,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Save to Firestore
      await incidentRef.set(incidentData);

      // Send notifications to security staff
      const securityTokens = await getSecurityStaffTokens();
      if (securityTokens.length > 0) {
        const notificationTitle = type === 'medical' ? '🚑 Medical Emergency' : '🚨 New Security Incident';
        const notificationBody = type === 'medical'
          ? `Student requesting ${medicalSubType === 'ambulance' ? 'ambulance' : 'doctor consultation'}\nLocation: ${hostelName} ${roomNumber}`
          : `Category: ${category}\nLocation: ${hostelName} ${roomNumber}\nStudent: ${reporterName}`;

        await sendNotification(securityTokens, notificationTitle, notificationBody, {
          incidentId,
          type,
          priority,
          location: JSON.stringify(location)
        });
      }

      res.status(201).json({
        success: true,
        incidentId,
        message: 'Incident reported successfully'
      });

    } catch (error) {
      console.error('Error creating incident:', error);
      if (error instanceof functions.https.HttpsError) {
        res.status(error.code).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
});

// API 2: Upload Evidence
exports.uploadEvidence = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // Verify authentication
      const decodedToken = await verifyAuthToken(req.headers.authorization);
      const userId = decodedToken.uid;

      const { fileName, fileType } = req.body;

      if (!fileName || !fileType) {
        res.status(400).json({ error: 'Missing file information' });
        return;
      }

      // Generate a mock URL (in production, this would be the actual Firebase Storage URL)
      const mockUrl = `https://firebasestorage.googleapis.com/v0/b/${process.env.GCLOUD_PROJECT}/o/incident-evidence%2F${uuidv4()}%2F${fileName}`;

      res.status(200).json({
        success: true,
        url: mockUrl,
        message: 'Evidence uploaded successfully'
      });

    } catch (error) {
      console.error('Error uploading evidence:', error);
      if (error instanceof functions.https.HttpsError) {
        res.status(error.code).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
});

// API 3: Update Incident Status
exports.updateIncidentStatus = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'PATCH') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // Verify authentication and role
      const decodedToken = await verifyAuthToken(req.headers.authorization);
      const userId = decodedToken.uid;

      // Check if user is security staff
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== 'security') {
        res.status(403).json({ error: 'Only security staff can update incident status' });
        return;
      }

      const { reportId, status, assignedTo } = req.body;

      if (!reportId || !status) {
        res.status(400).json({ error: 'Missing reportId or status' });
        return;
      }

      // Validate status
      const validStatuses = ['pending', 'investigating', 'resolved', 'false_report'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      // Update incident
      const incidentRef = db.collection('incident_reports').doc(reportId);
      const incidentDoc = await incidentRef.get();

      if (!incidentDoc.exists) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }

      const updateData = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (assignedTo) {
        updateData.assignedTo = assignedTo;
      }

      if (status === 'investigating') {
        updateData.responseTime = admin.firestore.FieldValue.serverTimestamp();
      }

      if (status === 'resolved') {
        updateData.resolvedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      await incidentRef.update(updateData);

      // Send notification to the reporter
      const incidentData = incidentDoc.data();
      const reporterId = incidentData?.reporter?.id;

      if (reporterId) {
        const userFcmToken = await getUserFcmToken(reporterId);
        if (userFcmToken) {
          const notificationTitle = 'Incident Status Update';
          let notificationBody = '';

          if (status === 'investigating') {
            notificationBody = 'Security team is responding to your report. ETA: 5 minutes';
          } else if (status === 'resolved') {
            notificationBody = 'Your incident has been resolved. Thank you for reporting.';
          } else if (status === 'false_report') {
            notificationBody = 'Your report has been marked as false. Contact security if this is incorrect.';
          }

          await sendNotification([userFcmToken], notificationTitle, notificationBody, {
            incidentId: reportId,
            status,
            updatedBy: userId
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Incident status updated successfully'
      });

    } catch (error) {
      console.error('Error updating incident status:', error);
      if (error instanceof functions.https.HttpsError) {
        res.status(error.code).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
});

// API 4: Send Emergency Notification
exports.sendEmergencyNotification = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // Verify authentication
      const decodedToken = await verifyAuthToken(req.headers.authorization);

      const { incidentId, type, location, reporterName } = req.body;

      if (!incidentId || !type || !location) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Get security staff tokens
      const securityTokens = await getSecurityStaffTokens();

      if (securityTokens.length === 0) {
        res.status(404).json({ error: 'No security staff available' });
        return;
      }

      const notificationTitle = type === 'medical' ? '🚑 Medical Emergency' : '🚨 Security Emergency';
      const notificationBody = type === 'medical'
        ? `Student requesting medical assistance\nLocation: ${location.address}\nStudent: ${reporterName}`
        : `Security emergency reported\nLocation: ${location.address}\nStudent: ${reporterName}`;

      await sendNotification(securityTokens, notificationTitle, notificationBody, {
        incidentId,
        type,
        priority: 'critical',
        location: JSON.stringify(location)
      });

      res.status(200).json({
        success: true,
        message: 'Emergency notification sent successfully'
      });

    } catch (error) {
      console.error('Error sending emergency notification:', error);
      if (error instanceof functions.https.HttpsError) {
        res.status(error.code).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (ROLE-BASED FCM TOKENS)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE TRIGGERS (SECURITY INCIDENTS)
// ═══════════════════════════════════════════════════════════════════════════════

// Firestore trigger: Send notification when new incident is created
exports.onIncidentCreated = functions.firestore
  .document('incident_reports/{incidentId}')
  .onCreate(async (snap, context) => {
    const incident = snap.data();
    const incidentId = context.params.incidentId;

    try {
      // Get security staff tokens
      const securityTokens = await getSecurityStaffTokens();

      if (securityTokens.length > 0) {
        const type = incident.type;
        const notificationTitle = type === 'medical' ? '🚑 Medical Emergency' : '🚨 New Security Incident';
        const notificationBody = type === 'medical'
          ? `Student requesting ${incident.medicalSubType === 'ambulance' ? 'ambulance' : 'doctor consultation'}\nLocation: ${incident.hostelName} ${incident.roomNumber}`
          : `Category: ${incident.category}\nLocation: ${incident.hostelName} ${incident.roomNumber}\nStudent: ${incident.reporter.name}`;

        await sendNotification(securityTokens, notificationTitle, notificationBody, {
          incidentId,
          type,
          priority: incident.priority,
          location: JSON.stringify(incident.location)
        });
      }

      console.log(`✅ Notification sent for new incident: ${incidentId}`);
    } catch (error) {
      console.error(`❌ Error sending notification for incident ${incidentId}:`, error);
    }
  });

// Firestore trigger: Send notification when new security report is created
exports.onSecurityReportCreated = functions.firestore
  .document('security_reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const reportId = context.params.reportId;

    try {
      // Get security staff tokens
      const securityTokens = await getSecurityStaffTokens();

      if (securityTokens.length > 0) {
        const type = report.category || 'security';
        const notificationTitle = '🚨 New Security Incident';
        const notificationBody = `Category: ${type}\nLocation: ${report.hostelName} ${report.roomNumber}\nStudent: ${report.studentName}`;

        await sendNotification(securityTokens, notificationTitle, notificationBody, {
          reportId,
          type: 'security',
          priority: report.priority,
          location: JSON.stringify(report.location)
        });
      }

      console.log(`✅ Notification sent for new security report: ${reportId}`);
    } catch (error) {
      console.error(`❌ Error sending notification for security report ${reportId}:`, error);
    }
  });

// Firestore trigger: Send notification when incident status is updated
exports.onIncidentUpdated = functions.firestore
  .document('incident_reports/{incidentId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const incidentId = context.params.incidentId;

    // Only proceed if status changed
    if (beforeData.status === afterData.status) {
      return;
    }

    try {
      // Send notification to the reporter
      const reporterId = afterData.reporter?.id;

      if (reporterId) {
        const userFcmToken = await getUserFcmToken(reporterId);
        if (userFcmToken) {
          const notificationTitle = 'Incident Status Update';
          let notificationBody = '';

          if (afterData.status === 'investigating') {
            notificationBody = 'Security team is responding to your report. ETA: 5 minutes';
          } else if (afterData.status === 'resolved') {
            notificationBody = 'Your incident has been resolved. Thank you for reporting.';
          } else if (afterData.status === 'false_report') {
            notificationBody = 'Your report has been marked as false. Contact security if this is incorrect.';
          }

          await sendNotification([userFcmToken], notificationTitle, notificationBody, {
            incidentId,
            status: afterData.status
          });
        }
      }

      console.log(`✅ Status update notification sent for incident: ${incidentId}`);
    } catch (error) {
      console.error(`❌ Error sending status update notification for incident ${incidentId}:`, error);
    }
  });

// ─── Helper: send to multiple tokens (auto-cleans invalid ones) ───────────────
async function sendMulticast(tokens, notification, data = {}) {
  if (!tokens.length) {
    functions.logger.info('No tokens to send notification to.');
    return;
  }
  // FCM requires data values to be strings
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? '')])
  );
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification,
    data: stringData,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
  functions.logger.info(`Sent ${response.successCount}/${tokens.length} notifications`);

  // Remove stale tokens automatically
  const stale = [];
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        stale.push(tokens[i]);
      }
    }
  });
  if (stale.length) {
    functions.logger.warn('Removing stale FCM tokens:', stale);
    const stalePredicate = await db.collection('users')
      .where('fcmToken', 'in', stale.slice(0, 10))   // Firestore 'in' limit = 10
      .get();
    const batch = db.batch();
    stalePredicate.forEach(doc => batch.update(doc.ref, { fcmToken: admin.firestore.FieldValue.delete() }));
    await batch.commit();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NEW MEDICAL REPORT — notify all medical officers
// ═══════════════════════════════════════════════════════════════════════════════
exports.onMedicalReportCreated = functions.firestore
  .document('medical_reports/{reportId}')
  .onCreate(async (snap, ctx) => {
    const report = snap.data();
    const reportId = ctx.params.reportId;
    const isSOS = report.type === 'SOS' || report.priority === 'critical';

    const tokens = await getTokensForRoles(['medical_officer', 'medical', 'admin', 'superadmin']);
    await sendMulticast(
      tokens,
      {
        title: isSOS ? '🚨 CRITICAL Medical Emergency!' : '⚕️ New Medical Report',
        body: `${report.type || 'Medical'} — ${report.location || 'Campus'} — ${report.reporterName || 'Student'}`,
      },
      { reportId, type: 'new_medical_report', priority: report.priority || 'medium' }
    );
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MEDICAL REPORT STATUS CHANGE — notify the student
// ═══════════════════════════════════════════════════════════════════════════════
exports.onMedicalReportUpdated = functions.firestore
  .document('medical_reports/{reportId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only fire when status or estimatedArrival changed
    if (before.status === after.status && before.estimatedArrival === after.estimatedArrival) {
      return null;
    }

    const reportId = ctx.params.reportId;
    const token = await getTokensForUser(after.reporterId);

    let title, body;
    switch (after.status) {
      case 'reviewed':
        title = '🩺 Your Report is Being Reviewed';
        body = 'A medical officer has taken note of your report.';
        break;
      case 'responding':
        title = '⚕️ Medical Help is On The Way';
        body = 'A medical officer is responding to your report.';
        break;
      case 'ambulance_dispatched':
        title = '🚑 Ambulance Dispatched!';
        body = after.estimatedArrival
          ? `Ambulance is on the way — ETA ${after.estimatedArrival}`
          : 'An ambulance has been dispatched to your location.';
        break;
      case 'resolved':
        title = '✅ Case Resolved';
        body = 'Your medical report has been resolved. Feel better soon!';
        break;
      default:
        title = '📋 Report Update';
        body = `Status changed to: ${after.status}`;
    }

    await sendMulticast(token, { title, body }, {
      reportId,
      type: 'report_status_update',
      status: after.status,
      eta: after.estimatedArrival || '',
    });
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AMBULANCE DISPATCHED — notify the driver
// ═══════════════════════════════════════════════════════════════════════════════
exports.onAmbulanceDispatched = functions.firestore
  .document('ambulance_dispatches/{dispatchId}')
  .onCreate(async (snap, ctx) => {
    const dispatch = snap.data();
    const dispatchId = ctx.params.dispatchId;

    if (!dispatch.driverId) {
      functions.logger.warn('Dispatch has no driverId — cannot notify driver.');
      return null;
    }

    const tokens = await getTokensForUser(dispatch.driverId);
    await sendMulticast(
      tokens,
      {
        title: '🚑 New Dispatch Assignment',
        body: 'You have a new emergency assignment. Tap to view the location.',
      },
      {
        dispatchId,
        reportId: dispatch.reportId || '',
        type: 'ambulance_dispatch',
      }
    );
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CHAT MESSAGE — notify the other participant
// ═══════════════════════════════════════════════════════════════════════════════
exports.onChatMessage = functions.firestore
  .document('medical_chats/{chatId}/messages/{messageId}')
  .onCreate(async (snap, ctx) => {
    const message = snap.data();
    const chatId = ctx.params.chatId;

    // Get the chat document to find the other participant
    const chatDoc = await db.collection('medical_chats').doc(chatId).get();
    if (!chatDoc.exists) return null;
    const chat = chatDoc.data();

    // Send to the OTHER person in the chat
    const isDoctor = message.senderRole === 'doctor' || message.senderRole === 'admin';
    const recipientId = isDoctor ? chat.studentId : chat.doctorId;
    if (!recipientId) return null;

    const tokens = await getTokensForUser(recipientId);
    const sender = message.senderName || (isDoctor ? 'Doctor' : 'Student');

    await sendMulticast(
      tokens,
      {
        title: `💬 ${isDoctor ? 'Message from Dr.' : 'New Message'} ${sender}`,
        body: message.message?.length > 80
          ? message.message.slice(0, 80) + '…'
          : message.message || '(new message)',
      },
      { chatId, type: 'chat_message', senderRole: message.senderRole || '' }
    );
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 5. HEALTH ADVISORY — broadcast to ALL students
// ═══════════════════════════════════════════════════════════════════════════════
exports.onHealthAdvisory = functions.firestore
  .document('health_advisories/{advisoryId}')
  .onCreate(async (snap) => {
    const advisory = snap.data();
    if (!advisory.active) return null;

    const tokens = await getTokensForRoles(['student']);
    const severityEmoji = { critical: '🚨', warning: '⚠️', info: 'ℹ️' };
    const emoji = severityEmoji[advisory.severity] || '⚠️';

    // Build Android notification config based on targets
    const androidConfig = {
      priority: 'high',
      notification: {
        icon: 'ic_notification',
        color: '#16A34A', // Green for medical
        sound: 'default',
      }
    };

    // Add notification targets if specified
    if (advisory.notificationTargets) {
      androidConfig.notification.clickAction = 'OPEN_NOTIFICATION_CENTER';

      // Control visibility on different screens
      if (!advisory.notificationTargets.lockScreen) {
        androidConfig.notification.visibility = 'PRIVATE'; // Don't show on lock screen
      }
    }

    await sendMulticast(
      tokens,
      {
        title: `${emoji} Campus Health Advisory`,
        body: advisory.message?.length > 100
          ? advisory.message.slice(0, 100) + '…'
          : advisory.message,
      },
      {
        type: 'health_advisory',
        severity: advisory.severity || 'warning',
        // Pass notification targets to mobile app
        showOnHomeScreen: String(advisory.notificationTargets?.homeScreen || true),
        showOnStatusBar: String(advisory.notificationTargets?.statusBar || true),
        showOnNotificationShade: String(advisory.notificationTargets?.notificationShade || true),
        showOnLockScreen: String(advisory.notificationTargets?.lockScreen || true),
        showInNotificationCenter: String(advisory.notificationTargets?.notificationCenter || true),
      },
      androidConfig
    );
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SECURITY AREA ALERT — broadcast to students in affected area
// ═══════════════════════════════════════════════════════════════════════════════
exports.onSecurityAreaAlert = functions.firestore
  .document('area_alerts/{alertId}')
  .onCreate(async (snap) => {
    const alert = snap.data();
    if (alert.status !== 'active') return null;

    // Get all student tokens
    const tokens = await getTokensForRoles(['student']);

    const severityEmoji = {
      low: '⚠️',
      medium: '⚠️',
      high: '🚨',
      emergency: '🚨'
    };
    const emoji = severityEmoji[alert.severity] || '⚠️';

    // Build Android notification config based on targets
    const androidConfig = {
      priority: 'high',
      notification: {
        icon: 'ic_notification',
        color: alert.severity === 'critical' || alert.severity === 'high' ? '#DC2626' : '#EA580C',
        sound: 'default',
      }
    };

    // Add notification targets if specified
    if (alert.notificationTargets) {
      androidConfig.notification.clickAction = 'OPEN_NOTIFICATION_CENTER';

      // Control visibility on different screens
      if (!alert.notificationTargets.lockScreen) {
        androidConfig.notification.visibility = 'PRIVATE'; // Don't show on lock screen
      }
    }

    await sendMulticast(
      tokens,
      {
        title: `${emoji} Security Alert: ${alert.area}`,
        body: alert.title + (alert.description ? ' - ' + alert.description : ''),
      },
      {
        type: 'security_alert',
        severity: alert.severity,
        area: alert.area,
        alertId: snap.id,
        // Pass notification targets to mobile app
        showOnHomeScreen: String(alert.notificationTargets?.homeScreen || true),
        showOnStatusBar: String(alert.notificationTargets?.statusBar || true),
        showOnNotificationShade: String(alert.notificationTargets?.notificationShade || true),
        showOnLockScreen: String(alert.notificationTargets?.lockScreen || true),
        showInNotificationCenter: String(alert.notificationTargets?.notificationCenter || true),
      },
      androidConfig
    );
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 7. STUDENT AMBULANCE REQUEST — notify medical staff immediately
// ═══════════════════════════════════════════════════════════════════════════════
exports.onStudentAmbulanceRequest = functions.firestore
  .document('incident_reports/{reportId}')
  .onCreate(async (snap, context) => {
    const report = snap.data();
    const reportId = context.params.reportId;

    // Only process medical ambulance requests
    if (report.type !== 'medical' || report.medicalSubType !== 'ambulance') {
      return null;
    }

    functions.logger.info(`🚑 Ambulance request received from student: ${reportId}`);

    // Get all medical staff tokens
    const tokens = await getTokensForRoles(['medical', 'medical_admin', 'medical_officer', 'admin', 'superadmin']);

    if (tokens.length === 0) {
      functions.logger.warn('No medical staff FCM tokens found!');
      return null;
    }

    // Extract location info
    const locationName = report.hostelName
      ? `${report.hostelName}, Room ${report.roomNumber}`
      : report.location?.address || 'Unknown location';

    const coords = report.location
      ? `(${report.location.latitude?.toFixed(4) || '?'}, ${report.location.longitude?.toFixed(4) || '?'})`
      : '';

    const condition = report.description?.replace('🚑 AMBULANCE EMERGENCY: ', '') || 'Medical emergency';
    const studentName = report.reporter?.name || 'Unknown Student';
    const studentEmail = report.reporter?.email || '';

    // Critical priority for ambulance requests
    const notification = {
      title: '🚑 MEDICAL EMERGENCY',
      body: `${studentName} needs ambulance at ${locationName}`,
    };

    // Data payload with full details
    const data = {
      type: 'medical_emergency',
      subtype: 'ambulance_request',
      reportId: reportId,
      studentName: studentName,
      studentEmail: studentEmail,
      location: locationName,
      coordinates: coords,
      condition: condition,
      priority: report.priority || 'critical',
      status: report.status || 'pending',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Android-specific config for maximum urgency
    const androidConfig = {
      priority: 'high',
      notification: {
        icon: 'ic_notification',
        color: '#DC2626', // Red for emergency
        sound: 'emergency_sound', // Custom emergency sound
        channelId: 'medical_emergencies',
      }
    };

    functions.logger.info(`Sending emergency notification to ${tokens.length} medical staff members`);

    await sendMulticast(tokens, notification, data, androidConfig);

    functions.logger.info(`✅ Ambulance request notification sent successfully for report ${reportId}`);
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SYSTEM STATUS CHANGE — broadcast security level / movement status to ALL users
// ═══════════════════════════════════════════════════════════════════════════════
exports.onSystemStatusChanged = functions.firestore
  .document('system_status/{docId}')
  .onWrite(async (change, ctx) => {
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return null; // document deleted — ignore

    const securityChanged = before.securityLevel !== after.securityLevel;
    const movementChanged = before.movementStatus !== after.movementStatus;

    // Nothing relevant changed
    if (!securityChanged && !movementChanged) return null;

    functions.logger.info(
      `[SystemStatus] securityLevel: ${before.securityLevel} → ${after.securityLevel}, ` +
      `movementStatus: ${before.movementStatus} → ${after.movementStatus}`
    );

    // ── Build notification content ──────────────────────────────────────────
    const secLevel = after.securityLevel || 'Low';
    const moveStatus = after.movementStatus || 'Safe';

    // Severity-based emoji and colour
    const levelEmoji = { Low: '🟢', Medium: '🟡', High: '🔴' };
    const moveEmoji = { Safe: '✅', Caution: '⚠️', Lockdown: '🚨' };
    const secEmoji = levelEmoji[secLevel] || '⚠️';
    const mvEmoji = moveEmoji[moveStatus] || '⚠️';

    let title, body;
    if (securityChanged && movementChanged) {
      title = `${secEmoji} Campus Status Update`;
      body = `Security: ${secLevel}  •  Movement: ${moveStatus}`;
    } else if (securityChanged) {
      title = `${secEmoji} Security Level: ${secLevel}`;
      body = `Campus security level has been updated to ${secLevel}. Stay alert.`;
    } else {
      title = `${mvEmoji} Movement Status: ${moveStatus}`;
      body = moveStatus === 'Lockdown'
        ? '🚨 LOCKDOWN in effect. Stay where you are and await further instructions.'
        : moveStatus === 'Caution'
          ? '⚠️ Exercise caution when moving around campus.'
          : '✅ Campus movement is now safe.';
    }

    // ── Colour / priority based on severity ────────────────────────────────
    const isHighAlert = secLevel === 'High' || moveStatus === 'Lockdown';
    const isMedAlert = secLevel === 'Medium' || moveStatus === 'Caution';
    const colour = isHighAlert ? '#DC2626' : isMedAlert ? '#EA580C' : '#16A34A';

    // ── Get ALL user tokens (students + staff) ─────────────────────────────
    // Fetch in batches — Firestore 'in' limit is 10, so query all users
    const usersSnap = await db.collection('users').get();
    const tokens = [];
    usersSnap.forEach(doc => {
      const d = doc.data();
      if (d.fcmToken) tokens.push(d.fcmToken);
      if (d.fcmTokens) tokens.push(...d.fcmTokens);
    });
    const uniqueTokens = [...new Set(tokens)].filter(Boolean);

    if (uniqueTokens.length === 0) {
      functions.logger.warn('[SystemStatus] No FCM tokens found — no notifications sent.');
      return null;
    }

    functions.logger.info(`[SystemStatus] Sending to ${uniqueTokens.length} devices`);

    // ── Send in chunks of 500 (FCM multicast limit) ────────────────────────
    const CHUNK = 500;
    for (let i = 0; i < uniqueTokens.length; i += CHUNK) {
      const chunk = uniqueTokens.slice(i, i + CHUNK);
      await sendMulticast(
        chunk,
        { title, body },
        {
          type: 'system_status_update',
          securityLevel: secLevel,
          movementStatus: moveStatus,
          securityChanged: String(securityChanged),
          movementChanged: String(movementChanged),
        }
      );
    }

    functions.logger.info('[SystemStatus] Broadcast complete.');
    return null;
  });

// ═══════════════════════════════════════════════════════════════════════════════
// EXISTING FUNCTIONS — kept as-is for backward compatibility
// ═══════════════════════════════════════════════════════════════════════════════

// Notify security personnel when a report is created in the old `reports` collection
// Notify security personnel when a report is created
exports.onNewReport = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const reportId = context.params.reportId;
    functions.logger.info('New report created:', reportId);

    try {
      const message = {
        notification: {
          title: "🚨 New Incident Report",
          body: `${data.category || 'Security'} at ${data.hostelName || data.locationDescription || 'Campus'}, Room ${data.roomNumber || 'Unknown'}`
        },
        topic: "security-team",
      };
      await admin.messaging().send(message);
      functions.logger.info('Sent push notification to topic security-team');
    } catch (error) {
      functions.logger.error('Topic Error (non-fatal):', error);
    }

    // Safety fallback: broadcast to all security tokens manually
    try {
      const tokens = await getTokensForRoles(['security', 'admin']);
      if (tokens.length > 0) {
        await sendMulticast(tokens, {
          title: "🚨 New Incident Report",
          body: `${data.category || 'Security'} at ${data.hostelName || data.locationDescription || 'Campus'}, Room ${data.roomNumber || 'Unknown'}`
        }, { reportId, type: "security_report" }
        );
      }
    } catch (err) {
      functions.logger.error('Multicast Error:', err);
    }
    return null;
  });

// Notify reporter when report status changes in old collection
exports.notifyStatusChange = functions.firestore
  .document('reports/{reportId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    if (beforeData.status === afterData.status) return null;
    try {
      const reporterDoc = await admin.firestore().collection('users').doc(afterData.reporterId).get();
      const reporterData = reporterDoc.data();
      if (!reporterData?.fcmTokens) return null;
      const message = {
        notification: { title: 'Report Status Updated', body: `Your ${afterData.type} report status changed to ${afterData.status}` },
        data: { reportId: context.params.reportId, status: afterData.status },
        tokens: reporterData.fcmTokens,
      };
      return admin.messaging().sendEachForMulticast(message);
    } catch (error) { functions.logger.error('Error:', error); return null; }
  });

// Scheduled cleanup of old reports
exports.cleanupOldReports = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Africa/Nairobi')
  .onRun(async () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    try {
      const oldReports = await admin.firestore().collection('reports').where('timestamp', '<', cutoffDate).get();
      const batch = admin.firestore().batch();
      let count = 0;
      oldReports.forEach(doc => { batch.delete(doc.ref); count++; });
      if (count > 0) await batch.commit();
      functions.logger.info(`Cleaned up ${count} old reports`);
      return count;
    } catch (error) { functions.logger.error('Cleanup error:', error); return 0; }
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 6. AMBULANCE PROXIMITY — notify student when ambulance is ≤200 m away
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Haversine distance (metres) between two lat/lng points.
 */
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlam = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ARRIVAL_RADIUS_METRES = 200;              // within 200 m → trigger once
const notifiedArrivalCache = new Set();        // in-memory dedup within a cold start

exports.onAmbulanceLocationUpdated = functions.firestore
  .document('ambulances/{ambulanceId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data();
    const after = change.after.data();
    const ambulanceId = ctx.params.ambulanceId;

    // Only run if GPS actually changed and ambulance is dispatched/tracking
    if (
      before.latitude === after.latitude &&
      before.longitude === after.longitude
    ) return null;

    if (after.status !== 'dispatched' || !after.isTracking) return null;
    if (!after.latitude || !after.longitude) return null;

    // Get the assigned case to find the student + destination coords
    const assignedCase = after.assignedCase;
    if (!assignedCase) return null;

    const reportDoc = await db.collection('medical_reports').doc(assignedCase).get();
    if (!reportDoc.exists) return null;
    const report = reportDoc.data();

    // If the report already has GPS coords, use them; fall back to hardcoded campus centre
    const destLat = report.latitude || -1.2921;
    const destLng = report.longitude || 36.8219;

    const dist = haversineMetres(after.latitude, after.longitude, destLat, destLng);
    functions.logger.info(`[GPS] Ambulance ${ambulanceId} is ${Math.round(dist)}m from destination`);

    // Dedup — only notify once per dispatch
    const cacheKey = `${ambulanceId}:${assignedCase}`;
    if (dist <= ARRIVAL_RADIUS_METRES && !notifiedArrivalCache.has(cacheKey)) {
      notifiedArrivalCache.add(cacheKey);

      // Notify the student
      const studentTokens = await getTokensForUser(report.reporterId);
      await sendMulticast(
        studentTokens,
        {
          title: '🏥 Ambulance Almost There!',
          body: 'The ambulance is less than 200 metres away. Please stay where you are.',
        },
        { type: 'ambulance_arriving', reportId: assignedCase, ambulanceId }
      );

      // Notify medical officers too
      const officerTokens = await getTokensForRoles(['medical_officer', 'admin']);
      await sendMulticast(
        officerTokens,
        {
          title: '🚑 Ambulance On Scene',
          body: `Ambulance ${after.vehicleId || ambulanceId} is arriving at ${report.location || 'the scene'}.`,
        },
        { type: 'ambulance_on_scene', reportId: assignedCase, ambulanceId }
      );
    }

    return null;
  });

// ─── Clean up location_history older than 7 days ─────────────────────────────
exports.cleanupLocationHistory = functions.pubsub
  .schedule('every 24 hours')
  .timeZone('Africa/Nairobi')
  .onRun(async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    try {
      const ambulances = await db.collection('ambulances').get();
      let total = 0;
      for (const amb of ambulances.docs) {
        const old = await db
          .collection('ambulances').doc(amb.id)
          .collection('location_history')
          .where('timestamp', '<', cutoff)
          .get();
        const batch = db.batch();
        old.forEach(d => { batch.delete(d.ref); total++; });
        if (old.size > 0) await batch.commit();
      }
      functions.logger.info(`Deleted ${total} stale location history points`);
      return total;
    } catch (e) { functions.logger.error('History cleanup error:', e); return 0; }
  });
