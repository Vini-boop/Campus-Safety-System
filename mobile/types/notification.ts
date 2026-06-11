/**
 * Notification Types and Interfaces for Campus Safety System
 */

export enum NotificationType {
  RISK = 'risk',
  MEDICAL = 'medical',
  SECURITY = 'security',
  BROADCAST = 'broadcast',
}

export enum NotificationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EMERGENCY = 'emergency',
}

export enum NotificationTarget {
  ALL = 'all',
  LOCATION = 'location',
  ROLE = 'role',
  USER = 'user',
}

export interface INotification {
  id?: string;
  title: string;
  message: string;
  type: NotificationType;
  severity: NotificationSeverity;
  target: NotificationTarget;
  
  // Location-based targeting
  latitude?: number;
  longitude?: number;
  radius?: number; // in meters
  
  // Role-based targeting
  targetRole?: string; // 'student' | 'staff' | 'security' | 'medical'
  
  // Metadata
  timestamp: string;
  createdAt: Date;
  createdBy: string; // User ID of admin who sent it
  
  // Read status (for individual users)
  isRead?: boolean;
  readAt?: string;
  
  // Additional data
  imageUrl?: string;
  actionUrl?: string;
  category?: string; // For medical: 'disease_outbreak', 'vaccination', etc.
  
  // Expiration
  expiresAt?: string;
  
  // Statistics (stored by backend)
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
}

/**
 * Risk Area Interface
 */
export interface IRiskArea {
  id: string;
  name: string;
  description: string;
  polygon: Array<{
    latitude: number;
    longitude: number;
  }>;
  center: {
    latitude: number;
    longitude: number;
  };
  radius: number; // meters
  isActive: boolean;
  riskLevel: NotificationSeverity;
  lastIncidentDate?: string;
}

/**
 * User Notification Preferences
 */
export interface IUserNotificationPreferences {
  userId: string;
  enableRiskAlerts: boolean;
  enableMedicalAlerts: boolean;
  enableSecurityAlerts: boolean;
  enableBroadcastAlerts: boolean;
  quietHoursStart?: number; // 0-23
  quietHoursEnd?: number; // 0-23
  fcmTokens: string[];
  lastLocationUpdate?: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
}

/**
 * Notification Response from Backend
 */
export interface INotificationResponse {
  success: boolean;
  notificationId?: string;
  sentCount?: number;
  error?: string;
}

/**
 * FCM Payload Structure
 */
export interface IFCMPayload {
  to?: string; // Single device token
  topic?: string; // Topic subscription
  condition?: string; // Complex targeting
  
  notification?: {
    title: string;
    body: string;
    android_channel_id?: string;
    sound?: string;
    badge?: string;
  };
  
  data?: {
    type: string;
    severity: string;
    notificationId: string;
    [key: string]: any;
  };
  
  android?: {
    priority: 'high' | 'normal';
    ttl: number;
    notification?: {
      icon?: string;
      color?: string;
      sound?: string;
      click_action?: string;
    };
  };
  
  apns?: {
    payload?: {
      aps?: {
        sound?: string;
        badge?: number;
        category?: string;
      };
    };
  };
}

// Predefined risk areas for Laikipia University
export const PREDEFINED_RISK_AREAS: Omit<IRiskArea, 'id'>[] = [
  {
    name: 'Forest Area',
    description: 'Dense forest area with limited visibility and isolated paths',
    polygon: [
      { latitude: -0.0380, longitude: 36.0650 },
      { latitude: -0.0380, longitude: 36.0720 },
      { latitude: -0.0420, longitude: 36.0720 },
      { latitude: -0.0420, longitude: 36.0650 },
    ],
    center: { latitude: -0.0400, longitude: 36.0685 },
    radius: 300,
    isActive: true,
    riskLevel: NotificationSeverity.HIGH,
  },
  {
    name: 'Ndoro Quarry',
    description: 'Active quarry site with heavy machinery and unstable terrain',
    polygon: [
      { latitude: -0.0350, longitude: 36.0600 },
      { latitude: -0.0350, longitude: 36.0640 },
      { latitude: -0.0380, longitude: 36.0640 },
      { latitude: -0.0380, longitude: 36.0600 },
    ],
    center: { latitude: -0.0365, longitude: 36.0620 },
    radius: 250,
    isActive: true,
    riskLevel: NotificationSeverity.EMERGENCY,
  },
  {
    name: 'Lake Chacha',
    description: 'Large water body with drowning risks, especially during rainy season',
    polygon: [
      { latitude: -0.0300, longitude: 36.0700 },
      { latitude: -0.0300, longitude: 36.0760 },
      { latitude: -0.0340, longitude: 36.0760 },
      { latitude: -0.0340, longitude: 36.0700 },
    ],
    center: { latitude: -0.0320, longitude: 36.0730 },
    radius: 400,
    isActive: true,
    riskLevel: NotificationSeverity.HIGH,
  },
  {
    name: 'Malewa Hostel Area',
    description: 'High-traffic student area with occasional security incidents',
    polygon: [
      { latitude: -0.0360, longitude: 36.0680 },
      { latitude: -0.0360, longitude: 36.0720 },
      { latitude: -0.0390, longitude: 36.0720 },
      { latitude: -0.0390, longitude: 36.0680 },
    ],
    center: { latitude: -0.0375, longitude: 36.0700 },
    radius: 200,
    isActive: true,
    riskLevel: NotificationSeverity.MEDIUM,
  },
];

// Helper function to create a notification document
export const createNotificationDocument = (
  title: string,
  message: string,
  type: NotificationType,
  severity: NotificationSeverity,
  createdBy: string,
  options?: Partial<INotification>
): Omit<INotification, 'id' | 'createdAt'> => {
  return {
    title,
    message,
    type,
    severity,
    target: NotificationTarget.ALL,
    timestamp: new Date().toISOString(),
    createdAt: new Date(),
    createdBy,
    isRead: false,
    ...options,
  };
};

// Helper function to get notification icon based on type
export const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case NotificationType.SECURITY:
      return '🚨';
    case NotificationType.MEDICAL:
      return '🚑';
    case NotificationType.RISK:
      return '⚠️';
    case NotificationType.BROADCAST:
      return '📢';
    default:
      return '🔔';
  }
};

// Helper function to get notification color based on severity
export const getNotificationColor = (severity: NotificationSeverity): string => {
  switch (severity) {
    case NotificationSeverity.EMERGENCY:
      return '#DC2626'; // Red
    case NotificationSeverity.HIGH:
      return '#EA580C'; // Orange
    case NotificationSeverity.MEDIUM:
      return '#CA8A04'; // Yellow
    case NotificationSeverity.LOW:
      return '#16A34A'; // Green
    default:
      return '#2563EB'; // Blue
  }
};
