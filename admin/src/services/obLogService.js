/**
 * OB Log Service - Enhanced Occurrence Book Management
 * 
 * Features:
 * - Auto-generate OB numbers (OB-YYYY-NNNNNN)
 * - Full audit trail with timeline
 * - Follow-up notes with timestamps
 * - Status tracking: open → assigned → investigating → resolved → closed
 * - Assignment system
 * - Evidence attachments
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
  getDocs,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Generate unique OB number: OB-YYYY-NNNNNN
 */
const generateOBNumber = async () => {
  try {
    const year = new Date().getFullYear();

    // Get count of OB logs this year
    const q = query(
      collection(db, 'security_ob_logs'),
      where('year', '==', year),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const count = snapshot.size + 1;
    const paddedCount = String(count).padStart(6, '0');

    return `OB-${year}-${paddedCount}`;
  } catch (error) {
    console.error('Error generating OB number:', error);
    // Fallback with timestamp
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `OB-${year}-${timestamp}`;
  }
};

/**
 * Create OB Log from incident report
 */
export const createOBLog = async (reportData, additionalInfo = {}) => {
  try {
    console.log('[OB Service] Creating OB log for report:', reportData.id);

    const obNumber = await generateOBNumber();
    const year = new Date().getFullYear();

    const obLog = {
      // Core Identification
      obNumber,
      year,
      reportId: reportData.id, // Link to original report

      // Incident Details
      category: reportData.type || 'security',
      summary: reportData.description?.substring(0, 100) || 'Incident Report',
      description: reportData.description || '',
      location: reportData.locationCoords || reportData.location,
      hostelName: reportData.hostelName || '',
      roomNumber: reportData.roomNumber || '',
      coordinates: reportData.locationCoords ? {
        latitude: reportData.locationCoords.latitude,
        longitude: reportData.locationCoords.longitude,
        address: reportData.locationCoords.address || ''
      } : null,

      // Student Information
      studentId: reportData.reporterId || null,
      studentName: reportData.reporterName || 'Anonymous',
      studentEmail: reportData.reporterEmail || '',
      phone: reportData.phone || '',

      // Status & Priority
      status: 'open', // open → assigned → investigating → resolved → closed
      priority: reportData.priority || 'medium',
      isHighRisk: reportData.isHighRisk || false,

      // Assignment
      assignedTo: null,
      assignedToName: null,
      assignedAt: null,

      // Timeline (Audit Trail)
      timeline: [
        {
          action: 'created',
          timestamp: new Date().toISOString(),
          actor: 'system',
          actorName: 'System',
          notes: 'OB Log automatically created from incident report'
        }
      ],

      // Investigation
      followUpNotes: [],
      evidence: [],
      adminResponse: null,

      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      openedAt: serverTimestamp(),
      closedAt: null,

      // Metadata
      createdBy: 'system',
      tags: additionalInfo.tags || [],
      relatedOBNumbers: []
    };

    const docRef = await addDoc(collection(db, 'security_ob_logs'), obLog);
    console.log('✅ OB Log created:', obNumber, 'ID:', docRef.id);

    return { id: docRef.id, ...obLog };
  } catch (error) {
    console.error('❌ Error creating OB log:', error);
    throw error;
  }
};

/**
 * Add follow-up note with audit trail
 */
export const addFollowUp = async (obId, notes, actionTaken, officerId, officerName) => {
  try {
    if (!notes || !notes.trim()) {
      throw new Error('Follow-up notes cannot be empty');
    }

    const now = new Date().toISOString();
    const followUpEntry = {
      id: Date.now().toString(),
      notes,
      actionTaken: actionTaken || 'Review and assessment',
      timestamp: now,
      actor: officerId,
      actorName: officerName,
      actorRole: 'officer'
    };

    const obRef = doc(db, 'security_ob_logs', obId);
    await updateDoc(obRef, {
      followUpNotes: arrayUnion(followUpEntry),
      updatedAt: serverTimestamp(),
      timeline: arrayUnion({
        action: 'follow_up_added',
        timestamp: now,
        actor: officerId,
        actorName: officerName,
        notes: notes.substring(0, 50) + (notes.length > 50 ? '...' : '')
      })
    });

    console.log('✅ Follow-up added to OB:', obId);
    return followUpEntry;
  } catch (error) {
    console.error('❌ Error adding follow-up:', error);
    throw error;
  }
};

/**
 * Update OB status with validation
 */
export const updateOBStatus = async (obId, newStatus, officerId, officerName) => {
  try {
    const validStatuses = ['open', 'assigned', 'investigating', 'resolved', 'closed'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`);
    }

    const now = new Date().toISOString();
    const obRef = doc(db, 'security_ob_logs', obId);
    const updates = {
      status: newStatus,
      updatedAt: serverTimestamp(),
      timeline: arrayUnion({
        action: `status_changed_to_${newStatus}`,
        timestamp: now,
        actor: officerId,
        actorName: officerName,
        notes: `Status changed to ${newStatus}`
      })
    };

    if (newStatus === 'closed') updates.closedAt = serverTimestamp();
    else if (newStatus === 'resolved') updates.resolvedAt = serverTimestamp();

    await updateDoc(obRef, updates);
    console.log(`✅ OB status updated to: ${newStatus}`);
  } catch (error) {
    console.error('❌ Error updating OB status:', error);
    throw error;
  }
};

/**
 * Assign officer to incident
 */
export const assignOfficer = async (obId, officerId, officerName, assignedBy, assignedByName) => {
  try {
    const now = new Date().toISOString();
    const obRef = doc(db, 'security_ob_logs', obId);
    await updateDoc(obRef, {
      assignedTo: officerId,
      assignedToName: officerName,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'assigned',
      timeline: arrayUnion({
        action: 'assigned',
        timestamp: now,
        actor: assignedBy,
        actorName: assignedByName,
        notes: `Assigned to ${officerName}`
      })
    });

    console.log('✅ Officer assigned to OB:', obId);
  } catch (error) {
    console.error('❌ Error assigning officer:', error);
    throw error;
  }
};

/**
 * Add evidence to OB log
 */
export const addEvidence = async (obId, evidenceUrls, officerId, officerName) => {
  try {
    const now = new Date().toISOString();
    const obRef = doc(db, 'security_ob_logs', obId);
    await updateDoc(obRef, {
      evidence: arrayUnion(...evidenceUrls.map(url => ({
        url,
        uploadedAt: now,
        uploadedBy: officerId,
        uploadedByName: officerName
      }))),
      updatedAt: serverTimestamp(),
      timeline: arrayUnion({
        action: 'evidence_added',
        timestamp: now,
        actor: officerId,
        actorName: officerName,
        notes: `Added ${evidenceUrls.length} evidence item(s)`
      })
    });

    console.log('✅ Evidence added to OB:', obId);
  } catch (error) {
    console.error('❌ Error adding evidence:', error);
    throw error;
  }
};

/**
 * Real-time OB listener with filters
 */
export const subscribeToOBLogs = (filters = {}, callback, onError) => {
  const {
    year = new Date().getFullYear(),
    status,
    assignedTo,
    priority,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = filters;

  console.log('[OB Service] Subscribing to OB logs with filters:', filters);

  let q = query(
    collection(db, 'security_ob_logs'),
    where('year', '==', year),
    orderBy(sortBy, sortOrder)
  );

  // Apply additional filters (requires composite indexes in production)
  if (status) {
    q = query(q, where('status', '==', status));
  }

  if (assignedTo && assignedTo !== 'unassigned') {
    q = query(q, where('assignedTo', '==', assignedTo));
  }

  if (priority && priority !== 'all') {
    q = query(q, where('priority', '==', priority));
  }

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`[OB Service] Received ${logs.length} OB logs`);
    callback(logs);
  }, (error) => {
    console.error('❌ OB listener error:', error);

    // Handle index errors gracefully
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.warn('[OB Service] Composite index required. Falling back to basic query...');

      // Fallback: simpler query without filters
      const fallbackQ = query(
        collection(db, 'security_ob_logs'),
        orderBy(sortBy, sortOrder)
      );

      const fallbackUnsubscribe = onSnapshot(fallbackQ, (fallbackSnap) => {
        const fallbackLogs = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(fallbackLogs);
      });

      // Return fallback unsubscribe
      return fallbackUnsubscribe;
    }

    onError?.(error);
  });

  return unsubscribe;
};

/**
 * Get single OB log by ID
 */
export const getOBLogById = async (obId) => {
  try {
    const obRef = doc(db, 'security_ob_logs', obId);
    const obSnap = await getDoc(obRef);

    if (!obSnap.exists()) {
      return null;
    }

    return { id: obSnap.id, ...obSnap.data() };
  } catch (error) {
    console.error('❌ Error getting OB log:', error);
    throw error;
  }
};

/**
 * Delete OB log (admin only - use with caution)
 */
export const deleteOBLog = async (obId, adminId, adminName) => {
  try {
    // First, log the deletion in audit trail
    const obRef = doc(db, 'security_ob_logs', obId);
    await updateDoc(obRef, {
      timeline: arrayUnion({
        action: 'marked_for_deletion',
        timestamp: serverTimestamp(),
        actor: adminId,
        actorName: adminName,
        notes: 'OB log marked for deletion by admin'
      }),
      deletedAt: serverTimestamp(),
      deletedBy: adminId
    });

    // Then delete
    await deleteDoc(obRef);
    console.log('✅ OB log deleted:', obId);
  } catch (error) {
    console.error('❌ Error deleting OB log:', error);
    throw error;
  }
};

/**
 * Export OB logs to CSV format
 */
export const exportOBLogsToCSV = (logs) => {
  const headers = [
    'OB Number',
    'Date',
    'Time',
    'Category',
    'Summary',
    'Location',
    'Student',
    'Email',
    'Status',
    'Priority',
    'Assigned To',
    'Follow-ups',
    'Created At',
    'Closed At'
  ];

  const csvData = logs.map(log => [
    log.obNumber,
    log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString() : 'N/A',
    log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString() : 'N/A',
    log.category,
    log.summary,
    log.location?.address || 'Unknown',
    log.studentName,
    log.studentEmail,
    log.status,
    log.priority,
    log.assignedToName || 'Unassigned',
    log.followUpNotes?.length || 0,
    log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString() : 'N/A',
    log.closedAt?.toDate ? log.closedAt.toDate().toLocaleString() : 'N/A'
  ]);

  return [headers, ...csvData];
};

/**
 * Download CSV file
 */
export const downloadOBLogsCSV = (logs, filename = 'ob-logs-export.csv') => {
  const csvData = exportOBLogsToCSV(logs);
  const csvContent = csvData.map(row => row.join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log('✅ CSV downloaded:', filename);
};

/**
 * Search OB logs by text
 */
export const searchOBLogs = async (searchTerm, year = new Date().getFullYear()) => {
  try {
    const q = query(
      collection(db, 'security_ob_logs'),
      where('year', '==', year),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Client-side search (in production, use Algolia or ElasticSearch)
    const term = searchTerm.toLowerCase();
    const filtered = logs.filter(log =>
      log.obNumber?.toLowerCase().includes(term) ||
      log.summary?.toLowerCase().includes(term) ||
      log.studentName?.toLowerCase().includes(term) ||
      log.studentEmail?.toLowerCase().includes(term) ||
      log.description?.toLowerCase().includes(term)
    );

    console.log(`🔍 Search found ${filtered.length} matching OB logs`);
    return filtered;
  } catch (error) {
    console.error('❌ Error searching OB logs:', error);
    return [];
  }
};

export default {
  createOBLog,
  addFollowUp,
  updateOBStatus,
  assignOfficer,
  addEvidence,
  subscribeToOBLogs,
  getOBLogById,
  deleteOBLog,
  exportOBLogsToCSV,
  downloadOBLogsCSV,
  searchOBLogs
};
