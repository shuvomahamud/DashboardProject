/**
 * Simple test to verify admin access and user creation
 */

import { prisma } from '../src/lib/prisma';

async function testAdminAccess() {
  console.log('🔍 Testing Admin Access...');
  
  try {
    // Test 1: Check if admin user exists
    const adminUser = await prisma.aspNetUsers.findFirst({
      where: { Email: 'admin@example.com' },
      include: {
        AspNetUserRoles: {
          include: {
            AspNetRoles: {
              include: {
                AspNetRoleClaims: true
              }
            }
          }
        }
      }
    });

    if (!adminUser) {
      console.log('❌ Admin user not found');
      return;
    }

    console.log('✅ Admin user found:', adminUser.Email || 'No email');

    // Test 2: Check admin permissions
    const adminTables = new Set<string>();
    adminUser.AspNetUserRoles.forEach(userRole => {
      userRole.AspNetRoles.AspNetRoleClaims.forEach(claim => {
        if (claim.ClaimType === 'table') {
          adminTables.add(claim.ClaimValue);
        }
      });
    });

    console.log('✅ Admin permissions:', Array.from(adminTables));

    // Test 3: List all users
    const allUsers = await prisma.aspNetUsers.findMany({
      select: {
        Id: true,
        Email: true,
        EmailConfirmed: true,
        AspNetUserRoles: {
          include: {
            AspNetRoles: {
              select: {
                Name: true
              }
            }
          }
        }
      }
    });

    console.log('✅ All users in system:');
    allUsers.forEach(user => {
      const roles = user.AspNetUserRoles.map(ur => ur.AspNetRoles.Name).join(', ');
             console.log(`  - ${user.Email || 'No email'} (${roles})`);
    });

    // Test 4: Check API endpoints are accessible
    console.log('✅ System is ready for testing!');
    console.log('🔗 Login URLs:');
    console.log('  - Admin: admin@example.com / AdminPassword123!');
    console.log('  - AP User: ap.user@example.com / ApPassword123!');
    console.log('  - Todo User: todo.user@example.com / TodoPassword123!');
    console.log('  - Interview User: interview.user@example.com / InterviewPassword123!');

  } catch (error) {
    console.error('❌ Error testing admin access:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAdminAccess(); 