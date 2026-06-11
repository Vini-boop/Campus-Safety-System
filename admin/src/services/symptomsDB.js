/**
 * symptomsDB.js
 * Comprehensive symptom database for the AI diagnosis engine.
 * Each symptom has an id, display label, keywords for NLP matching,
 * and a medical category for clustering.
 */

export const symptomsDB = [
    // ── Neurological ───────────────────────────────────────────────────────
    {
        id: 'headache',
        label: 'Headache',
        keywords: ['headache', 'head pain', 'head ache', 'head hurts', 'migraine', 'pounding head'],
        category: 'neurological',
        emoji: '🤕',
    },
    {
        id: 'dizziness',
        label: 'Dizziness',
        keywords: ['dizzy', 'dizziness', 'lightheaded', 'light headed', 'vertigo', 'feeling faint', 'room spinning'],
        category: 'neurological',
        emoji: '😵‍💫',
    },
    {
        id: 'confusion',
        label: 'Confusion',
        keywords: ['confused', 'confusion', 'disoriented', 'cant think', 'foggy mind', 'brain fog'],
        category: 'neurological',
        emoji: '😵',
    },
    {
        id: 'fainting',
        label: 'Fainting / Loss of Consciousness',
        keywords: ['fainted', 'fainting', 'blacked out', 'passed out', 'lost consciousness', 'unconscious'],
        category: 'neurological',
        emoji: '💫',
    },

    // ── General / Systemic ────────────────────────────────────────────────
    {
        id: 'fever',
        label: 'Fever',
        keywords: ['fever', 'high temperature', 'hot body', 'burning up', 'feverish', 'temperature', 'chills and fever'],
        category: 'general',
        emoji: '🌡️',
    },
    {
        id: 'chills',
        label: 'Chills',
        keywords: ['chills', 'shivering', 'cold sweats', 'feeling cold', 'trembling'],
        category: 'general',
        emoji: '🥶',
    },
    {
        id: 'fatigue',
        label: 'Fatigue / Weakness',
        keywords: ['fatigue', 'tired', 'exhausted', 'weakness', 'weak', 'no energy', 'lethargic', 'feeling drained'],
        category: 'general',
        emoji: '😴',
    },
    {
        id: 'body_aches',
        label: 'Body Aches',
        keywords: ['body aches', 'body pain', 'muscle pain', 'aching', 'sore body', 'muscles hurt', 'joint pain'],
        category: 'general',
        emoji: '💪',
    },
    {
        id: 'sweating',
        label: 'Excessive Sweating',
        keywords: ['sweating', 'night sweats', 'profuse sweating', 'sweating a lot'],
        category: 'general',
        emoji: '💦',
    },
    {
        id: 'weight_loss',
        label: 'Unexplained Weight Loss',
        keywords: ['weight loss', 'losing weight', 'lost weight', 'getting thin'],
        category: 'general',
        emoji: '⚖️',
    },

    // ── Gastrointestinal ──────────────────────────────────────────────────
    {
        id: 'nausea',
        label: 'Nausea / Vomiting',
        keywords: ['nausea', 'nauseous', 'vomiting', 'throwing up', 'puking', 'feeling sick', 'want to vomit'],
        category: 'gastrointestinal',
        emoji: '🤢',
    },
    {
        id: 'diarrhea',
        label: 'Diarrhea',
        keywords: ['diarrhea', 'loose stool', 'watery stool', 'running stomach', 'stomach running'],
        category: 'gastrointestinal',
        emoji: '🚽',
    },
    {
        id: 'stomach_pain',
        label: 'Stomach Pain',
        keywords: ['stomach pain', 'stomach ache', 'abdominal pain', 'tummy ache', 'belly pain', 'cramps', 'stomach cramps'],
        category: 'gastrointestinal',
        emoji: '🤕',
    },
    {
        id: 'loss_of_appetite',
        label: 'Loss of Appetite',
        keywords: ['no appetite', 'loss of appetite', 'not hungry', 'cant eat', 'dont want to eat'],
        category: 'gastrointestinal',
        emoji: '🍽️',
    },
    {
        id: 'bloating',
        label: 'Bloating',
        keywords: ['bloating', 'bloated', 'swollen stomach', 'gas', 'gassy'],
        category: 'gastrointestinal',
        emoji: '🎈',
    },
    {
        id: 'blood_in_stool',
        label: 'Blood in Stool',
        keywords: ['blood in stool', 'bloody stool', 'blood when going', 'rectal bleeding'],
        category: 'gastrointestinal',
        emoji: '🩸',
    },

    // ── Respiratory ───────────────────────────────────────────────────────
    {
        id: 'cough',
        label: 'Cough',
        keywords: ['cough', 'coughing', 'dry cough', 'wet cough', 'persistent cough'],
        category: 'respiratory',
        emoji: '😷',
    },
    {
        id: 'sore_throat',
        label: 'Sore Throat',
        keywords: ['sore throat', 'throat pain', 'painful throat', 'scratchy throat', 'throat hurts'],
        category: 'respiratory',
        emoji: '🗣️',
    },
    {
        id: 'runny_nose',
        label: 'Runny / Stuffy Nose',
        keywords: ['runny nose', 'stuffy nose', 'blocked nose', 'nasal congestion', 'sneezing', 'nose running'],
        category: 'respiratory',
        emoji: '🤧',
    },
    {
        id: 'difficulty_breathing',
        label: 'Difficulty Breathing',
        keywords: ['difficulty breathing', 'cant breathe', 'shortness of breath', 'breathless', 'hard to breathe', 'wheezing', 'gasping'],
        category: 'respiratory',
        emoji: '😮‍💨',
    },
    {
        id: 'chest_pain',
        label: 'Chest Pain',
        keywords: ['chest pain', 'chest tightness', 'chest hurts', 'pressure in chest', 'heart pain'],
        category: 'cardiovascular',
        emoji: '💔',
    },

    // ── Skin ──────────────────────────────────────────────────────────────
    {
        id: 'rash',
        label: 'Skin Rash',
        keywords: ['rash', 'skin rash', 'itchy skin', 'bumps on skin', 'hives', 'red spots', 'skin irritation'],
        category: 'dermatological',
        emoji: '🔴',
    },
    {
        id: 'yellow_skin',
        label: 'Yellowing Skin / Eyes',
        keywords: ['yellow skin', 'yellow eyes', 'jaundice', 'yellowish', 'skin turning yellow'],
        category: 'dermatological',
        emoji: '🟡',
    },

    // ── Musculoskeletal ───────────────────────────────────────────────────
    {
        id: 'back_pain',
        label: 'Back Pain',
        keywords: ['back pain', 'lower back pain', 'upper back pain', 'back ache', 'spine pain'],
        category: 'musculoskeletal',
        emoji: '🦴',
    },
    {
        id: 'stiff_neck',
        label: 'Stiff Neck',
        keywords: ['stiff neck', 'neck pain', 'neck stiffness', 'cant move neck', 'painful neck'],
        category: 'musculoskeletal',
        emoji: '🦴',
    },

    // ── Urinary ───────────────────────────────────────────────────────────
    {
        id: 'painful_urination',
        label: 'Painful Urination',
        keywords: ['painful urination', 'burns when peeing', 'pain when urinating', 'burning sensation'],
        category: 'urinary',
        emoji: '🚿',
    },
    {
        id: 'frequent_urination',
        label: 'Frequent Urination',
        keywords: ['frequent urination', 'peeing a lot', 'need to pee', 'always urinating'],
        category: 'urinary',
        emoji: '🚿',
    },
    {
        id: 'dark_urine',
        label: 'Dark Urine',
        keywords: ['dark urine', 'brown urine', 'dark colored pee', 'tea colored urine'],
        category: 'urinary',
        emoji: '🟤',
    },

    // ── Eyes ──────────────────────────────────────────────────────────────
    {
        id: 'red_eyes',
        label: 'Red / Irritated Eyes',
        keywords: ['red eyes', 'eye pain', 'eyes burning', 'itchy eyes', 'watery eyes', 'pink eye'],
        category: 'ophthalmological',
        emoji: '👁️',
    },
    {
        id: 'blurred_vision',
        label: 'Blurred Vision',
        keywords: ['blurred vision', 'blurry vision', 'cant see clearly', 'vision problems'],
        category: 'ophthalmological',
        emoji: '👓',
    },

    // ── Mental Health ─────────────────────────────────────────────────────
    {
        id: 'anxiety',
        label: 'Anxiety / Panic',
        keywords: ['anxiety', 'anxious', 'panic', 'panic attack', 'worried', 'nervous', 'cant calm down'],
        category: 'mental_health',
        emoji: '😰',
    },
    {
        id: 'insomnia',
        label: 'Insomnia',
        keywords: ['insomnia', 'cant sleep', 'sleepless', 'difficulty sleeping', 'not sleeping'],
        category: 'mental_health',
        emoji: '🌙',
    },

    // ── Injuries / Trauma ─────────────────────────────────────────────────
    {
        id: 'bleeding',
        label: 'Bleeding',
        keywords: ['bleeding', 'blood', 'cut', 'wound', 'laceration', 'bleeding heavily'],
        category: 'trauma',
        emoji: '🩸',
    },
    {
        id: 'swelling',
        label: 'Swelling',
        keywords: ['swelling', 'swollen', 'puffed up', 'inflamed', 'swollen ankle', 'swollen joint'],
        category: 'trauma',
        emoji: '🦶',
    },
    {
        id: 'fracture',
        label: 'Suspected Fracture',
        keywords: ['fracture', 'broken bone', 'bone broken', 'cant move', 'deformed', 'snapped'],
        category: 'trauma',
        emoji: '🦴',
    },
];

/**
 * Extract symptom IDs from free-text user input.
 * Returns an array of matched symptom IDs.
 */
export function extractSymptoms(text) {
    const lower = text.toLowerCase();
    return symptomsDB
        .filter(sym => sym.keywords.some(kw => lower.includes(kw)))
        .map(sym => sym.id);
}

/**
 * Get display info for a list of symptom IDs.
 */
export function getSymptomLabels(ids) {
    return ids.map(id => {
        const sym = symptomsDB.find(s => s.id === id);
        return sym ? `${sym.emoji} ${sym.label}` : id;
    });
}

/**
 * Quick symptom chips for the chat UI — grouped by category.
 */
export function getSymptomChips() {
    const categories = {};
    symptomsDB.forEach(sym => {
        if (!categories[sym.category]) categories[sym.category] = [];
        categories[sym.category].push({ id: sym.id, label: sym.label, emoji: sym.emoji });
    });
    return categories;
}
