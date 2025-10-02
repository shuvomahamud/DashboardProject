# Batch Resume Parsing API

## Endpoint

`POST /api/resumes/parse-missing`

## Purpose

Parse all imported resumes that have extracted text but no AI analysis. This should be used after importing resumes with `PARSE_ON_IMPORT=false` to batch process AI parsing separately.

## Authentication

Requires authentication with `resumes` table access permission.

## Request

### Headers
```
Content-Type: application/json
```

### Body (Optional)
```json
{
  "limit": 10  // Number of resumes to process (1-50, default: 10)
}
```

## Response

### Success (200)

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
    },
    {
      "resumeId": 124,
      "success": false,
      "error": "No text available for parsing"
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
    "remaining": 975000,
    "percentage": 2.5
  }
}
```

### No Resumes Found (200)

```json
{
  "message": "No unparsed resumes found",
  "attempted": 0,
  "succeeded": 0,
  "failed": 0,
  "results": [],
  "stats": {
    "total": 100,
    "parsed": 100,
    "unparsed": 0
  },
  "budget": {
    "used": 0,
    "limit": 1000000,
    "remaining": 1000000,
    "percentage": 0
  }
}
```

### AI Features Disabled (503)

```json
{
  "error": "AI features are currently disabled"
}
```

### Budget Exceeded (429)

```json
{
  "error": "Daily AI token budget exceeded",
  "budget": {
    "used": 1000000,
    "limit": 1000000,
    "remaining": 0,
    "percentage": 100
  }
}
```

### Invalid Request (400)

```json
{
  "error": "Invalid request body",
  "details": [
    {
      "code": "too_big",
      "maximum": 50,
      "path": ["limit"],
      "message": "Number must be less than or equal to 50"
    }
  ]
}
```

## Behavior

1. **Query**: Finds resumes with `rawText != null` AND (`aiExtractJson == null` OR `parsedAt == null`)
2. **Budget Check**: Verifies daily token budget has remaining capacity
3. **Processing**: Processes each resume sequentially with 500ms delay between requests
4. **Budget Monitor**: Checks budget before each resume, stops if < 100 tokens remaining
5. **Error Handling**: Records individual failures, continues batch processing

## What Gets Parsed

For each resume, the API extracts:
- Candidate name, email, phone
- Skills (array)
- Work experience (companies, roles, dates)
- Education (degrees, institutions)
- Total years of experience
- Summary

Results are stored in:
- `resume.aiExtractJson` - Full structured JSON
- `resume.candidateName` - Extracted name
- `resume.email` - Extracted email
- `resume.phone` - Extracted phone
- `resume.skills` - JSON array of skills
- `resume.companies` - Comma-separated company names
- `resume.totalExperienceY` - Years of experience
- `resume.parsedAt` - Timestamp of parsing
- `resume.parseModel` - AI model used

## Usage Examples

### Parse 10 resumes (default)
```bash
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

### Parse 50 resumes
```bash
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{"limit": 50}'
```

### With authentication (if using API key)
```bash
curl -X POST https://your-domain.com/api/resumes/parse-missing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"limit": 25}'
```

## Performance

- **Processing time**: ~2-3 seconds per resume
- **Tokens per resume**: ~1,500-3,000 tokens
- **Recommended batch size**: 10-25 resumes per request
- **For large batches**: Make multiple requests with delays

## Environment Variables

Required:
```env
AI_FEATURES=on                    # Enable AI parsing
OPENAI_API_KEY=sk-...            # OpenAI API key
OPENAI_RESUME_MODEL=gpt-4o-mini  # Model to use
```

Optional:
```env
OPENAI_TEMPERATURE=0.0           # Temperature for parsing (0.0-2.0)
PROMPT_VERSION=v1                # Prompt version identifier
```

## Monitoring

Check parsing stats:
```bash
# Get stats about parsed vs unparsed resumes
curl https://your-domain.com/api/resumes/parse-missing \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"limit": 0}'  # Won't process anything, just returns stats
```

## Integration with Import System

**Recommended workflow:**

1. **Import Phase** (with `PARSE_ON_IMPORT=false`)
   - Fetch emails from MS Graph
   - Download attachments
   - Upload to Supabase
   - Extract text (DOCX/PDF)
   - Link to job applications
   - **Skip GPT parsing** (fast: ~1-2s per resume)

2. **Batch Parse Phase** (after import completes)
   - Call `/api/resumes/parse-missing` in batches
   - Process 10-25 resumes at a time
   - Wait for completion before next batch
   - Monitor token usage

This separation ensures fast imports and prevents database connection timeouts.

## Error Recovery

If batch processing fails mid-way:
- Already processed resumes are saved (have `parsedAt` timestamp)
- Failed resumes remain unparsed
- Simply call the API again to retry unparsed resumes
- API is idempotent - safe to call multiple times

## Implementation

See: `src/app/api/resumes/parse-missing/route.ts`

Uses:
- `src/lib/ai/parseResume.ts` - Core parsing logic
- `src/lib/ai/openaiClient.ts` - OpenAI integration
- `src/lib/ai/schema/resumeSchema.ts` - Data validation
