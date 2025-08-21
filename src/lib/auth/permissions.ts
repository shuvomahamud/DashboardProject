/**
 * Centralized table permissions constants
 * These constants define the table keys used throughout the application
 * for role-based access control (RBAC).
 */

// Core table permissions
export const TABLE_PERMISSIONS = {
  // Admin wildcard permission
  ADMIN: '*',
  
  // Existing tables
  ACCOUNTS_PAYABLE: 'accounts_payable',
  INTERVIEWS: 'interviews', 
  ONBOARDING: 'onboarding',
  TODO: 'todo',
  
  // New Phase 1 tables
  JOBS: 'jobs',
  RESUMES: 'resumes',
  JOB_APPLICATIONS: 'job_applications',
  COMPANIES: 'companies',
  EMAIL_INGEST: 'email_ingest'
} as const;

// Type for table permission values
export type TablePermission = typeof TABLE_PERMISSIONS[keyof typeof TABLE_PERMISSIONS];

// Helper function to get all table keys except admin wildcard
export function getAllTableKeys(): string[] {
  return Object.values(TABLE_PERMISSIONS).filter(key => key !== TABLE_PERMISSIONS.ADMIN);
}

// Helper function to check if a key is a valid table permission
export function isValidTableKey(key: string): key is TablePermission {
  return Object.values(TABLE_PERMISSIONS).includes(key as TablePermission);
}

// Default permissions for different role types
export const DEFAULT_ROLE_PERMISSIONS = {
  ADMIN: [TABLE_PERMISSIONS.ADMIN],
  HR_MANAGER: [
    TABLE_PERMISSIONS.JOBS,
    TABLE_PERMISSIONS.RESUMES,
    TABLE_PERMISSIONS.JOB_APPLICATIONS,
    TABLE_PERMISSIONS.INTERVIEWS,
    TABLE_PERMISSIONS.ONBOARDING,
    TABLE_PERMISSIONS.COMPANIES
  ],
  RECRUITER: [
    TABLE_PERMISSIONS.JOBS,
    TABLE_PERMISSIONS.RESUMES,
    TABLE_PERMISSIONS.JOB_APPLICATIONS,
    TABLE_PERMISSIONS.INTERVIEWS,
    TABLE_PERMISSIONS.COMPANIES
  ],
  FINANCE: [
    TABLE_PERMISSIONS.ACCOUNTS_PAYABLE,
    TABLE_PERMISSIONS.ONBOARDING
  ],
  PROJECT_MANAGER: [
    TABLE_PERMISSIONS.TODO,
    TABLE_PERMISSIONS.ONBOARDING
  ]
} as const;