import type { Prisma, JobScoreRecalcRun } from '@prisma/client';
import prisma from '@/lib/prisma';
import { parseJobProfile, type JobProfile } from '@/lib/ai/jobProfileService';
import {
  parseSkillRequirementConfig,
  type SkillRequirement,
  type SkillRequirementEvaluationSummary,
  type SkillRequirementEvaluation
} from '@/lib/ai/skillRequirements';
import { computeProfileMatchScore } from '@/lib/ai/scoring/profileMatchScoring';
import { AnalysisSchema, type ProfileAnalysis } from '@/lib/ai/resumeParsingService';
import type { ExperienceRequirements } from '@/lib/jobs/experience';
import { normalizeSkillKey } from '@/lib/skills/normalize';

type SerializedRun = {
  id: string;
  jobId: number;
  status: string;
  totalCandidates: number;
  processedCandidates: number;
  successCount: number;
  failureCount: number;
  message: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

interface StoredAnalysis {
  analysis: ProfileAnalysis;
  candidateExperienceYears: number | null;
}

interface ScoreContext {
  jobProfile: JobProfile;
  experienceRequirements: ExperienceRequirements | null;
  mandatoryRequirements: SkillRequirement[];
}

type ApplicationRow = {
  id: number;
  resumeId: number;
  aiExtractJson: string | null;
  resume: {
    id: number;
    aiExtractJson: string | null;
    totalExperienceY: Prisma.Decimal | number | null;
    skillRequirementEvaluation: Prisma.JsonValue | null;
    aiMatchedAttributes: Prisma.JsonValue | null;
  } | null;
};

const ACTIVE_STATUSES = ['pending', 'running'];

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  try {
    // Prisma Decimal objects stringify to numeric text
    const asNumber = Number((value as Prisma.Decimal).toString());
    return Number.isFinite(asNumber) ? asNumber : null;
  } catch {
    return null;
  }
};

const serializeRun = (run: JobScoreRecalcRun): SerializedRun => ({
  id: run.id,
  jobId: run.jobId,
  status: run.status,
  totalCandidates: run.totalCandidates,
  processedCandidates: run.processedCandidates,
  successCount: run.successCount,
  failureCount: run.failureCount,
  message: run.message ?? null,
  error: run.error ?? null,
  createdAt: run.createdAt.toISOString(),
  startedAt: run.startedAt ? run.startedAt.toISOString() : null,
  finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null
});

const parseSkillEvaluationRecord = (
  input: Prisma.JsonValue | null | undefined
): SkillRequirementEvaluationSummary | null => {
  if (!input) return null;
  let record: any = input;
  if (typeof record === 'string') {
    try {
      record = JSON.parse(record);
    } catch {
      return null;
    }
  }
  if (!record || typeof record !== 'object') {
    return null;
  }

  const ensureStringArray = (value: any): string[] =>
    Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];

  const evaluations: SkillRequirementEvaluation[] = Array.isArray(record.evaluations)
    ? record.evaluations
        .map((entry: any) => ({
          skill: typeof entry?.skill === 'string' ? entry.skill : null,
          matched: Boolean(entry?.matched),
          manualFound: Boolean(entry?.manualFound),
          aiFound: Boolean(entry?.aiFound)
        }))
        .filter(item => item.skill)
    : [];

  return {
    evaluations: evaluations as SkillRequirementEvaluationSummary['evaluations'],
    allMet: Boolean(record.allMet),
    manualCoverageMissing: ensureStringArray(record.manualCoverageMissing),
    unmetRequirements: ensureStringArray(record.unmetRequirements),
    metRequirements: ensureStringArray(record.metRequirements),
    aiDetectedWithoutManual: ensureStringArray(record.aiDetectedWithoutManual)
  };
};

const buildSummaryFromAnalysis = (
  requirements: SkillRequirement[],
  analysis: ProfileAnalysis
): SkillRequirementEvaluationSummary | null => {
  if (!requirements.length) {
    return null;
  }

  const matchedSet = new Set(
    (analysis.mustHaveSkillsMatched ?? []).map(skill => normalizeSkillKey(String(skill)))
  );
  const missingList = (analysis.mustHaveSkillsMissing ?? []).map(skill =>
    String(skill)
  );

  const evaluations = requirements.map(req => {
    const key = req.canonical ?? normalizeSkillKey(req.skill);
    const matched = matchedSet.has(key);
    return {
      skill: req.skill,
      matched,
      manualFound: matched,
      aiFound: matched
    };
  });

  return {
    evaluations,
    allMet: evaluations.every(item => item.matched),
    manualCoverageMissing: missingList,
    unmetRequirements: evaluations.filter(item => !item.matched).map(item => item.skill),
    metRequirements: evaluations.filter(item => item.matched).map(item => item.skill),
    aiDetectedWithoutManual: []
  };
};

const extractStoredAnalysis = (raw: string): StoredAnalysis | null => {
  try {
    const parsed = JSON.parse(raw);
    const source = parsed?.analysis ?? parsed;
    const result = AnalysisSchema.safeParse(source);
    if (!result.success) {
      return null;
    }
    const candidateYears = toNumber(parsed?.resume?.candidate?.totalExperienceYears);
    return {
      analysis: result.data,
      candidateExperienceYears: candidateYears
    };
  } catch {
    return null;
  }
};

const extractAnalysisSnapshot = (
  snapshot: Prisma.JsonValue | null | undefined
): StoredAnalysis | null => {
  if (!snapshot) {
    return null;
  }

  let payload: any = snapshot;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const source = payload.analysis ?? payload;
  const result = AnalysisSchema.safeParse(source);
  if (!result.success) {
    return null;
  }

  return {
    analysis: result.data,
    candidateExperienceYears: toNumber(
      payload.candidateExperienceYears ?? payload.resume?.candidate?.totalExperienceYears
    )
  };
};

const recalcApplication = async (
  application: ApplicationRow,
  context: ScoreContext
): Promise<boolean> => {
  const snapshot = extractAnalysisSnapshot(application.resume?.aiMatchedAttributes);
  const storedJson = application.aiExtractJson ?? application.resume?.aiExtractJson;
  const stored =
    snapshot ??
    (storedJson ? extractStoredAnalysis(storedJson) : null);
  if (!stored) {
    throw new Error('Stored AI analysis is unavailable for this resume.');
  }

  const mandatorySummary =
    parseSkillEvaluationRecord(application.resume?.skillRequirementEvaluation) ??
    buildSummaryFromAnalysis(context.mandatoryRequirements, stored.analysis);

  const matchDetails = computeProfileMatchScore(
    context.jobProfile,
    stored.analysis,
    mandatorySummary ?? undefined,
    {
      candidateExperienceYears:
        stored.candidateExperienceYears ?? toNumber(application.resume?.totalExperienceY),
      experienceRequirements: context.experienceRequirements ?? undefined
    }
  );

  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      matchScore: matchDetails.finalScore
    }
  });

  return true;
};

const processScoreRecalcRun = async (runId: string) => {
  const run = await prisma.job_score_recalc_run.findUnique({ where: { id: runId } });
  if (!run) return;
  if (!ACTIVE_STATUSES.includes(run.status)) {
    return;
  }

  await prisma.job_score_recalc_run.update({
    where: { id: runId },
    data: {
      status: 'running',
      startedAt: new Date(),
      processedCandidates: 0,
      successCount: 0,
      failureCount: 0,
      message: 'Preparing to recalculate scores...'
    }
  });

  try {
    const job = await prisma.job.findUnique({
      where: { id: run.jobId },
      select: {
        id: true,
        aiJobProfileJson: true,
        mandatorySkillRequirements: true,
        requiredExperienceYears: true,
        preferredExperienceMinYears: true,
        preferredExperienceMaxYears: true
      }
    });

    if (!job) {
      throw new Error('Job not found.');
    }

    const jobProfile = job.aiJobProfileJson ? parseJobProfile(job.aiJobProfileJson) : null;
    if (!jobProfile) {
      throw new Error('AI job profile is missing. Generate one before recalculating scores.');
    }

    const mandatoryRequirements = parseSkillRequirementConfig(job.mandatorySkillRequirements);

    const experienceRequirements: ExperienceRequirements | null = {
      requiredYears: job.requiredExperienceYears ?? null,
      preferredMinYears: job.preferredExperienceMinYears ?? null,
      preferredMaxYears: job.preferredExperienceMaxYears ?? null
    };

    const applications = await prisma.jobApplication.findMany({
      where: { jobId: job.id },
      select: {
        id: true,
        resumeId: true,
        aiExtractJson: true,
        resume: {
          select: {
            id: true,
            aiExtractJson: true,
            totalExperienceY: true,
            skillRequirementEvaluation: true,
            aiMatchedAttributes: true
          }
        }
      },
      orderBy: { id: 'asc' }
    });

    await prisma.job_score_recalc_run.update({
      where: { id: runId },
      data: { totalCandidates: applications.length }
    });

    if (applications.length === 0) {
      await prisma.job_score_recalc_run.update({
        where: { id: runId },
        data: {
          status: 'completed',
          processedCandidates: 0,
          successCount: 0,
          failureCount: 0,
          finishedAt: new Date(),
          message: 'No candidates were linked to this job.'
        }
      });
      return;
    }

    const context: ScoreContext = {
      jobProfile,
      experienceRequirements,
      mandatoryRequirements
    };

    let processed = 0;
    let success = 0;
    let failure = 0;

    for (const application of applications) {
      try {
        await recalcApplication(application as ApplicationRow, context);
        success += 1;
      } catch (error) {
        failure += 1;
        console.warn('score refresh failed for application', {
          applicationId: application.id,
          resumeId: application.resumeId,
          error: error instanceof Error ? error.message : error
        });
      } finally {
        processed += 1;
      }

      if (processed === applications.length || processed % 3 === 0) {
        await prisma.job_score_recalc_run.update({
          where: { id: runId },
          data: {
            processedCandidates: processed,
            successCount: success,
            failureCount: failure,
            message: `Processing candidates (${processed}/${applications.length})`
          }
        });
      }
    }

    await prisma.job_score_recalc_run.update({
      where: { id: runId },
      data: {
        status: 'completed',
        processedCandidates: processed,
        successCount: success,
        failureCount: failure,
        finishedAt: new Date(),
        message: `Recalculated ${success} candidate${success === 1 ? '' : 's'}.`
      }
    });
  } catch (error) {
    await prisma.job_score_recalc_run.update({
      where: { id: runId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred.',
        finishedAt: new Date()
      }
    });
  }
};

export const getScoreRefreshRun = async (
  jobId: number,
  runId?: string | null
): Promise<SerializedRun | null> => {
  let run: JobScoreRecalcRun | null = null;

  if (runId) {
    run = await prisma.job_score_recalc_run.findUnique({ where: { id: runId } });
    if (run && run.jobId !== jobId) {
      return null;
    }
  } else {
    run = await prisma.job_score_recalc_run.findFirst({
      where: { jobId },
      orderBy: { createdAt: 'desc' }
    });
  }

  return run ? serializeRun(run) : null;
};

export const startScoreRefreshRun = async (jobId: number): Promise<SerializedRun> => {
  const jobExists = await prisma.job.count({ where: { id: jobId } });
  if (jobExists === 0) {
    throw new Error('Job not found.');
  }

  const existing = await prisma.job_score_recalc_run.findFirst({
    where: { jobId, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: 'desc' }
  });

  if (existing) {
    throw new Error('A score refresh is already running for this job.');
  }

  const total = await prisma.jobApplication.count({ where: { jobId } });
  if (total === 0) {
    throw new Error('No applications found for this job.');
  }

  const run = await prisma.job_score_recalc_run.create({
    data: {
      jobId,
      status: 'pending',
      totalCandidates: total,
      message: 'Queued for recalculation.'
    }
  });

  processScoreRecalcRun(run.id).catch(error => {
    console.error('score refresh run encountered an error', error);
  });

  return serializeRun(run);
};
