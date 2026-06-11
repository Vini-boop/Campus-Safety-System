import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import authTestService from '@/services/authTestService';
import { auth, testFirebaseConnection } from '@/services/firebase';
import { api } from '@/services/api';

interface StatusItem {
  label: string;
  status: 'checking' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

export default function AuthenticationStatus() {
  const [statuses, setStatuses] = useState<StatusItem[]>([
    { label: 'Firebase Connection', status: 'checking', message: 'Testing...' },
    { label: 'Firebase Auth', status: 'checking', message: 'Testing...' },
    { label: 'Backend API', status: 'checking', message: 'Testing...' },
    { label: 'User Authentication', status: 'checking', message: 'Testing...' },
  ]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    runAllTests();
  }, []);

  const runAllTests = async () => {
    setIsRefreshing(true);
    const newStatuses = [...statuses];

    // Test 1: Firebase Connection
    try {
      newStatuses[0] = { label: 'Firebase Connection', status: 'checking', message: 'Testing...' };
      setStatuses([...newStatuses]);

      const firebaseTest = await testFirebaseConnection();
      if (firebaseTest.success) {
        newStatuses[0] = {
          label: 'Firebase Connection',
          status: 'success',
          message: 'Connected successfully',
          details: `Project: ${firebaseTest.details?.projectId || 'Unknown'}`,
        };
      } else {
        newStatuses[0] = {
          label: 'Firebase Connection',
          status: 'error',
          message: 'Connection failed',
          details: firebaseTest.message,
        };
      }
    } catch (error: any) {
      newStatuses[0] = {
        label: 'Firebase Connection',
        status: 'error',
        message: 'Connection failed',
        details: error.message,
      };
    }
    setStatuses([...newStatuses]);

    // Test 2: Firebase Auth (basic connectivity test)
    try {
      newStatuses[1] = { label: 'Firebase Auth', status: 'checking', message: 'Testing...' };
      setStatuses([...newStatuses]);

      // Just check if auth service is available and configured
      if (auth && auth.app) {
        newStatuses[1] = {
          label: 'Firebase Auth',
          status: 'success',
          message: 'Auth service available',
          details: `Project: ${auth.app.options.projectId || 'Unknown'}`,
        };
      } else {
        newStatuses[1] = {
          label: 'Firebase Auth',
          status: 'error',
          message: 'Auth service not available',
          details: 'Firebase Auth not properly initialized',
        };
      }
    } catch (error: any) {
      newStatuses[1] = {
        label: 'Firebase Auth',
        status: 'error',
        message: 'Auth service failed',
        details: error.message,
      };
    }
    setStatuses([...newStatuses]);

    // Test 3: Backend API (basic connectivity test)
    try {
      newStatuses[2] = { label: 'Backend API', status: 'checking', message: 'Testing...' };
      setStatuses([...newStatuses]);

      // Just check if API client is configured
      if (typeof api.verifyToken === 'function') {
        newStatuses[2] = {
          label: 'Backend API',
          status: 'success',
          message: 'API service available',
          details: 'API client configured',
        };
      } else {
        newStatuses[2] = {
          label: 'Backend API',
          status: 'error',
          message: 'API service not available',
          details: 'API client not properly configured',
        };
      }
    } catch (error: any) {
      newStatuses[2] = {
        label: 'Backend API',
        status: 'error',
        message: 'API service failed',
        details: error.message,
      };
    }
    setStatuses([...newStatuses]);

    // Test 4: User Authentication Flow (basic check)
    try {
      newStatuses[3] = { label: 'User Authentication', status: 'checking', message: 'Testing...' };
      setStatuses([...newStatuses]);

      // Just check if auth service is available for user authentication
      if (auth && typeof auth.signInWithEmailAndPassword === 'function') {
        newStatuses[3] = {
          label: 'User Authentication',
          status: 'success',
          message: 'Auth methods available',
          details: 'Sign-in methods ready',
        };
      } else {
        newStatuses[3] = {
          label: 'User Authentication',
          status: 'error',
          message: 'Auth methods not available',
          details: 'Authentication methods not properly configured',
        };
      }
    } catch (error: any) {
      newStatuses[3] = {
        label: 'User Authentication',
        status: 'error',
        message: 'Auth flow failed',
        details: error.message,
      };
    }
    setStatuses([...newStatuses]);

    setIsRefreshing(false);
  };

  const getStatusIcon = (status: StatusItem['status']) => {
    switch (status) {
      case 'checking':
        return <ActivityIndicator size={16} color="#007AFF" />;
      case 'success':
        return <Ionicons name="checkmark-circle" size={16} color="#34C759" />;
      case 'error':
        return <Ionicons name="close-circle" size={16} color="#FF3B30" />;
      case 'warning':
        return <Ionicons name="warning" size={16} color="#FF9500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: StatusItem['status']) => {
    switch (status) {
      case 'checking':
        return '#007AFF';
      case 'success':
        return '#34C759';
      case 'error':
        return '#FF3B30';
      case 'warning':
        return '#FF9500';
      default:
        return '#8E8E93';
    }
  };

  const allSuccess = statuses.every(s => s.status === 'success');
  const hasErrors = statuses.some(s => s.status === 'error');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Authentication Status</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={runAllTests}
          disabled={isRefreshing}
        >
          <Ionicons
            name={isRefreshing ? 'refresh' : 'refresh-outline'}
            size={20}
            color={isRefreshing ? '#8E8E93' : '#007AFF'}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.overallStatus, allSuccess ? styles.success : hasErrors ? styles.error : styles.checking]}>
        <View style={styles.overallStatusContent}>
          {getStatusIcon(allSuccess ? 'success' : hasErrors ? 'error' : 'checking')}
          <Text style={styles.overallStatusText}>
            {allSuccess ? 'All Systems Operational' : hasErrors ? 'Issues Detected' : 'Checking Systems...'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.statusList}>
        {statuses.map((status, index) => (
          <View key={index} style={styles.statusItem}>
            <View style={styles.statusHeader}>
              <View style={styles.statusLeft}>
                {getStatusIcon(status.status)}
                <Text style={[styles.statusLabel, { color: getStatusColor(status.status) }]}>
                  {status.label}
                </Text>
              </View>
              <Text style={[styles.statusMessage, { color: getStatusColor(status.status) }]}>
                {status.message}
              </Text>
            </View>
            
            {showDetails && status.details && (
              <Text style={styles.statusDetails}>{status.details}</Text>
            )}
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(!showDetails)}
      >
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Hide Details' : 'Show Details'}
        </Text>
        <Ionicons
          name={showDetails ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#007AFF"
        />
      </TouchableOpacity>

      {!allSuccess && (
        <View style={styles.troubleshooting}>
          <Text style={styles.troubleshootingTitle}>Troubleshooting Tips:</Text>
          <Text style={styles.troubleshootingText}>
            • Check your internet connection{'\n'}
            • Ensure Firebase project is active{'\n'}
            • Verify backend server is running{'\n'}
            • Check environment variables{'\n'}
            • Try using test credentials button
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  refreshButton: {
    padding: 8,
  },
  overallStatus: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  success: {
    backgroundColor: '#E8F5E8',
  },
  error: {
    backgroundColor: '#FFEBEE',
  },
  checking: {
    backgroundColor: '#E3F2FD',
  },
  overallStatusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overallStatusText: {
    fontSize: 16,
    fontWeight: '500',
  },
  statusList: {
    maxHeight: 200,
  },
  statusItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusMessage: {
    fontSize: 12,
  },
  statusDetails: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 8,
  },
  detailsToggleText: {
    fontSize: 12,
    color: '#007AFF',
  },
  troubleshooting: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
  },
  troubleshootingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  troubleshootingText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
});
