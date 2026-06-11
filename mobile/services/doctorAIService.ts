/**
 * Doctor AI Service - Structured Line-by-Line Medical Chat Flow
 * Builds complete structured response, then splits into chat lines
 */

export interface StructuredResponse {
    acknowledgment: string[];
    analysis: string[];
    diagnosis: string[];
    advice: string[];
    warnings: string[];
    escalation: string[];
    followUp: string[];
    contact: string[];
    disclaimer: string[];
}

export interface AIResponse {
    lines: string[];
    stage: 'greeting' | 'consultation' | 'analysis' | 'closing';
    isComplete?: boolean;
}

// Emergency contact
const EMERGENCY_CONTACT = '📞 0705824331';

// Symptom database with detailed analysis
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
        followUp: 'If your symptoms continue beyond 2–3 days, it\'s important to visit a healthcare provider for proper testing (especially for malaria).',
        riskLevel: 'MEDIUM',
        urgent: false
    },

    viral_infection: {
        keywords: ['headache', 'stomach pain', 'mild fever', 'fatigue'],
        condition: 'viral infection or early malaria (moderate likelihood)',
        symptoms: ['headache', 'stomach discomfort', 'mild fever'],
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
        followUp: 'If your symptoms continue beyond 2–3 days, it\'s important to visit a healthcare provider for proper testing (especially for malaria).',
        riskLevel: 'MEDIUM',
        urgent: false
    },

    cold_flu: {
        keywords: ['runny nose', 'cough', 'sneezing', 'sore throat'],
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
        followUp: 'Most colds resolve within 5-7 days. If symptoms persist or worsen, visit a healthcare provider.',
        riskLevel: 'LOW',
        urgent: false
    },

    pneumonia: {
        keywords: ['chest pain', 'difficulty breathing', 'persistent cough', 'high fever'],
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
        followUp: 'Visit the medical center TODAY for chest X-ray and proper treatment.',
        riskLevel: 'SEVERE',
        urgent: true
    },

    headache_stress: {
        keywords: ['headache', 'stress', 'tired', 'dizziness'],
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
        followUp: 'If headaches persist for more than 3 days or become severe, consult a healthcare provider.',
        riskLevel: 'LOW',
        urgent: false
    }
};

export class DoctorAIService {
    private static instance: DoctorAIService;
    private conversationStage: string = 'start';

    public static getInstance(): DoctorAIService {
        if (!DoctorAIService.instance) {
            DoctorAIService.instance = new DoctorAIService();
        }
        return DoctorAIService.instance;
    }

    /**
     * Process user input and build structured response
     */
    public processUserInput(input: string): AIResponse {
        const userInput = input.toLowerCase().trim();

        // 🚨 EMERGENCY RULE (FIRST - Skip ML)
        if (this.isEmergency(userInput)) {
            return {
                lines: [
                    '🚨 MEDICAL EMERGENCY DETECTED',
                    'Please seek immediate medical attention or call emergency services NOW.',
                    `Call ${EMERGENCY_CONTACT} immediately.`,
                    'If on campus, use the ambulance request button.',
                    'Do NOT wait - this requires urgent care.'
                ],
                stage: 'analysis',
                isComplete: true
            };
        }

        switch (this.conversationStage) {
            case 'start':
                return this.handleStart();

            case 'greeting':
                return this.handleSelection(userInput);

            case 'consultation':
                return this.handleSymptomAnalysis(userInput);

            case 'closing':
                return this.handleClosing(userInput);

            default:
                return this.handleStart();
        }
    }

    /**
     * START - Initial greeting (FSM: start → greeting)
     */
    private handleStart(): AIResponse {
        this.conversationStage = 'greeting';
        return {
            lines: ['Welcome to Campus Medical Center. Please choose:\n\n1. Medical Consultation\n2. General Inquiry'],
            stage: 'greeting'
        };
    }

    /**
     * Handle user selection (FSM: greeting → consultation)
     */
    private handleSelection(input: string): AIResponse {
        if (input.includes('medical consultation') || input.includes('consultation') || input.includes('1') || input.includes('symptoms') || input.includes('feeling') || input.includes('sick') || input.includes('pain')) {
            this.conversationStage = 'consultation';
            return {
                lines: ['Please describe your symptoms.'],
                stage: 'consultation'
            };
        }

        if (input.includes('general inquiry') || input.includes('2') || input.includes('inquiry') || input.includes('question')) {
            return {
                lines: [`For general inquiries, please contact us at ${EMERGENCY_CONTACT}.\n\nIf you need medical consultation, type "Medical Consultation".`],
                stage: 'greeting'
            };
        }

        return {
            lines: ['Please choose:\n\n1. Medical Consultation\n2. General Inquiry'],
            stage: 'greeting'
        };
    }

    /**
     * 🧠 MAIN ANALYSIS - Build structured response as ONE consolidated message
     * FSM: consultation → analysis → closing
     */
    private handleSymptomAnalysis(input: string): AIResponse {
        // Extract symptoms from input
        const detectedSymptoms = this.extractSymptoms(input);

        // Find best matching condition with minimum 2 keyword matches
        const matchResult = this.findBestMatch(input);

        // RULE: Require at least 2 keyword matches for diagnosis
        if (!matchResult || matchResult.matchCount < 2) {
            return {
                lines: [
                    'Please provide more details. Include symptoms like:\n• Fever or chills\n• Pain location and intensity\n• Duration of symptoms\n• Any other discomfort'
                ],
                stage: 'consultation'
            };
        }

        const matchedCondition = matchResult.condition;

        // 🧾 BUILD CONSOLIDATED RESPONSE (ONE MESSAGE BLOCK - STRICT FORMAT)
        let response = '';

        // 1️⃣ ASSESSMENT
        response += `🩺 Assessment: ${matchedCondition.condition}\n\n`;

        // 2️⃣ DETECTED SYMPTOMS
        if (detectedSymptoms.length > 0) {
            response += `📋 Detected Symptoms: ${detectedSymptoms.join(', ')}\n\n`;
        }

        // 3️⃣ RECOMMENDED ACTIONS
        response += '💊 Recommended Actions:\n';
        matchedCondition.advice.forEach((advice: string) => {
            response += `• ${advice}\n`;
        });

        // 4️⃣ PRECAUTIONS
        if (matchedCondition.warnings && matchedCondition.warnings.length > 0) {
            response += '\n⚠️ Precautions:\n';
            matchedCondition.warnings.forEach((warning: string) => {
                response += `• ${warning}\n`;
            });
        }

        // 5️⃣ WHEN TO SEEK HELP
        if (matchedCondition.escalation && matchedCondition.escalation.length > 0) {
            response += '\n🚨 Seek immediate medical attention if:\n';
            matchedCondition.escalation.forEach((symptom: string) => {
                response += `• ${symptom}\n`;
            });
        }

        // 6️⃣ FOLLOW-UP GUIDANCE
        if (matchedCondition.followUp) {
            response += `\n📅 Follow-up: ${matchedCondition.followUp}\n`;
        }

        // 7️⃣ CONTACT
        response += `\n📞 Contact: ${EMERGENCY_CONTACT}\n`;

        // 8️⃣ DISCLAIMER
        response += '\n👨‍⚕️ Disclaimer: This system provides guidance only and is not a medical diagnosis. Please consult a qualified healthcare professional.';

        // Move to closing stage - NEVER return to analysis
        this.conversationStage = 'closing';

        // Return as ONE consolidated message
        return {
            lines: [response],
            stage: 'analysis',
            isComplete: false
        };
    }

    /**
     * Handle closing - STRICT: Never return to analysis after diagnosis
     * FSM: closing → start (new session) OR closing → consultation (new symptoms)
     */
    private handleClosing(input: string): AIResponse {
        if (input.includes('no') || input.includes('nothing') || input.includes("that's all") || input.includes('thank')) {
            this.conversationStage = 'start';
            return {
                lines: [
                    `Session ended. For urgent matters, call ${EMERGENCY_CONTACT}.`
                ],
                stage: 'closing',
                isComplete: true
            };
        }

        if (input.includes('yes') || input.includes('more') || input.includes('another') || input.includes('different')) {
            this.conversationStage = 'consultation';
            return {
                lines: ['Please describe your symptoms.'],
                stage: 'consultation'
            };
        }

        // If they describe new symptoms, analyze them
        const matchResult = this.findBestMatch(input);
        if (matchResult && matchResult.matchCount >= 2) {
            return this.handleSymptomAnalysis(input);
        }

        // Default: prompt for clarification
        return {
            lines: ['Type "yes" for another consultation or "no" to end session.'],
            stage: 'closing'
        };
    }

    /**
     * Extract symptoms from user input
     */
    private extractSymptoms(input: string): string[] {
        const symptoms: string[] = [];
        const symptomKeywords = [
            'fever', 'headache', 'cough', 'cold', 'stomach pain', 'nausea',
            'vomiting', 'diarrhea', 'chills', 'sweating', 'fatigue', 'weakness',
            'sore throat', 'runny nose', 'chest pain', 'difficulty breathing'
        ];

        symptomKeywords.forEach(keyword => {
            if (input.includes(keyword)) {
                symptoms.push(keyword);
            }
        });

        return symptoms;
    }

    /**
     * Find best matching condition using rule-based logic
     * Returns condition AND match count for validation
     */
    private findBestMatch(input: string): { condition: any; matchCount: number } | null {
        let bestMatch = null;
        let maxMatches = 0;

        // Rule-based interpretation (safer mapping)
        for (const condition of Object.values(SYMPTOM_CONDITIONS)) {
            const matches = condition.keywords.filter(keyword =>
                input.includes(keyword)
            ).length;

            if (matches > maxMatches) {
                maxMatches = matches;
                bestMatch = condition;
            }
        }

        // Return null if no matches or less than 2 matches
        if (!bestMatch || maxMatches < 2) {
            return null;
        }

        return { condition: bestMatch, matchCount: maxMatches };
    }

    /**
     * 🚨 Emergency detection (FIRST priority - overrides FSM)
     */
    private isEmergency(input: string): boolean {
        const emergencyKeywords = [
            'emergency', 'urgent', 'severe pain', "can't breathe", 'cant breathe',
            'chest pain', 'heart attack', 'unconscious', 'bleeding heavily',
            'heavy bleeding', 'seizure', 'convulsion', 'very high fever',
            'difficulty breathing', 'choking', 'stroke', 'paralysis',
            'severe bleeding', 'suicide', 'overdose'
        ];

        return emergencyKeywords.some(keyword => input.includes(keyword));
    }

    /**
     * Reset conversation
     */
    public resetConversation(): void {
        this.conversationStage = 'start';
    }

    /**
     * Get current stage
     */
    public getCurrentStage(): string {
        return this.conversationStage;
    }
}

export default DoctorAIService;