#!/usr/bin/env npx tsx

/**
 * RBAC System Verification Script
 * 
 * This script verifies the current state of the Role-Based Access Control system:
 * 1. Lists all roles and their permissions
 * 2. Shows all users and their assigned roles
 * 3. Validates the system integrity
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyRbacSystem() {
  console.log('🔍 Verifying RBAC System...\n');
  
  try {
    // Get all roles with their claims
    const roles = await prisma.aspNetRoles.findMany({
      include: {
        AspNetRoleClaims: true,
        AspNetUserRoles: {
          include: {
            AspNetUsers: {
              select: {
                Email: true,
                IsApproved: true
              }
            }
          }
        }
      }
    });

    console.log('🏷️  ROLES AND PERMISSIONS:');
    console.log('─'.repeat(50));
    
    roles.forEach((role) => {
      console.log(`\n📝 Role: ${role.Name}`);
      console.log(`   ID: ${role.Id}`);
      console.log(`   Normalized: ${role.NormalizedName}`);
      
      // Show permissions
      const tableClaims = role.AspNetRoleClaims.filter(claim => claim.ClaimType === 'table');
      if (tableClaims.length > 0) {
        console.log('   Permissions:');
        tableClaims.forEach(claim => {
          const permission = claim.ClaimValue === '*' ? 'All Tables (Admin)' : claim.ClaimValue;
          console.log(`     • ${permission}`);
        });
      } else {
        console.log('   ⚠️  No permissions assigned');
      }
      
      // Show assigned users
      const assignedUsers = role.AspNetUserRoles.map(ur => ur.AspNetUsers);
      if (assignedUsers.length > 0) {
        console.log('   Assigned Users:');
        assignedUsers.forEach(user => {
          const status = user.IsApproved ? '✅' : '⏳';
          console.log(`     ${status} ${user.Email}`);
        });
      } else {
        console.log('   👥 No users assigned');
      }
    });

    console.log('\n');
    console.log('👥 USER OVERVIEW:');
    console.log('─'.repeat(50));

    // Get all users with their roles
    const users = await prisma.aspNetUsers.findMany({
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
      },
      orderBy: {
        Email: 'asc'
      }
    });

    users.forEach((user) => {
      const status = user.IsApproved ? '✅' : '⏳';
      const confirmed = user.EmailConfirmed ? '📧' : '📪';
      console.log(`\n${status} ${confirmed} ${user.Email}`);
      console.log(`   Name: ${user.Name || 'Not set'}`);
      
      if (user.AspNetUserRoles.length > 0) {
        console.log('   Roles:');
        user.AspNetUserRoles.forEach(ur => {
          console.log(`     • ${ur.AspNetRoles.Name}`);
        });
        
        // Collect all table permissions
        const permissions = new Set<string>();
        user.AspNetUserRoles.forEach(ur => {
          ur.AspNetRoles.AspNetRoleClaims.forEach(claim => {
            if (claim.ClaimType === 'table') {
              permissions.add(claim.ClaimValue || '');
            }
          });
        });
        
        if (permissions.size > 0) {
          console.log('   Table Access:');
          Array.from(permissions).forEach(permission => {
            const displayName = permission === '*' ? 'All Tables (Admin)' : permission;
            console.log(`     • ${displayName}`);
          });
        }
      } else {
        console.log('   ⚠️  No roles assigned');
      }
    });

    console.log('\n');
    console.log('📊 SYSTEM STATISTICS:');
    console.log('─'.repeat(50));
    
    const stats = {
      totalRoles: await prisma.aspNetRoles.count(),
      totalUsers: await prisma.aspNetUsers.count(),
      approvedUsers: await prisma.aspNetUsers.count({ where: { IsApproved: true } }),
      confirmedUsers: await prisma.aspNetUsers.count({ where: { EmailConfirmed: true } }),
      totalClaims: await prisma.aspNetRoleClaims.count(),
      tableClaims: await prisma.aspNetRoleClaims.count({ where: { ClaimType: 'table' } }),
      adminUsers: await prisma.aspNetUsers.count({
        where: {
          AspNetUserRoles: {
            some: {
              AspNetRoles: {
                Name: 'Admin'
              }
            }
          }
        }
      })
    };
    
    console.log(`📝 Total Roles: ${stats.totalRoles}`);
    console.log(`👥 Total Users: ${stats.totalUsers}`);
    console.log(`✅ Approved Users: ${stats.approvedUsers}`);
    console.log(`📧 Email Confirmed: ${stats.confirmedUsers}`);
    console.log(`🔐 Total Claims: ${stats.totalClaims}`);
    console.log(`📋 Table Claims: ${stats.tableClaims}`);
    console.log(`👑 Admin Users: ${stats.adminUsers}`);
    
    // Validation checks
    console.log('\n');
    console.log('🔍 SYSTEM VALIDATION:');
    console.log('─'.repeat(50));
    
    const issues: string[] = [];
    
    // Check for Admin role
    const adminRole = await prisma.aspNetRoles.findFirst({ where: { Name: 'Admin' } });
    if (!adminRole) {
      issues.push('❌ Admin role not found');
    } else {
      const adminClaim = await prisma.aspNetRoleClaims.findFirst({
        where: { RoleId: adminRole.Id, ClaimType: 'table', ClaimValue: '*' }
      });
      if (!adminClaim) {
        issues.push('❌ Admin role missing wildcard permission');
      } else {
        console.log('✅ Admin role configured correctly');
      }
    }
    
    // Check for required table roles
    const requiredRoles = ['AP_Report_RW', 'Todo_RW', 'Interviews_RW', 'Onboarding_RW'];
    for (const roleName of requiredRoles) {
      const role = await prisma.aspNetRoles.findFirst({ where: { Name: roleName } });
      if (!role) {
        issues.push(`❌ Missing role: ${roleName}`);
      } else {
        const hasClaim = await prisma.aspNetRoleClaims.findFirst({
          where: { RoleId: role.Id, ClaimType: 'table' }
        });
        if (!hasClaim) {
          issues.push(`❌ Role ${roleName} has no table permissions`);
        }
      }
    }
    
    // Check for at least one admin user
    if (stats.adminUsers === 0) {
      issues.push('❌ No admin users found');
    } else {
      console.log('✅ Admin users exist');
    }
    
    if (issues.length === 0) {
      console.log('✅ All table roles configured correctly');
      console.log('\n🎉 RBAC System is properly configured!');
    } else {
      console.log('\n⚠️  ISSUES FOUND:');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log('\n💡 Run: npx tsx scripts/init-rbac-system.ts to fix issues');
    }
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the verification
if (require.main === module) {
  verifyRbacSystem();
}

export { verifyRbacSystem };