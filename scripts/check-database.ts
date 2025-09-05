/**
 * Simple script to check database contents
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database contents...');
    
    // Check resumes
    const resumeCount = await prisma.resume.count();
    console.log(`📄 Total resumes: ${resumeCount}`);
    
    if (resumeCount > 0) {
      const sampleResumes = await prisma.resume.findMany({ 
        take: 3, 
        select: { 
          id: true, 
          fileName: true, 
          sourceType: true,
          fileStorageUrl: true,
          createdAt: true 
        } 
      });
      console.log('Sample resumes:', sampleResumes);
    }
    
    // Check jobs
    const jobCount = await prisma.job.count();
    console.log(`💼 Total jobs: ${jobCount}`);
    
    // Check applications
    const appCount = await prisma.jobApplication.count();
    console.log(`📋 Total applications: ${appCount}`);
    
    // Check users
    const userCount = await prisma.aspNetUsers.count();
    console.log(`👥 Total users: ${userCount}`);
    
    console.log('\n✅ Database check completed!');
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();