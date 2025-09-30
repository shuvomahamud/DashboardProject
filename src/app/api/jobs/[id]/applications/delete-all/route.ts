import { NextRequest, NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { withTableAuthAppRouter } from "@/lib/auth/withTableAuthAppRouter";

export const dynamic = 'force-dynamic';

// DELETE /api/jobs/[id]/applications/delete-all
// Deletes all applications and their associated resumes for a specific job
async function _DELETE(req: NextRequest) {
  try {
    // Extract jobId from URL path
    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/');
    const jobIdIndex = pathSegments.findIndex(segment => segment === 'jobs') + 1;
    const jobId = parseInt(pathSegments[jobIdIndex]);

    if (!Number.isFinite(jobId)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    // First, get all applications for this job to find the resume IDs
    const applications = await prisma.jobApplication.findMany({
      where: { jobId },
      select: { resumeId: true }
    });

    const resumeIds = applications.map(app => app.resumeId);

    if (resumeIds.length === 0) {
      return NextResponse.json({
        message: 'No applications found for this job',
        deletedApplications: 0,
        deletedResumes: 0
      });
    }

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Delete all applications for this job
      const deletedApplications = await tx.jobApplication.deleteMany({
        where: { jobId }
      });

      // Delete all resumes that were associated with these applications
      const deletedResumes = await tx.resume.deleteMany({
        where: {
          id: { in: resumeIds }
        }
      });

      return {
        deletedApplications: deletedApplications.count,
        deletedResumes: deletedResumes.count
      };
    });

    console.log(`Deleted all applications for job ${jobId}:`, result);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedApplications} applications and ${result.deletedResumes} resumes`,
      ...result
    });

  } catch (error) {
    console.error('Error deleting all applications:', error);
    return NextResponse.json(
      { error: 'Failed to delete applications and resumes' },
      { status: 500 }
    );
  }
}

const protectedDELETE = withTableAuthAppRouter("jobs", _DELETE);

export { protectedDELETE as DELETE };
