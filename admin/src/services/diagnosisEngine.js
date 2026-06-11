/**
 * diagnosisEngine.js
 * Rule-based disease diagnosis engine.
 * Maps symptoms → possible diseases with confidence scoring.
 */

// ─── Disease Rules Database ──────────────────────────────────────────────────
export const diseaseRules = [
    // ── Tropical / Infectious ─────────────────────────────────────────────
    {
        disease: 'Malaria',
        symptoms: ['fever', 'headache', 'chills', 'nausea', 'body_aches', 'sweating', 'fatigue'],
        requiredSymptoms: ['fever'],
        severity: 'high',
        recommendation: 'Visit the campus clinic immediately for a malaria rapid test (RDT). Do NOT self-medicate with antimalarials.',
        selfCare: 'Stay hydrated, rest, and avoid mosquito bites. Use a mosquito net tonight.',
        urgency: 'clinic',
    },
    {
        disease: 'Typhoid Fever',
        symptoms: ['fever', 'headache', 'stomach_pain', 'fatigue', 'loss_of_appetite', 'diarrhea', 'body_aches'],
        requiredSymptoms: ['fever', 'stomach_pain'],
        severity: 'high',
        recommendation: 'Visit the hospital for a Widal test. Avoid street food and drink only clean/boiled water.',
        selfCare: 'Stay hydrated with ORS. Eat light, properly cooked meals only.',
        urgency: 'clinic',
    },
    {
        disease: 'Cholera',
        symptoms: ['diarrhea', 'nausea', 'stomach_pain', 'fatigue', 'dizziness'],
        requiredSymptoms: ['diarrhea'],
        severity: 'critical',
        recommendation: '🚨 URGENT: Severe dehydration risk. Go to hospital NOW. Start ORS immediately.',
        selfCare: 'ORS every 15 minutes. Do NOT eat solid food until diarrhea subsides.',
        urgency: 'emergency',
    },
    {
        disease: 'COVID-19',
        symptoms: ['fever', 'cough', 'sore_throat', 'fatigue', 'body_aches', 'difficulty_breathing', 'loss_of_appetite', 'headache'],
        requiredSymptoms: ['cough', 'fever'],
        severity: 'high',
        recommendation: 'Isolate immediately. Visit campus health center for a rapid antigen test.',
        selfCare: 'Wear a mask, isolate in your room, monitor oxygen levels if possible. Drink fluids.',
        urgency: 'clinic',
    },

    // ── Respiratory ───────────────────────────────────────────────────────
    {
        disease: 'Common Cold',
        symptoms: ['cough', 'sore_throat', 'runny_nose', 'headache', 'fatigue'],
        requiredSymptoms: [],
        severity: 'low',
        recommendation: 'Rest and drink warm fluids. Usually resolves in 5-7 days.',
        selfCare: 'Warm water with honey and lemon. Steam inhalation. Paracetamol for fever.',
        urgency: 'self_care',
    },
    {
        disease: 'Influenza (Flu)',
        symptoms: ['fever', 'cough', 'body_aches', 'fatigue', 'headache', 'chills', 'sore_throat'],
        requiredSymptoms: ['fever', 'body_aches'],
        severity: 'medium',
        recommendation: 'Rest at home. Visit clinic if symptoms persist beyond 3 days or worsen.',
        selfCare: 'Paracetamol for fever, rest, fluids. Avoid contact with others.',
        urgency: 'self_care',
    },
    {
        disease: 'Pneumonia',
        symptoms: ['cough', 'fever', 'difficulty_breathing', 'chest_pain', 'fatigue', 'chills'],
        requiredSymptoms: ['cough', 'difficulty_breathing'],
        severity: 'critical',
        recommendation: '🚨 Visit hospital immediately. Pneumonia requires antibiotic treatment.',
        selfCare: 'Keep warm, rest upright, drink warm fluids while awaiting transport.',
        urgency: 'emergency',
    },

    // ── Gastrointestinal ──────────────────────────────────────────────────
    {
        disease: 'Food Poisoning',
        symptoms: ['nausea', 'diarrhea', 'stomach_pain', 'fever', 'bloating'],
        requiredSymptoms: ['nausea'],
        severity: 'medium',
        recommendation: 'Rest and hydrate with ORS. Visit clinic if symptoms persist beyond 24 hours.',
        selfCare: 'Clear fluids only for 6 hours. Then bland diet (rice, bananas, toast).',
        urgency: 'self_care',
    },
    {
        disease: 'Gastroenteritis',
        symptoms: ['diarrhea', 'nausea', 'stomach_pain', 'fever', 'bloating', 'loss_of_appetite'],
        requiredSymptoms: ['diarrhea', 'stomach_pain'],
        severity: 'medium',
        recommendation: 'Stay hydrated. Visit clinic if blood in stool or fever above 39°C.',
        selfCare: 'ORS, bland diet, probiotics if available.',
        urgency: 'self_care',
    },
    {
        disease: 'Peptic Ulcer',
        symptoms: ['stomach_pain', 'nausea', 'bloating', 'loss_of_appetite', 'blood_in_stool'],
        requiredSymptoms: ['stomach_pain'],
        severity: 'medium',
        recommendation: 'Visit clinic for proper diagnosis. Avoid spicy food, alcohol, and NSAIDs.',
        selfCare: 'Eat small, frequent meals. Avoid acidic and spicy food. Antacids may help.',
        urgency: 'clinic',
    },

    // ── Urinary ───────────────────────────────────────────────────────────
    {
        disease: 'Urinary Tract Infection (UTI)',
        symptoms: ['painful_urination', 'frequent_urination', 'fever', 'stomach_pain', 'dark_urine'],
        requiredSymptoms: ['painful_urination'],
        severity: 'medium',
        recommendation: 'Visit clinic for urinalysis. Antibiotics usually required.',
        selfCare: 'Drink plenty of water. Avoid caffeine and sugary drinks.',
        urgency: 'clinic',
    },

    // ── Hepatic ───────────────────────────────────────────────────────────
    {
        disease: 'Hepatitis',
        symptoms: ['yellow_skin', 'fatigue', 'dark_urine', 'stomach_pain', 'nausea', 'loss_of_appetite', 'fever'],
        requiredSymptoms: ['yellow_skin'],
        severity: 'high',
        recommendation: 'Visit hospital immediately for liver function tests. This is a serious condition.',
        selfCare: 'Rest completely. No alcohol. Light diet.',
        urgency: 'clinic',
    },

    // ── Eye ───────────────────────────────────────────────────────────────
    {
        disease: 'Conjunctivitis (Pink Eye)',
        symptoms: ['red_eyes', 'headache'],
        requiredSymptoms: ['red_eyes'],
        severity: 'low',
        recommendation: 'Visit campus clinic for eye drops. Very contagious — avoid touching eyes.',
        selfCare: 'Warm compress on eyes. Wash hands frequently. Do not share towels.',
        urgency: 'self_care',
    },

    // ── Meningitis (CRITICAL) ─────────────────────────────────────────────
    {
        disease: 'Meningitis',
        symptoms: ['fever', 'headache', 'stiff_neck', 'nausea', 'confusion', 'rash'],
        requiredSymptoms: ['headache', 'stiff_neck'],
        severity: 'critical',
        recommendation: '🚨 EMERGENCY: Possible meningitis. Call ambulance or go to hospital IMMEDIATELY.',
        selfCare: 'Do NOT wait. This is a medical emergency. Keep the patient cool and still.',
        urgency: 'emergency',
    },

    // ── Allergic Reaction ────────────────────────────────────────────────
    {
        disease: 'Allergic Reaction',
        symptoms: ['rash', 'swelling', 'difficulty_breathing', 'red_eyes', 'runny_nose'],
        requiredSymptoms: ['rash'],
        severity: 'medium',
        recommendation: 'Take antihistamine if available. Visit clinic if swelling affects breathing.',
        selfCare: 'Remove allergen. Cool compress on rash. Antihistamine (cetirizine/loratadine).',
        urgency: 'self_care',
    },
    {
        disease: 'Anaphylaxis',
        symptoms: ['rash', 'swelling', 'difficulty_breathing', 'dizziness', 'nausea'],
        requiredSymptoms: ['difficulty_breathing', 'swelling'],
        severity: 'critical',
        recommendation: '🚨 EMERGENCY: Severe allergic reaction. Call ambulance IMMEDIATELY. Use EpiPen if available.',
        selfCare: 'Lie flat with legs elevated. Do NOT stand up. Wait for emergency services.',
        urgency: 'emergency',
    },

    // ── Trauma ────────────────────────────────────────────────────────────
    {
        disease: 'Fracture / Bone Injury',
        symptoms: ['fracture', 'swelling', 'bleeding'],
        requiredSymptoms: ['fracture'],
        severity: 'high',
        recommendation: 'Do NOT move the injured area. Visit hospital for X-ray immediately.',
        selfCare: 'Immobilize the area. Apply ice pack wrapped in cloth. Elevate if possible.',
        urgency: 'emergency',
    },

    // ── Mental Health ─────────────────────────────────────────────────────
    {
        disease: 'Anxiety / Panic Attack',
        symptoms: ['anxiety', 'chest_pain', 'difficulty_breathing', 'dizziness', 'sweating', 'insomnia'],
        requiredSymptoms: ['anxiety'],
        severity: 'medium',
        recommendation: 'If this is your first episode, visit the campus counseling center. You are safe.',
        selfCare: 'Breathe slowly: 4 counts in, hold 4, out 4. Ground yourself — name 5 things you see.',
        urgency: 'self_care',
    },
];

// ─── High-Risk Symptom Combinations (auto-escalate) ──────────────────────────
const EMERGENCY_COMBOS = [
    ['chest_pain', 'difficulty_breathing'],
    ['fainting', 'chest_pain'],
    ['difficulty_breathing', 'confusion'],
    ['fever', 'stiff_neck', 'confusion'],
    ['bleeding', 'fainting'],
    ['difficulty_breathing', 'swelling'],
];

// ─── Diagnosis Function ──────────────────────────────────────────────────────
/**
 * Analyze a list of symptom IDs and return possible diagnoses ranked by confidence.
 * @param {string[]} inputSymptoms — array of symptom IDs (e.g. ['fever', 'headache'])
 * @returns {Array<{disease, confidence, severity, recommendation, selfCare, urgency}>}
 */
export function diagnose(inputSymptoms) {
    if (!inputSymptoms || inputSymptoms.length === 0) return [];

    const results = [];

    diseaseRules.forEach(rule => {
        // Check required symptoms first — if any required symptom is missing, skip
        const hasRequired = rule.requiredSymptoms.every(rs => inputSymptoms.includes(rs));
        if (rule.requiredSymptoms.length > 0 && !hasRequired) return;

        // Count how many of the rule's symptoms match
        const matchCount = rule.symptoms.filter(sym => inputSymptoms.includes(sym)).length;
        const confidence = Math.round((matchCount / rule.symptoms.length) * 100);

        // Only include if >30% match
        if (confidence > 30) {
            results.push({
                disease: rule.disease,
                confidence,
                matchedSymptoms: matchCount,
                totalSymptoms: rule.symptoms.length,
                severity: rule.severity,
                recommendation: rule.recommendation,
                selfCare: rule.selfCare,
                urgency: rule.urgency,
            });
        }
    });

    return results.sort((a, b) => b.confidence - a.confidence);
}

// ─── Emergency Detection ─────────────────────────────────────────────────────
/**
 * Check if the given symptoms match any high-risk emergency combination.
 * Returns true if the patient should be immediately escalated.
 */
export function shouldEscalate(inputSymptoms) {
    return EMERGENCY_COMBOS.some(combo =>
        combo.every(sym => inputSymptoms.includes(sym))
    );
}

// ─── Follow-up Questions ─────────────────────────────────────────────────────
/**
 * Generate context-aware follow-up questions based on detected symptoms.
 */
export function getFollowUpQuestions(inputSymptoms) {
    const questions = [];

    if (inputSymptoms.includes('fever')) {
        questions.push('How long have you had the fever? (hours / days)');
        questions.push('Have you taken any medication like Paracetamol?');
    }
    if (inputSymptoms.includes('headache')) {
        questions.push('Where exactly is the headache? (front, back, sides, or all over)');
    }
    if (inputSymptoms.includes('cough')) {
        questions.push('Is the cough dry or producing mucus/phlegm?');
        questions.push('How long have you been coughing?');
    }
    if (inputSymptoms.includes('stomach_pain')) {
        questions.push('Where is the stomach pain? (upper, lower, left, right)');
        questions.push('Does eating make it better or worse?');
    }
    if (inputSymptoms.includes('diarrhea')) {
        questions.push('How many times have you gone today?');
        questions.push('Is there any blood or mucus in the stool?');
    }
    if (inputSymptoms.includes('difficulty_breathing')) {
        questions.push('⚠️ How severe is the breathing difficulty? (mild / moderate / severe)');
    }
    if (inputSymptoms.includes('chest_pain')) {
        questions.push('⚠️ Does the chest pain get worse with movement or breathing?');
    }
    if (inputSymptoms.includes('rash')) {
        questions.push('Is the rash spreading? Where did it start?');
    }
    if (inputSymptoms.includes('bleeding')) {
        questions.push('⚠️ How much bleeding is there? Is it controlled?');
    }

    // Default if no specific follow-ups
    if (questions.length === 0) {
        questions.push('How long have you had these symptoms?');
        questions.push('Have you taken any medication so far?');
        questions.push('Do you have any known allergies or conditions?');
    }

    return questions.slice(0, 3); // Max 3 follow-ups
}
