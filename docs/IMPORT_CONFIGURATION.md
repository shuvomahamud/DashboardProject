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

Run GPT parsing as a separate batch job after import completes:

```bash
# Parse all unparsed resumes
curl -X POST https://your-domain.com/api/resumes/parse-missing
```

Or trigger from UI:
- Go to Jobs page
- Click on job
- Click "Parse Missing Resumes" button

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
