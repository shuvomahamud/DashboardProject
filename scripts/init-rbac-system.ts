#!/usr/bin/env npx tsx

/**
 * RBAC System Initialization Script
 * 
 * This script initializes the Role-Based Access Control system by:
 * 1. Running database migrations if needed
 * 2. Seeding basic roles and permissions
 * 3. Creating a default admin user if it doesn't exist
 * 
 * Run this after setting up the project to ensure proper RBAC configuration.
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function initRbacSystem() {
  console.log('🚀 Initializing RBAC System...\n');
  
  try {
    // Step 1: Check database connection
    console.log('1. Checking database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ Database connection successful\n');
    
    // Step 2: Run migrations to ensure schema is up to date
    console.log('2. Applying database migrations...');
    try {
      execSync('npx prisma db push', { stdio: 'inherit' });
      console.log('   ✅ Database schema updated\n');
    } catch (error) {
      console.error('   ❌ Migration failed:', error);
      throw error;
    }
    
    // Step 3: Run seed to create roles and default admin
    console.log('3. Seeding RBAC roles and permissions...');
    try {
      execSync('npx prisma db seed', { stdio: 'inherit' });
      console.log('   ✅ RBAC seed completed\n');
    } catch (error) {
      console.error('   ❌ Seeding failed:', error);
      throw error;
    }
    
    // Step 4: Verify the setup
    console.log('4. Verifying RBAC setup...');
    const roles = await prisma.aspNetRoles.count();
    const claims = await prisma.aspNetRoleClaims.count();
    const adminUsers = await prisma.aspNetUsers.count({
      where: {
        AspNetUserRoles: {
          some: {
            AspNetRoles: {
              Name: 'Admin'
            }
          }
        }
      }
    });
    
    console.log(`   ✅ Roles created: ${roles}`);
    console.log(`   ✅ Claims created: ${claims}`);
    console.log(`   ✅ Admin users: ${adminUsers}\n`);
    
    console.log('🎉 RBAC System initialization completed successfully!');
    console.log('\n📋 System Overview:');
    console.log('   • Admin role: Full access with wildcard (*) permission');
    console.log('   • Table-specific roles: AP_Report_RW, Todo_RW, Interviews_RW, Onboarding_RW');
    console.log('   • Default admin account: admin@example.com (password: AdminPassword123!)');
    console.log('   • Navigation menu filters based on user permissions');
    console.log('   • API routes protected with table-based authorization');
    console.log('\n🔐 Security Features:');
    console.log('   • Users can only access permitted tables');
    console.log('   • Admin-only features: Sync Sheet, User Management, Data Loader');
    console.log('   • Server-side permission validation on all routes');
    console.log('   • Client-side menu filtering for better UX');
    
  } catch (error) {
    console.error('\n❌ RBAC System initialization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the initialization
if (require.main === module) {
  initRbacSystem();
}

export { initRbacSystem };