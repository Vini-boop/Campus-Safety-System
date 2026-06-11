/**
 * api.js
 * API service for making HTTP requests to the backend
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * Register a new user via backend API
 * @param {Object} userData - User registration data
 * @param {string} idToken - Firebase ID token for authentication
 * @returns {Promise<Response>} API response
 */
export const register = async (userData, idToken) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = new Error('Registration failed');
      error.response = response;
      throw error;
    }

    return response;
  } catch (error) {
    console.error('Register API error:', error);
    throw error;
  }
};

/**
 * Generic API request method
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} API response
 */
export const request = async (endpoint, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const error = new Error('API request failed');
      error.response = response;
      throw error;
    }

    return response;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

export const api = {
  register,
  request,
};
