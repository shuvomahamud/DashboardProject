import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { SessionWithTables } from '@/types/next-auth';

export type AppRouterHandler = (req: NextRequest) => Promise<NextResponse>;

/**
 * App Router middleware that protects API routes based on table permissions
 * @param tableKey - The table key that the user must have access to (use '*' for admin-only)
 * @param handler - The actual API route handler
 * @returns Protected API route handler
 */
export const withTableAuthAppRouter = (tableKey: string, handler: AppRouterHandler): AppRouterHandler => {
  return async (req: NextRequest) => {
    try {
      // Get the session - we need to pass a mock response object for App Router
      const session = await getServerSession(authOptions) as SessionWithTables;
      
      // Check if user is authenticated
      if (!session) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
      }

      // Check if user is approved
      if (!session.user.isApproved) {
        return NextResponse.json({ error: 'User not approved' }, { status: 403 });
      }

      // Get user's table permissions
      const userTables = session.user.tables || [];
      
      // Check permissions
      if (tableKey === '*') {
        // Admin-only route - user must have '*' permission
        if (!userTables.includes('*')) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
      } else {
        // Table-specific route - user must have '*' (admin) or specific table permission
        if (!userTables.includes('*') && !userTables.includes(tableKey)) {
          return NextResponse.json({ 
            error: `Access denied for table: ${tableKey}`,
            required: tableKey,
            userTables: userTables
          }, { status: 403 });
        }
      }

      // User has permission, proceed to handler
      return handler(req);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
};

/**
 * App Router middleware specifically for sync routes (admin-only)
 */
export const withAdminAuthAppRouter = (handler: AppRouterHandler): AppRouterHandler => {
  return withTableAuthAppRouter('*', handler);
};

/**
 * Helper function to check table permissions in App Router handlers
 * @param tableKey - The table key to check
 * @returns Promise that resolves to the session if authorized, or throws an error
 */
export const checkTablePermission = async (tableKey: string): Promise<SessionWithTables> => {
  const session = await getServerSession(authOptions) as SessionWithTables;
  
  if (!session) {
    throw new Error('Unauthenticated');
  }

  if (!session.user.isApproved) {
    throw new Error('User not approved');
  }

  const userTables = session.user.tables || [];
  
  if (tableKey === '*') {
    if (!userTables.includes('*')) {
      throw new Error('Admin access required');
    }
  } else {
    if (!userTables.includes('*') && !userTables.includes(tableKey)) {
      throw new Error(`Access denied for table: ${tableKey}`);
    }
  }

  return session;
}; 