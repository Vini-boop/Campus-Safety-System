import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile } from '@/services/userVerification';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { user, logout, refreshAuthData } = useAuth();
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    checkApprovalStatus();
  }, []);

  const checkApprovalStatus = async () => {
    if (!user) return;

    try {
      const profile = await getUserProfile(user.uid);

      if (profile) {
        // Support both field conventions:
        // - verificationStatus (set by new admin flow)
        // - status (set by old flow)
        const verificationStatus = (profile as any).verificationStatus || profile.status || 'pending';
        const isApproved = (profile as any).isApproved === true || verificationStatus === 'approved';

        if (isApproved) {
          setStatus('approved');
          // Update local cache with approved state
          const cached = await AsyncStorage.getItem('userData');
          const userData = cached ? JSON.parse(cached) : {};
          await AsyncStorage.setItem('userData', JSON.stringify({
            ...userData,
            uid: user.uid,
            email: user.email,
            role: (profile as any).role || 'student',
            displayName: (profile as any).fullName || (profile as any).displayName || '',
            isApproved: true,
            isVerified: true,
            verificationStatus: 'approved',
            regNo: (profile as any).regNo || (profile as any).regNumber || '',
            phone: (profile as any).phone || (profile as any).phoneNumber || '',
          }));
          await refreshAuthData();
          router.replace('/(tabs)');
        } else if (verificationStatus === 'rejected') {
          setStatus('rejected');
        } else {
          setStatus('pending');
        }
      }
    } catch {
      // Silent
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? You will need to wait for approval again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  // Auto-check every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!checking && status === 'pending') {
        checkApprovalStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [checking, status]);

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0C156D" />
        <Text style={styles.loadingText}>Checking approval status...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Status Icon */}
      <View style={styles.iconContainer}>
        {status === 'pending' && (
          <Ionicons name="time-outline" size={80} color="#FFA500" />
        )}
        {status === 'approved' && (
          <Ionicons name="checkmark-circle" size={80} color="#4CD964" />
        )}
        {status === 'rejected' && (
          <Ionicons name="close-circle" size={80} color="#FF3B30" />
        )}
      </View>

      {/* Title */}
      <Text style={styles.title}>
        {status === 'pending' && 'Pending Approval'}
        {status === 'approved' && 'Approved!'}
        {status === 'rejected' && 'Verification Rejected'}
      </Text>

      {/* Message */}
      {status === 'pending' && (
        <>
          <Text style={styles.message}>
            Your verification is being reviewed by an administrator.
          </Text>
          <Text style={styles.subMessage}>
            This page will automatically refresh when approved.
          </Text>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#0C156D" />
            <Text style={styles.infoText}>
              Average approval time: 24-48 hours
            </Text>
          </View>

          <TouchableOpacity style={styles.refreshButton} onPress={checkApprovalStatus}>
            <Ionicons name="refresh" size={20} color="#0C156D" />
            <Text style={styles.refreshButtonText}>Check Now</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'approved' && (
        <>
          <Text style={styles.message}>
            Congratulations! Your account has been verified.
          </Text>
          <Text style={styles.message}>
            You now have full access to all features.
          </Text>
        </>
      )}

      {status === 'rejected' && (
        <>
          <Text style={styles.message}>
            Your verification was rejected. Please contact support for assistance.
          </Text>
          <TouchableOpacity style={styles.contactButton} onPress={() => { }}>
            <Text style={styles.contactButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#666" />
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  iconContainer: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0C156D',
    marginBottom: 20,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 24,
  },
  subMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  infoCard: {
    backgroundColor: '#E8EAF6',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#0C156D',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0C156D',
    marginBottom: 20,
  },
  refreshButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#0C156D',
    fontWeight: '600',
  },
  contactButton: {
    backgroundColor: '#0C156D',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 20,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    padding: 15,
  },
  logoutButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#666',
  },
});
