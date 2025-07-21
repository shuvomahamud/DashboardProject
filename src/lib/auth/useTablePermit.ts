import { useSession } from 'next-auth/react';
import { SessionWithTables } from '@/types/next-auth';

/**
 * Client-side hook to check table permissions for UI components
 * @param tableKey - The table key to check access for (use '*' for admin-only)
 * @returns boolean indicating if the user has access to the table
 */
export function useTablePermit(tableKey: string): boolean {
  const { data: session } = useSession() as { data: SessionWithTables | null };
  
  if (!session?.user) {
    return false;
  }

  if (!session.user.isApproved) {
    return false;
  }

  const userTables = session.user.tables || [];
  
  // Check if user has admin access (wildcard permission)
  if (userTables.includes('*')) {
    return true;
  }
  
  // Check if user has specific table permission
  return userTables.includes(tableKey);
}

/**
 * Hook to check if user is admin
 * @returns boolean indicating if the user is an admin
 */
export function useIsAdmin(): boolean {
  return useTablePermit('*');
}

/**
 * Hook to get all table permissions for the current user
 * @returns array of table keys the user has access to
 */
export function useUserTables(): string[] {
  const { data: session } = useSession() as { data: SessionWithTables | null };
  
  if (!session?.user?.isApproved) {
    return [];
  }
  
  return session.user.tables || [];
}

/**
 * Hook to check multiple table permissions at once
 * @param tableKeys - Array of table keys to check
 * @returns object with each table key as key and boolean permission as value
 */
export function useMultipleTablePermits(tableKeys: string[]): Record<string, boolean> {
  const { data: session } = useSession() as { data: SessionWithTables | null };
  
  const result: Record<string, boolean> = {};
  
  if (!session?.user?.isApproved) {
    tableKeys.forEach(key => {
      result[key] = false;
    });
    return result;
  }
  
  const userTables = session.user.tables || [];
  const hasAdminAccess = userTables.includes('*');
  
  tableKeys.forEach(key => {
    result[key] = hasAdminAccess || userTables.includes(key);
  });
  
  return result;
} 