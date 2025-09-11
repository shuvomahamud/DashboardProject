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

  const { mailbox, text, top, searchOnly } = parsed.data;

  // Validate tenant domain
  const tenantDomain = process.env.ALLOWED_TENANT_EMAIL_DOMAIN;
  if (tenantDomain && !mailbox.toLowerCase().endsWith(`@${tenantDomain.toLowerCase()}`)) {
    return NextResponse.json({ 
      error: `Mailbox must be in @${tenantDomain}` 
    }, { status: 400 });
  }

  // IMPORTANT: Build a safe AQS (quotes ensure exact phrase; hasAttachment singular)
  // Clean and limit the search text, collapse whitespace, escape inner quotes
  const cleanText = text.replace(/"/g, '').replace(/\s+/g, ' ').trim().substring(0, 150);
  const aqs = `"hasAttachment:true AND \\"${cleanText}\\""`;

  const startTime = Date.now();
  
  // Debug log the request (only in search-only mode for safety)
  if (searchOnly) {
    console.log(`Graph search debug: mailbox=${mailbox}, aqs=${aqs}`);
  }
  
  try {
    if (searchOnly) {
      // Search-only mode: just search and check eligibility
      const result = await searchMessages(aqs, top || 25, mailbox);
      
      let eligibleEmails = 0;
      const firstSubjects: string[] = [];
      
      // Check eligibility for first few emails and collect subjects
      for (let i = 0; i < Math.min(result.messages.length, 5); i++) {
        const message = result.messages[i];
        if (i < 3) {
          firstSubjects.push(message.subject || '(no subject)');
        }
        
        const eligibilityCheck = await checkEmailEligibility(message.id, mailbox);
        if (eligibilityCheck.eligible) {
          eligibleEmails++;
        }
      }
      
      // For remaining messages, just count those with attachments
      // (approximation since checking all eligibility would be slow)
      const remainingWithAttachments = result.messages.slice(5).filter(m => m.hasAttachments).length;
      eligibleEmails += Math.floor(remainingWithAttachments * 0.7); // rough estimate
      
      const durationMs = Date.now() - startTime;
      
      // Structured logging
      console.log(`graph.search ok mailbox=${mailbox} scanned=${result.messages.length} eligible=${eligibleEmails} durationMs=${durationMs}`);
      
      const summary = {
        emailsScanned: result.messages.length,
        eligibleEmails,
        firstSubjects,
        durationMs
      };
      
      return NextResponse.json(summary);
    } else {
      // Full import mode (Phase 2 - not implemented yet)
      // This function should encapsulate:
      // - Graph search on mailbox
      // - Take ONE eligible attachment (pdf/docx) per email
      // - Download -> hash -> dedupe -> supabase upload
      // - Text extract -> create Resume -> link JobApplication
      // - Log EmailIngestLog
      // - Return summary
      //
      // const summary = await importFromMailbox({ jobId, mailbox, aqs, limit: top || 25 });

      // TEMP stub so UI can be wired immediately:
      const summary = {
        createdResumes: 0,
        linkedApplications: 0,
        skippedDuplicates: 0,
        failed: 0,
        emailsScanned: 0,
      };

      console.log(`Email import request for job ${jobId}:`, {
        mailbox,
        aqs,
        limit: top || 25,
      });

      return NextResponse.json(summary);
    }
  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    console.error(`graph.search failed mailbox=${mailbox} error="${e?.message}" durationMs=${durationMs}`);
    
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