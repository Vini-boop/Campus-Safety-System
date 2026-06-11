/**
 * chatService.js
 * Firestore helpers for doctor-student live chat.
 * Collections: medical_chats, medical_messages
 */

import {
    collection, query, where, orderBy,
    onSnapshot, addDoc, updateDoc, doc,
    serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Listen to all active chats ───────────────────────────────────────────────
export const listenToChats = (callback) => {
    const q = query(
        collection(db, 'medical_chats'),
        where('status', 'in', ['active', 'waiting'])
        // Removed orderBy to prevent composite index errors. Sort locally instead.
    );
    return onSnapshot(q, (snapshot) => {
        let chats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        chats.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });
        callback(chats);
    });
};

// ─── Listen to messages in a specific chat ────────────────────────────────────
export const listenToMessages = (chatId, callback) => {
    const q = query(
        collection(db, 'medical_messages'),
        where('chatId', '==', chatId)
    );
    return onSnapshot(q, (snapshot) => {
        let messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        messages.sort((a, b) => {
            const timeA = a.createdAt?.seconds || a.timestamp?.seconds || 0;
            const timeB = b.createdAt?.seconds || b.timestamp?.seconds || 0;
            return timeA - timeB;
        });
        callback(messages);
    });
};

// ─── Send a message ───────────────────────────────────────────────────────────
export const sendMessage = async (chatId, senderId, senderName, senderRole, message, messageType = 'text', extraData = {}) => {
    await addDoc(collection(db, 'medical_messages'), {
        chatId,
        senderId,
        senderName,
        senderRole,
        message,
        messageType,
        ...extraData,
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp() // For compatibility with mobile which uses timestamp
    });

    // Update last message preview on the chat document
    await updateDoc(doc(db, 'medical_chats', chatId), {
        lastMessage: message,
        lastMessageAt: serverTimestamp(),
        status: 'active' // Ensure it becomes active once doctor replies
    });

    // If a doctor/admin is replying, notify the student
    const isAdminReply = senderRole === 'doctor' || senderRole === 'admin' || senderRole === 'medical_admin';
    if (isAdminReply) {
        try {
            const { getDoc } = await import('firebase/firestore');
            const chatSnap = await getDoc(doc(db, 'medical_chats', chatId));
            if (chatSnap.exists()) {
                const chatData = chatSnap.data();
                const studentId = chatData.userId || chatData.studentId || chatData.patientId;
                if (studentId && studentId !== senderId) {
                    await addDoc(collection(db, 'notifications'), {
                        userId: studentId,
                        title: `💬 Dr. ${senderName || 'Medical Team'} replied`,
                        message: message.length > 120 ? message.substring(0, 120) + '…' : message,
                        type: 'doctor_reply',
                        read: false,
                        severity: 'info',
                        chatId,
                        createdAt: serverTimestamp(),
                    });
                }
            }
        } catch (e) {
            console.warn('[sendMessage] Could not write student notification:', e);
        }
    }
};

// ─── Escalate chat to critical / dispatch ambulance ───────────────────────────
export const escalateToAmbulance = async (chatId, reportId) => {
    await updateDoc(doc(db, 'medical_chats', chatId), {
        escalated: true,
        escalatedAt: serverTimestamp(),
    });
    if (reportId) {
        await updateDoc(doc(db, 'security_alerts', reportId), {
            priority: 'critical',
            status: 'escalated',
        });
    }
};

// ─── Close a chat ─────────────────────────────────────────────────────────────
export const closeChat = async (chatId) => {
    await updateDoc(doc(db, 'medical_chats', chatId), {
        status: 'closed',
        closedAt: serverTimestamp(),
    });
};
