import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface SecurityNotification {
  id: string;
  zoneName: string;
  riskLevel: 'High' | 'Medium' | 'Low';
  message: string;
  timestamp: Date;
  isRead: boolean;
  type: 'approach' | 'entry' | 'warning' | 'safety';
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  timeWindow?: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
}

interface SecuritySidebarProps {
  isVisible: boolean;
  onClose: () => void;
  notifications: SecurityNotification[];
  onClearAll: () => void;
  onMarkAsRead: (id: string) => void;
  unreadCount: number;
}

const SecuritySidebar: React.FC<SecuritySidebarProps> = ({
  isVisible,
  onClose,
  notifications,
  onClearAll,
  onMarkAsRead,
  unreadCount,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'high'>('all');

  const filteredNotifications = notifications.filter((notif) => {
    if (filter === 'unread') return !notif.isRead;
    if (filter === 'high') return notif.riskLevel === 'High';
    return true;
  });

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'High':
        return '#D50000';
      case 'Medium':
        return '#FF9800';
      case 'Low':
        return '#2E7D32';
      default:
        return '#666';
    }
  };

  const getRiskIcon = (riskLevel: string, type: string) => {
    if (type === 'safety') return 'shield-checkmark';
    
    switch (riskLevel) {
      case 'High':
        return type === 'approach' ? 'warning' : 'alert-circle';
      case 'Medium':
        return 'alert';
      case 'Low':
        return 'information-circle';
      default:
        return 'information-circle';
    }
  };

  const getTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - timestamp.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sidebar}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Security Alerts</Text>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
            
            {/* Filter Tabs */}
            <View style={styles.filterContainer}>
              <TouchableOpacity
                style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                onPress={() => setFilter('all')}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === 'all' && styles.filterTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
                onPress={() => setFilter('unread')}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === 'unread' && styles.filterTextActive,
                  ]}
                >
                  Unread
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterTab, filter === 'high' && styles.filterTabActive]}
                onPress={() => setFilter('high')}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === 'high' && styles.filterTextActive,
                  ]}
                >
                  High Risk
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notifications List */}
          <ScrollView style={styles.notificationsList}>
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="shield-checkmark" size={64} color="#CCCCCC" />
                <Text style={styles.emptyText}>No security alerts</Text>
                <Text style={styles.emptySubtext}>
                  {filter === 'all' 
                    ? "You're all caught up!" 
                    : filter === 'unread'
                    ? "No unread notifications"
                    : "No high-risk alerts"}
                </Text>
              </View>
            ) : (
              filteredNotifications.map((notif) => (
                <TouchableOpacity
                  key={notif.id}
                  style={[
                    styles.notificationCard,
                    !notif.isRead && styles.unreadCard,
                    notif.riskLevel === 'High' && styles.highRiskCard,
                  ]}
                  onPress={() => onMarkAsRead(notif.id)}
                  activeOpacity={0.7}
                >
                  {/* Time Badge */}
                  {notif.timeWindow && (
                    <View style={styles.timeBadge}>
                      <Ionicons name="time" size={12} color="#FFFFFF" />
                      <Text style={styles.timeBadgeText}>
                        {notif.timeWindow.start} - {notif.timeWindow.end}
                      </Text>
                    </View>
                  )}

                  <View style={styles.notificationContent}>
                    {/* Icon and Header */}
                    <View style={styles.notificationHeader}>
                      <View
                        style={[
                          styles.iconContainer,
                          { backgroundColor: getRiskColor(notif.riskLevel) },
                        ]}
                      >
                        <Ionicons
                          name={getRiskIcon(notif.riskLevel, notif.type) as any}
                          size={20}
                          color="#FFFFFF"
                        />
                      </View>
                      <View style={styles.headerTextContainer}>
                        <Text style={styles.zoneName}>{notif.zoneName}</Text>
                        <View style={styles.metaRow}>
                          <View
                            style={[
                              styles.riskTag,
                              { backgroundColor: getRiskColor(notif.riskLevel) },
                            ]}
                          >
                            <Text style={styles.riskTagText}>{notif.riskLevel}</Text>
                          </View>
                          <Text style={styles.timestamp}>{getTimeAgo(notif.timestamp)}</Text>
                        </View>
                      </View>
                      {!notif.isRead && <View style={styles.unreadDot} />}
                    </View>

                    {/* Message */}
                    <Text style={styles.notificationMessage} numberOfLines={3}>
                      {notif.message}
                    </Text>

                    {/* Type Indicator */}
                    <View style={styles.typeIndicator}>
                      <Ionicons
                        name={
                          notif.type === 'approach'
                            ? 'walk'
                            : notif.type === 'entry'
                            ? 'enter'
                            : notif.type === 'warning'
                            ? 'warning'
                            : 'shield-checkmark'
                        }
                        size={14}
                        color="#666"
                      />
                      <Text style={styles.typeText}>
                        {notif.type === 'approach'
                          ? 'Approaching zone'
                          : notif.type === 'entry'
                          ? 'Zone entry detected'
                          : notif.type === 'warning'
                          ? 'Safety warning'
                          : 'Safety tip'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Footer Actions */}
          {notifications.length > 0 && (
            <View style={styles.footer}>
              <TouchableOpacity style={styles.clearButton} onPress={onClearAll}>
                <Ionicons name="trash-outline" size={20} color="#D50000" />
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sidebar: {
    width: Platform.OS === 'web' ? 450 : '100%',
    maxWidth: Platform.OS === 'web' ? 450 : undefined,
    height: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: Platform.OS === 'web' ? 16 : 0,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#0C156D',
    paddingTop: Platform.OS === 'web' ? 20 : 40,
    paddingBottom: 15,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  closeButton: {
    padding: 5,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  badge: {
    backgroundColor: '#D50000',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
  },
  filterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#0C156D',
  },
  notificationsList: {
    flex: 1,
    padding: 15,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#D50000',
  },
  highRiskCard: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  timeBadge: {
    backgroundColor: 'rgba(12, 21, 109, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  timeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
  notificationContent: {
    padding: 15,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  riskTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timestamp: {
    fontSize: 11,
    color: '#999',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D50000',
    marginLeft: 5,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 10,
  },
  typeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  typeText: {
    fontSize: 12,
    color: '#666',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    padding: 15,
    backgroundColor: '#F8F9FA',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D50000',
    marginLeft: 8,
  },
});

export default SecuritySidebar;
