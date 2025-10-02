# Email Import Configuration

## Performance Optimization

For best performance in Vercel serverless environment, **disable GPT parsing during import**:

```env
PARSE_ON_IMPORT=false
```

### Why?

- GPT parsing takes 5-7 seconds per resume
- This exhausts the 5-second time budget
- Causes database connection timeouts
- Only processes 1 item per 5s slice

### With PARSE_ON_IMPORT=false:

- Text extraction only: 1-2 seconds per resume
- Processes 3-5 items per 5s slice
- No database timeouts
- Faster overall import completion

### Batch Parsing After Import

**Prerequisites:**
```env
AI_FEATURES=on  # Required for batch parsing API
```

Run GPT parsing as a separate batch job after import completes:

```bash
# Parse up to 10 unparsed resumes (default)
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json"

# Parse up to 50 resumes in one batch
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

**API Response:**
```json
{
  "message": "Batch processing complete: 10/10 succeeded",
  "attempted": 10,
  "succeeded": 10,
  "failed": 0,
  "totalTokensUsed": 25000,
  "results": [
    {
      "resumeId": 123,
      "success": true,
      "candidateName": "John Doe",
      "tokensUsed": 2500
    }
  ],
  "stats": {
    "total": 100,
    "parsed": 10,
    "unparsed": 90
  },
  "budget": {
    "used": 25000,
    "limit": 1000000,
    "remaining": 975000
  }
}
```

**Features:**
- Processes resumes with extracted text but no AI parsing
- Respects daily token budget (stops if limit reached)
- Returns detailed results per resume
- 500ms delay between requests to avoid API rate limits

## Other Configuration

### Time Budget

```env
SOFT_BUDGET_MS=5000  # 5 seconds processing + 5s buffer = 10s total
```

### Database Connection Pool

```env
# Automatically configured in src/lib/prisma.ts
connection_limit=5    # Small pool per serverless instance
pool_timeout=20       # Fail fast
connect_timeout=5     # Fail fast
pgbouncer=true       # Use Supabase pooler
```

### PDF Extraction

```env
PDF_HARD_PAGE_CAP=15              # Max pages to extract
PDF_EXTRACTION_TIMEOUT_MS=3000    # 3 second timeout
```

## Monitoring

Check import progress:
```bash
# View runs
curl https://your-domain.com/api/import-email-runs/summary

# View specific run
curl https://your-domain.com/api/import-email-runs/{runId}
```

Check logs in Vercel Dashboard → Functions → Logs
