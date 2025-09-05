import { PrismaClient } from '@prisma/client';
import { parseResumeToJson } from './openaiClient';
import { ResumeParseSchema, toDbFields } from './schema/resumeSchema';

const prisma = new PrismaClient();

interface ParseHints {
  jobTitle?: string;
}

interface ParseOptions {
  hints?: ParseHints;
}

interface ParseSummary {
  resumeId: number;
  candidateName: string | null;
  emailsCount: number;
  skillsCount: number;
  companiesCount: number;
  tokensUsed?: number;
}

type ParseResult = 
  | { ok: true; summary: ParseSummary }
  | { ok: false; error: string; type: 'not_found' | 'no_text' | 'ai_error' | 'validation' | 'database' };

export async function parseAndPersistResume(
  resumeId: number,
  opts?: ParseOptions
): Promise<ParseResult> {
  try {
    // Load resume from database
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      select: {
        id: true,
        rawText: true,
        aiExtractJson: true,
        parsedAt: true,
        fileName: true
      }
    });

    if (!resume) {
      return {
        ok: false,
        error: `Resume with ID ${resumeId} not found`,
        type: 'not_found'
      };
    }

    if (!resume.rawText || resume.rawText.trim() === '') {
      return {
        ok: false,
        error: 'Resume has no raw text to parse',
        type: 'no_text'
      };
    }

    // If already parsed and no hints provided, return existing data
    if (resume.aiExtractJson && resume.parsedAt && !opts?.hints) {
      try {
        const existingData = JSON.parse(resume.aiExtractJson);
        const candidateName = existingData.candidate?.name || null;
        const emailsCount = existingData.candidate?.emails?.length || 0;
        const skillsCount = existingData.skills?.length || 0;
        const companiesCount = existingData.employment?.length || 0;

        return {
          ok: true,
          summary: {
            resumeId,
            candidateName,
            emailsCount,
            skillsCount,
            companiesCount
          }
        };
      } catch (parseError) {
        // Existing data is invalid, proceed with re-parsing
        console.warn(`Invalid existing aiExtractJson for resume ${resumeId}, re-parsing...`);
      }
    }

    console.log(`Parsing resume ${resumeId} (${resume.fileName})`);

    // Call OpenAI API to parse the resume
    const parseResult = await parseResumeToJson({
      text: resume.rawText,
      hints: opts?.hints
    });

    if (!parseResult.ok) {
      return {
        ok: false,
        error: parseResult.error,
        type: parseResult.type === 'budget' ? 'ai_error' : 
              parseResult.type === 'api' ? 'ai_error' : 'validation'
      };
    }

    // Validate the parsed data against our Zod schema
    let validatedData;
    try {
      validatedData = ResumeParseSchema.parse(parseResult.data);
    } catch (validationError) {
      console.error('Schema validation failed:', validationError);
      return {
        ok: false,
        error: `Parsed data failed schema validation: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`,
        type: 'validation'
      };
    }

    // Convert to database fields
    const dbFields = toDbFields(validatedData);

    // Update the resume in database
    try {
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          ...dbFields,
          parsedAt: new Date()
        }
      });
    } catch (dbError) {
      console.error('Database update failed:', dbError);
      return {
        ok: false,
        error: `Failed to update resume in database: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`,
        type: 'database'
      };
    }

    // Build summary
    const summary: ParseSummary = {
      resumeId,
      candidateName: validatedData.candidate.name,
      emailsCount: validatedData.candidate.emails.length,
      skillsCount: validatedData.skills.length,
      companiesCount: validatedData.employment.length,
      tokensUsed: parseResult.tokensUsed
    };

    console.log(`Successfully parsed resume ${resumeId}: ${summary.candidateName || 'Unknown'}, ${summary.skillsCount} skills, ${summary.companiesCount} companies`);

    return {
      ok: true,
      summary
    };

  } catch (error) {
    console.error('Unexpected error in parseAndPersistResume:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      type: 'database'
    };
  }
}

// Helper function to get parsing stats
export async function getParsingStats(): Promise<{
  total: number;
  parsed: number;
  unparsed: number;
  withText: number;
}> {
  try {
    const [total, parsed, withText] = await Promise.all([
      prisma.resume.count(),
      prisma.resume.count({
        where: {
          aiExtractJson: { not: null },
          parsedAt: { not: null }
        }
      }),
      prisma.resume.count({
        where: {
          rawText: { not: null }
        }
      })
    ]);

    return {
      total,
      parsed,
      unparsed: withText - parsed,
      withText
    };
  } catch (error) {
    console.error('Error getting parsing stats:', error);
    return { total: 0, parsed: 0, unparsed: 0, withText: 0 };
  }
}

// Helper to find unparsed resumes
export async function findUnparsedResumes(limit: number = 10): Promise<Array<{
  id: number;
  fileName: string;
  originalName: string;
  createdAt: Date;
}>> {
  try {
    return await prisma.resume.findMany({
      where: {
        rawText: { not: null },
        AND: [
          {
            OR: [
              { aiExtractJson: null },
              { parsedAt: null }
            ]
          }
        ]
      },
      select: {
        id: true,
        fileName: true,
        originalName: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'asc' // Parse oldest first
      },
      take: limit
    });
  } catch (error) {
    console.error('Error finding unparsed resumes:', error);
    return [];
  }
}