import { NextRequest, NextResponse } from 'next/server';
import { withTableAuthAppRouter } from '@/lib/auth/withTableAuthAppRouter';
import { importEmailSchema } from '@/lib/validation/importEmail';
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

  // IMPORTANT: Build a safe AQS (quotes ensure exact phrase; hasAttachments)
  const aqs = `hasAttachments:yes "${text.replaceAll('"', '\\"')}"`;

  try {
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
  } catch (e: any) {
    console.error("import-email failed:", e?.message || e);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

export const POST = withTableAuthAppRouter("jobs", _POST);