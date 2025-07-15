import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    console.log('🔧 Creating admin user...');

    // Admin user details
    const adminEmail = 'test@example.com'; // Change this to your email
    const adminPassword = 'TestPassword123!'; // Change this to a secure password
    const adminName = 'Test Administrator';

    // Check if admin user already exists
    const existingUser = await prisma.aspNetUsers.findFirst({
      where: { Email: adminEmail }
    });

    if (existingUser) {
      console.log('👤 Admin user already exists');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    // Generate UUIDs
    const userId = randomUUID();
    const roleId = randomUUID();

    // Create Admin role if it doesn't exist
    let adminRole = await prisma.aspNetRoles.findFirst({
      where: { Name: 'Admin' }
    });

    if (!adminRole) {
      adminRole = await prisma.aspNetRoles.create({
        data: {
          Id: roleId,
          Name: 'Admin',
          NormalizedName: 'ADMIN'
        }
      });
      console.log('🔐 Created Admin role');
    }

    // Create the admin user
    const adminUser = await prisma.aspNetUsers.create({
      data: {
        Id: userId,
        UserName: adminEmail,
        NormalizedUserName: adminEmail.toUpperCase(),
        Email: adminEmail,
        NormalizedEmail: adminEmail.toUpperCase(),
        EmailConfirmed: true,
        PasswordHash: hashedPassword,
        SecurityStamp: randomUUID(),
        ConcurrencyStamp: randomUUID(),
        PhoneNumberConfirmed: false,
        TwoFactorEnabled: false,
        LockoutEnabled: false,
        AccessFailedCount: 0,
        IsApproved: true,
        Name: adminName
      }
    });

    // Assign Admin role to user
    await prisma.aspNetUserRoles.create({
      data: {
        UserId: adminUser.Id,
        RoleId: adminRole.Id
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log('⚠️  Please change the password after first login!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser(); 