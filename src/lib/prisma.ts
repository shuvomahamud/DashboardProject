import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Configure connection pool via DATABASE_URL query parameters
// Format: postgresql://user:pass@host/db?connection_limit=10&pool_timeout=20
const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL || '';

  // Only modify if pool params aren't already set
  if (baseUrl.includes('connection_limit=')) {
    return baseUrl;
  }

  // Add connection pool params for email import concurrency
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}connection_limit=10&pool_timeout=20`;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma 