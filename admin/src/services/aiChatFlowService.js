/**
 * aiChatFlowService.js
 * Manages the structured AI medical chat conversation flow.
 * States: greeting → symptoms → follow_up → diagnosis → escalation
 * 
 * Persists chat AI state to Firestore so it survives page reloads.
 */

import { extractSymptoms } from './symptomsDB';
import { diagnose, shouldEscalate, getFollowUpQuestions } from './diagnosisEngine';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// ─── Chat Stages ─────────────────────────────────────────────────────────────
export const CHAT_STAGES = {
    GREETING: 'greeting',
    ASK_SYMPTOMS: 'ask_symptoms',
    COLLECT_SYMPTOMS: 'collect_symptoms',
    FOLLOW_UP: 'follow_up',
    DIAGNOSING: 'diagnosing',
    DIAGNOSIS_RESULT: 'diagnosis_result',
    ESCALATED: 'escalated',
    DOCTOR_TAKEOVER: 'doctor_takeover',
};

// ─── Initial AI State ────────────────────────────────────────────────────────
export function createInitialAIState() {
    return {
        stage: CHAT_STAGES.GREETING,
        collectedSymptoms: [],
        followUpAnswers: [],
        diagnosis: null,
        followUpQuestions: [],
        currentFollowUpIndex: 0,
        messageCount: 0,
        aiMode: true,
    };
}

// ─── Core Chat Flow ──────────────────────────────────────────────────────────
/**
 * Process a user message through the AI chat flow.
 * Returns: { replies: string[], nextState: object, escalate?: bool, emergency?: bool, diagnosis?: object }
 */
export function processUserMessage(message, currentState) {
    const state = { ...currentState };
    state.messageCount = (state.messageCount || 0) + 1;

    // If doctor has taken over, don't process AI
    if (state.stage === CHAT_STAGES.DOCTOR_TAKEOVER) {
        return { replies: [], nextState: state, handled: false };
    }

    switch (state.stage) {
        case CHAT_STAGES.GREETING:
            return handleGreeting(state);

        case CHAT_STAGES.ASK_SYMPTOMS:
            return handleSymptomsCollection(message, state);

        case CHAT_STAGES.COLLECT_SYMPTOMS:
            return handleSymptomsCollection(message, state);

        case CHAT_STAGES.FOLLOW_UP:
            return handleFollowUp(message, state);

        case CHAT_STAGES.DIAGNOSIS_RESULT:
            return handlePostDiagnosis(message, state);

        default:
            return handleSymptomsCollection(message, state);
    }
}

// ─── Stage Handlers ──────────────────────────────────────────────────────────

function handleGreeting(state) {
    return {
        replies: [
            'Hello 👋 I\'m your Campus Health AI Assistant.',
            'I can help assess your symptoms and recommend the right care. How are you feeling today? Please describe your symptoms.',
            '💡 *Tip: You can mention multiple symptoms like "I have a headache and fever"*'
        ],
        nextState: {
            ...state,
            stage: CHAT_STAGES.COLLECT_SYMPTOMS,
        },
    };
}

function handleSymptomsCollection(message, state) {
    // Extract symptoms from user message
    const newSymptoms = extractSymptoms(message);
    const allSymptoms = [...new Set([...state.collectedSymptoms, ...newSymptoms])];

    // If no symptoms detected, ask for clarification
    if (allSymptoms.length === 0) {
        return {
            replies: [
                'I couldn\'t identify specific symptoms from your message. Could you describe what you\'re feeling?',
                '🩺 Common symptoms: fever, headache, cough, stomach pain, nausea, dizziness, body aches, sore throat...',
            ],
            nextState: { ...state, stage: CHAT_STAGES.COLLECT_SYMPTOMS },
        };
    }

    // Check for emergency combos FIRST
    if (shouldEscalate(allSymptoms)) {
        return {
            replies: [
                `🚨 **URGENT: Based on your symptoms, this may require immediate medical attention.**`,
                '🚑 I\'m connecting you to the medical team right now. An ambulance can be dispatched to your location.',
                'Please stay calm and don\'t move unnecessarily.',
            ],
            nextState: {
                ...state,
                collectedSymptoms: allSymptoms,
                stage: CHAT_STAGES.ESCALATED,
            },
            escalate: true,
            emergency: true,
        };
    }

    // Generate follow-up questions
    const followUps = getFollowUpQuestions(allSymptoms);

    // Build symptom acknowledgment
    const symptomNames = allSymptoms.map(s => {
        const map = {
            fever: '🌡️ Fever', headache: '🤕 Headache', cough: '😷 Cough',
            nausea: '🤢 Nausea', diarrhea: '🚽 Diarrhea', dizziness: '😵‍💫 Dizziness',
            fatigue: '😴 Fatigue', body_aches: '💪 Body Aches', sore_throat: '🗣️ Sore Throat',
            stomach_pain: '🤕 Stomach Pain', chills: '🥶 Chills', rash: '🔴 Rash',
            difficulty_breathing: '😮‍💨 Difficulty Breathing', chest_pain: '💔 Chest Pain',
            runny_nose: '🤧 Runny Nose', bleeding: '🩸 Bleeding', swelling: '🦶 Swelling',
        };
        return map[s] || s;
    });

    const replies = [
        `I've noted the following symptoms: **${symptomNames.join(', ')}**`,
    ];

    if (followUps.length > 0) {
        replies.push(`To give you a better assessment, I have a quick follow-up question:`);
        replies.push(followUps[0]);
    }

    return {
        replies,
        nextState: {
            ...state,
            collectedSymptoms: allSymptoms,
            stage: followUps.length > 0 ? CHAT_STAGES.FOLLOW_UP : CHAT_STAGES.DIAGNOSING,
            followUpQuestions: followUps,
            currentFollowUpIndex: 0,
        },
    };
}

function handleFollowUp(message, state) {
    const followUpAnswers = [...(state.followUpAnswers || []), message];
    const nextIndex = (state.currentFollowUpIndex || 0) + 1;

    // Also check for additional symptoms in follow-up answers
    const extraSymptoms = extractSymptoms(message);
    const allSymptoms = [...new Set([...state.collectedSymptoms, ...extraSymptoms])];

    // Re-check for emergencies with new symptoms
    if (shouldEscalate(allSymptoms)) {
        return {
            replies: [
                `🚨 **URGENT: Your additional information indicates this may be serious.**`,
                '🚑 Connecting you to the medical team for immediate assistance.',
            ],
            nextState: { ...state, collectedSymptoms: allSymptoms, stage: CHAT_STAGES.ESCALATED },
            escalate: true,
            emergency: true,
        };
    }

    // More follow-up questions remaining?
    if (nextIndex < (state.followUpQuestions?.length || 0)) {
        return {
            replies: [
                'Thank you. One more question:',
                state.followUpQuestions[nextIndex],
            ],
            nextState: {
                ...state,
                collectedSymptoms: allSymptoms,
                followUpAnswers,
                currentFollowUpIndex: nextIndex,
            },
        };
    }

    // All follow-ups answered — run diagnosis
    return runDiagnosis(allSymptoms, followUpAnswers, state);
}

function runDiagnosis(symptoms, followUpAnswers, state) {
    const results = diagnose(symptoms);

    if (results.length === 0) {
        return {
            replies: [
                '⚠️ I couldn\'t match your symptoms to a specific condition with enough confidence.',
                '🩺 **I recommend connecting you with a doctor** who can do a proper assessment.',
                'Would you like me to connect you with the medical team?',
            ],
            nextState: {
                ...state,
                collectedSymptoms: symptoms,
                followUpAnswers,
                stage: CHAT_STAGES.DIAGNOSIS_RESULT,
                diagnosis: null,
            },
            escalate: true,
        };
    }

    const top = results[0];
    const replies = ['🔍 **Analysis Complete**\n'];

    // Primary diagnosis
    if (top.urgency === 'emergency') {
        replies.push(
            `🚨 **Most Likely: ${top.disease}** (${top.confidence}% match)\n` +
            `Severity: ⚠️ CRITICAL\n\n` +
            `${top.recommendation}\n\n` +
            `🚑 **An ambulance can be dispatched to your location immediately.**`
        );
    } else {
        replies.push(
            `🏥 **Most Likely: ${top.disease}** (${top.confidence}% match)\n` +
            `Severity: ${top.severity === 'high' ? '🟠 High' : top.severity === 'medium' ? '🟡 Medium' : '🟢 Low'}\n\n` +
            `📋 **Recommendation:** ${top.recommendation}\n\n` +
            `💊 **Self-Care:** ${top.selfCare}`
        );
    }

    // Secondary possibilities
    if (results.length > 1) {
        const others = results.slice(1, 3).map(r => `• ${r.disease} (${r.confidence}%)`).join('\n');
        replies.push(`\n📊 **Other possibilities:**\n${others}`);
    }

    // Action suggestion
    if (top.urgency === 'emergency') {
        replies.push('\n🚑 **Do you want me to request an ambulance?** (Yes / No)');
    } else if (top.urgency === 'clinic') {
        replies.push('\n🏥 **Would you like to chat with a doctor for further guidance?** (Yes / No)');
    } else {
        replies.push('\n✅ Monitor your symptoms. If they worsen, please come back or visit the campus clinic.');
    }

    return {
        replies,
        nextState: {
            ...state,
            collectedSymptoms: symptoms,
            followUpAnswers,
            stage: CHAT_STAGES.DIAGNOSIS_RESULT,
            diagnosis: { results, top },
        },
        emergency: top.urgency === 'emergency',
        diagnosis: { results, top },
    };
}

function handlePostDiagnosis(message, state) {
    const lower = message.toLowerCase();

    if (lower.includes('yes') || lower.includes('ambulance') || lower.includes('doctor') || lower.includes('connect')) {
        if (state.diagnosis?.top?.urgency === 'emergency') {
            return {
                replies: [
                    '🚑 **Ambulance request submitted!** The medical team has been notified.',
                    'Please share your current location and stay where you are.',
                ],
                nextState: { ...state, stage: CHAT_STAGES.ESCALATED },
                escalate: true,
                emergency: true,
            };
        }
        return {
            replies: [
                '🩺 **Connecting you with a campus doctor now...**',
                'A doctor will join this chat shortly. Please stay in the conversation.',
            ],
            nextState: { ...state, stage: CHAT_STAGES.DOCTOR_TAKEOVER },
            escalate: true,
        };
    }

    if (lower.includes('no') || lower.includes('okay') || lower.includes('thanks') || lower.includes('thank')) {
        return {
            replies: [
                '✅ Alright! Please follow the self-care advice provided.',
                '⚠️ If your symptoms get worse or new symptoms appear, don\'t hesitate to come back.',
                'Stay healthy! 💪',
            ],
            nextState: { ...state },
        };
    }

    // If they type something else, check if it's new symptoms
    const newSymptoms = extractSymptoms(message);
    if (newSymptoms.length > 0) {
        const allSymptoms = [...new Set([...state.collectedSymptoms, ...newSymptoms])];
        return runDiagnosis(allSymptoms, state.followUpAnswers || [], state);
    }

    return {
        replies: [
            'Would you like me to connect you with a doctor, or are you feeling better?',
            'You can also describe any new symptoms you\'re experiencing.',
        ],
        nextState: state,
    };
}

// ─── Firestore Persistence ───────────────────────────────────────────────────
/**
 * Save AI state to the chat document in Firestore.
 */
export async function saveAIState(chatId, aiState) {
    try {
        await updateDoc(doc(db, 'medical_chats', chatId), {
            aiState,
            aiMode: aiState.aiMode !== false,
            updatedAt: serverTimestamp(),
        });
    } catch (e) {
        console.error('Failed to save AI state:', e);
    }
}

/**
 * Switch chat from AI mode to human doctor mode.
 */
export async function transferToDoctor(chatId, doctorId, doctorName) {
    try {
        await updateDoc(doc(db, 'medical_chats', chatId), {
            aiMode: false,
            'aiState.stage': CHAT_STAGES.DOCTOR_TAKEOVER,
            assignedDoctorId: doctorId || null,
            assignedDoctorName: doctorName || null,
            status: 'active',
            updatedAt: serverTimestamp(),
        });
    } catch (e) {
        console.error('Failed to transfer to doctor:', e);
    }
}

// ─── Generate Diagnosis Summary for Firestore ────────────────────────────────
/**
 * Create a structured summary to store in medical_reports.
 */
export function generateDiagnosisSummary(aiState) {
    if (!aiState.diagnosis?.top) return null;
    return {
        symptoms: aiState.collectedSymptoms,
        diagnosis: aiState.diagnosis.top.disease,
        confidence: aiState.diagnosis.top.confidence,
        severity: aiState.diagnosis.top.severity,
        recommendation: aiState.diagnosis.top.recommendation,
        urgency: aiState.diagnosis.top.urgency,
        allResults: aiState.diagnosis.results?.slice(0, 3).map(r => ({
            disease: r.disease,
            confidence: r.confidence,
        })),
    };
}
