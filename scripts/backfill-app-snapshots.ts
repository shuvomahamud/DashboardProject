import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const toNumber = (x: any) => (x == null ? null : Number(x));

async function backfillApplicationSnapshots() {
  console.log('Starting backfill of application snapshots...');

  try {
    // Get all applications that need backfilling
    const apps = await prisma.jobApplication.findMany({
      where: {
        OR: [
          { aiExtractJson: null },
          { matchScore: null }
        ]
      },
      select: {
        id: true,
        jobId: true,
        resumeId: true,
        status: true,
        appliedDate: true,
        updatedAt: true,
        matchScore: true,
        aiCompanyScore: true,
        resume: {
          select: {
            aiExtractJson: true,
            candidateName: true,
            email: true,
            phone: true,
            skills: true,
            totalExperienceY: true,
            companyScore: true,
            fakeScore: true,
            originalName: true,
            sourceFrom: true
          }
        }
      }
    });

    console.log(`Found ${apps.length} applications to backfill`);

    let updated = 0;
    let errors = 0;

    for (const app of apps) {
      try {
        // Extract match score from resume aiExtractJson if missing
        let matchScore = toNumber(app.matchScore);

        if (matchScore == null && app.resume.aiExtractJson) {
          try {
            const resumeJson = JSON.parse(app.resume.aiExtractJson as string);
            matchScore = toNumber(resumeJson?.scores?.matchScore);
          } catch (parseError) {
            console.warn(`Failed to parse aiExtractJson for resume ${app.resumeId}:`, parseError);
          }
        }

        // Build the snapshot
        const snapshot = {
          id: app.id,
          jobId: app.jobId,
          resumeId: app.resumeId,
          status: app.status ?? "new",
          notes: null,
          updatedAt: app.updatedAt?.toISOString() ?? null,
          appliedDate: app.appliedDate?.toISOString() ?? null,
          candidateName: app.resume.candidateName || null,
          email: app.resume.email || null,
          phone: app.resume.phone || null,
          aiMatch: matchScore,
          aiCompany: toNumber(app.resume.companyScore),
          aiFake: toNumber(app.resume.fakeScore),
          originalName: app.resume.originalName || null,
          sourceFrom: app.resume.sourceFrom || null,
          skills: app.resume.skills || null,
          experience: toNumber(app.resume.totalExperienceY),
          createdAt: null
        };

        // Update the application
        const updateData: any = {
          aiExtractJson: snapshot
        };

        // Also backfill matchScore if it was missing
        if (matchScore != null && app.matchScore == null) {
          updateData.matchScore = matchScore;
        }

        // Backfill aiCompanyScore from resume.companyScore
        const companyScore = toNumber(app.resume.companyScore);
        if (companyScore != null) {
          updateData.aiCompanyScore = companyScore;
        }

        await prisma.jobApplication.update({
          where: { id: app.id },
          data: updateData
        });

        updated++;

        if (updated % 10 === 0) {
          console.log(`Progress: ${updated}/${apps.length} applications updated`);
        }

      } catch (error) {
        errors++;
        console.error(`Error updating application ${app.id}:`, error);
      }
    }

    console.log(`Backfill completed:`);
    console.log(`- ${updated} applications updated successfully`);
    console.log(`- ${errors} errors encountered`);

  } catch (error) {
    console.error('Fatal error during backfill:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the backfill
if (require.main === module) {
  backfillApplicationSnapshots()
    .then(() => {
      console.log('Backfill script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Backfill script failed:', error);
      process.exit(1);
    });
}

export { backfillApplicationSnapshots };
