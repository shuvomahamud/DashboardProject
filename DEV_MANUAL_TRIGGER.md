# Local Development - Manual Trigger Guide

## Problem: Vercel Crons Don't Work Locally

The cron-based dispatcher system is designed for **Vercel production**, where crons run every minute. On your local machine, you need to **manually trigger** the dispatcher.

## Current Status

You have **1 job queued** (Job #10 - Tibco Spotfire consultant) that's been waiting for ~4 hours.

## How to Process It Locally

### Option 1: Call Dispatcher Endpoint (Quick Test)

```bash
# In your browser or via curl:
curl -X POST http://localhost:3000/api/import-emails/dispatch

# Or just visit in browser:
http://localhost:3000/api/import-emails/dispatch
```

**What this does:**
- Promotes oldest enqueued run to "running"
- Returns the run ID
- In production, would automatically call processor
- In dev, you need to call processor manually (see Option 2)

**Expected response:**
```json
{
  "status": "dispatched",
  "runId": "some-uuid",
  "message": "Run promoted to running. Call /api/import-emails/process to start processing."
}
```

### Option 2: Full Processing (Not Ready Yet)

The processor endpoint (`/api/import-emails/process`) needs to be implemented with:
- Provider adapter (MS Graph message listing)
- Pipeline adapter (email processing steps)
- Items table (database migration)

**This is documented in `CRON_DISPATCHER_IMPLEMENTATION.md`**

## Quick Fix for Your Queued Job

Since the system isn't fully implemented yet, you can:

### 1. Reset the Queued Job

```sql
-- Mark it as canceled (it's been sitting for 4 hours)
UPDATE import_email_runs
SET status = 'canceled',
    finished_at = NOW()
WHERE job_id = 10 AND status = 'enqueued';
```

### 2. Use Old Import Method (Temporary)

Until the new cron system is fully implemented, you can use the existing `importFromMailbox` function directly if you need to import emails now.

## Production vs Development

### Production (Vercel)
```
Vercel Cron (every minute)
  ↓
POST /api/import-emails/dispatch (automatic)
  ↓
POST /api/import-emails/process (via waitUntil)
  ↓
Processing happens automatically
```

### Development (Local)
```
Manual: POST /api/import-emails/dispatch
  ↓
Status: "dispatched"
  ↓
Manual: POST /api/import-emails/process (when implemented)
  ↓
Processing happens
```

## What You Need to Implement Next

To make the system work end-to-end:

1. ✅ Database migration (add `import_email_items` table)
2. ✅ Summary endpoint (done)
3. ✅ Cancel endpoint (done)
4. ✅ Dispatcher endpoint (done - just created)
5. ❌ Enqueue endpoint (`POST /api/import-emails`)
6. ❌ Processor endpoint (`POST /api/import-emails/process`)
7. ❌ Provider adapter (MS Graph)
8. ❌ Pipeline adapter (email processing)

## Testing the Dispatcher

```bash
# 1. Check current queue status
curl http://localhost:3000/api/import-email-runs/summary

# 2. Trigger dispatcher
curl -X POST http://localhost:3000/api/import-emails/dispatch

# 3. Check status again (should show "running" instead of "enqueued")
curl http://localhost:3000/api/import-email-runs/summary
```

## For Now

**Recommendation:**
1. Test the dispatcher endpoint to see it promote the queued job
2. Then cancel it (since processor isn't implemented yet)
3. Implement the full system following `CRON_DISPATCHER_IMPLEMENTATION.md`

**Or:** Continue using your existing import method until the new system is complete.

---

**Key Point:** The new system is designed for **production deployment on Vercel** where crons work automatically. For local development, you'll always need manual triggers or a local cron simulator.
