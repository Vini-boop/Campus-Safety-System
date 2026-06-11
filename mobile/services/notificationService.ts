import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  updateDoc,
  serverTimestamp,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { db, auth } from '@/services/firebase';
import { 
  INotification, 
  NotificationType, 
  NotificationSeverity,
  NotificationTarget,
  IUserNotificationPreferences 
} from '@/types/notification';

/**
 * Create a new notification in Firestore
 */
export const createNotification = async (
  notification: Omit<INotification, 'id' | 'createdAt'>
): Promise<string> => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const docRef = await addDoc(notificationsRef, {
      ...notification,
      createdAt: serverTimestamp(),
    });
    
    console.log('✅ Notification created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

/**
 * Get recent notifications for a user
 */
export const getUserNotifications = async (
  userId: string,
  limitCount: number = 50
): Promise<INotification[]> => {
  try {
    const notificationsRef = collection(db, 'notifications');
    
    // Query for all notifications (we'll filter client-side based on location/role)
    const q = query(
      notificationsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const notifications: INotification[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.timestamp),
      } as INotification);
    });
    
    return notifications;
  } catch (error) {
    console.error('❌ Error getting notifications:', error);
    return [];
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (
  notificationId: string,
  userId: string
): Promise<void> => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    const userNotificationRef = doc(db, 'user_notifications', `${userId}_${notificationId}`);
    
    // Update user's read status
    await setDoc(userNotificationRef, {
      userId,
      notificationId,
      isRead: true,
      readAt: serverTimestamp(),
    }, { merge: true });
    
    console.log('✅ Notification marked as read');
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
  }
};

/**
 * Mark all notifications as read for a user
 */
export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  try {
    // This would ideally be done with a batch write or cloud function
    console.log('✅ Marking all notifications as read for user:', userId);
    // Implementation depends on your Firestore structure
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
  }
};

/**
 * Get unread notification count for badge
 */
export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  try {
    const userNotificationsRef = collection(db, 'user_notifications');
    const q = query(
      userNotificationsRef,
      where('userId', '==', userId),
      where('isRead', '==', false)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return 0;
  }
};

/**
 * Save user notification preferences
 */
export const saveUserNotificationPreferences = async (
  preferences: IUserNotificationPreferences
): Promise<void> => {
  try {
    const preferencesRef = doc(db, 'notification_preferences', preferences.userId);
    await setDoc(preferencesRef, preferences, { merge: true });
    console.log('✅ User notification preferences saved');
  } catch (error) {
    console.error('❌ Error saving notification preferences:', error);
  }
};

/**
 * Get user notification preferences
 */
export const getUserNotificationPreferences = async (
  userId: string
): Promise<IUserNotificationPreferences | null> => {
  try {
    const preferencesRef = doc(db, 'notification_preferences', userId);
    const docSnap = await getDoc(preferencesRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as IUserNotificationPreferences;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error getting notification preferences:', error);
    return null;
  }
};

/**
 * Send a security alert notification
 */
export const sendSecurityAlert = async (
  title: string,
  message: string,
  options: {
    latitude?: number;
    longitude?: number;
    radius?: number;
    severity?: NotificationSeverity;
  } = {}
): Promise<string> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated');
    }

    const notification: Omit<INotification, 'id' | 'createdAt'> = {
      title,
      message,
      type: NotificationType.SECURITY,
      severity: options.severity || NotificationSeverity.HIGH,
      target: options.latitude && options.longitude 
        ? NotificationTarget.LOCATION 
        : NotificationTarget.ALL,
      latitude: options.latitude,
      longitude: options.longitude,
      radius: options.radius || 500,
      timestamp: new Date().toISOString(),
      createdBy: currentUser.uid,
    };

    return await createNotification(notification);
  } catch (error) {
    console.error('❌ Error sending security alert:', error);
    throw error;
  }
};

/**
 * Send a medical advisory notification
 */
export const sendMedicalAdvisory = async (
  title: string,
  message: string,
  options: {
    category?: string;
    severity?: NotificationSeverity;
  } = {}
): Promise<string> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated');
    }

    const notification: Omit<INotification, 'id' | 'createdAt'> = {
      title,
      message,
      type: NotificationType.MEDICAL,
      severity: options.severity || NotificationSeverity.MEDIUM,
      target: NotificationTarget.ALL,
      category: options.category,
      timestamp: new Date().toISOString(),
      createdBy: currentUser.uid,
    };

    return await createNotification(notification);
  } catch (error) {
    console.error('❌ Error sending medical advisory:', error);
    throw error;
  }
};

/**
 * Send a risk area alert (automatic)
 */
export const sendRiskAreaAlert = async (
  riskAreaName: string,
  latitude: number,
  longitude: number
): Promise<string> => {
  try {
    const notification: Omit<INotification, 'id' | 'createdAt'> = {
      title: '⚠️ Campus Safety Alert',
      message: `You are entering a high-risk area (${riskAreaName}). Please remain alert and avoid isolated paths. If you feel unsafe press the Emergency Button.`,
      type: NotificationType.RISK,
      severity: NotificationSeverity.HIGH,
      target: NotificationTarget.LOCATION,
      latitude,
      longitude,
      radius: 300,
      timestamp: new Date().toISOString(),
      createdBy: 'system',
    };

    return await createNotification(notification);
  } catch (error) {
    console.error('❌ Error sending risk area alert:', error);
    throw error;
  }
};

/**
 * Delete a notification (admin only)
 */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      deleted: true,
      deletedAt: serverTimestamp(),
    });
    console.log('✅ Notification deleted');
  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    throw error;
  }
};

export default {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  saveUserNotificationPreferences,
  getUserNotificationPreferences,
  sendSecurityAlert,
  sendMedicalAdvisory,
  sendRiskAreaAlert,
  deleteNotification,
};
