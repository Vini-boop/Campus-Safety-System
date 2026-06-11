// Validation utilities for authentication forms
class AuthValidation {
  // Email validation
  static isValidEmail(email: string): boolean {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static getEmailError(email: string): string | null {
    if (!email) return 'Email is required';
    if (!this.isValidEmail(email)) return 'Please enter a valid email address';
    return null;
  }

  // Password validation
  static isValidPassword(password: string): boolean {
    if (!password) return false;
    return password.length >= 8;
  }

  static getPasswordError(password: string): string | null {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    return null;
  }

  // Name validation
  static isValidName(name: string): boolean {
    if (!name) return false;
    return name.trim().length >= 2;
  }

  static getNameError(name: string): string | null {
    if (!name) return 'Name is required';
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    return null;
  }

  // Password confirmation validation
  static getPasswordMatchError(password: string, confirmPassword: string): string | null {
    if (!confirmPassword) return 'Please confirm your password';
    if (password !== confirmPassword) return 'Passwords do not match';
    return null;
  }

  // Comprehensive validation for login
  static validateLogin(email: string, password: string): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    const emailError = this.getEmailError(email);
    if (emailError) errors.email = emailError;

    const passwordError = this.getPasswordError(password);
    if (passwordError) errors.password = passwordError;

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  // Comprehensive validation for signup
  static validateSignup(
    name: string, 
    email: string, 
    password: string, 
    confirmPassword: string
  ): { isValid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    const nameError = this.getNameError(name);
    if (nameError) errors.name = nameError;

    const emailError = this.getEmailError(email);
    if (emailError) errors.email = emailError;

    const passwordError = this.getPasswordError(password);
    if (passwordError) errors.password = passwordError;

    const confirmPasswordError = this.getPasswordMatchError(password, confirmPassword);
    if (confirmPasswordError) errors.confirmPassword = confirmPasswordError;

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  // Check if field should show error (meaningful validation)
  static shouldShowFieldError(value: string, touched: boolean, submitted: boolean): boolean {
    // Show error if field has been touched and has content, or if form has been submitted
    return (touched && value !== '') || submitted;
  }

  // Clear error when user makes meaningful correction
  static shouldClearError(oldValue: string, newValue: string, error: string | null): boolean {
    if (!error) return false;
    
    // Clear error if user is making progress toward valid input
    if (!newValue) return true; // User cleared the field
    
    // For email: clear when user starts typing a valid format
    if (error.includes('email')) {
      return this.isValidEmail(newValue);
    }
    
    // For password: clear when user meets minimum length
    if (error.includes('password')) {
      return this.isValidPassword(newValue);
    }
    
    // For name: clear when user meets minimum length
    if (error.includes('name')) {
      return this.isValidName(newValue);
    }
    
    return false;
  }
}

export default AuthValidation;