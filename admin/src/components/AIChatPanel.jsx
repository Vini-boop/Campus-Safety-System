import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    ChatBubbleLeftRightIcon, PaperAirplaneIcon,
    ArrowPathIcon, UserCircleIcon, CpuChipIcon,
    ExclamationTriangleIcon, TruckIcon, XMarkIcon,
    SparklesIcon, HeartIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { listenToChats, listenToMessages, sendMessage, escalateToAmbulance, closeChat } from '../services/chatService';
import {
    processUserMessage, createInitialAIState, saveAIState,
    transferToDoctor, generateDiagnosisSummary, CHAT_STAGES,
} from '../services/aiChatFlowService';
import { getSymptomChips } from '../services/symptomsDB';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { formatDistanceToNow } from 'date-fns';

// ─── Typing Indicator ────────────────────────────────────────────────────────
const TypingIndicator = () => (
    <div className="flex items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-1.5 bg-[#1e2347] rounded-2xl px-4 py-3 rounded-bl-md">
            <CpuChipIcon className="w-4 h-4 text-blue-400 animate-pulse" />
            <span className="text-gray-400 text-xs">AI is thinking</span>
            <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
        </div>
    </div>
);

// ─── Diagnosis Card ──────────────────────────────────────────────────────────
const DiagnosisCard = ({ diagnosis }) => {
    if (!diagnosis?.top) return null;
    const { top, results } = diagnosis;
    const isEmergency = top.urgency === 'emergency';
    const sevColor = isEmergency ? 'red' : top.severity === 'high' ? 'orange' : top.severity === 'medium' ? 'yellow' : 'green';

    return (
        <div className={`mx-4 mb-3 p-4 rounded-xl border ${isEmergency ? 'bg-red-500/10 border-red-500/40' : 'bg-indigo-500/10 border-indigo-500/30'}`}>
            <div className="flex items-center gap-2 mb-3">
                <SparklesIcon className={`w-5 h-5 ${isEmergency ? 'text-red-400' : 'text-indigo-400'}`} />
                <p className={`text-sm font-bold ${isEmergency ? 'text-red-300' : 'text-indigo-300'}`}>AI Diagnosis Result</p>
            </div>

            {/* Primary diagnosis */}
            <div className={`p-3 rounded-lg mb-2 ${isEmergency ? 'bg-red-500/20' : 'bg-[#1e2347]'}`}>
                <div className="flex items-center justify-between mb-1">
                    <p className="text-white text-sm font-bold">{top.disease}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-${sevColor}-500/20 text-${sevColor}-400 border border-${sevColor}-500/30`}>
                        {top.confidence}% match
                    </span>
                </div>
                <p className="text-gray-300 text-xs mt-1">{top.recommendation}</p>
                {top.selfCare && (
                    <p className="text-gray-400 text-[11px] mt-2 italic">💊 {top.selfCare}</p>
                )}
            </div>

            {/* Other possibilities */}
            {results && results.length > 1 && (
                <div className="mt-2">
                    <p className="text-gray-500 text-[10px] font-semibold uppercase mb-1">Other Possibilities</p>
                    {results.slice(1, 3).map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-1">
                            <span className="text-gray-400 text-xs">{r.disease}</span>
                            <span className="text-gray-500 text-[10px]">{r.confidence}%</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Symptom Chips ───────────────────────────────────────────────────────────
const SymptomChips = ({ onSelect }) => {
    const chips = useMemo(() => {
        const all = getSymptomChips();
        // Flatten and pick common ones
        const common = ['fever', 'headache', 'cough', 'nausea', 'stomach_pain', 'dizziness',
            'fatigue', 'sore_throat', 'body_aches', 'diarrhea', 'difficulty_breathing', 'chest_pain'];
        const flat = Object.values(all).flat();
        return flat.filter(c => common.includes(c.id));
    }, []);

    return (
        <div className="px-4 py-2 border-t border-[#1e2347]">
            <p className="text-gray-500 text-[10px] font-semibold uppercase mb-2">Quick Symptoms</p>
            <div className="flex flex-wrap gap-1.5">
                {chips.map(c => (
                    <button
                        key={c.id}
                        onClick={() => onSelect(c.id)}
                        className="px-2.5 py-1 bg-[#1e2347] hover:bg-blue-600/30 text-gray-300 hover:text-white text-[11px] rounded-lg transition-colors border border-[#252A41] hover:border-blue-500/40"
                    >
                        {c.emoji} {c.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

// ─── Message Bubble ──────────────────────────────────────────────────────────
const AIMessageBubble = ({ msg, dark = true }) => {
    const isUser = msg.sender === 'user' || msg.senderRole === 'student';
    const isAI = msg.sender === 'ai' || msg.senderRole === 'ai_assistant';
    const isDoctor = msg.senderRole === 'doctor' || msg.senderRole === 'admin';

    const timeStr = msg.createdAt
        ? (msg.createdAt.seconds
            ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        : msg.time || '';

    // Shared bubble + text style for AI and Doctor
    const bubbleBg = dark ? 'bg-[#1e2347] border border-[#252A41]' : 'bg-gray-100 border border-gray-200';
    const bubbleText = dark ? 'text-gray-100' : 'text-gray-800';
    const timeColor = dark ? 'text-gray-500' : 'text-gray-400';

    // AI message
    if (isAI) {
        return (
            <div className="flex justify-start mb-2">
                <div className="max-w-[85%] flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                        <CpuChipIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 shadow-sm ${bubbleBg} ${bubbleText}`}>
                        <p className="text-[9px] font-bold text-blue-400 mb-1">🤖 AI Health Assistant</p>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message || msg.text}</p>
                        {timeStr && <p className={`text-[9px] mt-1 text-right ${timeColor}`}>{timeStr}</p>}
                    </div>
                </div>
            </div>
        );
    }

    // Doctor message
    if (isDoctor) {
        return (
            <div className="flex justify-start mb-2">
                <div className="max-w-[85%] flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                        <UserCircleIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 shadow-sm ${bubbleBg} ${bubbleText}`}>
                        <p className="text-[9px] font-bold text-green-500 mb-1">👨‍⚕️ {msg.senderName || 'Doctor'}</p>
                        <p className="text-sm leading-relaxed">{msg.message || msg.text}</p>
                        {timeStr && <p className={`text-[9px] mt-1 text-right ${timeColor}`}>{timeStr}</p>}
                    </div>
                </div>
            </div>
        );
    }

    // User/Student message
    return (
        <div className="flex justify-end mb-2">
            <div className="max-w-[75%] bg-blue-600 text-white rounded-2xl rounded-br-md px-3.5 py-2.5 shadow-sm">
                <p className="text-sm leading-relaxed">{msg.message || msg.text}</p>
                {timeStr && <p className="text-[9px] mt-1 text-blue-200 text-right">{timeStr}</p>}
            </div>
        </div>
    );
};

// ─── Chat List Item ──────────────────────────────────────────────────────────
const AIChatListItem = ({ chat, isActive, onClick }) => {
    const timeAgo = chat.createdAt
        ? formatDistanceToNow(
            chat.createdAt.seconds ? new Date(chat.createdAt.seconds * 1000) : new Date(chat.createdAt),
            { addSuffix: true }
        )
        : 'Just now';

    const isAIMode = chat.aiMode !== false;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-3 rounded-xl transition-all border ${isActive
                ? 'bg-blue-600/20 border-blue-500/40'
                : 'bg-[#0D1130] border-[#1e2347] hover:border-[#3d4466]'
                }`}
        >
            <div className="flex items-center gap-2 mb-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isAIMode ? 'bg-gradient-to-br from-blue-500 to-purple-600' : 'bg-gradient-to-br from-green-500 to-emerald-600'
                    }`}>
                    {chat.studentName?.[0] || 'S'}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-bold truncate">{chat.studentName || 'Student'}</p>
                    <p className="text-gray-500 text-[10px]">{timeAgo}</p>
                </div>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${isAIMode
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-green-500/20 text-green-400 border border-green-500/30'
                    }`}>
                    {isAIMode ? '🤖 AI' : '👨‍⚕️ DR'}
                </span>
            </div>
            {chat.escalated && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full">
                    CRITICAL
                </span>
            )}
            <p className="text-gray-400 text-[10px] truncate mt-0.5">{chat.lastMessage || 'No messages yet'}</p>
        </button>
    );
};

// ─── Main AIChatPanel Component ──────────────────────────────────────────────
const AIChatPanel = ({ session, dark = true }) => {
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [localMessages, setLocalMessages] = useState([]); // AI messages before Firestore sync
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [aiThinking, setAiThinking] = useState(false);
    const [aiState, setAiState] = useState(createInitialAIState());
    const [showChips, setShowChips] = useState(true);
    const bottomRef = useRef(null);

    // Listen to chats
    useEffect(() => {
        const unsub = listenToChats(setChats);
        return () => unsub();
    }, []);

    // Listen to messages when chat selected
    useEffect(() => {
        if (!activeChat) { setMessages([]); setLocalMessages([]); return; }
        const unsub = listenToMessages(activeChat.id, (msgs) => {
            setMessages(msgs);
            setLocalMessages([]); // Clear local once Firestore syncs
        });

        // Load AI state from chat document
        const chatAiState = activeChat.aiState || createInitialAIState();
        setAiState(chatAiState);
        setShowChips(chatAiState.stage === CHAT_STAGES.COLLECT_SYMPTOMS || chatAiState.stage === CHAT_STAGES.ASK_SYMPTOMS);

        return () => unsub();
    }, [activeChat?.id]);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, localMessages, aiThinking]);

    // Auto-greet on empty chat
    useEffect(() => {
        if (activeChat && messages.length === 0 && localMessages.length === 0 && aiState.stage === CHAT_STAGES.GREETING) {
            handleAIGreeting();
        }
    }, [activeChat?.id, messages.length]);

    const handleAIGreeting = async () => {
        const result = processUserMessage('', aiState);
        setAiThinking(true);

        await new Promise(r => setTimeout(r, 1200));

        for (const reply of result.replies) {
            await sendAIMessage(reply);
            await new Promise(r => setTimeout(r, 600));
        }

        setAiState(result.nextState);
        setShowChips(true);
        setAiThinking(false);
        if (activeChat) saveAIState(activeChat.id, result.nextState);
    };

    const sendAIMessage = async (text) => {
        if (!activeChat) return;
        try {
            await sendMessage(
                activeChat.id,
                'ai_assistant',
                '🤖 AI Health Assistant',
                'ai_assistant',
                text
            );
        } catch (e) {
            // Fallback to local display
            setLocalMessages(prev => [...prev, {
                id: `local_${Date.now()}`,
                sender: 'ai',
                senderRole: 'ai_assistant',
                message: text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }]);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || !activeChat) return;
        const text = input.trim();
        setInput('');
        setSending(true);
        setShowChips(false);

        try {
            // Send user message to Firestore
            await sendMessage(
                activeChat.id,
                session?.uid || 'student',
                session?.name || 'Student',
                'student',
                text
            );

            // Process through AI if in AI mode
            if (aiState.aiMode !== false && aiState.stage !== CHAT_STAGES.DOCTOR_TAKEOVER) {
                setAiThinking(true);

                // Simulate AI thinking delay
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

                const result = processUserMessage(text, aiState);

                // Send AI replies with typing delay
                for (const reply of result.replies) {
                    await sendAIMessage(reply);
                    await new Promise(r => setTimeout(r, 500));
                }

                const newState = result.nextState;
                setAiState(newState);
                setAiThinking(false);

                // Show chips during symptom collection
                setShowChips(newState.stage === CHAT_STAGES.COLLECT_SYMPTOMS);

                // Save state to Firestore
                saveAIState(activeChat.id, newState);

                // Handle escalation
                if (result.escalate || result.emergency) {
                    await escalateToAmbulance(activeChat.id, activeChat.reportId || null);
                }

                // Store diagnosis in Firestore
                if (result.diagnosis) {
                    const summary = generateDiagnosisSummary(newState);
                    if (summary) {
                        try {
                            await addDoc(collection(db, 'medical_reports'), {
                                ...summary,
                                chatId: activeChat.id,
                                studentId: activeChat.studentId,
                                studentName: activeChat.studentName,
                                createdAt: serverTimestamp(),
                                source: 'ai_diagnosis',
                            });
                        } catch (e) { console.error('Failed to save diagnosis:', e); }
                    }
                }
            }
        } catch (e) {
            console.error('Send failed:', e);
        } finally {
            setSending(false);
        }
    };

    const handleSymptomChipClick = (symptomId) => {
        const map = {
            fever: 'I have a fever',
            headache: 'I have a headache',
            cough: 'I have a cough',
            nausea: 'I feel nauseous',
            stomach_pain: 'I have stomach pain',
            dizziness: 'I feel dizzy',
            fatigue: 'I feel very tired and weak',
            sore_throat: 'I have a sore throat',
            body_aches: 'My body aches all over',
            diarrhea: 'I have diarrhea',
            difficulty_breathing: 'I have difficulty breathing',
            chest_pain: 'I have chest pain',
        };
        setInput(prev => prev ? `${prev}, ${map[symptomId] || symptomId}` : map[symptomId] || symptomId);
    };

    const handleDoctorTakeover = async () => {
        if (!activeChat) return;
        await transferToDoctor(activeChat.id, session?.uid, session?.name);
        setAiState(prev => ({ ...prev, aiMode: false, stage: CHAT_STAGES.DOCTOR_TAKEOVER }));
        await sendMessage(
            activeChat.id,
            session?.uid || 'doctor',
            session?.name || 'Doctor',
            'system',
            `👨‍⚕️ Dr. ${session?.name || 'Doctor'} has joined the conversation. The AI assistant has been paused.`
        );
    };

    const handleCloseChat = async () => {
        if (!activeChat) return;
        await closeChat(activeChat.id);
        setActiveChat(null);
    };

    const handleDoctorSend = async () => {
        if (!input.trim() || !activeChat) return;
        setSending(true);
        try {
            await sendMessage(
                activeChat.id,
                session?.uid || 'doctor',
                session?.name || 'Doctor',
                'doctor',
                input.trim()
            );
            setInput('');
        } catch (e) {
            console.error('Doctor send failed:', e);
        } finally {
            setSending(false);
        }
    };

    const allMessages = [...messages, ...localMessages];
    const isAIMode = aiState.aiMode !== false && aiState.stage !== CHAT_STAGES.DOCTOR_TAKEOVER;
    const hasDiagnosis = aiState.diagnosis?.top;

    return (
        <div className={`flex h-full rounded-2xl overflow-hidden border ${dark ? 'bg-[#141728] border-[#252A41]' : 'bg-white border-gray-200'}`}>
            {/* ── Chat List ── */}
            <div className={`w-56 border-r flex flex-col shrink-0 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                <div className={`p-3 border-b flex items-center gap-2 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                    <SparklesIcon className="w-4 h-4 text-blue-400" />
                    <span className={`text-sm font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>AI Medical Chats</span>
                    {chats.length > 0 && (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 bg-blue-600 text-white rounded-full">
                            {chats.length}
                        </span>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {chats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 gap-2">
                            <CpuChipIcon className="w-8 h-8 text-gray-700" />
                            <p className="text-gray-500 text-[11px] text-center">No active chats</p>
                        </div>
                    ) : (
                        chats.map(chat => (
                            <AIChatListItem
                                key={chat.id}
                                chat={chat}
                                isActive={activeChat?.id === chat.id}
                                onClick={() => setActiveChat(chat)}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* ── Chat Conversation ── */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeChat ? (
                    <>
                        {/* Header */}
                        <div className={`px-4 py-3 border-b flex items-center gap-3 shrink-0 ${dark ? 'border-[#1e2347]' : 'border-gray-200'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isAIMode ? 'bg-gradient-to-br from-blue-500 to-purple-600' : 'bg-gradient-to-br from-green-500 to-emerald-600'
                                }`}>
                                {activeChat.studentName?.[0] || 'S'}
                            </div>
                            <div className="flex-1">
                                <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>{activeChat.studentName || 'Student'}</p>
                                <p className="text-[10px] flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${isAIMode ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
                                    <span className={isAIMode ? 'text-blue-400' : 'text-green-400'}>
                                        {isAIMode ? '🤖 AI Mode' : `👨‍⚕️ Dr. ${activeChat.assignedDoctorName || session?.name || 'Doctor'}`}
                                    </span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isAIMode && (
                                    <button
                                        onClick={handleDoctorTakeover}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-[11px] font-bold transition-colors border border-green-500/30"
                                    >
                                        <UserCircleIcon className="w-3.5 h-3.5" />
                                        Take Over
                                    </button>
                                )}
                                {!isAIMode && activeChat.escalated !== true && (
                                    <button
                                        onClick={() => escalateToAmbulance(activeChat.id)}
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-[11px] font-bold transition-colors"
                                    >
                                        <TruckIcon className="w-3.5 h-3.5" />
                                        Dispatch
                                    </button>
                                )}
                                <button onClick={handleCloseChat} className={`flex items-center gap-1 px-2 py-1.5 text-gray-400 rounded-lg text-xs font-bold transition-colors ${dark ? 'bg-[#1e2347] hover:bg-[#252A41]' : 'bg-gray-100 hover:bg-gray-200'}`}>
                                    <XMarkIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* AI state banner */}
                        {isAIMode && aiState.collectedSymptoms?.length > 0 && (
                            <div className="mx-4 mt-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl shrink-0">
                                <p className="text-blue-400 text-[10px] font-bold uppercase tracking-wide mb-1">Detected Symptoms</p>
                                <div className="flex flex-wrap gap-1">
                                    {aiState.collectedSymptoms.map(s => (
                                        <span key={s} className="text-[10px] px-2 py-0.5 bg-blue-600/20 text-blue-300 rounded-full border border-blue-500/30">
                                            {s.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Diagnosis card */}
                        {hasDiagnosis && <DiagnosisCard diagnosis={aiState.diagnosis} />}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {allMessages.length === 0 && !aiThinking ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                                    <SparklesIcon className="w-10 h-10 text-gray-700" />
                                    <p className="text-gray-500 text-sm">AI Medical Assistant</p>
                                    <p className="text-gray-600 text-xs">Starting conversation...</p>
                                </div>
                            ) : (
                                allMessages.map(msg => (
                                    <AIMessageBubble key={msg.id} msg={msg} dark={dark} />
                                ))
                            )}
                            {aiThinking && <TypingIndicator />}
                            <div ref={bottomRef} />
                        </div>

                        {/* Symptom chips */}
                        {isAIMode && showChips && <SymptomChips onSelect={handleSymptomChipClick} />}

                        {/* Input */}
                        <div className={`p-3 border-t flex items-center gap-2 shrink-0 ${dark ? 'border-[#1e2347] bg-[#0D1130]' : 'border-gray-200 bg-gray-50'}`}>
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        isAIMode ? handleSend() : handleDoctorSend();
                                    }
                                }}
                                placeholder={isAIMode ? 'Describe your symptoms...' : 'Type a diagnosis or message...'}
                                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 ${dark ? 'bg-[#141728] border-[#252A41] text-white placeholder-gray-600' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                                disabled={aiThinking}
                            />
                            <button
                                onClick={isAIMode ? handleSend : handleDoctorSend}
                                disabled={sending || aiThinking || !input.trim()}
                                className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
                            >
                                {sending || aiThinking
                                    ? <ArrowPathIcon className="w-4 h-4 text-white animate-spin" />
                                    : <PaperAirplaneIcon className="w-4 h-4 text-white" />}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/20 flex items-center justify-center">
                            <SparklesIcon className="w-8 h-8 text-blue-500" />
                        </div>
                        <p className={`font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>AI Medical Chat</p>
                        <p className="text-gray-500 text-sm max-w-xs">Select a student conversation to view AI-powered symptom assessment and diagnosis.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIChatPanel;
