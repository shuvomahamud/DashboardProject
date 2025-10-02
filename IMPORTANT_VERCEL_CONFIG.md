# ⚠️ CRITICAL: Vercel Environment Variables

## YOU MUST SET THIS IN VERCEL DASHBOARD

The `.env.local` file is **NOT deployed to Vercel**. You must manually set environment variables in Vercel Dashboard.

### Required Steps:

1. Go to https://vercel.com/your-username/your-project/settings/environment-variables

2. Add this variable:
   ```
   Name: PARSE_ON_IMPORT
   Value: true
   Environment: Production, Preview
   ```

3. **IMPORTANT**: After adding/changing environment variables, you MUST redeploy:
   ```bash
   vercel --prod
   ```
   Or trigger redeploy from Vercel Dashboard.

## How to Verify

### Check if variable is set:
```bash
vercel env ls
```

Should show:
```
PARSE_ON_IMPORT = true    Production, Preview
```

### Check current value in production:

Add this temporary endpoint to verify:

**File: `src/app/api/debug/env/route.ts`**
```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    PARSE_ON_IMPORT: process.env.PARSE_ON_IMPORT || 'not set',
    NODE_ENV: process.env.NODE_ENV
  });
}
```

Then visit: `https://your-domain.vercel.app/api/debug/env`

Should return:
```json
{
  "PARSE_ON_IMPORT": "true",
  "NODE_ENV": "production"
}
```

If it returns `"not set"` or `"false"`, the environment variable is not properly configured in Vercel.

## Why This Matters

**With PARSE_ON_IMPORT=true and 8-second timeout protection:**
- ✅ GPT parsing attempts during import (faster for users)
- ✅ Timeout protection prevents blocking (8s max per item)
- ✅ Non-fatal failures - import continues even if GPT times out
- ✅ Failed parsing can be retried later via batch API
- ✅ Resume data still saved with text extraction
- ✅ Reliable imports with intelligent fallback

## Common Mistake

❌ **WRONG**: Only setting in `.env.local`
- `.env.local` is gitignored
- Not deployed to Vercel
- Only works locally

✅ **CORRECT**: Set in Vercel Dashboard
- Go to Project Settings → Environment Variables
- Add PARSE_ON_IMPORT = true
- Redeploy

## Quick Fix Command

```bash
# Using Vercel CLI
vercel env add PARSE_ON_IMPORT production
# When prompted: true

vercel env add PARSE_ON_IMPORT preview
# When prompted: true

# Redeploy
vercel --prod
```
