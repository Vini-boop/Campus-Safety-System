import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, KeyboardAvoidingView, Platform, Alert,
    ActivityIndicator, Image, Vibration, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/services/firebase';
import {
    collection, addDoc, onSnapshot, serverTimestamp,
    doc, setDoc, updateDoc, where, query,
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { uploadMediaFile } from '@/services/mediaUploadService';
import ChatService, { ChatMessage } from '@/services/chatService';
import { ConsultationWizard } from '@/components/ConsultationWizard';
import DoctorAIService, { AIResponse } from '@/services/doctorAIService';
import SymptomGuideModal from '@/components/SymptomGuideModal';

// ─── Enhanced AI Service Integration ──────────────────────────────────────────
const EC = '📞 0705824331';
const aiService = DoctorAIService.getInstance();

// Simple AI response generation - returns array of lines (STRICT FSM)
function getAIResponse(input: string): string[] {
    const response = aiService.processUserInput(input);
    return response.lines;
}

// Enhanced consultation response - ONE consolidated message (STRICT FORMAT)
function getConsultationResponse(data: any): string[] {
    const { symptoms, duration, painLevel, flags, history } = data;

    let response = '';

    // 1. Summary
    response += `📋 Consultation Summary:\n`;
    response += `• Symptoms: ${symptoms}\n`;
    response += `• Duration: ${duration}\n`;
    response += `• Pain level: ${painLevel}/10\n`;

    if (flags?.length > 0) {
        response += `• Additional concerns: ${flags.join(', ')}\n`;
    }

    if (history?.trim()) {
        response += `• Medical history: ${history.trim()}\n`;
    }

    response += '\n';

    // 2. Use AI service for structured analysis
    const analysisResponse = aiService.processUserInput(symptoms);

    // Append AI analysis
    if (analysisResponse.lines.length > 0) {
        response += analysisResponse.lines[0];
    }

    // 3. Urgency escalation (only if critical)
    if (painLevel >= 9 || flags?.includes('Difficulty breathing') || flags?.includes('Chest pain')) {
        response += '\n\n🚨 CRITICAL: Given the severity, use the ambulance button immediately if symptoms worsen.';
    }

    return [response];
}

// ─── Loading screen ───────────────────────────────────────────────────────────
function ChatLoadingScreen() {
    const pulse = useRef(new Animated.Value(1)).current;
    const spin = useRef(new Animated.Value(0)).current;
    const fadeIn = useRef(new Animated.Value(0)).current;
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeIn, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.12, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])).start();
        Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })).start();
        const da = (d: Animated.Value, delay: number) => Animated.loop(Animated.sequence([
            Animated.delay(delay),
            Animated.timing(d, { toValue: -8, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(d, { toValue: 0, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(600),
        ]));
        da(dot1, 0).start(); da(dot2, 150).start(); da(dot3, 300).start();
    }, []);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    return (
        <SafeAreaView style={ls.container}>
            <Animated.View style={[ls.content, { opacity: fadeIn }]}>
                <View style={ls.iconWrap}>
                    <Animated.View style={[ls.spinRing, { transform: [{ rotate }] }]} />
                    <Animated.View style={[ls.iconCircle, { transform: [{ scale: pulse }] }]}>
                        <Text style={ls.iconEmoji}>🏥</Text>
                    </Animated.View>
                </View>
                <Text style={ls.title}>Campus Health Center</Text>
                <Text style={ls.subtitle}>Connecting you to a doctor…</Text>
                <View style={ls.dotsRow}>
                    {[dot1, dot2, dot3].map((d, i) => (
                        <Animated.View key={i} style={[ls.dot, { transform: [{ translateY: d }] }]} />
                    ))}
                </View>
            </Animated.View>
        </SafeAreaView>
    );
}

const ls = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    content: { alignItems: 'center', paddingHorizontal: 32 },
    iconWrap: { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 28 },
    spinRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#0C156D', borderTopColor: 'transparent', borderRightColor: 'transparent' },
    iconCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#0C156D', justifyContent: 'center', alignItems: 'center', elevation: 10 },
    iconEmoji: { fontSize: 38 },
    title: { fontSize: 22, fontWeight: '800', color: '#0C156D', marginBottom: 6, textAlign: 'center' },
    subtitle: { fontSize: 14, color: '#5C6BC0', marginBottom: 24, textAlign: 'center' },
    dotsRow: { flexDirection: 'row', gap: 10 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0C156D' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DoctorChatScreen() {
    const router = useRouter();
    const { user, userProfile, isAuthenticated, authLoading } = useAuth();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [chatId, setChatId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [status, setStatus] = useState<'waiting' | 'active' | 'closed'>('waiting');
    const [showBanner, setShowBanner] = useState(true);
    const [showWizard, setShowWizard] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [showSymptomGuide, setShowSymptomGuide] = useState(false);

    const flatListRef = useRef<FlatList>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const aiActiveRef = useRef(false);          // true while AI is streaming
    const realDoctorRef = useRef(false);        // true once a real doctor joins
    const lastPatientMsgTimeRef = useRef(0);    // timestamp of last patient message
    const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 3-min timer

    // Auth guard
    useEffect(() => {
        if (!authLoading && !isAuthenticated) router.replace('/(auth)/login');
    }, [isAuthenticated, authLoading]);

    // ── Init chat ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !isAuthenticated) return;

        const initChat = async () => {
            try {
                const sessions = await ChatService.getUserChatSessions(user.uid);
                const active = sessions.find((s) => s.status === 'active' || s.status === 'waiting');
                let cid = active?.id;

                if (!cid) {
                    cid = `chat_${user.uid}_${Date.now()}`;
                    await setDoc(doc(db, 'medical_chats', cid), {
                        studentId: user.uid,
                        studentName: userProfile?.displayName || (userProfile as any)?.fullName || user.email,
                        studentEmail: user.email,
                        regNo: userProfile?.regNo || (userProfile as any)?.regNumber || null,
                        phone: userProfile?.phone || null,
                        isRegNumberVerified: !!userProfile?.isRegNumberVerified,
                        hostelName: (userProfile as any)?.hostelName || '',
                        roomNumber: (userProfile as any)?.roomNumber || '',
                        status: 'waiting',
                        createdAt: serverTimestamp(),
                        lastMessageAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        doctorId: null, doctorName: null,
                        category: 'general', priority: 'medium',
                    });
                }

                setChatId(cid);

                // Watch chat doc — detect real doctor joining
                const chatDocUnsub = onSnapshot(doc(db, 'medical_chats', cid), (snap) => {
                    if (!snap.exists()) return;
                    const d = snap.data();
                    const newStatus = d.status || 'waiting';
                    if (newStatus === 'active' && !realDoctorRef.current) {
                        realDoctorRef.current = true;
                        aiActiveRef.current = false; // stop AI mid-stream
                        if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
                    }
                    setStatus(newStatus);
                    setIsTyping(!!d.doctorIsTyping);
                });

                // Watch messages
                const msgsUnsub = ChatService.onChatMessages(cid, (msgs) => {
                    setMessages(msgs);
                    setLoading(false);

                    // If no messages, show wizard (no automatic greeting)
                    if (msgs.length === 0) {
                        setShowWizard(true);
                    }
                });

                unsubscribeRef.current = () => { chatDocUnsub(); msgsUnsub(); };
            } catch (err: any) {
                // Silently handle permission errors - chat may not be accessible
                if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
                    console.log('Chat initialization requires permissions - chat disabled');
                    Alert.alert('Chat Unavailable', 'Medical chat is currently unavailable. Please try again later.');
                } else {
                    console.error('Chat init failed:', err);
                    Alert.alert('Error', 'Failed to connect. Please try again.');
                }
                setLoading(false);
            }
        };

        initChat();
        return () => { unsubscribeRef.current?.(); };
    }, [user, isAuthenticated]);

    // ── AI streaming (Single consolidated message with realistic delay) ─────────
    const streamAI = useCallback(async (lines: string[], cid: string) => {
        if (realDoctorRef.current) return; // real doctor already here
        aiActiveRef.current = true;

        try { await updateDoc(doc(db, 'medical_chats', cid), { doctorIsTyping: true }); } catch { }

        // Realistic delay before sending (simulate reading/thinking)
        await new Promise((r) => setTimeout(r, 1500));

        // Send ONE consolidated message (STRICT - NO LINE-BY-LINE)
        if (aiActiveRef.current && lines.length > 0) {
            try {
                await addDoc(collection(db, 'medical_messages'), {
                    chatId: cid,
                    senderId: 'doctor_ai',
                    senderName: 'Doctor',
                    senderRole: 'doctor',
                    message: lines[0], // Only first line (should be consolidated)
                    messageType: 'text',
                    timestamp: serverTimestamp(),
                    isRead: false,
                    readBy: [],
                });

                console.log(`[AI] Sent consolidated response`);
            } catch (e) {
                console.warn('AI send failed:', e);
            }
        }

        try { await updateDoc(doc(db, 'medical_chats', cid), { doctorIsTyping: false }); } catch { }
        aiActiveRef.current = false;

        console.log(`✅ AI response complete`);
    }, []);

    // ── 3-minute fallback timer — fires if doctor hasn't replied ─────────────
    const scheduleAIFallback = useCallback((cid: string, patientText: string) => {
        if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
        aiTimerRef.current = setTimeout(() => {
            if (!realDoctorRef.current && !aiActiveRef.current) {
                const lines = [
                    'Sorry for the wait — I am still here with you.',
                    ...getAIResponse(patientText),
                ];
                streamAI(lines, cid);
            }
        }, 3 * 60 * 1000); // 3 minutes
    }, [streamAI]);

    // ── Send message ──────────────────────────────────────────────────────────
    const sendMessage = useCallback(async () => {
        if (!inputText.trim() || !chatId || !user) return;
        const text = inputText.trim();
        setInputText('');
        setSending(true);
        lastPatientMsgTimeRef.current = Date.now();

        try {
            Vibration.vibrate(50);
            await ChatService.sendMessage(chatId, text, 'text');
            await updateDoc(doc(db, 'medical_chats', chatId), { lastMessageAt: serverTimestamp() });
            await ChatService.markMessagesAsRead(chatId, user.uid);

            if (!realDoctorRef.current) {
                // Immediate AI reply using enhanced service
                streamAI(getAIResponse(text), chatId);
                // Also schedule 3-min fallback for next message if doctor doesn't reply
                scheduleAIFallback(chatId, text);
            }
        } catch (err: any) {
            // Silently handle permission errors
            if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
                console.log('Message send requires permissions - message not sent');
                Alert.alert('Message Not Sent', 'Unable to send message. Please try again later.');
            } else {
                console.error('Send failed:', err);
                Alert.alert('Error', 'Failed to send message. Please try again.');
            }
            setInputText(text);
        } finally {
            setSending(false);
        }
    }, [inputText, chatId, user, streamAI, scheduleAIFallback]);

    // ── Submit consultation ───────────────────────────────────────────────────
    const submitConsultation = async (data: any) => {
        setShowWizard(false);
        if (!chatId || !user) return;
        setSending(true);
        try {
            await ChatService.sendMessage(chatId, 'Submitted Consultation Summary', 'consultation_summary', { consultationData: data });
            await updateDoc(doc(db, 'medical_chats', chatId), { lastMessageAt: serverTimestamp() });
            streamAI(getConsultationResponse(data), chatId);
            scheduleAIFallback(chatId, data.symptoms);
        } catch (err: any) {
            // Silently handle permission errors
            if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
                console.log('Consultation submit requires permissions - submission failed');
                Alert.alert('Submission Failed', 'Unable to submit consultation. Please try again later.');
            } else {
                console.error('Consultation submit failed:', err);
                Alert.alert('Error', 'Failed to submit consultation details.');
            }
        } finally {
            setSending(false);
        }
    };

    // ── Image picker ──────────────────────────────────────────────────────────
    const pickAndSendImage = useCallback(async () => {
        if (!chatId || !user) return;
        const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm !== 'granted') { Alert.alert('Permission Required', 'Please grant photo library access.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
        if (!result.canceled && result.assets.length > 0) {
            setUploadingImage(true);
            try {
                const up = await uploadMediaFile(result.assets[0] as any, chatId);
                if (up.success && up.url) {
                    await ChatService.sendMessage(chatId, up.url, 'image');
                    await updateDoc(doc(db, 'medical_chats', chatId), { lastMessageAt: serverTimestamp() });
                } else Alert.alert('Upload Failed', 'Could not upload image.');
            } catch { Alert.alert('Error', 'Failed to send image.'); }
            finally { setUploadingImage(false); }
        }
    }, [chatId, user]);

    // ── Typing indicator to doctor ────────────────────────────────────────────
    const handleInputChange = (text: string) => {
        setInputText(text);
        if (!chatId) return;
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        updateDoc(doc(db, 'medical_chats', chatId), { studentIsTyping: true }).catch(() => { });
        typingTimeoutRef.current = setTimeout(() => {
            updateDoc(doc(db, 'medical_chats', chatId), { studentIsTyping: false }).catch(() => { });
        }, 3000);
    };

    const handleEscalate = () => {
        Alert.alert('🚨 Request Ambulance', 'Do you want to escalate this to an ambulance request?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Request Ambulance', style: 'destructive', onPress: () => router.push({ pathname: '/(tabs)/report', params: { mode: 'ambulance' } }) },
        ]);
    };

    const formatTime = (ts: any): string => {
        if (!ts) return '';
        try { return (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch { return ''; }
    };

    // ── Render message ────────────────────────────────────────────────────────
    const renderMessage = ({ item }: { item: ChatMessage }) => {
        if (item.senderRole === 'system') {
            return (
                <View style={s.sysWrap}>
                    <Text style={s.sysText}>{item.message || item.text}</Text>
                </View>
            );
        }

        const isStudent = item.senderRole === 'student';
        const msgText = item.message || item.text || '';
        const msgType = item.messageType || item.type || 'text';
        const imageUrl = item.imageUrl || (msgType === 'image' ? item.message : null);

        // Consultation summary card
        if (msgType === 'consultation_summary' && item.consultationData) {
            const cd = item.consultationData;
            return (
                <View style={[s.row, s.rowRight]}>
                    <View style={[s.bubble, s.studentBubble, { minWidth: '78%' }]}>
                        <Text style={[s.msgText, s.studentText, { fontWeight: 'bold', marginBottom: 6 }]}>📝 Consultation Summary</Text>
                        <Text style={[s.msgText, s.studentText, { fontSize: 13, opacity: 0.9 }]}>
                            <Text style={{ fontWeight: 'bold' }}>Symptoms:</Text> {cd.symptoms}{'\n'}
                            <Text style={{ fontWeight: 'bold' }}>Duration:</Text> {cd.duration}{'\n'}
                            <Text style={{ fontWeight: 'bold' }}>Pain Level:</Text> {cd.painLevel}/10
                            {cd.flags?.length > 0 && <Text>{'\n'}<Text style={{ fontWeight: 'bold' }}>Flags:</Text> {cd.flags.join(', ')}</Text>}
                            {cd.history?.trim() && <Text>{'\n'}<Text style={{ fontWeight: 'bold' }}>History:</Text> {cd.history}</Text>}
                        </Text>
                        <Text style={[s.timeText, s.studentTime, { marginTop: 6 }]}>{formatTime(item.timestamp || item.createdAt)}</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={[s.row, isStudent ? s.rowRight : s.rowLeft]}>
                <View style={[s.bubble, isStudent ? s.studentBubble : s.doctorBubble]}>
                    {!isStudent && <Text style={s.senderName}>{item.senderName}</Text>}
                    {msgType === 'image' && imageUrl
                        ? <Image source={{ uri: imageUrl }} style={s.msgImage} />
                        : <Text style={[s.msgText, isStudent ? s.studentText : s.doctorText]}>{msgText}</Text>
                    }
                    <Text style={[s.timeText, isStudent ? s.studentTime : s.doctorTime]}>
                        {formatTime(item.timestamp || item.createdAt)}
                    </Text>
                </View>
            </View>
        );
    };

    // ── Guards ────────────────────────────────────────────────────────────────
    if (authLoading || (loading && !chatId)) return <ChatLoadingScreen />;

    if (showWizard) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
                <ConsultationWizard
                    onSubmit={submitConsultation}
                    onCancel={() => { setShowWizard(false); if (messages.length === 0) router.back(); }}
                />
            </SafeAreaView>
        );
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>Doctor Chat</Text>
                    <View style={s.statusRow}>
                        <View style={[s.statusDot, status === 'active' ? s.dotActive : s.dotWaiting]} />
                        <Text style={s.statusText}>
                            {status === 'active' ? 'Doctor connected' : status === 'closed' ? 'Closed' : 'Doctor on duty'}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => setShowSymptomGuide(true)} style={s.guideBtn}>
                    <Ionicons name="help-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Emergency banner */}
            <TouchableOpacity style={s.emergencyBanner} onPress={handleEscalate} activeOpacity={0.85}>
                <Text style={s.emergencyText}>🚨 Need Urgent Help? Request Ambulance</Text>
            </TouchableOpacity>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
                {/* Info banner */}
                {showBanner && (
                    <View style={s.infoBanner}>
                        <Ionicons name="medical" size={18} color="#0C156D" style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.infoTitle}>Campus Health Center</Text>
                            <Text style={s.infoSub}>Describe your symptoms and the doctor will respond.</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowBanner(false)}>
                            <Ionicons name="close" size={18} color="#666" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Typing indicator */}
                {isTyping && (
                    <View style={s.typingRow}>
                        <ActivityIndicator size="small" color="#0C156D" />
                        <Text style={s.typingText}>  Doctor is typing…</Text>
                    </View>
                )}

                {/* Messages */}
                {loading
                    ? <View style={s.loadingWrap}><ActivityIndicator size="small" color="#0C156D" /></View>
                    : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={(item, i) => item.id || `m-${i}`}
                            renderItem={renderMessage}
                            contentContainerStyle={s.msgList}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                            ListEmptyComponent={
                                <View style={s.emptyWrap}>
                                    <Ionicons name="chatbubbles-outline" size={48} color="#CCC" />
                                    <Text style={s.emptyText}>No messages yet. Describe your symptoms.</Text>
                                </View>
                            }
                        />
                    )
                }

                {/* Input */}
                <View style={s.inputRow}>
                    <TouchableOpacity style={s.attachBtn} onPress={pickAndSendImage} disabled={uploadingImage || !chatId}>
                        {uploadingImage
                            ? <ActivityIndicator size="small" color="#0C156D" />
                            : <Ionicons name="camera-outline" size={24} color="#0C156D" />
                        }
                    </TouchableOpacity>
                    <TextInput
                        style={s.input}
                        value={inputText}
                        onChangeText={handleInputChange}
                        placeholder="Type your message..."
                        placeholderTextColor="#999"
                        maxLength={1000}
                        editable={!!chatId}
                        onSubmitEditing={sendMessage}
                        returnKeyType="send"
                        blurOnSubmit={false}
                    />
                    <TouchableOpacity
                        style={[s.sendBtn, (!inputText.trim() || sending) && s.sendBtnDisabled]}
                        onPress={sendMessage}
                        disabled={!inputText.trim() || sending || !chatId}
                    >
                        {sending
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="send" size={20} color="#fff" />
                        }
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>

            {/* Symptom Guide Modal */}
            <SymptomGuideModal
                visible={showSymptomGuide}
                onClose={() => setShowSymptomGuide(false)}
            />
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    header: {
        backgroundColor: '#0C156D', flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 2, borderBottomColor: '#1a237e', elevation: 4,
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    guideBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
    dotActive: { backgroundColor: '#4CAF50' },
    dotWaiting: { backgroundColor: '#FFC107' },
    statusText: { color: '#CCDFFF', fontSize: 12 },
    emergencyBanner: { backgroundColor: '#C62828', paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
    emergencyText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    infoBanner: {
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: '#E8EAF6', borderBottomWidth: 1, borderBottomColor: '#C5CAE9',
        paddingHorizontal: 12, paddingVertical: 10,
    },
    infoTitle: { color: '#0C156D', fontWeight: '700', fontSize: 13 },
    infoSub: { color: '#444', fontSize: 12, marginTop: 2 },
    typingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 16 },
    typingText: { fontSize: 12, color: '#666' },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    msgList: { paddingVertical: 12, paddingHorizontal: 10 },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { color: '#666', fontSize: 14, marginTop: 12, textAlign: 'center' },
    row: { marginVertical: 4 },
    rowLeft: { alignItems: 'flex-start' },
    rowRight: { alignItems: 'flex-end' },
    bubble: {
        maxWidth: '78%', borderRadius: 18,
        paddingVertical: 10, paddingHorizontal: 14,
        elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
    },
    studentBubble: { backgroundColor: '#0C156D', borderBottomRightRadius: 4, borderWidth: 1, borderColor: '#1a237e' },
    doctorBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E0E0E0', elevation: 1 },
    senderName: { fontSize: 11, color: '#888', marginBottom: 2, fontWeight: '600' },
    msgText: { fontSize: 15, lineHeight: 22 },
    studentText: { color: '#fff' },
    doctorText: { color: '#1A1A1A' },
    timeText: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end', fontWeight: '500' },
    studentTime: { color: 'rgba(255,255,255,0.6)' },
    doctorTime: { color: '#999' },
    msgImage: { width: 200, height: 150, borderRadius: 10 },
    sysWrap: { alignItems: 'center', marginVertical: 8, paddingHorizontal: 16 },
    sysText: { color: '#888', fontSize: 12, fontStyle: 'italic', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#E0E0E0', backgroundColor: '#fff' },
    attachBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    input: { flex: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20, paddingHorizontal: 16, fontSize: 14, color: '#333' },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0C156D', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
    sendBtnDisabled: { backgroundColor: 'rgba(0,0,0,0.1)' },
});
