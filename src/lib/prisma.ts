import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getDatabaseUrl = () => {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error('DATABASE_URL is not set. Prisma cannot initialise.');
    return '';
  }

  try {
    const url = new URL(rawUrl);

    const isSupabasePooler = url.hostname.includes('pooler.supabase.com');
    if (isSupabasePooler && (!url.port || url.port === '5432')) {
      url.port = '6543';
    }

    if (!url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true');
    }

    if (!url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require');
    }

    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '10');
    }

    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '15');
    }

    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '2');
    }

    return url.toString();
  } catch (error) {
    console.warn('Failed to normalise DATABASE_URL, falling back to raw value:', error);
    if (rawUrl.includes('connection_limit=')) {
      return rawUrl;
    }
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}connection_limit=2&pool_timeout=15&connect_timeout=10&pgbouncer=true&sslmode=require`;
  }
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl()
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    __internal: {
      engine: {
        connection_timeout: 10,
        pool_timeout: 15
      }
    } as any
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error disconnecting Prisma:', error);
  }
}

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
      const message = error?.message?.toLowerCase() || '';
      return (
        message.includes("can't reach database") ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('etimedout') ||
        error?.code === 'P1001' ||
        error?.code === 'P1008' ||
        error?.code === 'P1017'
      );
    }
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const baseDelay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = Math.random() * baseDelay * 0.3;
      const delay = Math.floor(baseDelay + jitter);

      console.warn(
        `Database operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${error.message}`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default prisma;
