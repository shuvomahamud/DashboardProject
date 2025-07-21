import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { SessionWithTables } from '@/types/next-auth';

export type NextApiHandler = (req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

/**
 * Universal middleware that protects API routes based on table permissions
 * @param tableKey - The table key that the user must have access to (use '*' for admin-only)
 * @param handler - The actual API route handler
 * @returns Protected API route handler
 */
export const withTableAuth = (tableKey: string, handler: NextApiHandler): NextApiHandler => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Get the session
      const session = await getServerSession(req, res, authOptions) as SessionWithTables;
      
      // Check if user is authenticated
      if (!session) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }

      // Check if user is approved
      if (!session.user.isApproved) {
        return res.status(403).json({ error: 'User not approved' });
      }

      // Get user's table permissions
      const userTables = session.user.tables || [];
      
      // Check permissions
      if (tableKey === '*') {
        // Admin-only route - user must have '*' permission
        if (!userTables.includes('*')) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      } else {
        // Table-specific route - user must have '*' (admin) or specific table permission
        if (!userTables.includes('*') && !userTables.includes(tableKey)) {
          return res.status(403).json({ 
            error: `Access denied for table: ${tableKey}`,
            required: tableKey,
            userTables: userTables
          });
        }
      }

      // User has permission, proceed to handler
      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Helper function to get table key from model name
 * Maps Prisma model names to table keys used in permissions
 */
export const getTableKey = (modelName: string): string => {
  const tableKeyMap: Record<string, string> = {
    'AP_Report': 'ap_report',
    'todo_list': 'todo_list',
    'InterviewInformation': 'interview_information',
    'interviews': 'interviews',
    'onboarding': 'onboarding'
  };
  
  return tableKeyMap[modelName] || modelName.toLowerCase();
};

/**
 * Middleware specifically for sync routes (admin-only)
 */
export const withAdminAuth = (handler: NextApiHandler): NextApiHandler => {
  return withTableAuth('*', handler);
}; 