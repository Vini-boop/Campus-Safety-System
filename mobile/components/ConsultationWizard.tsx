import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConsultationData {
    symptoms: string;
    duration: string;
    painLevel: number;
    flags: string[];
    history: string;
}

interface Props {
    onSubmit: (data: ConsultationData) => void;
    onCancel: () => void;
}

export function ConsultationWizard({ onSubmit, onCancel }: Props) {
    const [step, setStep] = useState(1);
    const [data, setData] = useState<ConsultationData>({
        symptoms: '',
        duration: '',
        painLevel: 5,
        flags: [],
        history: '',
    });

    const nextStep = () => {
        if (step === 1 && !data.symptoms.trim()) {
            alert('Please describe your symptoms.');
            return;
        }
        if (step === 2 && !data.duration) {
            alert('Please select a duration.');
            return;
        }

        if (step < 5) setStep(step + 1);
        else onSubmit(data);
    };

    const prevStep = () => {
        if (step > 1) setStep(step - 1);
    };

    const toggleFlag = (flag: string) => {
        const newFlags = data.flags.includes(flag)
            ? data.flags.filter(f => f !== flag)
            : [...data.flags, flag];
        setData({ ...data, flags: newFlags });
    };

    const durations = ['Hours', '1-2 days', 'Several days', 'Weeks'];
    const flagOptions = ['Fever', 'Vomiting', 'Difficulty breathing', 'Injury'];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Medical Consultation</Text>
                <Text style={styles.stepText}>Step {step} of 5</Text>
            </View>

            <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.question}>What symptoms are you experiencing?</Text>
                        <TextInput
                            style={styles.textInput}
                            multiline
                            placeholder="E.g., headache, stomach pain..."
                            value={data.symptoms}
                            onChangeText={(t) => setData({ ...data, symptoms: t })}
                        />
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.question}>How long have you had these symptoms?</Text>
                        {durations.map((dur) => (
                            <TouchableOpacity
                                key={dur}
                                style={[styles.optionButton, data.duration === dur && styles.optionSelected]}
                                onPress={() => setData({ ...data, duration: dur })}
                            >
                                <Text style={[styles.optionText, data.duration === dur && styles.optionTextSelected]}>
                                    {dur}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.question}>Rate your pain level (1-10)</Text>
                        <View style={styles.painLevelContainer}>
                            <Text style={styles.painLabel}>Mild (1)</Text>
                            <Text style={styles.painLabelSelected}>{data.painLevel}</Text>
                            <Text style={styles.painLabel}>Severe (10)</Text>
                        </View>
                        <View style={styles.painButtonsRow}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                                <TouchableOpacity
                                    key={level}
                                    style={[styles.painButton, data.painLevel === level && styles.painButtonSelected]}
                                    onPress={() => setData({ ...data, painLevel: level })}
                                >
                                    <Text style={[styles.painButtonText, data.painLevel === level && styles.painButtonTextSelected]}>
                                        {level}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {step === 4 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.question}>Do you have any of the following?</Text>
                        <Text style={styles.subHint}>(Select all that apply)</Text>
                        {flagOptions.map((flag) => {
                            const selected = data.flags.includes(flag);
                            return (
                                <TouchableOpacity
                                    key={flag}
                                    style={[styles.optionButton, selected && styles.optionSelected]}
                                    onPress={() => toggleFlag(flag)}
                                >
                                    <View style={styles.checkboxContainer}>
                                        <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                                            {selected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                                        </View>
                                        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                                            {flag}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}

                {step === 5 && (
                    <View style={styles.stepContainer}>
                        <Text style={styles.question}>Any existing conditions or allergies?</Text>
                        <Text style={styles.subHint}>(Optional)</Text>
                        <TextInput
                            style={styles.textInput}
                            multiline
                            placeholder="Type here or leave blank..."
                            value={data.history}
                            onChangeText={(t) => setData({ ...data, history: t })}
                        />
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                {step > 1 ? (
                    <TouchableOpacity style={styles.footerButtonOutline} onPress={prevStep}>
                        <Text style={styles.footerButtonOutlineText}>Back</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ flex: 1 }} />
                )}

                <TouchableOpacity style={styles.footerButton} onPress={nextStep}>
                    <Text style={styles.footerButtonText}>{step === 5 ? 'Submit' : 'Next'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
        backgroundColor: '#F9FAFB',
    },
    closeButton: {
        padding: 4,
    },
    headerTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '700',
        color: '#0C156D',
        textAlign: 'center',
    },
    stepText: {
        fontSize: 13,
        color: '#666',
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    stepContainer: {
        paddingBottom: 40,
    },
    question: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1A1A1A',
        marginBottom: 8,
    },
    subHint: {
        fontSize: 13,
        color: '#666',
        marginBottom: 16,
    },
    textInput: {
        backgroundColor: '#FAFAFA',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        minHeight: 120,
        textAlignVertical: 'top',
        color: '#1A1A1A',
        marginTop: 10,
    },
    optionButton: {
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        backgroundColor: '#FFFFFF',
    },
    optionSelected: {
        borderColor: '#0C156D',
        backgroundColor: 'rgba(12, 21, 109, 0.05)',
    },
    optionText: {
        fontSize: 16,
        color: '#444',
    },
    optionTextSelected: {
        color: '#0C156D',
        fontWeight: '600',
    },
    painLevelContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        marginTop: 10,
    },
    painLabel: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    painLabelSelected: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0C156D',
    },
    painButtonsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 10,
    },
    painButton: {
        width: 45,
        height: 45,
        borderRadius: 22.5,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
    },
    painButtonSelected: {
        borderColor: '#0C156D',
        backgroundColor: '#0C156D',
    },
    painButtonText: {
        fontSize: 16,
        color: '#444',
        fontWeight: '500',
    },
    painButtonTextSelected: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#CCC',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#0C156D',
        borderColor: '#0C156D',
    },
    footer: {
        flexDirection: 'row',
        padding: 16,
        paddingBottom: 30, // Safe area
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#EEE',
        gap: 12,
    },
    footerButtonOutline: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#0C156D',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerButtonOutlineText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0C156D',
    },
    footerButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#0C156D',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
