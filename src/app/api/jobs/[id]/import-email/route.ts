import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { importEmailSchema } from '@/lib/validation/importEmail';
import { searchMessages, checkEmailEligibility } from '@/lib/msgraph/outlook';
// import { importFromMailbox } from '@/lib/msgraph/importFromMailbox'; // your Phase-2 function

async function _POST(req: NextRequest) {
  // Extract job ID from URL path
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/');
  const jobIdIndex = pathSegments.findIndex(segment => segment === 'jobs') + 1;
  const jobId = parseInt(pathSegments[jobIdIndex]);
  
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = importEmailSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message || "Invalid input" }, { status: 400 });
  }

  const { mailbox, text, top } = parsed.data;

  // Validate tenant domain
  const tenantDomain = process.env.ALLOWED_TENANT_EMAIL_DOMAIN;
  if (tenantDomain && !mailbox.toLowerCase().endsWith(`@${tenantDomain.toLowerCase()}`)) {
    return NextResponse.json({ 
      error: `Mailbox must be in @${tenantDomain}` 
    }, { status: 400 });
  }

  // Clean and limit the search text
  const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 150);

  const startTime = Date.now();
  
  try {
    // Use filter-based approach for all imports now
    const result = await searchMessages(cleanText, top || 5000, mailbox);
      
    let eligibleEmails = 0;
    const firstSubjects: string[] = [];
    
    // For now, process all messages to get accurate counts (optimize later for production)
    for (let i = 0; i < result.messages.length; i++) {
      const message = result.messages[i];
      if (i < 3) {
        firstSubjects.push(message.subject || '(no subject)');
      }
      
      // Quick check: if message doesn't have attachments, skip detailed check
      if (!message.hasAttachments) {
        continue;
      }
      
      const eligibilityCheck = await checkEmailEligibility(message.id, mailbox);
      if (eligibilityCheck.eligible) {
        eligibleEmails++;
      }
    }
    
    const durationMs = Date.now() - startTime;
    
    // Structured logging (domain only, no full email for privacy)
    const mailboxDomain = mailbox.split('@')[1] || 'unknown';
    console.log(`graph.filter ok domain=${mailboxDomain} searchTextLength=${cleanText.length} scanned=${result.messages.length} eligible=${eligibleEmails} durationMs=${durationMs}`);
    console.log(`Debug: searchText="${cleanText}" messagesFound=${result.messages.length} withAttachments=${result.messages.filter(m => m.hasAttachments).length}`);
    
    const summary = {
      createdResumes: 0,
      linkedApplications: 0,
      skippedDuplicates: 0,
      failed: 0,
      emailsScanned: result.messages.length,
    };

    return NextResponse.json(summary);
  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    const mailboxDomain = mailbox.split('@')[1] || 'unknown';
    console.error(`graph.filter failed domain=${mailboxDomain} error="${e?.message}" durationMs=${durationMs}`);
    
    // Handle common Graph API errors with helpful messages
    if (e?.message?.includes('401') || e?.message?.includes('403')) {
      return NextResponse.json({ 
        error: "Graph search failed — check credentials/permissions" 
      }, { status: 401 });
    }
    
    if (e?.message?.includes('404')) {
      return NextResponse.json({ 
        error: "Mailbox not found — check the address/licensing" 
      }, { status: 404 });
    }
    
    if (e?.message?.includes('429')) {
      const retryAfter = e?.retryAfter || 60;
      return NextResponse.json({ 
        error: `Graph API throttled — retry after ${retryAfter} seconds` 
      }, { status: 429 });
    }
    
    return NextResponse.json({ 
      error: "Graph search failed — please try again" 
    }, { status: 500 });
  }
}

export const POST = withTableAuthAppRouter("jobs", _POST);