import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ChatService, { ChatSession, ChatMessage } from '@/services/chatService';
import { useRouter } from 'expo-router';

interface DoctorDashboardProps {
  doctorId: string;
  doctorName: string;
}

export default function DoctorDashboard({ doctorId, doctorName }: DoctorDashboardProps) {
  const router = useRouter();
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    waiting: 0,
    closed: 0,
    averageResponseTime: 0,
  });

  useEffect(() => {
    loadChatSessions();
    loadStats();
    
    // Set up real-time listener for active chats
    const unsubscribe = ChatService.onChatMessages('all', (messages) => {
      // Update chat sessions with new messages
      loadChatSessions();
    });

    return unsubscribe;
  }, []);

  const loadChatSessions = async () => {
    try {
      const sessions = await ChatService.getActiveChatSessions();
      setChatSessions(sessions);
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const chatStats = await ChatService.getChatStats();
      setStats(chatStats);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadChatSessions(), loadStats()]);
    setRefreshing(false);
  };

  const assignToChat = async (chatId: string) => {
    try {
      await ChatService.assignDoctorToChat(chatId, doctorId, doctorName);
      Alert.alert('Success', 'You have been assigned to this chat');
      loadChatSessions();
    } catch (error) {
      console.error('Error assigning to chat:', error);
      Alert.alert('Error', 'Failed to assign to chat');
    }
  };

  const closeChat = async (chatId: string) => {
    Alert.alert(
      'Close Chat',
      'Are you sure you want to close this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChatService.closeChatSession(chatId, 'Consultation completed');
              loadChatSessions();
            } catch (error) {
              console.error('Error closing chat:', error);
              Alert.alert('Error', 'Failed to close chat');
            }
          },
        },
      ]
    );
  };

  const openChat = (chatId: string) => {
    router.push(`/doctor-chat/${chatId}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'waiting': return '#FFC107';
      case 'closed': return '#9E9E9E';
      case 'escalated': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#F44336';
      case 'high': return '#FF9800';
      case 'medium': return '#2196F3';
      case 'low': return '#4CAF50';
      default: return '#9E9E9E';
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const renderChatCard = (chat: ChatSession) => {
    const isAssigned = chat.doctorId === doctorId;
    const canAssign = !chat.doctorId && chat.status === 'waiting';
    
    return (
      <TouchableOpacity
        key={chat.id}
        style={[styles.chatCard, isAssigned && styles.assignedChat]}
        onPress={() => isAssigned ? openChat(chat.id!) : assignToChat(chat.id!)}
        disabled={!isAssigned && !canAssign}
      >
        <View style={styles.chatHeader}>
          <View style={styles.studentInfo}>
            <Text style={styles.studentName}>{chat.studentName}</Text>
            <Text style={styles.studentEmail}>{chat.studentEmail}</Text>
            {chat.location && (
              <Text style={styles.locationText}>
                📍 {chat.location.hostelName} - Room {chat.location.roomNumber}
              </Text>
            )}
          </View>
          <View style={styles.chatStatus}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(chat.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(chat.status) }]}>
              {chat.status}
            </Text>
          </View>
        </View>

        {chat.lastMessage && (
          <Text style={styles.lastMessage} numberOfLines={2}>
            {chat.lastMessage}
          </Text>
        )}

        <View style={styles.chatFooter}>
          <View style={styles.chatMeta}>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(chat.priority) }]}>
              <Text style={styles.priorityText}>{chat.priority}</Text>
            </View>
            <Text style={styles.timeText}>
              {formatTime(chat.lastMessageTime || chat.createdAt)}
            </Text>
          </View>
          
          <View style={styles.chatActions}>
            {isAssigned && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  e.stopPropagation();
                  openChat(chat.id!);
                }}
              >
                <Ionicons name="chatbubble" size={20} color="#0C156D" />
              </TouchableOpacity>
            )}
            {canAssign && (
              <TouchableOpacity
                style={[styles.actionButton, styles.assignButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  assignToChat(chat.id!);
                }}
              >
                <Ionicons name="person-add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            {isAssigned && (
              <TouchableOpacity
                style={[styles.actionButton, styles.closeButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  closeChat(chat.id!);
                }}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0C156D" />
        <Text style={styles.loadingText}>Loading chat sessions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Doctor Dashboard</Text>
        <Text style={styles.headerSubtitle}>Dr. {doctorName}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total Chats</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.waiting}</Text>
          <Text style={styles.statLabel}>Waiting</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{Math.round(stats.averageResponseTime)}m</Text>
          <Text style={styles.statLabel}>Avg Response</Text>
        </View>
      </View>

      {/* Chat Sessions */}
      <ScrollView
        style={styles.chatList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {chatSessions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No active chat sessions</Text>
            <Text style={styles.emptySubtext}>New chat requests will appear here</Text>
          </View>
        ) : (
          chatSessions.map(renderChatCard)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#0C156D',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#0C156D',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0C156D',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  chatList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  chatCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  assignedChat: {
    borderLeftWidth: 4,
    borderLeftColor: '#0C156D',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  studentEmail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 11,
    color: '#888',
  },
  chatStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 11,
    color: '#888',
  },
  chatActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignButton: {
    backgroundColor: '#4CAF50',
  },
  closeButton: {
    backgroundColor: '#F44336',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#AAA',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#CCC',
  },
});
