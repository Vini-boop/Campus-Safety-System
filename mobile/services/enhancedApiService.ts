import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';
import { getIdToken } from 'firebase/auth';
import { getApiBaseUrl } from './apiBaseUrl';

// Enhanced API Service with better error handling and token management
class EnhancedApiService {
  private api: AxiosInstance;
  private baseURL: string;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  constructor() {
    // Use the shared resolver so Expo Go works on both emulator and physical devices
    this.baseURL = getApiBaseUrl();

    console.log('🔧 API Service initialized with base URL:', this.baseURL);

    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 15000, // 15 seconds timeout
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - add auth token
    this.api.interceptors.request.use(
      async (config) => {
        try {
          const token = await this.getAuthToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.url}`);
        } catch (error) {
          console.warn('⚠️ Failed to add auth token to request:', error);
        }
        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle errors and token refresh
    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ API Response: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        console.error(`❌ API Error: ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} - ${error.response?.status || 'NETWORK'}`);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          response: error.response?.data,
          status: error.response?.status,
        });

        // Handle token refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          if (this.isRefreshing) {
            // Wait for token refresh
            return new Promise((resolve) => {
              this.refreshSubscribers.push((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(this.api(originalRequest));
              });
            });
          }

          this.isRefreshing = true;

          try {
            const newToken = await this.refreshAuthToken();
            this.refreshSubscribers.forEach(callback => callback(newToken));
            this.refreshSubscribers = [];
            this.isRefreshing = false;

            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.api(originalRequest);
          } catch (refreshError) {
            console.error('❌ Token refresh failed:', refreshError);
            this.refreshSubscribers = [];
            this.isRefreshing = false;
            
            // Clear stored user data and redirect to login
            await this.clearUserData();
            
            // Return a more specific error
            return Promise.reject({
              ...error,
              isAuthError: true,
              message: 'Session expired. Please log in again.',
            });
          }
        }

        // Handle network errors
        if (!error.response) {
          return Promise.reject({
            ...error,
            isNetworkError: true,
            message: this.getNetworkErrorMessage(error),
          });
        }

        // Handle specific HTTP status codes
        return Promise.reject({
          ...error,
          message: this.getErrorMessage(error),
        });
      }
    );
  }

  private async getAuthToken(): Promise<string | null> {
    try {
      if (auth.currentUser) {
        const token = await getIdToken(auth.currentUser);
        return token;
      }
      
      // Fallback to stored token
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        return parsed.idToken;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get auth token:', error);
      return null;
    }
  }

  private async refreshAuthToken(): Promise<string> {
    try {
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }
      
      // Force token refresh
      const token = await getIdToken(auth.currentUser, true);
      
      // Update stored user data
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const parsed = JSON.parse(userData);
        parsed.idToken = token;
        await AsyncStorage.setItem('userData', JSON.stringify(parsed));
      }
      
      return token;
    } catch (error) {
      console.error('❌ Failed to refresh auth token:', error);
      throw error;
    }
  }

  private async clearUserData() {
    try {
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('userProfile');
      console.log('🗑️ Cleared user data due to auth failure');
    } catch (error) {
      console.error('❌ Failed to clear user data:', error);
    }
  }

  private getNetworkErrorMessage(error: any): string {
    if (error.code === 'ERR_NETWORK') {
      return 'Network connection failed. Please check your internet connection.';
    }
    if (error.code === 'ECONNREFUSED') {
      return 'Cannot connect to server. Please check if the server is running.';
    }
    if (error.code === 'ETIMEDOUT') {
      return 'Request timed out. Please try again.';
    }
    if (error.message?.includes('Network Error')) {
      return 'Network connection failed. Please check your internet connection.';
    }
    return 'Connection failed. Please check your internet connection and try again.';
  }

  private getErrorMessage(error: any): string {
    const status = error.response?.status;
    const data = error.response?.data;

    switch (status) {
      case 400:
        return data?.message || 'Invalid request. Please check your input.';
      case 401:
        return data?.message || 'Authentication failed. Please log in again.';
      case 403:
        return data?.message || 'Access denied. You don\'t have permission for this action.';
      case 404:
        return data?.message || 'Resource not found.';
      case 409:
        return data?.message || 'Resource already exists.';
      case 422:
        return data?.message || 'Validation error. Please check your input.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later.';
      case 502:
        return 'Server is temporarily unavailable. Please try again later.';
      case 503:
        return 'Service is temporarily unavailable. Please try again later.';
      default:
        return data?.message || error.message || 'An unexpected error occurred.';
    }
  }

  // API Methods
  async verifyToken(token: string): Promise<AxiosResponse> {
    return this.api.post('/auth/verify', { token });
  }

  async register(userData: { fullName: string; email: string }, token: string): Promise<AxiosResponse> {
    return this.api.post('/auth/register', userData, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  async getUserProfile(userId: string): Promise<AxiosResponse> {
    return this.api.get(`/users/${userId}`);
  }

  async updateUserProfile(userId: string, data: any): Promise<AxiosResponse> {
    return this.api.put(`/users/${userId}`, data);
  }

  async createIncident(incidentData: any): Promise<AxiosResponse> {
    return this.api.post('/incidents', incidentData);
  }

  async getIncidents(filters?: any): Promise<AxiosResponse> {
    return this.api.get('/incidents', { params: filters });
  }

  async updateIncident(id: string, data: any): Promise<AxiosResponse> {
    return this.api.put(`/incidents/${id}`, data);
  }

  async createChatSession(chatData: any): Promise<AxiosResponse> {
    return this.api.post('/chat/sessions', chatData);
  }

  async getChatSessions(userId?: string): Promise<AxiosResponse> {
    const url = userId ? `/chat/sessions?userId=${userId}` : '/chat/sessions';
    return this.api.get(url);
  }

  async sendMessage(chatId: string, messageData: any): Promise<AxiosResponse> {
    return this.api.post(`/chat/sessions/${chatId}/messages`, messageData);
  }

  async getChatMessages(chatId: string): Promise<AxiosResponse> {
    return this.api.get(`/chat/sessions/${chatId}/messages`);
  }

  // Health check
  async healthCheck(): Promise<AxiosResponse> {
    return this.api.get('/health');
  }

  // Connection test
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const response = await this.healthCheck();
      return {
        success: true,
        message: 'API connection successful',
        details: {
          status: response.status,
          data: response.data,
          baseURL: this.baseURL,
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: this.getNetworkErrorMessage(error),
        details: {
          baseURL: this.baseURL,
          error: error.message,
          code: error.code,
        }
      };
    }
  }
}

// Create singleton instance
const enhancedApiService = new EnhancedApiService();

// Export the instance and individual methods for backward compatibility
export default enhancedApiService;

export const api = {
  verifyToken: (token: string) => enhancedApiService.verifyToken(token),
  register: (userData: { fullName: string; email: string }, token: string) => 
    enhancedApiService.register(userData, token),
  getUserProfile: (userId: string) => enhancedApiService.getUserProfile(userId),
  updateUserProfile: (userId: string, data: any) => enhancedApiService.updateUserProfile(userId, data),
  createIncident: (incidentData: any) => enhancedApiService.createIncident(incidentData),
  getIncidents: (filters?: any) => enhancedApiService.getIncidents(filters),
  updateIncident: (id: string, data: any) => enhancedApiService.updateIncident(id, data),
  createChatSession: (chatData: any) => enhancedApiService.createChatSession(chatData),
  getChatSessions: (userId?: string) => enhancedApiService.getChatSessions(userId),
  sendMessage: (chatId: string, messageData: any) => enhancedApiService.sendMessage(chatId, messageData),
  getChatMessages: (chatId: string) => enhancedApiService.getChatMessages(chatId),
  healthCheck: () => enhancedApiService.healthCheck(),
  testConnection: () => enhancedApiService.testConnection(),
};

// Export the class for testing or advanced usage
export { EnhancedApiService };
