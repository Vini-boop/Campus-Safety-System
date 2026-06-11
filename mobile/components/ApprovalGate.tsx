/**
 * ApprovalGate.tsx
 *
 * Reusable component that shows a banner when a student's verification
 * is pending admin approval. Blocks the action button and explains why.
 *
 * Usage:
 *   <ApprovalGate userProfile={userProfile}>
 *     <YourActionButton />
 *   </ApprovalGate>
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface UserProfile {
    role?: string;
    isProfileComplete?: boolean;
    hasCompletedProfile?: boolean;
    isApproved?: boolean;
    verificationStatus?: string;
    [key: string]: any;
}

interface ApprovalGateProps {
    userProfile: UserProfile | null;
    children: React.ReactNode;
    /** If true, renders children but overlays a disabled state. Default: false (hides children) */
    overlay?: boolean;
}

/** Returns the verification state for a student profile */
export function getVerificationState(userProfile: UserProfile | null): {
    isStudent: boolean;
    profileSubmitted: boolean;
    isApproved: boolean;
    needsAction: boolean;
} {
    if (!userProfile) return { isStudent: false, profileSubmitted: false, isApproved: false, needsAction: false };

    const isStudent = userProfile.role === 'student' || !userProfile.role;
    const profileSubmitted = userProfile.isProfileComplete === true || userProfile.hasCompletedProfile === true;
    const isApproved = userProfile.isApproved === true || userProfile.verificationStatus === 'approved';
    const needsAction = isStudent && (!profileSubmitted || !isApproved);

    return { isStudent, profileSubmitted, isApproved, needsAction };
}

export default function ApprovalGate({ userProfile, children, overlay = false }: ApprovalGateProps) {
    const router = useRouter();
    const { isStudent, profileSubmitted, isApproved, needsAction } = getVerificationState(userProfile);

    // Non-students or approved students — render normally
    if (!needsAction) {
        return <>{children}</>;
    }

    const banner = (
        <View style={s.banner}>
            <View style={s.bannerIcon}>
                <Ionicons
                    name={profileSubmitted ? 'time-outline' : 'shield-outline'}
                    size={28}
                    color={profileSubmitted ? '#FF9800' : '#0C156D'}
                />
            </View>
            <View style={s.bannerBody}>
                {!profileSubmitted ? (
                    <>
                        <Text style={s.bannerTitle}>Verification Required</Text>
                        <Text style={s.bannerMsg}>
                            Submit your Reg No. and phone number to unlock reporting and ambulance requests.
                        </Text>
                        <TouchableOpacity
                            style={s.bannerBtn}
                            onPress={() => router.push('/update-profile')}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="arrow-forward-circle-outline" size={16} color="#FFF" />
                            <Text style={s.bannerBtnText}>Complete Verification</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={[s.bannerTitle, { color: '#E65100' }]}>Awaiting Admin Approval</Text>
                        <Text style={s.bannerMsg}>
                            Your details have been submitted. An admin will approve your account within 24–48 hours.
                            You'll have full access once approved.
                        </Text>
                        <View style={s.pendingBadge}>
                            <Ionicons name="hourglass-outline" size={13} color="#FF9800" />
                            <Text style={s.pendingBadgeText}>Pending Review</Text>
                        </View>
                    </>
                )}
            </View>
        </View>
    );

    if (overlay) {
        // Show children but with a disabled overlay on top
        return (
            <View style={{ flex: 1 }}>
                {banner}
                <View style={s.overlayWrap} pointerEvents="none">
                    <View style={s.overlayDim} />
                    {children}
                </View>
            </View>
        );
    }

    // Default: show banner only, hide children
    return <View style={{ flex: 1 }}>{banner}</View>;
}

const s = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FFF',
        borderRadius: 16,
        margin: 16,
        padding: 16,
        gap: 12,
        borderWidth: 1.5,
        borderColor: '#E0E0E0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 3,
    },
    bannerIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    bannerBody: { flex: 1 },
    bannerTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0C156D',
        marginBottom: 4,
    },
    bannerMsg: {
        fontSize: 13,
        color: '#555',
        lineHeight: 18,
        marginBottom: 12,
    },
    bannerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#0C156D',
        borderRadius: 10,
        paddingVertical: 9,
        paddingHorizontal: 14,
        alignSelf: 'flex-start',
    },
    bannerBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#FFF3E0',
        borderRadius: 8,
        paddingVertical: 5,
        paddingHorizontal: 10,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: '#FFE0B2',
    },
    pendingBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#E65100',
    },
    overlayWrap: { flex: 1, position: 'relative' },
    overlayDim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.7)',
        zIndex: 10,
        borderRadius: 12,
    },
});
