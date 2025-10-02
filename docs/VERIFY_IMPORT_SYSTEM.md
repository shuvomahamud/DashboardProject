# Verify Import System is Working Correctly

## Prerequisites

Ensure environment variables are set in Vercel:

```env
PARSE_ON_IMPORT=false
SOFT_BUDGET_MS=5000
ITEM_CONCURRENCY=1
```

## Expected Behavior with PARSE_ON_IMPORT=false

### What SHOULD Happen:
1. ✅ Fetch emails from MS Graph
2. ✅ Download resume attachments
3. ✅ Upload to Supabase storage
4. ✅ Extract text (DOCX: via mammoth, PDF: via pdfjs-dist)
5. ✅ Create resume record with `rawText` populated
6. ✅ Link to JobApplication
7. ❌ **SKIP** GPT parsing (no AI call to OpenAI)
8. ✅ Mark item as completed

### What SHOULD NOT Happen:
- ❌ No calls to OpenAI API
- ❌ No `parseAndScoreResume()` calls
- ❌ No 6-7 second delays per item
- ❌ No database connection timeouts
- ❌ Resume fields remain unpopulated:
  - `aiExtractJson` = null
  - `candidateName` = null
  - `skills` = null
  - `companies` = null
  - `totalExperienceY` = null
  - (These get populated later via `/api/resumes/parse-missing`)

## Testing Steps

### 1. Check Environment Variable in Vercel

```bash
# Via Vercel CLI
vercel env ls

# Should show:
# PARSE_ON_IMPORT = false
```

Or check Vercel Dashboard:
- Project Settings → Environment Variables
- Look for `PARSE_ON_IMPORT` = `false`

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

**✅ GOOD - Fast Processing (~1-2s per item):**
```
📧 [RUN:xxx] Phase B: Processing item 123
🔧 [ITEM:123] Step 1: Fetching message and attachments
✅ [ITEM:123] Step 1: Complete - moved to step: fetched
🔧 [ITEM:123] Step 2: Downloading attachment bytes
✅ [ITEM:123] Step 2: Complete - moved to step: saved
🔧 [ITEM:123] Step 3: Uploading to Supabase storage
✅ [ITEM:123] Step 3: Complete - moved to step: uploaded
✅ [ITEM:123] Step 4: Text extraction complete
✅ [ITEM:123] Step 6: Linked to job application
✅ Phase B: Item 123 processed
📊 Phase B: Progress updated - 1/5 (20.0%)
```

**❌ BAD - Slow Processing (~7s per item):**
```
✅ [ITEM:123] Step 3: Complete - moved to step: uploaded
[LONG PAUSE - 5-7 seconds]
Unexpected error in parseAndScoreResume: ...
✅ Phase B: Item 123 processed
⏱️  Phase B: Time budget exhausted (8302ms)
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

**Expected results with PARSE_ON_IMPORT=false:**
- `text_length` > 0 (has extracted text)
- `parsedAt` NOT NULL (text extraction timestamp)
- `aiExtractJson` IS NULL (no AI parsing)
- `candidateName` IS NULL (no AI parsing)
- `skills` IS NULL (no AI parsing)

### 5. Check Processing Time

From Vercel logs, measure time between:
- Start: `📧 [RUN:xxx] Phase B: Processing item N`
- End: `✅ [RUN:xxx] Phase B: Item N processed`

**Expected timing with PARSE_ON_IMPORT=false:**
- DOCX files: 0.5 - 1.5 seconds per item
- PDF files: 1.0 - 2.5 seconds per item
- Average: ~1.5 seconds per item

**If you see 5-7+ seconds per item:**
- ⚠️ PARSE_ON_IMPORT is still `true`
- Check Vercel environment variables
- Redeploy after changing

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

### Problem: Still seeing slow processing (5-7s per item)

**Cause:** PARSE_ON_IMPORT is still `true` in Vercel

**Fix:**
```bash
# Set environment variable
vercel env add PARSE_ON_IMPORT

# When prompted:
# Value: false
# Environment: Production

# Redeploy
vercel --prod
```

### Problem: "parseAndScoreResume" appears in logs

**Cause:** Environment variable not applied or needs redeploy

**Fix:**
1. Check `vercel env ls`
2. Confirm `PARSE_ON_IMPORT=false`
3. Trigger new deployment (environment changes require redeploy)

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

1. **Speed**: Items process in 1-2 seconds each
2. **Logs**: No "parseAndScoreResume" or "Unexpected error" messages
3. **Database**: Resumes have `rawText` but no `aiExtractJson`
4. **Time budget**: Processor completes within 5 seconds
5. **Connections**: Supabase shows < 50 active connections
6. **Completion**: Import finishes with status "succeeded"

## After Import: Batch Parsing

Once import completes successfully, run AI parsing separately:

```bash
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

This will:
- Find resumes with `rawText` but no `aiExtractJson`
- Parse them with GPT in batches
- Take 2-3 seconds per resume (acceptable for background job)
- Populate AI fields: `candidateName`, `skills`, `companies`, etc.

## Performance Comparison

| Configuration | Time per item | Items per 5s | Connection usage |
|--------------|---------------|--------------|------------------|
| PARSE_ON_IMPORT=true | 5-7s | 0-1 | Very High ❌ |
| PARSE_ON_IMPORT=false | 1-2s | 3-5 | Low ✅ |

**Recommendation:** Always use `PARSE_ON_IMPORT=false` for imports, then batch parse separately.
