# Import Queue System - Production Deployment

## Architecture Overview

The import queue system has two components:

1. **Next.js App (Vercel)** - Handles web requests and enqueues jobs
2. **Worker Process (Separate Server)** - Processes the queue

In production, these run on **separate infrastructure** because Vercel's serverless functions have a **10-second timeout**, which is too short for email imports that can take minutes.

## Deployment Options

### Option 1: Vercel + External Worker (Recommended)

#### Vercel (Next.js App)
- ✅ Deploy your Next.js app to Vercel as usual
- ✅ Handles UI and enqueuing jobs
- ✅ Shows queue status in real-time

#### Worker Server (VPS/EC2/Cloud Run)
Deploy the worker on a long-running server:

**Examples:**
- **AWS EC2** - Small t3.micro instance (~$10/month)
- **DigitalOcean Droplet** - $6/month basic droplet
- **Google Cloud Run** - Serverless container with long timeout
- **Railway** - Simple deployment with persistent processes
- **Render** - Background worker support

### Option 2: Vercel + Cron-based Processing

Use Vercel Cron Jobs to periodically process the queue:

**Pros:**
- ✅ No separate server needed
- ✅ Simple deployment

**Cons:**
- ❌ Not real-time (processes every X minutes)
- ❌ Still subject to 10-second timeout per run
- ❌ Can only process small batches

### Option 3: All-in-One Server (Not Vercel)

Deploy to a platform that supports long-running processes:
- **Railway** - Full-stack deployment
- **Render** - Web service + background worker
- **Fly.io** - Long-running processes
- **Self-hosted VPS** - Complete control

## Recommended Setup: Vercel + Railway Worker

### Step 1: Deploy Next.js to Vercel

```bash
# Push to GitHub
git push origin main

# Vercel will auto-deploy
# Set environment variables in Vercel dashboard
```

**Vercel Environment Variables:**
```env
DATABASE_URL=postgresql://...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
MS_TENANT_ID=...
MS_MAILBOX_USER_ID=...
ALLOWED_TENANT_EMAIL_DOMAIN=...
```

### Step 2: Deploy Worker to Railway

**Create `railway.json`:**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run worker:import",
    "healthcheckPath": "/",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Create `Procfile` (alternative):**
```
worker: npm run worker:import
```

**Railway Setup:**
1. Create new project on Railway
2. Connect your GitHub repo
3. Set environment variables (same as Vercel)
4. Deploy
5. Worker starts automatically and stays running

### Step 3: Database Access

Both Vercel and Railway need access to the same PostgreSQL database.

**Options:**
- **Supabase** - Free tier with connection pooling
- **Neon** - Serverless Postgres with generous free tier
- **Railway Postgres** - Built-in database
- **AWS RDS** - Production-grade database

**Connection String Format:**
```
postgresql://user:password@host:5432/database?pgbouncer=true
```

Use connection pooling (pgbouncer) for Vercel serverless functions.

## Alternative: Vercel with Cron Jobs

If you don't want a separate worker, use Vercel Cron:

**Create `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/cron/process-queue",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

**Create `/api/cron/process-queue/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 10; // Vercel Pro: 60 seconds

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get next enqueued job
    const run = await prisma.import_email_runs.findFirst({
      where: { status: 'enqueued' },
      orderBy: { created_at: 'asc' },
      include: { Job: true }
    });

    if (!run) {
      return NextResponse.json({ message: 'No jobs in queue' });
    }

    // Try to mark as running
    try {
      await prisma.import_email_runs.update({
        where: { id: run.id, status: 'enqueued' },
        data: { status: 'running', started_at: new Date() }
      });
    } catch (e) {
      // Another cron job is already processing
      return NextResponse.json({ message: 'Already processing' });
    }

    // Process in batches to stay under timeout
    // TODO: Implement batch processing with early exit
    // For now, just demonstrate structure

    await prisma.import_email_runs.update({
      where: { id: run.id },
      data: {
        status: 'enqueued', // Put back in queue if not finished
        progress: 10 // Update progress
      }
    });

    return NextResponse.json({
      message: 'Batch processed',
      runId: run.id,
      progress: 10
    });

  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}
```

**Limitations:**
- ⚠️ 10-second timeout on Hobby plan
- ⚠️ 60-second timeout on Pro plan ($20/month)
- ⚠️ Not ideal for large imports

## Environment-Specific Configuration

**Development:**
```bash
npm run dev:all  # Both server and worker locally
```

**Production:**
- **Vercel:** Serves Next.js app
- **Railway/EC2/etc:** Runs worker continuously

## Monitoring & Health Checks

### Worker Health Check

Add to `src/lib/queue/worker.ts`:

```typescript
import express from 'express';

// Simple health check server
const app = express();
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    worker: 'running',
    timestamp: new Date().toISOString()
  });
});
app.listen(process.env.PORT || 3001);
```

### Railway Health Check

Railway automatically pings `/health` endpoint.

### Logging

```typescript
// Add structured logging
console.log(JSON.stringify({
  level: 'info',
  message: 'Job processed',
  runId,
  jobId,
  duration: Date.now() - startTime
}));
```

Monitor logs in Railway dashboard or use external logging:
- **LogDNA**
- **Datadog**
- **Sentry**

## Cost Estimate

**Minimal Setup:**
- Vercel: Free (Hobby plan)
- Railway: $5/month (500 hours)
- Supabase: Free (database)
- **Total: $5/month**

**Production Setup:**
- Vercel: $20/month (Pro plan)
- Railway: $10/month (or AWS EC2 t3.micro)
- Supabase: $25/month (Pro plan)
- **Total: $55/month**

## Quick Start Scripts

**Deploy to Railway:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize
railway init

# Set environment variables
railway variables set DATABASE_URL=...
railway variables set MS_CLIENT_ID=...
# ... (all other env vars)

# Deploy
railway up

# View logs
railway logs
```

**Deploy to Render:**
```bash
# Create render.yaml
services:
  - type: web
    name: dashboard-web
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start

  - type: worker
    name: import-worker
    env: node
    buildCommand: npm install
    startCommand: npm run worker:import
```

## Troubleshooting

### Worker Not Processing in Production

1. **Check worker logs:**
   ```bash
   railway logs  # Railway
   render logs   # Render
   ```

2. **Verify environment variables:**
   - DATABASE_URL (same as Vercel)
   - MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID
   - MS_MAILBOX_USER_ID

3. **Test database connection:**
   ```bash
   railway run npm run test:queue
   ```

### Database Connection Pool Exhausted

Use connection pooling:
```env
# Supabase pooler
DATABASE_URL=postgresql://...?pgbouncer=true

# Or use Prisma Data Proxy
DATABASE_URL=prisma://...
```

### Vercel Timeout Errors

If using Vercel cron approach:
- Upgrade to Pro for 60-second timeout
- Process in smaller batches
- Consider external worker instead

## Summary

**Best Practice:**
- ✅ **Vercel** - Next.js app (UI + enqueue)
- ✅ **Railway/Render** - Worker (background processing)
- ✅ **Supabase/Neon** - Shared PostgreSQL database

This gives you:
- Instant enqueueing (Vercel)
- Reliable background processing (Railway)
- Scalable architecture
- Low cost ($5-10/month to start)

The worker runs 24/7 and processes jobs as they're queued. No timeout issues, no cron delays.
