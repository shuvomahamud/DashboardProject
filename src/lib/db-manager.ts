/**
 * Database Connection Manager
 *
 * Manages Prisma connections in serverless environment to prevent pool exhaustion.
 * Uses a singleton pattern with lazy initialization and automatic cleanup.
 */

import { PrismaClient } from '@prisma/client';

// Track connection state
let prismaClient: PrismaClient | null = null;
let isConnecting = false;
let connectionPromise: Promise<PrismaClient> | null = null;
let lastActivity = Date.now();
let cleanupTimer: NodeJS.Timeout | null = null;

// Aggressive cleanup after 30 seconds of inactivity
const IDLE_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Get or create Prisma client with lazy initialization
 */
export async function getPrismaClient(): Promise<PrismaClient> {
  lastActivity = Date.now();

  // Return existing connected client
  if (prismaClient) {
    return prismaClient;
  }

  // Wait for in-progress connection
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // Create new connection
  isConnecting = true;
  connectionPromise = createPrismaClient();

  try {
    prismaClient = await connectionPromise;
    scheduleCleanup();
    return prismaClient;
  } finally {
    isConnecting = false;
    connectionPromise = null;
  }
}

/**
 * Create new Prisma client with minimal connection pool
 */
async function createPrismaClient(): Promise<PrismaClient> {
  const baseUrl = process.env.DATABASE_URL || '';

  // Ultra-minimal connection pool for serverless
  const separator = baseUrl.includes('?') ? '&' : '?';
  const url = `${baseUrl}${separator}connection_limit=3&pool_timeout=10&connect_timeout=5&pgbouncer=true`;

  const client = new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['error'] : [],
  });

  // Test connection with retry
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await client.$connect();
      console.log('✓ Database connected');
      return client;
    } catch (error: any) {
      console.warn(`Connection attempt ${i + 1}/${MAX_RETRIES} failed:`, error.message);

      if (i < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (i + 1)));
      } else {
        throw new Error(`Failed to connect after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error('Connection failed');
}

/**
 * Schedule automatic cleanup of idle connections
 */
function scheduleCleanup() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
  }

  cleanupTimer = setTimeout(async () => {
    const idleTime = Date.now() - lastActivity;

    if (idleTime >= IDLE_TIMEOUT && prismaClient) {
      console.log('Disconnecting idle Prisma client');
      try {
        await prismaClient.$disconnect();
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
      prismaClient = null;
    } else {
      // Check again later
      scheduleCleanup();
    }
  }, IDLE_TIMEOUT);
}

/**
 * Manually disconnect (for testing or explicit cleanup)
 */
export async function disconnectPrisma() {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }

  if (prismaClient) {
    try {
      await prismaClient.$disconnect();
      console.log('✓ Database disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
    prismaClient = null;
  }
}

/**
 * Execute query with automatic connection management
 */
export async function withPrisma<T>(
  callback: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const client = await getPrismaClient();
  return callback(client);
}
