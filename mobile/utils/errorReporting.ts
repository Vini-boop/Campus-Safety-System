import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Error Reporting Utility for Campus Safety App
 * Handles logging, reporting, and diagnostics for startup and runtime errors
 */

interface StartupError {
  timestamp: string;
  context: string;
  error: string;
  stack: string;
  platform: 'web' | 'native';
  initDuration: number;
}

/**
 * Log startup errors for diagnostics
 * @param error - The error object
 * @param context - Context where the error occurred
 */
export async function logStartupError(error: any, context: string): Promise<void> {
  try {
    const errorInfo: StartupError = {
      timestamp: new Date().toISOString(),
      context,
      error: error.message || error.toString(),
      stack: error.stack || 'No stack trace',
      platform: typeof window !== 'undefined' ? 'web' : 'native',
      initDuration: 0, // Will be set by caller if needed
    };
    
    // Log to console
    console.error(`[STARTUP_ERROR] ${context}:`, errorInfo);
    
    // Save to AsyncStorage for later reporting
    const existingErrors = await AsyncStorage.getItem('startupErrors');
    const errors: StartupError[] = existingErrors ? JSON.parse(existingErrors) : [];
    errors.push(errorInfo);
    
    // Keep only the last 20 errors
    if (errors.length > 20) {
      errors.splice(0, errors.length - 20);
    }
    
    await AsyncStorage.setItem('startupErrors', JSON.stringify(errors));
  } catch (logError) {
    console.error('Failed to log startup error:', logError);
  }
}

/**
 * Log general application errors
 * @param error - The error object
 * @param context - Context where the error occurred
 * @param additionalInfo - Additional information about the error
 */
export async function logAppError(error: any, context: string, additionalInfo?: any): Promise<void> {
  try {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      context,
      error: error.message || error.toString(),
      stack: error.stack || 'No stack trace',
      platform: typeof window !== 'undefined' ? 'web' : 'native',
      additionalInfo,
    };
    
    // Log to console
    console.error(`[APP_ERROR] ${context}:`, errorInfo);
    
    // Save to AsyncStorage for later reporting
    const existingErrors = await AsyncStorage.getItem('appErrors');
    const errors = existingErrors ? JSON.parse(existingErrors) : [];
    errors.push(errorInfo);
    
    // Keep only the last 50 errors
    if (errors.length > 50) {
      errors.splice(0, errors.length - 50);
    }
    
    await AsyncStorage.setItem('appErrors', JSON.stringify(errors));
  } catch (logError) {
    console.error('Failed to log app error:', logError);
  }
}

/**
 * Get all stored startup errors
 * @returns Array of startup errors
 */
export async function getStartupErrors(): Promise<StartupError[]> {
  try {
    const errors = await AsyncStorage.getItem('startupErrors');
    return errors ? JSON.parse(errors) : [];
  } catch (error) {
    console.error('Failed to retrieve startup errors:', error);
    return [];
  }
}

/**
 * Get all stored application errors
 * @returns Array of application errors
 */
export async function getAppErrors(): Promise<any[]> {
  try {
    const errors = await AsyncStorage.getItem('appErrors');
    return errors ? JSON.parse(errors) : [];
  } catch (error) {
    console.error('Failed to retrieve app errors:', error);
    return [];
  }
}

/**
 * Clear stored startup errors
 */
export async function clearStartupErrors(): Promise<void> {
  try {
    await AsyncStorage.removeItem('startupErrors');
  } catch (error) {
    console.error('Failed to clear startup errors:', error);
  }
}

/**
 * Clear stored application errors
 */
export async function clearAppErrors(): Promise<void> {
  try {
    await AsyncStorage.removeItem('appErrors');
  } catch (error) {
    console.error('Failed to clear app errors:', error);
  }
}

/**
 * Report errors to backend (stub implementation)
 * In a real app, this would send errors to a monitoring service
 * @param errors - Errors to report
 */
export async function reportErrorsToBackend(errors: any[]): Promise<void> {
  try {
    // In a production app, you would send these errors to your backend
    // or a monitoring service like Sentry, Bugsnag, etc.
    console.log('Reporting errors to backend:', errors);
    
    // Example implementation:
    /*
    await fetch('/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ errors }),
    });
    */
  } catch (error) {
    console.error('Failed to report errors to backend:', error);
  }
}

/**
 * Check if device is online
 * @returns Boolean indicating if device is online
 */
export function isOnline(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.onLine;
  }
  // For React Native, we would need to use NetInfo library
  // This is a simplified check
  return true;
}

/**
 * Handle network error with appropriate user feedback
 * @param error - Network error
 * @param action - Action that failed
 */
export function handleNetworkError(error: any, action: string): string {
  let message = '';
  
  if (error.name === 'AbortError') {
    message = `${action} timed out. Please check your network connection and try again.`;
  } else if (error.message && error.message.includes('network')) {
    message = `Network error during ${action}. Please check your internet connection and try again.`;
  } else {
    message = `${action} failed. Please check your connection and try again.`;
  }
  
  return message;
}