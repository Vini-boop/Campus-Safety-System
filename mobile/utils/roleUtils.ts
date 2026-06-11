// Utility functions for role-based routing and permissions

// Define user roles
export const USER_ROLES = {
  ADMIN: 'admin',
  SECURITY: 'security',
  MEDICAL: 'medical',
  STUDENT: 'student',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Define route paths for different user roles
// For now, all roles use the same student interface
// TODO: Implement separate interfaces for admin roles if needed
export const ROLE_ROUTES: Record<UserRole, string> = {
  [USER_ROLES.ADMIN]: '/(tabs)', // For now, admin uses student interface
  [USER_ROLES.SECURITY]: '/(tabs)', // For now, security uses student interface
  [USER_ROLES.MEDICAL]: '/(tabs)', // For now, medical uses student interface
  [USER_ROLES.STUDENT]: '/(tabs)', // Student home
};

/**
 * Get the appropriate route for a user based on their role
 * @param role - The user's role
 * @returns The route path for that role
 */
export function getRouteForRole(role: UserRole | string): string {
  // Normalize the role to lowercase
  const normalizedRole = role.toString().toLowerCase() as UserRole;
  
  // Return the route for the role, or default to student route
  const route = ROLE_ROUTES[normalizedRole] || ROLE_ROUTES[USER_ROLES.STUDENT];
  console.log(`getRouteForRole: Role "${role}" maps to route "${route}"`);
  return route;
}

/**
 * Check if a user has a specific role
 * @param userRole - The user's role
 * @param role - The role to check against
 * @returns Boolean indicating if the user has the specified role
 */
export function hasRole(userRole: UserRole | string, role: UserRole): boolean {
  return userRole.toString().toLowerCase() === role;
}

/**
 * Check if a user has one of the specified roles
 * @param userRole - The user's role
 * @param roles - Array of roles to check against
 * @returns Boolean indicating if the user has one of the specified roles
 */
export function hasAnyRole(userRole: UserRole | string, roles: UserRole[]): boolean {
  const normalizedUserRole = userRole.toString().toLowerCase() as UserRole;
  return roles.some(role => normalizedUserRole === role);
}

/**
 * Check if a user has admin privileges (admin, security, or medical)
 * @param userRole - The user's role
 * @returns Boolean indicating if the user has admin privileges
 */
export function hasAdminPrivileges(userRole: UserRole | string): boolean {
  const adminRoles: UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.SECURITY, USER_ROLES.MEDICAL];
  return hasAnyRole(userRole, adminRoles);
}

/**
 * Check if a user is a student
 * @param userRole - The user's role
 * @returns Boolean indicating if the user is a student
 */
export function isStudent(userRole: UserRole | string): boolean {
  return hasRole(userRole, USER_ROLES.STUDENT);
}

/**
 * Sanitize role data to prevent injection attacks
 * @param role - Role data to sanitize
 * @returns Sanitized role string
 */
export function sanitizeRole(role: string): UserRole | null {
  if (!role) return null;
  
  // Ensure role is a valid known role
  const normalizedRole = role.toString().toLowerCase().trim() as UserRole;
  if (Object.values(USER_ROLES).includes(normalizedRole)) {
    return normalizedRole;
  }
  
  return null;
}

/**
 * Validate role data from external sources
 * @param role - Role data to validate
 * @returns Validated role or default student role
 */
export function validateRole(role: string | undefined): UserRole {
  if (!role) {
    return USER_ROLES.STUDENT;
  }
  
  const sanitizedRole = sanitizeRole(role.toString());
  return sanitizedRole || USER_ROLES.STUDENT;
}