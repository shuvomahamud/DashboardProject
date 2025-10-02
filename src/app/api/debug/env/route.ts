import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check environment variables
 * DELETE THIS FILE after verifying config
 */

export async function GET() {
  return NextResponse.json({
    PARSE_ON_IMPORT: process.env.PARSE_ON_IMPORT || 'NOT_SET',
    SOFT_BUDGET_MS: process.env.SOFT_BUDGET_MS || 'NOT_SET (defaults to 6000)',
    ITEM_CONCURRENCY: process.env.ITEM_CONCURRENCY || 'NOT_SET (defaults to 1)',
    PDF_HARD_PAGE_CAP: process.env.PDF_HARD_PAGE_CAP || 'NOT_SET (defaults to 15)',
    PDF_EXTRACTION_TIMEOUT_MS: process.env.PDF_EXTRACTION_TIMEOUT_MS || 'NOT_SET (defaults to 3000)',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET (hidden)' : 'NOT_SET',
    OPENAI_RESUME_MODEL: process.env.OPENAI_RESUME_MODEL || 'NOT_SET (defaults to gpt-4o-mini)',
    DATABASE_URL: process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT_SET',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL || 'NOT_VERCEL',
    VERCEL_ENV: process.env.VERCEL_ENV || 'NOT_SET'
  });
}
