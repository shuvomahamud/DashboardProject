import { NextRequest, NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { withTableAuthAppRouter } from "@/lib/auth/withTableAuthAppRouter";

export const dynamic = 'force-dynamic';

function parsePaging(url: string) {
  const sp = new URL(url).searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") || 10)));
  const q = (sp.get("q") || "").trim();
  const search = (sp.get("search") || "").trim();
  const status = (sp.get("status") || "").trim();
  const minMatch = sp.get("minMatch") ? Number(sp.get("minMatch")) : null;
  const maxFake = sp.get("maxFake") ? Number(sp.get("maxFake")) : null;
  const sortField = (sp.get("sortField") || "updatedAt").trim();
  const directionParam = (sp.get("sortDirection") || "desc").toLowerCase();
  const sortDirection = directionParam === 'asc' ? 'asc' : 'desc';
  return { page, pageSize, q, search, status, minMatch, maxFake, sortField, sortDirection };
}

// GET /api/jobs/[id]/applications?q=&page=&pageSize=
async function _GET(req: NextRequest) {
  // Extract jobId from URL path
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/');
  const jobIdIndex = pathSegments.findIndex(segment => segment === 'jobs') + 1;
  const jobId = parseInt(pathSegments[jobIdIndex]);
  
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const { page, pageSize, q, search, status, minMatch, maxFake, sortField, sortDirection } = parsePaging(req.url);

  let whereClause: any = { jobId };
  const resumeFilters: any[] = [];

  // Handle legacy 'q' parameter and new 'search' parameter
  const searchTerm = search || q;

  // If search query exists, search in resume fields and contactInfo JSON
  if (searchTerm) {
    resumeFilters.push({
      OR: [
        { candidateName: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
        { phone: { contains: searchTerm, mode: "insensitive" } },
        { originalName: { contains: searchTerm, mode: "insensitive" } },
        { contactInfo: { contains: searchTerm, mode: "insensitive" } },
        { skills: { contains: searchTerm, mode: "insensitive" } },
        { experience: { contains: searchTerm, mode: "insensitive" } },
        { sourceFrom: { contains: searchTerm, mode: "insensitive" } },
        { rawText: { contains: searchTerm, mode: "insensitive" } }
      ]
    });
  }

  // Filter by fake score (max)
  if (maxFake !== null && !isNaN(maxFake)) {
    resumeFilters.push({
      fakeScore: { lte: maxFake }
    });
  }

  // Apply resume filters
  if (resumeFilters.length > 0) {
    whereClause.resume = {
      AND: resumeFilters
    };
  }

  // Filter by status
  if (status && status !== 'all') {
    whereClause.status = status;
  }

  // Filter by match score (min)
  if (minMatch !== null && !isNaN(minMatch)) {
    whereClause.matchScore = { gte: minMatch };
  }

  const sortDir = sortDirection === 'asc' ? 'asc' : 'desc';
  let orderByClause: any;

  switch (sortField) {
    case 'candidateName':
      orderByClause = { resume: { candidateName: sortDir } };
      break;
    case 'status':
      orderByClause = { status: sortDir };
      break;
    case 'notes':
      orderByClause = { notes: sortDir };
      break;
    case 'matchScore':
      orderByClause = { matchScore: sortDir };
      break;
    case 'aiCompanyScore':
      orderByClause = { aiCompanyScore: sortDir };
      break;
    case 'fakeScore':
      orderByClause = { resume: { fakeScore: sortDir } };
      break;
    case 'skills':
      orderByClause = { resume: { skills: sortDir } };
      break;
    case 'experience':
      orderByClause = { resume: { totalExperienceY: sortDir } };
      break;
    case 'appliedDate':
      orderByClause = { appliedDate: sortDir };
      break;
    case 'createdAt':
      orderByClause = { resume: { createdAt: sortDir } };
      break;
    case 'updatedAt':
    default:
      orderByClause = { updatedAt: sortDir };
      break;
  }

  const [total, apps] = await Promise.all([
    prisma.jobApplication.count({ where: whereClause }),
    prisma.jobApplication.findMany({
      where: whereClause,
      orderBy: orderByClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        jobId: true,
        resumeId: true,
        status: true,
        notes: true,
        updatedAt: true,
        appliedDate: true,
        matchScore: true,
        aiCompanyScore: true,
        resume: {
          select: {
            id: true,
            originalName: true,
            contactInfo: true,
            sourceFrom: true,
            skills: true,
            experience: true,
            createdAt: true,
            totalExperienceY: true,
            fakeScore: true,
            companyScore: true,
            candidateName: true,
            email: true,
            phone: true,
          },
        },
      },
    }),
  ]);

  // Helper to safely convert Decimal to number
  const toNumber = (val: any) => val == null ? null : Number(val);

  // Parse contact info and extract candidate details
  const rows = apps.map((a) => {
    let candidateName = a.candidateName || a.resume?.candidateName || null;
    let email = a.email || a.resume?.email || null;
    let phone = a.phone || a.resume?.phone || null;

    // Try to parse contactInfo JSON as fallback
    if (!candidateName || !email || !phone) {
      if (a.resume?.contactInfo) {
        try {
          const contactData = JSON.parse(a.resume.contactInfo);
          candidateName = candidateName || contactData.name || contactData.candidateName || null;
          email = email || contactData.email || null;
          phone = phone || contactData.phone || contactData.phoneNumber || null;
        } catch (e) {
          // If JSON parsing fails, try to extract email from string
          if (!email) {
            const emailMatch = a.resume.contactInfo.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (emailMatch) email = emailMatch[0];
          }
          if (!phone) {
            const phoneMatch = a.resume.contactInfo.match(/[\+]?[\d\s\-\(\)]{10,}/);
            if (phoneMatch) phone = phoneMatch[0];
          }
        }
      }
    }

    // Fallback to sourceFrom (email sender) if no email found
    if (!email && a.resume?.sourceFrom) {
      email = a.resume?.sourceFrom;
    }

    // Fallback to originalName for candidate name
    if (!candidateName && a.resume?.originalName) {
      const fileName = a.resume?.originalName;
      candidateName = fileName?.replace(/\.(pdf|docx?|txt)$/i, '') || null;
    }

    return {
      id: a.id,
      jobId: a.jobId,
      resumeId: a.resumeId,
      status: a.status,
      notes: a.notes,
      updatedAt: a.updatedAt,
      appliedDate: a.appliedDate,
      candidateName,
      email,
      phone,
      // AI scores from database (with fallbacks to Resume table)
      matchScore: toNumber(a.matchScore),
      aiCompany: toNumber(a.aiCompanyScore) ?? toNumber(a.resume?.companyScore),
      aiFake: toNumber(a.resume?.fakeScore),
      // Additional resume fields
      originalName: a.resume?.originalName,
      sourceFrom: a.resume?.sourceFrom,
      skills: a.resume?.skills,
      experience: toNumber(a.resume?.totalExperienceY),
      createdAt: a.resume?.createdAt,
    };
  });

  return NextResponse.json({
    applications: rows,
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    query: searchTerm,
    filters: {
      search: searchTerm,
      status: status || null,
      minMatch,
      maxFake
    }
  });
}

// PATCH /api/jobs/[id]/applications  { resumeId, status?, notes?, score? }
async function _PATCH(req: NextRequest) {
  // Extract jobId from URL path
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/');
  const jobIdIndex = pathSegments.findIndex(segment => segment === 'jobs') + 1;
  const jobId = parseInt(pathSegments[jobIdIndex]);
  
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const { resumeId, status, notes } = body || {};
  if (!Number.isFinite(resumeId)) {
    return NextResponse.json({ error: "resumeId required" }, { status: 400 });
  }

  const data: any = {};
  if (typeof status === "string") data.status = status;
  if (typeof notes === "string") data.notes = notes;

  const updated = await prisma.jobApplication.update({
    where: { jobId_resumeId: { jobId, resumeId: Number(resumeId) } },
    data,
    select: { id: true, jobId: true, resumeId: true, status: true, notes: true, updatedAt: true },
  });

  return NextResponse.json({ application: updated });
}

// DELETE /api/jobs/[id]/applications  { resumeId }
async function _DELETE(req: NextRequest) {
  // Extract jobId from URL path
  const url = new URL(req.url);
  const pathSegments = url.pathname.split('/');
  const jobIdIndex = pathSegments.findIndex(segment => segment === 'jobs') + 1;
  const jobId = parseInt(pathSegments[jobIdIndex]);
  
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const { resumeId } = body || {};
  if (!Number.isFinite(resumeId)) {
    return NextResponse.json({ error: "resumeId required" }, { status: 400 });
  }

  await prisma.jobApplication.delete({
    where: { jobId_resumeId: { jobId, resumeId: Number(resumeId) } },
  });

  return NextResponse.json({ ok: true });
}

const protectedGET = withTableAuthAppRouter("jobs", _GET);
const protectedPATCH = withTableAuthAppRouter("jobs", _PATCH);
const protectedDELETE = withTableAuthAppRouter("jobs", _DELETE);

export { protectedGET as GET, protectedPATCH as PATCH, protectedDELETE as DELETE };
