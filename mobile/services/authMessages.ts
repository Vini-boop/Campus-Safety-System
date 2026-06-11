import AsyncStorage from '@react-native-async-storage/async-storage';

// Centralized authentication message system
class AuthMessageService {
  private static readonly MESSAGE_KEY = 'auth_message';
  private static readonly MESSAGE_TIMESTAMP_KEY = 'auth_message_timestamp';
  private static readonly MESSAGE_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes

  // Set an authentication message
  static async setMessage(message: string, type: 'success' | 'error' = 'success'): Promise<void> {
    try {
      const messageData = {
        text: message,
        type,
        timestamp: Date.now()
      };
      
      await AsyncStorage.setItem(this.MESSAGE_KEY, JSON.stringify(messageData));
      await AsyncStorage.setItem(this.MESSAGE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Failed to set auth message:', error);
    }
  }

  // Get and clear authentication message (one-time use)
  static async getMessage(): Promise<{ text: string; type: 'success' | 'error' } | null> {
    try {
      const messageDataStr = await AsyncStorage.getItem(this.MESSAGE_KEY);
      const timestampStr = await AsyncStorage.getItem(this.MESSAGE_TIMESTAMP_KEY);
      
      if (!messageDataStr || !timestampStr) {
        return null;
      }

      const messageData = JSON.parse(messageDataStr);
      const timestamp = parseInt(timestampStr, 10);
      
      // Check if message is still valid (not expired)
      if (Date.now() - timestamp > this.MESSAGE_EXPIRY_TIME) {
        await this.clearMessage();
        return null;
      }
      
      // Clear the message after retrieving it (one-time use)
      await this.clearMessage();
      
      return {
        text: messageData.text,
        type: messageData.type
      };
    } catch (error) {
      console.error('Failed to get auth message:', error);
      return null;
    }
  }

  // Clear authentication message
  static async clearMessage(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.MESSAGE_KEY);
      await AsyncStorage.removeItem(this.MESSAGE_TIMESTAMP_KEY);
    } catch (error) {
      console.error('Failed to clear auth message:', error);
    }
  }

  // Predefined success messages
  static async setAccountCreatedMessage(): Promise<void> {
    await this.setMessage('Account created successfully. Please log in.', 'success');
  }

  static async setRegistrationSuccessMessage(): Promise<void> {
    await this.setMessage('Registration successful! Please log in with your new account.', 'success');
  }

  static async setPasswordResetMessage(): Promise<void> {
    await this.setMessage('Password reset email sent. Please check your inbox.', 'success');
  }

  static async setLogoutSuccessMessage(): Promise<void> {
    await this.setMessage('You have been logged out successfully.', 'success');
  }

  // Predefined error messages
  static async setGenericErrorMessage(): Promise<void> {
    await this.setMessage('An unexpected error occurred. Please try again.', 'error');
  }

  static async setNetworkErrorMessage(): Promise<void> {
    await this.setMessage('Network connection failed. Please check your internet connection and try again.', 'error');
  }
}

export default AuthMessageService;