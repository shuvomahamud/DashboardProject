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

export default prisma 