import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  limit,
  startAfter
} from 'firebase/firestore';
import { auth, db } from './firebase';

// Types for chat system
export interface ChatMessage {
  id?: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'doctor' | 'system' | 'security';
  message: string;
  text?: string; // For backward compatibility
  messageType: 'text' | 'image' | 'file' | 'consultation_summary' | 'doctor_response';
  type?: 'text' | 'image'; // For backward compatibility
  timestamp: any; // Firebase Timestamp
  createdAt?: any; // For backward compatibility
  isRead: boolean;
  readBy?: string[];
  imageUrl?: string; // For backward compatibility

  // Structured Consultation Data
  consultationData?: {
    symptoms: string;
    duration: string;
    painLevel: number;
    flags: string[];
    history: string;
  };

  // Structured Doctor Response
  doctorResponse?: {
    recommendation: 'medication' | 'visit' | 'test' | 'emergency';
    prescribedMedication?: string;
  };
}

export interface ChatSession {
  id?: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  doctorId?: string;
  doctorName?: string;
  status: 'active' | 'waiting' | 'closed' | 'escalated';
  category: 'general' | 'emergency' | 'medication' | 'appointment';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  lastMessage?: string;
  lastMessageTime?: any; // Firebase Timestamp
  createdAt: any; // Firebase Timestamp
  updatedAt: any; // Firebase Timestamp
  assignedAt?: any; // Firebase Timestamp
  closedAt?: any; // Firebase Timestamp
  location?: {
    hostelName: string;
    roomNumber: string;
  };
  symptoms?: string;
  urgency?: string;
}

export interface ChatParticipant {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'doctor' | 'security';
  isOnline: boolean;
  lastSeen?: any; // Firebase Timestamp
}

class ChatService {
  private chatsCollection = collection(db, 'medical_chats');
  private messagesCollection = collection(db, 'medical_messages');

  // Create new chat session
  async createChatSession(chatData: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      if (!auth.currentUser) {
        throw new Error('User not authenticated');
      }

      const chatDoc = await addDoc(this.chatsCollection, {
        ...chatData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log('✅ Chat session created:', chatDoc.id);
      return chatDoc.id;
    } catch (error) {
      console.error('Error creating chat session:', error);
      throw new Error('Failed to create chat session');
    }
  }

  // Send message in chat
  async sendMessage(
    chatId: string,
    message: string,
    messageType: 'text' | 'image' | 'file' | 'consultation_summary' | 'doctor_response' = 'text',
    extraData?: {
      consultationData?: ChatMessage['consultationData'];
      doctorResponse?: ChatMessage['doctorResponse'];
    }
  ): Promise<string> {
    try {
      if (!auth.currentUser) throw new Error('User not authenticated');

      // Get display name from Firestore profile if displayName is null
      let senderName = auth.currentUser.displayName || '';
      let senderRole: ChatMessage['senderRole'] = 'student';

      try {
        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userSnap.exists()) {
          const d = userSnap.data();
          senderName = d.fullName || d.displayName || auth.currentUser.email || 'Student';
          const role = d.role || '';
          if (role === 'doctor' || role === 'medical') senderRole = 'doctor';
          else if (role === 'security' || role === 'security_admin') senderRole = 'security';
          else senderRole = 'student';
        }
      } catch { /* use defaults */ }

      if (!senderName) senderName = auth.currentUser.email || 'Student';

      const messageData: Omit<ChatMessage, 'id'> = {
        chatId,
        senderId: auth.currentUser.uid,
        senderName,
        senderRole,
        message,
        messageType,
        ...extraData,
        timestamp: serverTimestamp(),
        isRead: false,
        readBy: [auth.currentUser.uid],
      };

      const messageDoc = await addDoc(this.messagesCollection, messageData);

      await this.updateChatSession(chatId, {
        lastMessage: messageType === 'text' ? message : `[${messageType}]`,
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return messageDoc.id;
    } catch (error) {
      console.error('Error sending message:', error);
      throw new Error('Failed to send message');
    }
  }

  // Get chat messages for a session
  async getChatMessages(chatId: string, lastMessage?: ChatMessage): Promise<ChatMessage[]> {
    try {
      let q = query(
        this.messagesCollection,
        where('chatId', '==', chatId)
        // Removed orderBy to prevent composite index crash on fresh setups. Sort locally instead.
      );

      const querySnapshot = await getDocs(q);
      const messages = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];

      // Sort locally DESC
      messages.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
      });

      // Handle pagination locally
      if (lastMessage && lastMessage.timestamp) {
        const lastTime = lastMessage.timestamp.toMillis ? lastMessage.timestamp.toMillis() : 0;
        const filtered = messages.filter(m => {
          const t = m.timestamp?.toMillis ? m.timestamp.toMillis() : 0;
          return t < lastTime;
        });
        return filtered.slice(0, 50);
      }

      return messages.slice(0, 50);


    } catch (error) {
      console.error('Error getting chat messages:', error);
      throw new Error('Failed to get chat messages');
    }
  }

  // Real-time listener for chat messages
  onChatMessages(chatId: string, callback: (messages: ChatMessage[]) => void): () => void {
    const q = query(
      this.messagesCollection,
      where('chatId', '==', chatId)
      // Removed orderBy to prevent index crash
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const messages = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];

      // Sort locally ASC
      messages.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return timeA - timeB;
      });

      callback(messages);
    }, (error) => {
      console.error('Error in chat messages listener:', error);
    });

    return unsubscribe;
  }

  // Get user's chat sessions
  async getUserChatSessions(userId: string): Promise<ChatSession[]> {
    try {
      const q = query(
        this.chatsCollection,
        where('studentId', '==', userId)
        // Removed orderBy to prevent index crash
      );

      const querySnapshot = await getDocs(q);
      const sessions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatSession[];

      // Sort locally DESC
      return sessions.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return timeB - timeA;
      });
    } catch (error) {
      console.error('Error getting user chat sessions:', error);
      throw new Error('Failed to get chat sessions');
    }
  }

  // Get active chat sessions for doctors
  async getActiveChatSessions(): Promise<ChatSession[]> {
    try {
      const q = query(
        this.chatsCollection,
        where('status', 'in', ['active', 'waiting'])
        // Removed multiple orderBy to prevent index crash
      );

      const querySnapshot = await getDocs(q);
      const sessions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatSession[];

      const priorityWeights = { urgent: 4, high: 3, medium: 2, low: 1 };

      // Sort locally
      return sessions.sort((a, b) => {
        const pA = priorityWeights[a.priority as keyof typeof priorityWeights] || 0;
        const pB = priorityWeights[b.priority as keyof typeof priorityWeights] || 0;
        if (pA !== pB) return pB - pA; // Descending priority

        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeA - timeB; // Ascending time
      });
    } catch (error) {
      console.error('Error getting active chat sessions:', error);
      throw new Error('Failed to get active chat sessions');
    }
  }

  // Update chat session
  async updateChatSession(chatId: string, updates: Partial<ChatSession>): Promise<void> {
    try {
      const chatRef = doc(this.chatsCollection, chatId);
      await updateDoc(chatRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating chat session:', error);
      throw new Error('Failed to update chat session');
    }
  }

  // Assign doctor to chat
  async assignDoctorToChat(chatId: string, doctorId: string, doctorName: string): Promise<void> {
    try {
      await this.updateChatSession(chatId, {
        doctorId,
        doctorName,
        status: 'active',
        assignedAt: serverTimestamp(),
      });

      // Send system message
      await this.sendMessage(chatId, `👨‍⚕️ Dr. ${doctorName} has joined the chat`, 'text');
    } catch (error) {
      console.error('Error assigning doctor to chat:', error);
      throw new Error('Failed to assign doctor to chat');
    }
  }

  // Mark messages as read
  async markMessagesAsRead(chatId: string, userId: string): Promise<void> {
    try {
      // Only query by chatId — filter out own messages client-side to avoid composite index
      const q = query(this.messagesCollection, where('chatId', '==', chatId));
      const querySnapshot = await getDocs(q);

      const updates = querySnapshot.docs
        .filter(d => d.data().senderId !== userId && !d.data().isRead)
        .map(d => updateDoc(d.ref, { isRead: true, readBy: [userId] }));

      await Promise.all(updates);
    } catch (error: any) {
      // Silently handle permission errors - messages collection may not be accessible
      if (error?.code === 'permission-denied' || error?.message?.includes('Missing or insufficient permissions')) {
        console.log('Message read status requires permissions - skipping update');
      } else {
        console.error('Error marking messages as read:', error);
      }
      // Non-critical — don't throw
    }
  }

  // Close chat session
  async closeChatSession(chatId: string, reason?: string): Promise<void> {
    try {
      await this.updateChatSession(chatId, {
        status: 'closed',
        closedAt: serverTimestamp(),
      });

      if (reason) {
        await this.sendMessage(chatId, `📝 Chat closed: ${reason}`, 'text');
      }
    } catch (error) {
      console.error('Error closing chat session:', error);
      throw new Error('Failed to close chat session');
    }
  }

  // Get chat statistics
  async getChatStats(): Promise<{
    total: number;
    active: number;
    waiting: number;
    closed: number;
    averageResponseTime: number;
  }> {
    try {
      const allSessions = await getDocs(this.chatsCollection);
      const sessions = allSessions.docs.map(doc => doc.data()) as ChatSession[];

      const stats = {
        total: sessions.length,
        active: sessions.filter(s => s.status === 'active').length,
        waiting: sessions.filter(s => s.status === 'waiting').length,
        closed: sessions.filter(s => s.status === 'closed').length,
        averageResponseTime: this.calculateAverageResponseTime(sessions),
      };

      return stats;
    } catch (error) {
      console.error('Error getting chat stats:', error);
      throw new Error('Failed to get chat statistics');
    }
  }

  // Calculate average response time
  private calculateAverageResponseTime(sessions: ChatSession[]): number {
    const responseTimes = sessions
      .filter(s => s.assignedAt && s.createdAt)
      .map(s => {
        const created = s.createdAt.toDate();
        const assigned = s.assignedAt!.toDate();
        return (assigned.getTime() - created.getTime()) / 1000 / 60; // Convert to minutes
      });

    if (responseTimes.length === 0) return 0;
    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  // Get unread message count
  async getUnreadMessageCount(userId: string): Promise<number> {
    try {
      const q = query(
        this.messagesCollection,
        where('readBy', 'array-contains', userId),
        where('isRead', '==', false),
        where('senderId', '!=', userId)
      );

      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error('Error getting unread message count:', error);
      return 0;
    }
  }

  // Real-time listener for chat session updates
  onChatSessionUpdate(chatId: string, callback: (session: ChatSession) => void): () => void {
    const chatRef = doc(this.chatsCollection, chatId);

    const unsubscribe = onSnapshot(chatRef, (doc) => {
      if (doc.exists()) {
        callback({
          id: doc.id,
          ...doc.data(),
        } as ChatSession);
      }
    }, (error) => {
      console.error('Error in chat session listener:', error);
    });

    return unsubscribe;
  }

  // Get available doctors
  async getAvailableDoctors(): Promise<ChatParticipant[]> {
    try {
      // This would query a users collection for doctors who are online
      // For now, return mock data
      return [
        {
          id: 'doctor1',
          name: 'Dr. Sarah Johnson',
          email: 'sarah.johnson@university.edu',
          role: 'doctor',
          isOnline: true,
        },
        {
          id: 'doctor2',
          name: 'Dr. Michael Chen',
          email: 'michael.chen@university.edu',
          role: 'doctor',
          isOnline: true,
        },
      ];
    } catch (error) {
      console.error('Error getting available doctors:', error);
      return [];
    }
  }
}

export default new ChatService();
