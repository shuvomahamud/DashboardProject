import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting RBAC seed...');
  
  await prisma.$transaction(async (tx) => {
    // Define the five roles
    const roles = [
      { id: randomUUID(), name: 'Admin', normalizedName: 'ADMIN' },
      { id: randomUUID(), name: 'AP_Report_RW', normalizedName: 'AP_REPORT_RW' },
      { id: randomUUID(), name: 'Todo_RW', normalizedName: 'TODO_RW' },
      { id: randomUUID(), name: 'Interviews_RW', normalizedName: 'INTERVIEWS_RW' },
      { id: randomUUID(), name: 'Onboarding_RW', normalizedName: 'ONBOARDING_RW' },
    ];

    // Create or update roles
    console.log('📝 Creating/updating roles...');
    for (const role of roles) {
      await tx.aspNetRoles.upsert({
        where: { NormalizedName: role.normalizedName },
        update: {
          Name: role.name
        },
        create: {
          Id: role.id,
          Name: role.name,
          NormalizedName: role.normalizedName,
          ConcurrencyStamp: randomUUID()
        }
      });
      console.log(`   ✅ Role: ${role.name}`);
    }

    // Define table claim mappings
    const claimsMap = {
      AP_Report_RW: 'ap_report',
      Todo_RW: 'todo_list',
      Interviews_RW: 'interviews',
      Onboarding_RW: 'onboarding',
    };

    // Create wildcard claim for Admin role
    console.log('🔐 Creating table claims...');
    const adminRole = await tx.aspNetRoles.findFirst({ 
      where: { Name: 'Admin' } 
    });
    
    if (adminRole) {
      // Check if admin wildcard claim already exists
      const existingAdminClaim = await tx.aspNetRoleClaims.findFirst({
        where: {
          RoleId: adminRole.Id,
          ClaimType: 'table',
          ClaimValue: '*'
        }
      });

      if (!existingAdminClaim) {
        await tx.aspNetRoleClaims.create({
          data: {
            RoleId: adminRole.Id,
            ClaimType: 'table',
            ClaimValue: '*'
          }
        });
      }
      console.log(`   ✅ Claim: Admin -> * (wildcard)`);
    }

    // Create table claims for the 4 table-specific RW roles
    for (const [roleName, tableKey] of Object.entries(claimsMap)) {
      const role = await tx.aspNetRoles.findFirst({ 
        where: { Name: roleName } 
      });
      
      if (role) {
        // Check if claim already exists
        const existingClaim = await tx.aspNetRoleClaims.findFirst({
          where: {
            RoleId: role.Id,
            ClaimType: 'table',
            ClaimValue: tableKey
          }
        });

        if (!existingClaim) {
          await tx.aspNetRoleClaims.create({
            data: {
              RoleId: role.Id,
              ClaimType: 'table',
              ClaimValue: tableKey
            }
          });
        }
        console.log(`   ✅ Claim: ${roleName} -> ${tableKey}`);
      }
    }

    // Create default admin user (only if doesn't exist)
    const adminEmail = 'admin@example.com';
    const existingAdmin = await tx.aspNetUsers.findFirst({
      where: { Email: adminEmail }
    });

    if (!existingAdmin) {
      console.log('👤 Creating default admin user...');
      const adminUserId = randomUUID();
      const hashedPassword = await bcrypt.hash('AdminPassword123!', 12);
      
      await tx.aspNetUsers.create({
        data: {
          Id: adminUserId,
          Email: adminEmail,
          NormalizedEmail: adminEmail.toUpperCase(),
          EmailConfirmed: true,
          UserName: 'admin',
          NormalizedUserName: 'ADMIN',
          PasswordHash: hashedPassword,
          SecurityStamp: randomUUID(),
          ConcurrencyStamp: randomUUID(),
          PhoneNumberConfirmed: false,
          TwoFactorEnabled: false,
          LockoutEnabled: false,
          AccessFailedCount: 0,
          IsApproved: true,
          Name: 'System Administrator'
        }
      });

      // Assign Admin role to the user
      const adminRole = await tx.aspNetRoles.findFirst({
        where: { Name: 'Admin' }
      });
      
      if (adminRole) {
        await tx.aspNetUserRoles.create({
          data: {
            UserId: adminUserId,
            RoleId: adminRole.Id
          }
        });
        console.log(`   ✅ Admin user created with email: ${adminEmail}`);
        console.log(`   🔑 Default password: AdminPassword123!`);
      }
    } else {
      console.log('👤 Admin user already exists, skipping creation');
    }

    // Create some sample users for testing (only if they don't exist)
    const sampleUsers = [
      { email: 'ap.user@example.com', name: 'AP User', role: 'AP_Report_RW' },
      { email: 'todo.user@example.com', name: 'Todo User', role: 'Todo_RW' },
      { email: 'interview.user@example.com', name: 'Interview User', role: 'Interviews_RW' },
    ];

    console.log('👥 Creating sample users...');
    for (const sampleUser of sampleUsers) {
      const existingUser = await tx.aspNetUsers.findFirst({
        where: { Email: sampleUser.email }
      });

      if (!existingUser) {
        const userId = randomUUID();
        const hashedPassword = await bcrypt.hash('UserPassword123!', 12);
        
        await tx.aspNetUsers.create({
          data: {
            Id: userId,
            Email: sampleUser.email,
            NormalizedEmail: sampleUser.email.toUpperCase(),
            EmailConfirmed: true,
            UserName: sampleUser.email,
            NormalizedUserName: sampleUser.email.toUpperCase(),
            PasswordHash: hashedPassword,
            SecurityStamp: randomUUID(),
            ConcurrencyStamp: randomUUID(),
            PhoneNumberConfirmed: false,
            TwoFactorEnabled: false,
            LockoutEnabled: false,
            AccessFailedCount: 0,
            IsApproved: true,
            Name: sampleUser.name
          }
        });

        // Assign role to the user
        const userRole = await tx.aspNetRoles.findFirst({
          where: { Name: sampleUser.role }
        });
        
        if (userRole) {
          await tx.aspNetUserRoles.create({
            data: {
              UserId: userId,
              RoleId: userRole.Id
            }
          });
          console.log(`   ✅ Sample user: ${sampleUser.email} (${sampleUser.role})`);
        }
      }
    }
  });

  console.log('🎉 RBAC seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 