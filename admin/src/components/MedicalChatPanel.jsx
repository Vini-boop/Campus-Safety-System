import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ChatBubbleLeftRightIcon, PaperAirplaneIcon,
    TruckIcon, XMarkIcon, ArrowPathIcon,
    ExclamationTriangleIcon, CpuChipIcon,
} from '@heroicons/react/24/outline';
import { listenToChats, listenToMessages, sendMessage, escalateToAmbulance, closeChat } from '../services/chatService';
import { doc, updateDoc, serverTimestamp, onSnapshot, addDoc, collection } from 'firebase/firestore';
import { db } from '../services/firebase';
import { formatDistanceToNow } from 'date-fns';

// ─── Chat list item ────────────────────────────────────────────────────────────
const ChatListItem = ({ chat, isActive, onClick, dark }) => {
    const timeAgo = chat.createdAt
        ? formatDistanceToNow(
            chat.createdAt.seconds ? new Date(chat.createdAt.seconds * 1000) : new Date(chat.createdAt),
            { addSuffix: true }
        )
        : 'Just now';

    const isWaiting = chat.status === 'waiting';

    return (
        <button onClick={onClick}
            className={`w-full text-left p-3 rounded-xl transition-all border ${isActive
                ? 'bg-blue-600/20 border-blue-500/40'
                : dark
                    ? 'bg-[#0D1130] border-[#1e2347] hover:border-[#3d4466]'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}>
            <div className="flex items-center gap-2 mb-1">
                <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {chat.studentName?.[0] || 'S'}
                    </div>
                    {/* AI indicator dot */}
                    {isWaiting && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-[#0D1130] flex items-center justify-center">
                            <CpuChipIcon className="w-1.5 h-1.5 text-white" />
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>{chat.studentName || 'Student'}</p>
                    <p className={`text-[10px] ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{timeAgo}</p>
                </div>
                {chat.escalated && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-500/20 text-red-500 border border-red-500/30 rounded-full">CRITICAL</span>
                )}
                {isWaiting && !chat.escalated && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-full animate-pulse">AI</span>
                )}
            </div>
            <p className={`text-[10px] truncate pl-10 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{chat.lastMessage || 'No messages yet'}</p>
        </button>
    );
};

// ─── Message bubble ────────────────────────────────────────────────────────────
const MessageBubble = ({ msg, dark }) => {
    const ts = msg.timestamp || msg.createdAt;
    const timeStr = ts
        ? (ts.seconds
            ? new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        : '';

    const isDoctor = msg.senderRole === 'doctor' || msg.senderRole === 'admin';
    const isAI = msg.senderId === 'doctor_ai';
    const isStudent = msg.senderRole === 'student';

    // Consultation summary card
    if (msg.messageType === 'consultation_summary' && msg.consultationData) {
        const cd = msg.consultationData;
        return (
            <div className="flex justify-start mb-3">
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 rounded-bl-md shadow-md border ${dark ? 'bg-[#1e2347] border-[#252A41] text-gray-200' : 'bg-blue-50 border-blue-200 text-gray-800'}`}>
                    <p className={`text-[10px] uppercase font-bold mb-2 border-b pb-1 ${dark ? 'text-blue-400 border-[#252A41]' : 'text-blue-600 border-blue-200'}`}>📝 Initial Consultation Summary</p>
                    <p className="text-sm leading-relaxed mb-1"><strong className={dark ? 'text-gray-400' : 'text-gray-600'}>Symptoms:</strong> {cd.symptoms}</p>
                    <p className="text-sm leading-relaxed mb-1"><strong className={dark ? 'text-gray-400' : 'text-gray-600'}>Duration:</strong> {cd.duration}</p>
                    <p className="text-sm leading-relaxed mb-1"><strong className={dark ? 'text-gray-400' : 'text-gray-600'}>Pain Level:</strong> {cd.painLevel}/10</p>
                    {cd.flags?.length > 0 && <p className="text-sm leading-relaxed mb-1"><strong className={dark ? 'text-gray-400' : 'text-gray-600'}>Flags:</strong> {cd.flags.join(', ')}</p>}
                    {cd.history?.trim() && <p className="text-sm leading-relaxed mb-1"><strong className={dark ? 'text-gray-400' : 'text-gray-600'}>History:</strong> {cd.history}</p>}
                    <p className={`text-[9px] mt-2 text-right ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{timeStr}</p>
                </div>
            </div>
        );
    }

    // Doctor response action card
    if (msg.messageType === 'doctor_response' && msg.doctorResponse) {
        const resp = msg.doctorResponse;
        const isEmergency = resp.recommendation === 'emergency';
        return (
            <div className="flex justify-end mb-3">
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 rounded-br-md shadow-md ${isEmergency ? 'bg-red-600/20 border border-red-500/50 text-white' : 'bg-blue-600 text-white'}`}>
                    <div className="text-[10px] uppercase font-bold mb-2 border-b border-white/20 pb-1">
                        {resp.recommendation === 'medication' && '💊 Medication Prescribed'}
                        {resp.recommendation === 'visit' && '🏥 Office Visit Recommended'}
                        {resp.recommendation === 'test' && '🔬 Tests Required'}
                        {resp.recommendation === 'emergency' && '🚨 Emergency Escalation'}
                    </div>
                    <p className="text-sm leading-relaxed">{msg.message}</p>
                    {resp.prescribedMedication && (
                        <div className="bg-black/20 p-2 rounded-lg mt-2 text-xs italic border border-white/10">
                            <strong className="not-italic block mb-0.5 text-blue-100">Prescription:</strong>
                            {resp.prescribedMedication}
                        </div>
                    )}
                    <p className={`text-[9px] mt-2 text-right ${isEmergency ? 'text-red-200' : 'text-blue-200'}`}>{timeStr}</p>
                </div>
            </div>
        );
    }

    // AI message — shown on left with indigo tint so doctor can distinguish
    if (isAI) {
        return (
            <div className="flex justify-start mb-2">
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 rounded-bl-md shadow-sm border ${dark ? 'bg-indigo-900/30 border-indigo-500/30 text-indigo-100' : 'bg-indigo-50 border-indigo-200 text-indigo-900'}`}>
                    <p className={`text-[9px] font-bold mb-0.5 flex items-center gap-1 ${dark ? 'text-indigo-400' : 'text-indigo-500'}`}>
                        <CpuChipIcon className="w-3 h-3" /> AI Auto-reply
                    </p>
                    <p className="text-sm leading-relaxed">{msg.message}</p>
                    <p className={`text-[9px] mt-1 text-right ${dark ? 'text-indigo-400/60' : 'text-indigo-400'}`}>{timeStr}</p>
                </div>
            </div>
        );
    }

    // Regular student or doctor message
    return (
        <div className={`flex ${isDoctor ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${isDoctor
                ? 'bg-blue-600 text-white rounded-br-md shadow-sm'
                : dark ? 'bg-[#1e2347] text-gray-200 rounded-bl-md shadow-sm' : 'bg-gray-100 text-gray-800 rounded-bl-md shadow-sm'
                }`}>
                {isStudent && (
                    <p className={`text-[9px] font-bold mb-0.5 ${dark ? 'text-blue-400' : 'text-blue-500'}`}>{msg.senderName || 'Student'}</p>
                )}
                {msg.messageType === 'image' || msg.type === 'image'
                    ? <img src={msg.message || msg.imageUrl} alt="attachment" className="rounded-lg max-w-full max-h-48 mt-1" />
                    : <p className="text-sm leading-relaxed">{msg.message}</p>
                }
                <p className={`text-[9px] mt-1 text-right ${isDoctor ? 'text-blue-200' : dark ? 'text-gray-500' : 'text-gray-400'}`}>{timeStr}</p>
            </div>
        </div>
    );
};

// ─── Embedded AI knowledge base (consolidated responses - STRICT FSM) ────────
const EC = '📞 0705824331';

// Symptom database matching mobile implementation
const SYMPTOM_CONDITIONS = {
    fever_malaria: {
        keywords: ['fever', 'chills', 'headache', 'sweating', 'malaria'],
        condition: 'Malaria (moderate likelihood)',
        symptoms: ['fever', 'chills', 'headache', 'sweating'],
        advice: [
            'Take paracetamol for pain or fever (follow dosage instructions)',
            'Drink plenty of fluids (water, soups, ORS)',
            'Get enough rest',
            'Eat light meals and avoid skipping food',
            'Use a cool compress if your temperature rises'
        ],
        warnings: [
            'Do NOT take antibiotics without medical advice',
            'Avoid mixing multiple medications',
            'Monitor your symptoms closely'
        ],
        escalation: [
            'High fever that keeps rising',
            'Persistent vomiting',
            'Severe weakness or dizziness',
            'Chest pain or difficulty breathing'
        ],
        followUp: 'If symptoms continue beyond 2–3 days, visit a healthcare provider for proper testing (especially for malaria).'
    },
    viral_infection: {
        keywords: ['headache', 'stomach pain', 'mild fever', 'fatigue', 'tired', 'weak'],
        condition: 'Viral infection or early malaria (moderate likelihood)',
        symptoms: ['headache', 'stomach discomfort', 'mild fever', 'fatigue'],
        advice: [
            'Take paracetamol for pain or fever (follow dosage instructions)',
            'Drink plenty of fluids (water, soups, ORS)',
            'Get enough rest',
            'Eat light meals and avoid skipping food',
            'Use a cool compress if your temperature rises'
        ],
        warnings: [
            'Do NOT take antibiotics without medical advice',
            'Avoid mixing multiple medications',
            'Monitor your symptoms closely'
        ],
        escalation: [
            'High fever that keeps rising',
            'Persistent vomiting',
            'Severe weakness or dizziness',
            'Chest pain or difficulty breathing'
        ],
        followUp: 'If symptoms continue beyond 2–3 days, visit a healthcare provider for proper testing.'
    },
    cold_flu: {
        keywords: ['runny nose', 'cough', 'sneezing', 'sore throat', 'congestion'],
        condition: 'Common Cold or Flu',
        symptoms: ['runny nose', 'cough', 'sneezing', 'sore throat'],
        advice: [
            'Drink warm fluids (tea, soup, warm water)',
            'Get plenty of rest',
            'Take Vitamin C supplements',
            'Use steam inhalation for congestion',
            'Gargle with salt water for sore throat'
        ],
        warnings: [
            'Do NOT take antibiotics (they don\'t work for viral infections)',
            'Avoid cold drinks and ice cream',
            'Don\'t ignore worsening symptoms'
        ],
        escalation: [
            'Fever above 39°C',
            'Difficulty breathing',
            'Chest pain',
            'Symptoms lasting more than 7 days'
        ],
        followUp: 'Most colds resolve within 5-7 days. If symptoms persist or worsen, visit a healthcare provider.'
    },
    pneumonia: {
        keywords: ['chest pain', 'difficulty breathing', 'persistent cough', 'high fever', 'breathing'],
        condition: 'Pneumonia (requires immediate attention)',
        symptoms: ['chest pain', 'difficulty breathing', 'persistent cough', 'high fever'],
        advice: [
            '⚠️ Seek medical attention IMMEDIATELY',
            'Do NOT delay visiting a healthcare facility',
            'Rest and avoid physical exertion',
            'Keep warm and stay hydrated'
        ],
        warnings: [
            'This is a SERIOUS condition',
            'Requires antibiotics and possibly hospitalization',
            'Do NOT self-medicate'
        ],
        escalation: [
            'Severe difficulty breathing',
            'Blue lips or fingernails',
            'Confusion or altered consciousness',
            'Coughing up blood'
        ],
        followUp: 'Visit the medical center TODAY for chest X-ray and proper treatment.'
    },
    headache_stress: {
        keywords: ['headache', 'stress', 'tired', 'dizziness', 'dizzy'],
        condition: 'Tension Headache or Stress',
        symptoms: ['headache', 'fatigue', 'stress'],
        advice: [
            'Rest in a quiet, dark room',
            'Drink plenty of water (dehydration causes headaches)',
            'Take paracetamol or ibuprofen if needed',
            'Apply a cold or warm compress to your head',
            'Reduce screen time and take breaks'
        ],
        warnings: [
            'Don\'t skip meals (low blood sugar worsens headaches)',
            'Avoid excessive caffeine',
            'Don\'t ignore persistent headaches'
        ],
        escalation: [
            'Sudden severe headache (worst of your life)',
            'Headache with fever and stiff neck',
            'Vision changes or confusion',
            'Headache after head injury'
        ],
        followUp: 'If headaches persist for more than 3 days or become severe, consult a healthcare provider.'
    },
    stomach_issues: {
        keywords: ['stomach', 'nausea', 'vomiting', 'diarrhea', 'abdominal'],
        condition: 'Gastroenteritis or Food Poisoning',
        symptoms: ['stomach pain', 'nausea', 'vomiting', 'diarrhea'],
        advice: [
            'Drink oral rehydration solution (ORS) or water',
            'Avoid solid food for a few hours',
            'Eat bland foods (rice, bananas, toast)',
            'Rest and avoid strenuous activity'
        ],
        warnings: [
            'Do NOT take anti-diarrhea medication without medical advice',
            'Avoid dairy, spicy, or oily foods',
            'Monitor for dehydration signs'
        ],
        escalation: [
            'Blood in vomit or stool',
            'Severe dehydration (dry mouth, no urination)',
            'High fever above 39°C',
            'Symptoms lasting more than 3 days'
        ],
        followUp: 'If symptoms persist beyond 2 days or worsen, seek medical attention.'
    }
};

// Extract symptoms from input
function extractSymptoms(input) {
    const symptoms = [];
    const symptomKeywords = [
        'fever', 'headache', 'cough', 'cold', 'stomach pain', 'nausea',
        'vomiting', 'diarrhea', 'chills', 'sweating', 'fatigue', 'weakness',
        'sore throat', 'runny nose', 'chest pain', 'difficulty breathing',
        'dizziness', 'stress'
    ];
    symptomKeywords.forEach(keyword => {
        if (input.includes(keyword)) symptoms.push(keyword);
    });
    return symptoms;
}

// Find best matching condition with minimum 2 keyword requirement (STRICT)
function findBestMatch(input) {
    let bestMatch = null;
    let maxMatches = 0;

    for (const condition of Object.values(SYMPTOM_CONDITIONS)) {
        const matches = condition.keywords.filter(keyword => input.includes(keyword)).length;
        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = condition;
        }
    }

    // Return null if less than 2 matches (STRICT RULE)
    if (!bestMatch || maxMatches < 2) return null;
    return { condition: bestMatch, matchCount: maxMatches };
}

// Check for emergency keywords (FIRST PRIORITY - overrides FSM)
function isEmergency(input) {
    const emergencyKeywords = [
        'emergency', 'urgent', 'severe pain', "can't breathe", 'cant breathe',
        'chest pain', 'heart attack', 'unconscious', 'bleeding heavily',
        'heavy bleeding', 'seizure', 'convulsion', 'very high fever',
        'difficulty breathing', 'choking', 'stroke', 'paralysis',
        'severe bleeding', 'suicide', 'overdose'
    ];
    return emergencyKeywords.some(keyword => input.includes(keyword));
}

// Generate ONE consolidated AI response (STRICT FORMAT - NO CONVERSATIONAL TEXT)
function getAIConsolidatedResponse(input) {
    const lower = (input || '').toLowerCase();

    // EMERGENCY OVERRIDE (FIRST PRIORITY)
    if (isEmergency(lower)) {
        return `🚨 MEDICAL EMERGENCY DETECTED\n\nSeek immediate medical attention or call emergency services NOW.\n\n📞 Emergency Contact: ${EC}\n\nIf on campus, use the ambulance request button.\n\nDo NOT wait - this requires urgent care.`;
    }

    const detectedSymptoms = extractSymptoms(lower);
    const matchResult = findBestMatch(lower);

    // Require at least 2 keyword matches (STRICT RULE)
    if (!matchResult || matchResult.matchCount < 2) {
        return 'Please provide more details. Include symptoms like:\n• Fever or chills\n• Pain location and intensity\n• Duration of symptoms\n• Any other discomfort';
    }

    const matchedCondition = matchResult.condition;
    let response = '';

    // STRICT FORMAT (NO CONVERSATIONAL TEXT)
    // 1. Assessment
    response += `🩺 Assessment: ${matchedCondition.condition}\n\n`;

    // 2. Detected Symptoms
    if (detectedSymptoms.length > 0) {
        response += `📋 Detected Symptoms: ${detectedSymptoms.join(', ')}\n\n`;
    }

    // 3. Recommended Actions
    response += '💊 Recommended Actions:\n';
    matchedCondition.advice.forEach(advice => {
        response += `• ${advice}\n`;
    });

    // 4. Precautions
    if (matchedCondition.warnings && matchedCondition.warnings.length > 0) {
        response += '\n⚠️ Precautions:\n';
        matchedCondition.warnings.forEach(warning => {
            response += `• ${warning}\n`;
        });
    }

    // 5. When to Seek Help
    if (matchedCondition.escalation && matchedCondition.escalation.length > 0) {
        response += '\n🚨 Seek immediate medical attention if:\n';
        matchedCondition.escalation.forEach(symptom => {
            response += `• ${symptom}\n`;
        });
    }

    // 6. Follow-up
    if (matchedCondition.followUp) {
        response += `\n📅 Follow-up: ${matchedCondition.followUp}\n`;
    }

    // 7. Contact
    response += `\n📞 Contact: ${EC}\n`;

    // 8. Disclaimer
    response += '\n👨‍⚕️ Disclaimer: This system provides guidance only and is not a medical diagnosis. Please consult a qualified healthcare professional.';

    return response;
}

// ─── Main component ────────────────────────────────────────────────────────────
const MedicalChatPanel = ({ session, dark = true }) => {
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [medication, setMedication] = useState('');
    const [showMedInput, setShowMedInput] = useState(false);
    const [sending, setSending] = useState(false);
    const [escalating, setEscalating] = useState(false);
    const [closing, setClosing] = useState(false);
    const [studentTyping, setStudentTyping] = useState(false);

    const bottomRef = useRef(null);
    const typingTimerRef = useRef(null);
    // Track which chatIds the AI is currently streaming for
    const aiActiveChats = useRef(new Set());
    // 3-min fallback timers per chatId
    const aiTimers = useRef({});
    // Track last student message per chatId for fallback
    const lastStudentMsg = useRef({});

    // ── Listen to all waiting/active chats ────────────────────────────────────
    useEffect(() => {
        const unsub = listenToChats(setChats);
        return () => unsub();
    }, []);

    // ── Listen to messages + watch for new student messages to trigger AI ─────
    useEffect(() => {
        if (!activeChat) { setMessages([]); return; }

        // Watch student typing indicator
        const chatUnsub = onSnapshot(doc(db, 'medical_chats', activeChat.id), snap => {
            if (snap.exists()) setStudentTyping(!!snap.data().studentIsTyping);
        });

        const msgsUnsub = listenToMessages(activeChat.id, (msgs) => {
            setMessages(msgs);
            // Find the latest student message
            const studentMsgs = msgs.filter(m => m.senderRole === 'student');
            if (studentMsgs.length === 0) return;
            const latest = studentMsgs[studentMsgs.length - 1];
            const latestId = latest.id;
            const chatId = activeChat.id;

            // Only trigger AI if chat is still waiting (no real doctor has replied)
            const chatData = chats.find(c => c.id === chatId);
            const isWaiting = chatData?.status === 'waiting' || activeChat.status === 'waiting';
            if (!isWaiting) return;

            // Don't re-trigger for the same message
            if (lastStudentMsg.current[chatId] === latestId) return;
            lastStudentMsg.current[chatId] = latestId;

            // Cancel any existing 3-min timer for this chat
            if (aiTimers.current[chatId]) clearTimeout(aiTimers.current[chatId]);

            // Stream AI reply immediately (ONE consolidated message)
            streamAI(chatId, getAIConsolidatedResponse(latest.message));

            // Set 3-min fallback — if doctor still hasn't replied, AI checks in again
            aiTimers.current[chatId] = setTimeout(() => {
                if (!aiActiveChats.current.has(chatId)) {
                    streamAI(chatId, 'Sorry for the wait — I am still here with you. A doctor will be with you shortly. ' + getAIConsolidatedResponse(latest.message));
                }
            }, 3 * 60 * 1000);
        });

        return () => { chatUnsub(); msgsUnsub(); };
    }, [activeChat?.id, chats]);

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── AI streaming — ONE consolidated message ───────────────────────────────
    const streamAI = useCallback(async (chatId, messageText) => {
        if (aiActiveChats.current.has(chatId)) return;
        aiActiveChats.current.add(chatId);

        // Show typing indicator on mobile
        try { await updateDoc(doc(db, 'medical_chats', chatId), { doctorIsTyping: true }); } catch { }

        // Realistic delay before sending (simulate reading/thinking)
        await new Promise(r => setTimeout(r, 1500));

        try {
            await addDoc(collection(db, 'medical_messages'), {
                chatId,
                senderId: 'doctor_ai',
                senderName: 'Doctor',
                senderRole: 'doctor',
                message: messageText,
                messageType: 'text',
                timestamp: serverTimestamp(),
                createdAt: serverTimestamp(),
                isRead: false,
                readBy: [],
            });
        } catch (e) {
            console.warn('AI message failed:', e);
        }

        try { await updateDoc(doc(db, 'medical_chats', chatId), { doctorIsTyping: false }); } catch { }
        aiActiveChats.current.delete(chatId);
    }, []);

    // ── Doctor takes over — stop AI for this chat ─────────────────────────────
    const takeOver = useCallback(async (chatId) => {
        aiActiveChats.current.delete(chatId); // stop AI mid-stream
        if (aiTimers.current[chatId]) {
            clearTimeout(aiTimers.current[chatId]);
            delete aiTimers.current[chatId];
        }
        // Mark chat as active so mobile AI also stops
        try {
            await updateDoc(doc(db, 'medical_chats', chatId), {
                status: 'active',
                doctorIsTyping: false,
            });
        } catch { }
    }, []);

    // ── Send message (real doctor) ────────────────────────────────────────────
    const handleSend = async () => {
        if (!input.trim() || !activeChat) return;
        setSending(true);
        // Take over from AI before sending
        await takeOver(activeChat.id);
        try {
            await sendMessage(activeChat.id, session?.uid || 'doctor', session?.name || 'Doctor', 'doctor', input.trim());
            setInput('');
        } catch (e) { console.error('Send failed:', e); }
        finally { setSending(false); }
    };

    const handleSendAction = async (recommendation) => {
        if (!activeChat) return;
        if (!input.trim() && recommendation !== 'emergency') return;
        setSending(true);
        await takeOver(activeChat.id);
        try {
            await sendMessage(
                activeChat.id, session?.uid || 'doctor', session?.name || 'Doctor', 'doctor',
                input.trim() || 'Please seek immediate emergency assistance.',
                'doctor_response',
                { doctorResponse: { recommendation, prescribedMedication: recommendation === 'medication' ? medication : null } }
            );
            setInput(''); setMedication(''); setShowMedInput(false);
        } catch (e) { console.error('Action send failed:', e); }
        finally { setSending(false); }
    };

    // ── Doctor typing indicator → mobile sees it ──────────────────────────────
    const handleInputChange = (val) => {
        setInput(val);
        if (!activeChat) return;
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        // Only set doctorIsTyping if doctor has taken over
        const chatData = chats.find(c => c.id === activeChat.id);
        if (chatData?.status === 'active') {
            updateDoc(doc(db, 'medical_chats', activeChat.id), { doctorIsTyping: true }).catch(() => { });
            typingTimerRef.current = setTimeout(() => {
                updateDoc(doc(db, 'medical_chats', activeChat.id), { doctorIsTyping: false }).catch(() => { });
            }, 3000);
        }
    };

    const handleEscalate = async () => {
        if (!activeChat) return;
        setEscalating(true);
        await takeOver(activeChat.id);
        try {
            await escalateToAmbulance(activeChat.id, activeChat.reportId || null);
            setActiveChat(prev => ({ ...prev, escalated: true }));
        } catch (e) { console.error('Escalation failed:', e); }
        finally { setEscalating(false); }
    };

    const handleClose = async () => {
        if (!activeChat) return;
        setClosing(true);
        await takeOver(activeChat.id);
        try {
            await closeChat(activeChat.id);
            setActiveChat(null);
        } catch (e) { console.error('Close failed:', e); }
        finally { setClosing(false); }
    };

    const activeChatData = chats.find(c => c.id === activeChat?.id) || activeChat;
    const isAIHandling = activeChatData?.status === 'waiting';

    return (
        <div className={`flex h-full border rounded-2xl overflow-hidden ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>

            {/* ── Left: Chat list ── */}
            <div className={`w-60 border-r flex flex-col shrink-0 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                <div className={`p-3 border-b flex items-center gap-2 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                    <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-500" />
                    <span className={`text-sm font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Active Chats</span>
                    {chats.length > 0 && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 bg-blue-600 text-white rounded-full">{chats.length}</span>}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {chats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 gap-2">
                            <ChatBubbleLeftRightIcon className={`w-8 h-8 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
                            <p className={`text-[11px] text-center ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No active chats</p>
                        </div>
                    ) : chats.map(chat => (
                        <ChatListItem key={chat.id} chat={chat} isActive={activeChat?.id === chat.id} onClick={() => setActiveChat(chat)} dark={dark} />
                    ))}
                </div>
            </div>

            {/* ── Right: Message thread ── */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeChat ? (
                    <>
                        {/* Chat header */}
                        <div className={`px-4 py-3 border-b flex items-center gap-3 shrink-0 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                {activeChatData?.studentName?.[0] || 'S'}
                            </div>
                            <div className="flex-1">
                                <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{activeChatData?.studentName || 'Student'}</p>
                                <p className={`text-[10px] flex items-center gap-1 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {activeChatData?.escalated ? '🔴 Escalated' : isAIHandling ? <><CpuChipIcon className="w-3 h-3 text-indigo-400" /><span className="text-indigo-400">AI handling</span></> : '🟢 Doctor active'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Take over button — visible when AI is handling */}
                                {isAIHandling && (
                                    <button onClick={() => takeOver(activeChat.id)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors">
                                        <CpuChipIcon className="w-3.5 h-3.5" /> Take Over
                                    </button>
                                )}
                                {!activeChatData?.escalated && (
                                    <button onClick={handleEscalate} disabled={escalating}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
                                        {escalating ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TruckIcon className="w-3.5 h-3.5" />}
                                        Dispatch
                                    </button>
                                )}
                                <button onClick={handleClose} disabled={closing}
                                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${dark ? 'bg-[#1e2347] hover:bg-[#252A41] text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}>
                                    <XMarkIcon className="w-3.5 h-3.5" /> Close
                                </button>
                            </div>
                        </div>

                        {/* AI handling notice */}
                        {isAIHandling && (
                            <div className={`mx-4 mt-3 p-2.5 rounded-xl border flex items-center gap-2 ${dark ? 'bg-indigo-900/20 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'}`}>
                                <CpuChipIcon className={`w-4 h-4 shrink-0 ${dark ? 'text-indigo-400' : 'text-indigo-500'}`} />
                                <p className={`text-xs ${dark ? 'text-indigo-300' : 'text-indigo-700'}`}>
                                    AI is responding to this patient. Click <strong>Take Over</strong> to reply as the doctor — the patient won't notice the switch.
                                </p>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                                    <ChatBubbleLeftRightIcon className={`w-10 h-10 ${dark ? 'text-gray-700' : 'text-gray-300'}`} />
                                    <p className={`text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>No messages yet.</p>
                                </div>
                            ) : messages.map(msg => (
                                <MessageBubble key={msg.id} msg={msg} dark={dark} />
                            ))}
                            {studentTyping && (
                                <div className={`flex items-center gap-2 px-3 py-1.5 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    <span className="flex gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </span>
                                    Student is typing…
                                </div>
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {activeChatData?.escalated && (
                            <div className="mx-4 mb-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
                                <ExclamationTriangleIcon className="w-4 h-4 text-red-500 shrink-0" />
                                <p className="text-red-500 text-xs font-medium">Case escalated — ambulance dispatch requested.</p>
                            </div>
                        )}

                        {/* Input */}
                        <div className={`p-3 border-t flex items-center gap-2 shrink-0 ${dark ? 'border-[#1e2347] bg-[#0D1130]' : 'border-gray-200 bg-gray-50'}`}>
                            <input
                                type="text" value={input}
                                onChange={e => handleInputChange(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                placeholder={isAIHandling ? 'Type to take over from AI…' : 'Type a message…'}
                                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 ${dark ? 'bg-[#141728] border-[#252A41] text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                            />
                            <button onClick={handleSend} disabled={sending || !input.trim()}
                                className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors">
                                {sending ? <ArrowPathIcon className="w-4 h-4 text-white animate-spin" /> : <PaperAirplaneIcon className="w-4 h-4 text-white" />}
                            </button>
                        </div>

                        {/* Action buttons */}
                        {!showMedInput ? (
                            <div className={`flex flex-wrap gap-2 px-3 pb-3 shrink-0 ${dark ? 'bg-[#0D1130]' : 'bg-gray-50'}`}>
                                <button onClick={() => setShowMedInput(true)} className="px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-500 font-semibold text-[11px] rounded transition-colors border border-indigo-500/30">💊 Prescribe Meds</button>
                                <button onClick={() => handleSendAction('visit')} disabled={!input.trim()} className="px-2 py-1.5 bg-green-500/10 hover:bg-green-500/30 text-green-600 font-semibold text-[11px] rounded transition-colors border border-green-500/30 disabled:opacity-50">🏥 Advise Visit</button>
                                <button onClick={() => handleSendAction('test')} disabled={!input.trim()} className="px-2 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/30 text-yellow-600 font-semibold text-[11px] rounded transition-colors border border-yellow-500/30 disabled:opacity-50">🔬 Require Tests</button>
                                <button onClick={() => handleSendAction('emergency')} className="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-500 font-semibold text-[11px] ml-auto rounded transition-colors border border-red-500/30">🚨 Escalate</button>
                            </div>
                        ) : (
                            <div className={`flex items-center gap-2 px-3 pb-3 shrink-0 ${dark ? 'bg-[#0D1130]' : 'bg-gray-50'}`}>
                                <input type="text" placeholder="Medication details/dosage…" value={medication} onChange={e => setMedication(e.target.value)}
                                    className={`flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500/50 ${dark ? 'bg-black/40 border-[#252A41] text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`} />
                                <button onClick={() => handleSendAction('medication')} disabled={!medication.trim() || !input.trim()} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] rounded font-bold disabled:opacity-50 transition-colors">Send Rx</button>
                                <button onClick={() => { setShowMedInput(false); setMedication(''); }} className={`px-3 py-1.5 text-[11px] rounded font-bold transition-colors ${dark ? 'bg-[#252A41] hover:bg-[#2c3251] text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`}>Cancel</button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${dark ? 'bg-[#1e2347]' : 'bg-gray-100'}`}>
                            <ChatBubbleLeftRightIcon className={`w-8 h-8 ${dark ? 'text-gray-600' : 'text-gray-400'}`} />
                        </div>
                        <p className={`font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Select a chat</p>
                        <p className={`text-sm ${dark ? 'text-gray-600' : 'text-gray-400'}`}>AI is handling new patients automatically. Click a chat to monitor or take over.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MedicalChatPanel;
