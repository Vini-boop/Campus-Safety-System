import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WeatherService from '@/services/weatherService';
import { api } from '@/services/api';
import { auth } from '@/services/firebase';

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  details?: any;
}

export default function ApiTestPanel() {
  const [results, setResults] = useState<TestResult[]>([
    { name: 'Weather API', status: 'pending', message: 'Not tested' },
    { name: 'Backend Connection', status: 'pending', message: 'Not tested' },
    { name: 'Firebase Auth', status: 'pending', message: 'Not tested' },
    { name: 'Google OAuth Config', status: 'pending', message: 'Not tested' },
  ]);
  const [isTesting, setIsTesting] = useState(false);

  const runTests = async () => {
    setIsTesting(true);
    const newResults: TestResult[] = [];

    // Test 1: Weather API
    try {
      const weather = await WeatherService.getWeatherByCoordinates(0.0417, 36.2920);
      if (weather) {
        newResults.push({
          name: 'Weather API',
          status: 'success',
          message: `${weather.temperature}°C, ${weather.description}`,
          details: weather,
        });
      } else {
        newResults.push({
          name: 'Weather API',
          status: 'error',
          message: 'Returned null data',
        });
      }
    } catch (error: any) {
      newResults.push({
        name: 'Weather API',
        status: 'error',
        message: error.message,
      });
    }

    // Test 2: Backend Connection
    try {
      const connection = await api.testConnection();
      if (connection.success) {
        newResults.push({
          name: 'Backend Connection',
          status: 'success',
          message: `Connected to ${connection.details?.baseURL}`,
          details: connection.details,
        });
      } else {
        newResults.push({
          name: 'Backend Connection',
          status: 'error',
          message: connection.message,
        });
      }
    } catch (error: any) {
      newResults.push({
        name: 'Backend Connection',
        status: 'error',
        message: error.message,
      });
    }

    // Test 3: Firebase Auth
    try {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        newResults.push({
          name: 'Firebase Auth',
          status: 'success',
          message: `Logged in as ${user.email}`,
          details: { uid: user.uid, token: token.substring(0, 20) + '...' },
        });
      } else {
        newResults.push({
          name: 'Firebase Auth',
          status: 'error',
          message: 'No user logged in',
        });
      }
    } catch (error: any) {
      newResults.push({
        name: 'Firebase Auth',
        status: 'error',
        message: error.message,
      });
    }

    // Test 4: Google OAuth Config
    const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (googleClientId && !googleClientId.includes('your_')) {
      newResults.push({
        name: 'Google OAuth Config',
        status: 'success',
        message: 'Client ID configured',
        details: { clientId: googleClientId.substring(0, 20) + '...' },
      });
    } else {
      newResults.push({
        name: 'Google OAuth Config',
        status: 'error',
        message: 'Client ID not configured',
      });
    }

    setResults(newResults);
    setIsTesting(false);

    // Show summary alert
    const passed = newResults.filter(r => r.status === 'success').length;
    const total = newResults.length;
    Alert.alert(
      'API Test Results',
      `${passed}/${total} tests passed`,
      [{ text: 'OK' }]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={24} color="#4CD964" />;
      case 'error':
        return <Ionicons name="close-circle" size={24} color="#FF3B30" />;
      default:
        return <Ionicons name="help-circle" size={24} color="#999" />;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>API Test Panel</Text>
      
      <TouchableOpacity
        style={[styles.testButton, isTesting && styles.testButtonDisabled]}
        onPress={runTests}
        disabled={isTesting}
      >
        {isTesting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.testButtonText}>Run API Tests</Text>
          </>
        )}
      </TouchableOpacity>

      <ScrollView style={styles.resultsContainer}>
        {results.map((result, index) => (
          <View key={index} style={styles.resultItem}>
            {getStatusIcon(result.status)}
            <View style={styles.resultText}>
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultMessage}>{result.message}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0C156D',
    marginBottom: 16,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: '#0C156D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultsContainer: {
    maxHeight: 300,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F6FA',
    borderRadius: 10,
    marginBottom: 8,
  },
  resultText: {
    marginLeft: 12,
    flex: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  resultMessage: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
