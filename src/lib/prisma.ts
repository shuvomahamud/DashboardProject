import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pool via DATABASE_URL query parameters
// For Vercel serverless, use MINIMAL connection pool to avoid exhaustion
// Format: postgresql://user:pass@host/db?connection_limit=2&pool_timeout=10&connect_timeout=5
const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL || '';

  // Only modify if pool params aren't already set
  if (baseUrl.includes('connection_limit=')) {
    return baseUrl;
  }

  // Ultra-minimal pool: 2 connections per instance
  // With 100 concurrent functions: 2×100 = 200 connections (at Supabase limit)
  // Previously: 5×100 = 500 connections (way over limit)
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}connection_limit=2&pool_timeout=10&connect_timeout=5&pgbouncer=true`;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  // Aggressive timeouts for serverless environment
  __internal: {
    engine: {
      connection_timeout: 5,
      pool_timeout: 10,
    }
  } as any
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Graceful shutdown handler for serverless
// This helps release connections when function execution ends
export async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error disconnecting Prisma:', error);
  }
}

// Helper to ensure connection is healthy
export async function ensureConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error: any) {
      console.warn(`Connection check failed (attempt ${i + 1}/${retries}):`, error.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  return false;
}

// Retry wrapper for database operations with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = (error: any) => {
      // Retry on connection errors, timeouts, or database unavailability
      const message = error?.message?.toLowerCase() || '';
      return (
        message.includes('can\'t reach database') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('ECONNREFUSED') ||
        message.includes('ETIMEDOUT') ||
        error?.code === 'P1001' || // Can't reach database server
        error?.code === 'P1008' || // Operations timed out
        error?.code === 'P1017'    // Server closed the connection
      );
    }
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Don't retry if this is the last attempt or error shouldn't be retried
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = Math.random() * baseDelay * 0.3; // Add up to 30% jitter
      const delay = Math.floor(baseDelay + jitter);

      console.warn(
        `Database operation failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
        `retrying in ${delay}ms: ${error.message}`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default prisma 