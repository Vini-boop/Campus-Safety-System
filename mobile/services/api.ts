import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedApiService } from './enhancedApiService';
import { getApiBaseUrl } from './apiBaseUrl';

const API_BASE_URL = getApiBaseUrl();

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // Reduced to 15 seconds for better UX
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add timeout handler
apiClient.interceptors.request.use(
  (config) => {
    // Add timestamp to track request duration
    (config as any)._timestamp = Date.now();
    return config;
  },
  (error) => Promise.reject(error)
);

// Request interceptor - Add Firebase ID token for authentication
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Only add Authorization header for endpoints that require it
      if (!config.url?.includes('/admin/auth/verify') &&
        !config.url?.includes('/admin/auth/verify-credentials') &&
        !config.url?.includes('/admin/auth/google/verify') &&
        !config.url?.includes('/admin/auth/google/callback') &&
        !config.url?.includes('/admin/auth/google/register') &&
        !config.url?.includes('/admin/auth/profile')) {
        const userDataString = await AsyncStorage.getItem('userData');
        if (userDataString) {
          const userData = JSON.parse(userDataString);
          if (userData.idToken) {
            config.headers.Authorization = `Bearer ${userData.idToken}`;
          }
        }
      }
    } catch {
      // Silent — continue with request
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle responses and network errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle 401 — clear auth data and notify
    if (error.response?.status === 401) {
      try {
        await AsyncStorage.multiRemove(['userData', 'userRole', 'authToken']);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-session-expired'));
        }
      } catch { /* ignore */ }
    }

    // Attach a friendly message without spamming the console
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      error.customMessage = 'Request timed out. Make sure the backend server is running.';
    } else if (error.response) {
      error.customMessage = `Server error: ${error.response.status}. ${error.response.data?.message || error.response.statusText}`;
    } else if (error.request) {
      // Network error — silent, callers handle fallback
      error.customMessage = 'Network error - cannot reach server.';
    } else {
      error.customMessage = `Request error: ${error.message}`;
    }

    return Promise.reject(error);
  }
);

export default apiClient;

/**
 * Retry wrapper for API calls with exponential backoff
 * Only retries on network errors or timeouts, not on HTTP error responses
 */
export const withRetry = async <T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 [API] Attempt ${attempt + 1}/${maxRetries + 1}`);
      return await apiCall();
    } catch (error: any) {
      lastError = error;

      // Check if this is a retryable error (network/timeout)
      const isRetryableError =
        error.code === 'ERR_NETWORK' ||
        error.code === 'ECONNABORTED' ||
        error.message?.includes('timeout') ||
        error.message?.includes('Network Error') ||
        !error.response; // No response from server

      console.warn(`⚠️ [API] Attempt ${attempt + 1} failed:`, error.message);

      // Don't retry non-retryable errors (401, 403, 404, etc.)
      if (!isRetryableError) {
        console.log('❌ [API] Non-retryable error, stopping retries');
        throw error;
      }

      // If we have more retries left, wait with exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), 5000);
        console.log(`⏱️ [API] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted, throw the last error
  console.error('❌ [API] All retries exhausted');
  throw lastError;
};

// API endpoints using Firebase ID token authentication
export const api = {
  // Auth endpoints
  register: async (userData: { fullName: string; email: string }, idToken: string) => {
    return apiClient.post('/admin/auth/register', userData, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
  },

  verifyToken: async (idToken: string) => {
    return apiClient.post('/admin/auth/verify', { idToken }, {});
  },

  // Student profile verification
  submitVerification: async (idToken: string, regNo: string, phone: string) => {
    return apiClient.post('/admin/auth/submit-verification', { idToken, regNo, phone });
  },

  checkVerificationStatus: async (idToken: string) => {
    return apiClient.post('/admin/auth/verification-status', { idToken });
  },

  // Google Auth endpoints
  verifyGoogleToken: async (idToken: string) => {
    return apiClient.post('/admin/auth/google/verify', { idToken }, {});
  },

  googleAuthCallback: async (idToken: string) => {
    return apiClient.post('/admin/auth/google/callback', { idToken }, {});
  },

  googleRegister: async (idToken: string, fullName: string) => {
    return apiClient.post('/admin/auth/google/register', { idToken, fullName }, {});
  },

  // User Verification endpoints
  verifyUserCredentials: async (idToken: string) => {
    return apiClient.post('/admin/auth/verify-credentials', { idToken }, {});
  },

  checkUserAccess: async (idToken: string, screen: string) => {
    return apiClient.post('/admin/auth/check-access', { idToken, screen }, {});
  },

  getUserProfile: async (idToken: string) => {
    return apiClient.post('/admin/auth/profile', { idToken }, {});
  },

  // Alerts endpoints
  getAlerts: async (idToken: string, params?: any) => {
    return apiClient.get('/admin/alerts', {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
      params,
    });
  },

  createAlert: async (idToken: string, data: any) => {
    return apiClient.post('/admin/alerts', data, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
  },

  // Reports endpoints
  createReport: async (idToken: string, data: any) => {
    return apiClient.post('/admin/reports', data, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
  },

  // Emergency endpoints
  sendEmergency: async (idToken: string, data: any) => {
    return apiClient.post('/admin/emergency', data, {
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
  },

  // Medical endpoints
  requestAmbulance: async (idToken: string, data: any) => {
    return apiClient.post('/admin/medical/ambulance', data, {
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  },

  // Doctor chat endpoints
  initiateDoctorChat: async (idToken: string, data: any) => {
    return apiClient.post('/admin/medical/chat/initiate', data, {
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  },

  sendChatMessage: async (idToken: string, chatId: string, message: any) => {
    return apiClient.post(`/admin/medical/chat/${chatId}/message`, message, {
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  },

  getChatMessages: async (idToken: string, chatId: string) => {
    return apiClient.get(`/admin/medical/chat/${chatId}/messages`, {
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  },

  // Report routing
  getReportById: async (idToken: string, reportId: string) => {
    return apiClient.get(`/admin/reports/${reportId}`, {
      headers: { 'Authorization': `Bearer ${idToken}` },
    });
  },

  // Utility function to get a fresh ID token
  getFreshIdToken: async () => {
    try {
      // This would typically get a fresh token from Firebase Auth
      // For now, we'll return null and expect the token to be passed explicitly
      return null;
    } catch (error) {
      console.error('Error getting fresh ID token:', error);
      return null;
    }
  }
};