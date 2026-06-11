import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SymptomGuideModalProps {
    visible: boolean;
    onClose: () => void;
}

const SYMPTOM_GUIDE = [
    {
        condition: 'Fever',
        symptoms: 'High body temperature, sweating/chills, weakness, body aches',
        possibleCauses: 'Malaria, Viral infections, Flu',
        advice: 'Drink fluids, Rest, Take paracetamol, Test for malaria if persistent',
        riskLevel: 'medium',
        icon: '🌡️'
    },
    {
        condition: 'Headache',
        symptoms: 'Pain in head (mild → severe), sensitivity to light, dizziness',
        possibleCauses: 'Stress, Dehydration, Migraine, Eye strain',
        advice: 'Drink water, Rest in quiet place, Reduce screen time, Pain relief meds if needed',
        riskLevel: 'low',
        icon: '🤕'
    },
    {
        condition: 'Common Cold',
        symptoms: 'Runny nose, sneezing, mild fever, sore throat',
        possibleCauses: 'Viral infection',
        advice: 'Warm fluids, Rest, Vitamin C, Usually resolves in 3–7 days',
        riskLevel: 'low',
        icon: '🤧'
    },
    {
        condition: 'Malaria',
        symptoms: 'High fever, chills & sweating, headache, nausea/vomiting',
        possibleCauses: 'Malaria parasite infection',
        advice: 'Get tested immediately, Start antimalarial drugs if confirmed, Seek medical care if severe',
        riskLevel: 'high',
        icon: '🦟'
    },
    {
        condition: 'Pneumonia',
        symptoms: 'Chest pain, difficulty breathing, persistent cough, high fever',
        possibleCauses: 'Bacterial or viral lung infection',
        advice: '⚠️ Seek medical attention immediately, Requires antibiotics / hospital care',
        riskLevel: 'severe',
        icon: '🫁'
    }
];

export default function SymptomGuideModal({ visible, onClose }: SymptomGuideModalProps) {
    const getUrgencyColor = (riskLevel: string) => {
        switch (riskLevel) {
            case 'severe': return '#D32F2F';
            case 'high': return '#D32F2F';
            case 'medium': return '#FF9800';
            case 'low': return '#4CAF50';
            default: return '#666';
        }
    };

    const getUrgencyLabel = (riskLevel: string) => {
        switch (riskLevel) {
            case 'severe': return 'SEVERE';
            case 'high': return 'HIGH PRIORITY';
            case 'medium': return 'MEDIUM PRIORITY';
            case 'low': return 'LOW PRIORITY';
            default: return 'NORMAL';
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Ionicons name="medical" size={24} color="#0C156D" />
                        <Text style={styles.headerTitle}>Symptom Reference Guide</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color="#666" />
                    </TouchableOpacity>
                </View>

                {/* Subtitle */}
                <View style={styles.subtitleContainer}>
                    <Text style={styles.subtitle}>Quick reference for common campus health issues (Ages 17-25)</Text>
                </View>

                {/* Content */}
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {SYMPTOM_GUIDE.map((item, index) => (
                        <View key={index} style={styles.symptomCard}>
                            <View style={styles.cardHeader}>
                                <View style={styles.conditionRow}>
                                    <Text style={styles.conditionIcon}>{item.icon}</Text>
                                    <Text style={styles.conditionName}>{item.condition}</Text>
                                </View>
                                <View style={[styles.urgencyBadge, { backgroundColor: getUrgencyColor(item.riskLevel) }]}>
                                    <Text style={styles.urgencyText}>{getUrgencyLabel(item.riskLevel)}</Text>
                                </View>
                            </View>

                            <View style={styles.cardContent}>
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Symptoms:</Text>
                                    <Text style={styles.sectionText}>{item.symptoms}</Text>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Possible Causes:</Text>
                                    <Text style={styles.sectionText}>{item.possibleCauses}</Text>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Advice:</Text>
                                    <Text style={styles.sectionText}>{item.advice}</Text>
                                </View>
                            </View>
                        </View>
                    ))}

                    {/* Emergency Contacts */}
                    <View style={styles.emergencyCard}>
                        <View style={styles.emergencyHeader}>
                            <Ionicons name="call" size={20} color="#D32F2F" />
                            <Text style={styles.emergencyTitle}>Emergency Contacts</Text>
                        </View>
                        <Text style={styles.emergencyText}>📞 Medical Center: 0705824331</Text>
                        <Text style={styles.emergencyText}>🚑 Campus Ambulance: Use app button</Text>
                        <Text style={styles.emergencyText}>🆘 National Emergency: 999 or 112</Text>
                    </View>

                    {/* Disclaimer */}
                    <View style={styles.disclaimerCard}>
                        <Ionicons name="warning" size={16} color="#FF9800" />
                        <Text style={styles.disclaimerText}>
                            This guide provides preliminary information only and is not a substitute for professional medical diagnosis.
                            Always consult with qualified medical professionals for proper diagnosis and treatment.
                        </Text>
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0C156D',
        marginLeft: 8,
    },
    closeButton: {
        padding: 4,
    },
    subtitleContainer: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#E8EAF6',
    },
    subtitle: {
        fontSize: 14,
        color: '#5C6BC0',
        textAlign: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    symptomCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
    },
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    conditionIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    conditionName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1A1A1A',
    },
    urgencyBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    urgencyText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    cardContent: {
        padding: 16,
    },
    section: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0C156D',
        marginBottom: 4,
    },
    sectionText: {
        fontSize: 14,
        color: '#444',
        lineHeight: 20,
    },
    emergencyCard: {
        backgroundColor: '#FFEBEE',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#D32F2F',
    },
    emergencyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    emergencyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#D32F2F',
        marginLeft: 8,
    },
    emergencyText: {
        fontSize: 14,
        color: '#B71C1C',
        marginBottom: 4,
    },
    disclaimerCard: {
        backgroundColor: '#FFF3E0',
        borderRadius: 12,
        padding: 16,
        marginBottom: 32,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    disclaimerText: {
        fontSize: 12,
        color: '#E65100',
        marginLeft: 8,
        flex: 1,
        lineHeight: 18,
    },
});