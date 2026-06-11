// Centralized error categorization and human-readable messaging
class AuthErrorHandler {
  // Categorize and transform Firebase auth errors
  static handleFirebaseAuthError(error: Error | { code: string; message?: string }): string {
    // Type guard to check if error has code property
    if (!('code' in error) || !error.code) {
      // @ts-ignore
      return `Authentication failed: ${error.message || 'Unknown error'}. Please try again.`;
    }

    switch (error.code) {
      case 'auth/user-not-found':
        return 'No account found with this email address.';

      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';

      case 'auth/invalid-email':
        return 'Please enter a valid email address.';

      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';

      case 'auth/weak-password':
        return 'Password is too weak. Please use a stronger password.';

      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';

      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';

      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';

      case 'auth/invalid-credential':
        return 'Invalid credentials. Please check your email and password.';

      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled. Please contact support.';

      default:
        console.warn('Unhandled Firebase auth error:', 'code' in error ? error.code : 'Unknown error');
        return `Authentication failed: ${error.code}. Please try again.`;
    }
  }

  // Handle backend/API errors
  static handleBackendError(error: any): string {
    // Network/timeout errors
    if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('Network')) {
      return 'Network connection failed. Please check your internet connection and try again.';
    }

    // HTTP status codes
    if (error.response?.status) {
      switch (error.response.status) {
        case 400:
          return error.response.data?.message || 'Invalid request. Please check your information.';

        case 401:
          return 'Authentication failed. Please check your credentials.';

        case 403:
          return 'Access denied. You do not have permission to perform this action.';

        case 404:
          return 'Resource not found. Please try again.';

        case 409:
          return 'Account already exists. Please try logging in instead.';

        case 422:
          return error.response.data?.message || 'Unable to process your request. Please check the information provided.';

        case 500:
          return 'Our servers are experiencing issues. Please try again in a few minutes.';

        case 502:
        case 503:
        case 504:
          return 'Service temporarily unavailable. Please try again later.';

        default:
          console.warn('Unhandled HTTP error status:', error.response.status);
          return `Server error (${error.response.status}). Please try again.`;
      }
    }

    // Timeout errors
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return 'Request timed out. Please check your connection and try again.';
    }

    // Generic network errors
    if (error.message?.includes('Network') || error.message?.includes('ECONNREFUSED')) {
      return 'Network connection failed. Please check your internet connection and try again.';
    }

    // Fallback for unknown errors
    console.warn('Unknown backend error:', error);
    return 'An unexpected error occurred. Please try again.';
  }

  // Transform raw errors into user-friendly messages
  static getFriendlyErrorMessage(error: any): string {
    // Handle Firebase auth errors specifically
    if (error?.code?.startsWith('auth/')) {
      return this.handleFirebaseAuthError(error);
    }

    // Handle backend/API errors
    if (error?.response || error?.message?.includes('Network') || error?.name === 'AbortError') {
      return this.handleBackendError(error);
    }

    // Handle generic JavaScript errors
    if (error instanceof Error) {
      return error.message || 'An unexpected error occurred. Please try again.';
    }

    // Log the raw error for debugging
    console.error('Raw error object:', {
      error: error,
      typeof: typeof error,
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });

    // Fallback generic message
    return 'An unexpected error occurred. Please try again.';
  }

  // Log errors for debugging while keeping user messages clean
  static logError(error: any, context: string): void {
    console.error(`[${context}] Error:`, {
      message: error?.message,
      code: 'code' in error ? error.code : undefined,
      response: 'response' in error ? error.response?.data : undefined,
      status: 'response' in error ? error.response?.status : undefined,
      stack: error?.stack
    });
  }
}

export default AuthErrorHandler;