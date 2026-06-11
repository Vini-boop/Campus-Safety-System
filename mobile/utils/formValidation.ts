/**
 * Form Validation Utilities for Campus Safety App
 * Provides validation functions for report submission forms
 */

import { MAX_MEDIA_FILES } from '@/constants/mediaConfig';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate report form data
 * @param data - Report form data
 * @returns Array of validation errors
 */
export function validateReportForm(data: {
  location: string;
  description: string;
  reportType: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate report type
  if (!data.reportType || !['sos', 'medical', 'security'].includes(data.reportType)) {
    errors.push({
      field: 'reportType',
      message: 'Please select a valid report type'
    });
  }

  // Validate location
  if (!data.location || data.location.trim().length === 0) {
    errors.push({
      field: 'location',
      message: 'Location is required'
    });
  } else if (data.location.trim().length < 5) {
    errors.push({
      field: 'location',
      message: 'Location must be at least 5 characters long'
    });
  }

  // Validate description
  if (!data.description || data.description.trim().length === 0) {
    errors.push({
      field: 'description',
      message: 'Description is required'
    });
  } else if (data.description.trim().length < 10) {
    errors.push({
      field: 'description',
      message: 'Description must be at least 10 characters long'
    });
  } else if (data.description.trim().length > 1000) {
    errors.push({
      field: 'description',
      message: 'Description must be less than 1000 characters'
    });
  }

  return errors;
}

/**
 * Validate media attachments
 * @param mediaAssets - Array of media assets
 * @param maxFiles - Maximum number of files allowed
 * @returns Validation error or null if valid
 */
export function validateMediaAttachments(
  mediaAssets: any[],
  maxFiles: number = MAX_MEDIA_FILES
): ValidationError | null {
  if (mediaAssets.length > maxFiles) {
    return {
      field: 'media',
      message: `Maximum ${maxFiles} files allowed`
    };
  }

  // Check file sizes (assuming each file should be < 10MB)
  for (let i = 0; i < mediaAssets.length; i++) {
    const asset = mediaAssets[i];
    // Note: In Expo ImagePicker, we don't get file size directly
    // This is a placeholder for when we implement direct file access
  }

  return null;
}

/**
 * Sanitize user input to prevent injection attacks
 * @param input - User input string
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript protocol
    .replace(/vbscript:/gi, '') // Remove vbscript protocol
    .replace(/data:/gi, ''); // Remove data protocol
}

/**
 * Format validation errors for display
 * @param errors - Array of validation errors
 * @returns Formatted error message
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';

  if (errors.length === 1) {
    return errors[0].message;
  }

  return errors.map(error => `• ${error.message}`).join('\n');
}

/**
 * Validate hostel information
 * Hostel + room are OPTIONAL for security reports — incidents happen everywhere on campus.
 * They are required only for ambulance/medical requests where the responder needs a room.
 */
export function validateHostelInfo(data: {
  hostelName: string;
  roomNumber: string;
  reportType: string;
}): ValidationError[] {
  // Only require hostel info for medical/ambulance requests, not general security reports
  if (data.reportType === 'medical') {
    const errors: ValidationError[] = [];
    if (!data.hostelName || data.hostelName.trim().length === 0) {
      errors.push({ field: 'hostelName', message: 'Hostel name is required for medical requests' });
    }
    if (!data.roomNumber || data.roomNumber.trim().length === 0) {
      errors.push({ field: 'roomNumber', message: 'Room number is required for medical requests' });
    }
    return errors;
  }
  // Security reports: hostel/room are optional context fields
  return [];
}