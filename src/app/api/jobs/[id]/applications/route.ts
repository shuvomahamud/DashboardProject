import { NextRequest, NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { withTableAuthAppRouter } from "@/lib/auth/withTableAuthAppRouter";
import { getStateName, parseCityState, US_STATES } from '@/lib/location/usStates';

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
  const sortField = (sp.get("sortField") || "matchScore").trim();
  const directionParam = (sp.get("sortDirection") || "desc").toLowerCase();
  const sortDirection = directionParam === 'asc' ? 'asc' : 'desc';
  const state = (sp.get("state") || "").trim().toUpperCase();
  const city = (sp.get("city") || "").trim();
  return { page, pageSize, q, search, status, minMatch, maxFake, sortField, sortDirection, state, city };
}

function extractSearchTokens(value: string): string[] {
  if (!value) {
    return [];
  }

  const matches = value.match(/"([^"]+)"|[^\s,]+/g) || [];
  return matches
    .map(token => {
      const trimmed = token.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).trim();
      }
      return trimmed.replace(/^[,\s]+|[,\s]+$/g, '');
    })
    .map(token => token.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 6);
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
  const { page, pageSize, q, search, status, minMatch, maxFake, sortField, sortDirection, state, city } = parsePaging(req.url);
  const stateFilter = state && state.length === 2 ? state : '';
  const cityFilter = stateFilter ? city : '';

  let whereClause: any = { jobId };
  const andFilters: any[] = [];

  // Handle legacy 'q' parameter and new 'search' parameter
  const searchTerm = search || q;
  const searchTokens = extractSearchTokens(searchTerm);

  if (searchTokens.length > 0) {
    searchTokens.forEach(token => {
      andFilters.push({
        OR: [
          { resume: { candidateName: { contains: token, mode: "insensitive" } } },
          { resume: { email: { contains: token, mode: "insensitive" } } },
          { resume: { phone: { contains: token, mode: "insensitive" } } },
          { resume: { originalName: { contains: token, mode: "insensitive" } } },
          { resume: { contactInfo: { contains: token, mode: "insensitive" } } },
          { resume: { skills: { contains: token, mode: "insensitive" } } },
          { resume: { experience: { contains: token, mode: "insensitive" } } },
          { resume: { sourceFrom: { contains: token, mode: "insensitive" } } },
          { resume: { rawText: { contains: token, mode: "insensitive" } } },
          { resume: { companies: { contains: token, mode: "insensitive" } } },
          { notes: { contains: token, mode: "insensitive" } },
          { status: { contains: token, mode: "insensitive" } }
        ]
      });
    });
  }

  // Filter by fake score (max)
  if (maxFake !== null && !isNaN(maxFake)) {
    andFilters.push({
      resume: {
        fakeScore: { lte: maxFake }
      }
    });
  }

  // Filter by status
  if (status && status !== 'all') {
    whereClause.status = status;
  }

  // Filter by match score (min)
  if (minMatch !== null && !isNaN(minMatch)) {
    whereClause.matchScore = { gte: minMatch };
  }

  if (stateFilter) {
    andFilters.push({
      OR: [
        {
          resume: {
            candidateState: stateFilter
          }
        },
        {
          resume: {
            sourceCandidateLocation: {
              contains: stateFilter,
              mode: 'insensitive'
            }
          }
        }
      ]
    });

    if (cityFilter) {
      andFilters.push({
        OR: [
          {
            resume: {
              candidateCity: {
                equals: cityFilter,
                mode: 'insensitive'
              }
            }
          },
          {
            resume: {
              sourceCandidateLocation: {
                contains: cityFilter,
                mode: 'insensitive'
              }
            }
          }
        ]
      });
    }
  }

  if (andFilters.length > 0) {
    whereClause.AND = andFilters;
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
    case 'location':
      orderByClause = [
        { resume: { candidateState: sortDir } },
        { resume: { candidateCity: sortDir } }
      ];
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

  const [total, apps, locationRecords] = await Promise.all([
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
            sourceCandidateLocation: true,
            candidateCity: true,
            candidateState: true,
            sourceWorkAuthorization: true
          },
        },
      },
    }),
    prisma.resume.findMany({
      where: {
        OR: [
          { candidateState: { not: null } },
          { sourceCandidateLocation: { not: null } }
        ],
        applications: {
          some: { jobId }
        }
      },
      select: {
        candidateState: true,
        candidateCity: true,
        sourceCandidateLocation: true
      }
    })
  ]);

  // Helper to safely convert Decimal to number
  const toNumber = (val: any) => val == null ? null : Number(val);

  const extractLocation = (record: {
    candidateState: string | null;
    candidateCity: string | null;
    sourceCandidateLocation?: string | null;
  }) => {
    if (record.candidateState || record.candidateCity) {
      return {
        state: record.candidateState?.toUpperCase() || null,
        city: record.candidateCity || null
      };
    }
    if (record.sourceCandidateLocation) {
      const parsed = parseCityState(record.sourceCandidateLocation);
      return {
        state: parsed.state,
        city: parsed.city
      };
    }
    return { state: null, city: null };
  };

  const locationMap = new Map<string, Set<string>>();
  locationRecords.forEach(record => {
    const location = extractLocation(record);
    const stateCode = location.state ? location.state.toUpperCase() : null;
    if (!stateCode) return;
    if (!locationMap.has(stateCode)) {
      locationMap.set(stateCode, new Set());
    }
    if (location.city) {
      locationMap.get(stateCode)!.add(location.city);
    }
  });

  const locationOptions = Array.from(locationMap.entries())
    .map(([code, cities]) => ({
      code,
      name: getStateName(code) ?? code,
      cities: Array.from(cities).sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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

    const resolvedLocation = extractLocation({
      candidateState: a.resume?.candidateState || null,
      candidateCity: a.resume?.candidateCity || null,
      sourceCandidateLocation: a.resume?.sourceCandidateLocation || null
    });
    const locationCity = resolvedLocation.city;
    const locationState = resolvedLocation.state;
    const fallbackLocation = a.resume?.sourceCandidateLocation || null;
    const locationDisplay = locationCity && locationState
      ? `${locationCity}, ${locationState}`
      : locationCity
      ? locationCity
      : locationState || fallbackLocation || null;

    const workAuthorization = a.resume?.sourceWorkAuthorization || null;

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
      locationCity,
      locationState,
      locationDisplay,
      workAuthorization,
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
      maxFake,
      state: stateFilter || null,
      city: cityFilter || null,
      locationOptions: { states: locationOptions }
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
