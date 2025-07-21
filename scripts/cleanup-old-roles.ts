/**
 * Cleanup script to remove old InterviewInfo_RW role and fix user permissions
 */

import { prisma } from '../src/lib/prisma';

async function cleanupOldRoles() {
  console.log('🧹 Cleaning up old roles...');
  
  try {
    // Find the old InterviewInfo_RW role
    const oldRole = await prisma.aspNetRoles.findFirst({
      where: { Name: 'InterviewInfo_RW' }
    });

    if (oldRole) {
      console.log(`Found old role: ${oldRole.Name}`);
      
      // Delete role claims
      await prisma.aspNetRoleClaims.deleteMany({
        where: { RoleId: oldRole.Id }
      });
      console.log('✅ Deleted old role claims');
      
      // Delete user role assignments
      await prisma.aspNetUserRoles.deleteMany({
        where: { RoleId: oldRole.Id }
      });
      console.log('✅ Deleted old user role assignments');
      
      // Delete the role itself
      await prisma.aspNetRoles.delete({
        where: { Id: oldRole.Id }
      });
      console.log('✅ Deleted old role');
    } else {
      console.log('ℹ️ No old InterviewInfo_RW role found');
    }

    // Now fix the interview user to have Interviews_RW role
    const interviewUser = await prisma.aspNetUsers.findFirst({
      where: { Email: 'interview.user@example.com' }
    });

    if (interviewUser) {
      const interviewsRole = await prisma.aspNetRoles.findFirst({
        where: { Name: 'Interviews_RW' }
      });

      if (interviewsRole) {
        // Check if user already has this role
        const existingAssignment = await prisma.aspNetUserRoles.findFirst({
          where: {
            UserId: interviewUser.Id,
            RoleId: interviewsRole.Id
          }
        });

        if (!existingAssignment) {
          await prisma.aspNetUserRoles.create({
            data: {
              UserId: interviewUser.Id,
              RoleId: interviewsRole.Id
            }
          });
          console.log('✅ Assigned Interviews_RW role to interview user');
        } else {
          console.log('ℹ️ Interview user already has Interviews_RW role');
        }
      }
    }

    console.log('🎉 Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupOldRoles(); 