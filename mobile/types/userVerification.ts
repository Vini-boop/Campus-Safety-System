/**
 * User Verification Types
 * Defines the structure for student/staff verification system
 */

export type UserRole = 'student' | 'admin' | 'security' | 'medical';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface VerifiedUser {
  uid: string;
  email: string;
  fullName: string;
  regNo: string;          // Registration Number (for students)
  phone: string;          // Phone number in Kenya format (+254...)
  role: UserRole;
  status: UserStatus;
  isVerified: boolean;
  createdAt: string;      // ISO timestamp
  updatedAt?: string;     // ISO timestamp
}

export interface PendingVerification {
  uid: string;
  email: string;
  fullName: string;
  regNo: string;
  phone: string;
  role: UserRole;
  submittedAt: string;   // ISO timestamp
}

export interface EmergencyRequest {
  id?: string;
  userId: string;
  name: string;
  regNo: string;
  phone: string;
  type: 'SOS' | 'incident' | 'ambulance';
  location?: string;
  description?: string;
  status: 'active' | 'responding' | 'resolved' | 'cancelled';
  createdAt: string;    // ISO timestamp
  respondedBy?: string; // Admin/Security/Medical user ID
  respondedAt?: string; // ISO timestamp
}
