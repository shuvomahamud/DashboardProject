# Verify Import System is Working Correctly

## Prerequisites

Ensure environment variables are set in Vercel:

```env
PARSE_ON_IMPORT=true
ITEM_CONCURRENCY=1
```

**Note:** SOFT_BUDGET_MS has been removed - no artificial time limits with Fluid Compute and maxDuration=60s.

## Expected Behavior with PARSE_ON_IMPORT=true (Timeout Protected)

### What SHOULD Happen:
1. ✅ Fetch emails from MS Graph
2. ✅ Download resume attachments
3. ✅ Upload to Supabase storage
4. ✅ Extract text (DOCX: via mammoth, PDF: via pdfjs-dist)
5. ✅ Create resume record with `rawText` populated
6. ✅ **ATTEMPT** GPT parsing with 8-second timeout
   - If completes within 8s: AI fields populated (`aiExtractJson`, `candidateName`, `skills`, etc.)
   - If times out: Continue without failing, can retry later via batch API
7. ✅ Link to JobApplication
8. ✅ Mark item as completed

### Timeout Protection Benefits:
- ✅ GPT parsing attempts during import (faster user experience)
- ✅ 8-second max per item prevents blocking
- ✅ Non-fatal failures - import continues
- ✅ Resume data saved even if GPT times out
- ✅ Failed parsing can be retried via `/api/resumes/parse-missing`
- ✅ No database connection exhaustion

## Testing Steps

### 1. Check Environment Variable in Vercel

```bash
# Via Vercel CLI
vercel env ls

# Should show:
# PARSE_ON_IMPORT = true
```

Or check Vercel Dashboard:
- Project Settings → Environment Variables
- Look for `PARSE_ON_IMPORT` = `true`

### 2. Trigger Test Import

From your UI:
1. Go to Jobs page
2. Click on a job
3. Click "Import Applications from Email"
4. Fill in:
   - Mailbox: `karan@bnbtechinc.com`
   - Search text: Job reference number
   - Max emails: 5 (small test)
5. Click Import

### 3. Monitor Vercel Logs

```bash
vercel logs --follow
```

Look for these patterns:

**✅ GOOD - Timeout Protected Processing:**
```
📧 [RUN:xxx] Phase B: Processing item 123
🔧 [ITEM:123] Step 1: Fetching message and attachments
✅ [ITEM:123] Step 1: Complete - moved to step: fetched
🔧 [ITEM:123] Step 2: Downloading attachment bytes
✅ [ITEM:123] Step 2: Complete - moved to step: saved
🔧 [ITEM:123] Step 3: Uploading to Supabase storage
✅ [ITEM:123] Step 3: Complete - moved to step: uploaded
✅ [ITEM:123] Step 4: Text extraction complete
✅ [ITEM:123] GPT parsing completed (or timeout warning if >8s)
✅ [ITEM:123] Step 6: Linked to job application
✅ Phase B: Item 123 processed
📊 Phase B: Progress updated - 1/5 (20.0%)
```

**⚠️ ACCEPTABLE - GPT Timeout (Non-fatal):**
```
✅ [ITEM:123] Step 3: Complete - moved to step: uploaded
⚠️  [ITEM:123] GPT parsing failed (non-fatal): GPT_TIMEOUT
✅ [ITEM:123] Step 6: Linked to job application
✅ Phase B: Item 123 processed
```

### 4. Check Database Records

Query your database:

```sql
-- Check that resumes have text but no AI parsing
SELECT
  id,
  fileName,
  LENGTH(rawText) as text_length,
  parsedAt,
  aiExtractJson,
  candidateName,
  skills
FROM "Resume"
WHERE sourceType = 'email'
  AND createdAt > NOW() - INTERVAL '1 hour'
ORDER BY createdAt DESC
LIMIT 10;
```

**Expected results with PARSE_ON_IMPORT=true:**
- `text_length` > 0 (has extracted text)
- `parsedAt` NOT NULL (text extraction timestamp)
- `aiExtractJson` MAY BE populated (if GPT completed within 8s)
- `candidateName` MAY BE populated (if GPT completed within 8s)
- `skills` MAY BE populated (if GPT completed within 8s)
- If NULL, parsing timed out and can be retried via batch API

### 5. Check Processing Time

From Vercel logs, measure time between:
- Start: `📧 [RUN:xxx] Phase B: Processing item N`
- End: `✅ [RUN:xxx] Phase B: Item N processed`

**Expected timing with PARSE_ON_IMPORT=true (no time budget):**
- Without GPT: 1-3 seconds per item (text extraction only)
- With GPT (success): 3-8 seconds per item (includes AI parsing)
- With GPT (timeout): 9-10 seconds per item (hits 8s timeout, continues)
- Average: ~4-6 seconds per item (mix of success/timeout)
- maxDuration: 60s allows ~7-10 items per run

**Processing completes in ONE cycle:**
- No artificial time limits - processes ALL items
- 10 email import: ~40-60 seconds total
- 20 email import: Will hit 60s limit, continue on next cron (1 minute)
- Much faster than old approach (6s budget = 1-2 items per minute)

### 6. Check Connection Pool Usage

Monitor Supabase Dashboard:
- Settings → Database → Connection Pooling
- Should see: 20-40 connections (manageable)
- Should NOT see: 150+ connections (exhausted)

### 7. Verify Import Completes

Check import summary:
```bash
curl https://your-domain.com/api/import-email-runs/summary
```

Should show:
```json
{
  "inProgress": null,
  "enqueued": [],
  "recentDone": [
    {
      "id": "xxx",
      "status": "succeeded",
      "progress": 1.0,
      "processedMessages": 5,
      "totalMessages": 5
    }
  ]
}
```

## Troubleshooting

### Problem: All GPT calls timing out

**Cause:** OpenAI API slow or network issues

**Fix:**
1. Check OpenAI status: https://status.openai.com
2. Verify OPENAI_API_KEY is valid in Vercel
3. Check Vercel logs for specific API errors
4. Failed parsing will be retried via batch API later

### Problem: Items completing but no AI data

**Cause:** GPT parsing timing out (expected for some items)

**Fix:**
1. This is acceptable - import still succeeds
2. Run batch parsing after import:
   ```bash
   curl -X POST https://your-domain.com/api/resumes/parse-missing \
     -H "Content-Type: application/json" \
     -d '{"limit": 10}'
   ```
3. Batch parsing has no time budget constraints

### Problem: Connection timeouts still occurring

**Cause:** Too many concurrent requests or old connections

**Fix:**
1. Wait 5 minutes for old connections to expire
2. Check Supabase connection count in dashboard
3. Consider upgrading Supabase plan if consistently hitting limit

### Problem: Text extraction failed for PDFs

**Cause:** pdfjs-dist polyfills not loaded

**Fix:**
- Already fixed in latest commit
- Redeploy to apply polyfills

## Success Criteria

✅ All checks passed when:

1. **Speed**: Items process in 3-8 seconds each (with GPT) or 1-3 seconds (without GPT)
2. **Logs**: GPT parsing attempts visible, timeouts are non-fatal warnings
3. **Database**: Resumes have `rawText`, some may have `aiExtractJson` populated
4. **Completion**: Small imports (< 10 items) complete in ONE run (~60s max)
5. **Large imports**: Process 7-10 items per cycle, continue on next cron
6. **Connections**: Supabase shows < 50 active connections
7. **Final status**: Import finishes with status "succeeded"
8. **GPT Success Rate**: At least 50-70% of items complete GPT parsing within 8s

## After Import: Retry Failed Parsing (If Needed)

If some items timed out during import and have no AI data, you can retry parsing:

```bash
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

This batch API:
- Finds resumes with `rawText` but no `aiExtractJson`
- Parses them with GPT without time constraints
- Takes 3-7 seconds per resume (acceptable for background job)
- Populates AI fields: `candidateName`, `skills`, `companies`, etc.
- No time budget limitations (can run as long as needed)

## Performance Comparison

| Configuration | Time/Item | Items/Run | Total Time (20 emails) | GPT Parsing |
|--------------|-----------|-----------|------------------------|-------------|
| Old: 6s budget | 3-8s | 1-2 | **10-20 minutes** ❌ | Attempted but slow |
| PARSE_ON_IMPORT=false | 1-3s | 20+ | 1-2 minutes | Deferred ⚠️ |
| **Current: No budget, 8s timeout** | **3-8s** | **7-10** | **2-3 minutes** ✅ | **Attempted ✅** |

**Key Improvements:**
- Removed SOFT_BUDGET_MS artificial limit
- Utilizes full 60-second maxDuration
- Processes ALL items in one or two cycles (vs 10-20 cycles)
- 6-10x faster than old time-budget approach
- GPT parsing with timeout protection remains reliable
