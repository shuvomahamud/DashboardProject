import bcrypt from "bcrypt";
import prisma from "../src/lib/prisma";

async function testDatabaseAndCreateUser() {
  try {
    console.log("🔍 Testing database connection...");
    
    // Test 1: Basic connection
    await prisma.$connect();
    console.log("✅ Database connected successfully!");

    // Test 2: Check if we can query users table
    console.log("\n🔍 Testing AspNetUsers table access...");
    const userCount = await prisma.aspNetUsers.count();
    console.log(`✅ Found ${userCount} users in AspNetUsers table`);

    // Test 3: Check existing admin user
    console.log("\n🔍 Checking existing admin user...");
    const existingAdmin = await prisma.aspNetUsers.findFirst({
      where: { Email: "shuvomahamud@gmail.com" }
    });
    
    if (existingAdmin) {
      console.log("✅ Found existing admin user:");
      console.log("   - ID:", existingAdmin.Id);
      console.log("   - Name:", existingAdmin.Name);
      console.log("   - Email:", existingAdmin.Email);
      console.log("   - IsApproved:", existingAdmin.IsApproved);
      console.log("   - Password hash starts with:", existingAdmin.PasswordHash?.substring(0, 10) + "...");
      
      const isAspNetHash = existingAdmin.PasswordHash?.startsWith("AQ");
      console.log("   - Is ASP.NET Identity hash:", isAspNetHash);
      
      if (isAspNetHash) {
        console.log("⚠️  This is an ASP.NET Identity hash - bcrypt won't work with it!");
      }
    } else {
      console.log("❌ Admin user not found");
    }

    // Test 4: Create a test user with bcrypt hash
    console.log("\n🔍 Creating test user with bcrypt hash...");
    
    const testEmail = "test@example.com";
    const testPassword = "TestPassword123!";
    
    // Check if test user already exists
    const existingTestUser = await prisma.aspNetUsers.findFirst({
      where: { Email: testEmail }
    });
    
    if (existingTestUser) {
      console.log("ℹ️  Test user already exists, deleting...");
      await prisma.aspNetUsers.delete({
        where: { Id: existingTestUser.Id }
      });
    }

    // Generate bcrypt hash
    const bcryptHash = await bcrypt.hash(testPassword, 10);
    console.log("✅ Generated bcrypt hash:", bcryptHash.substring(0, 20) + "...");

    // Create test user
    const testUser = await prisma.aspNetUsers.create({
      data: {
        Id: crypto.randomUUID(),
        Email: testEmail,
        NormalizedEmail: testEmail.toUpperCase(),
        UserName: testEmail,
        NormalizedUserName: testEmail.toUpperCase(),
        Name: "Test User",
        PasswordHash: bcryptHash,
        IsApproved: true,
        EmailConfirmed: true,
        PhoneNumberConfirmed: false,
        TwoFactorEnabled: false,
        LockoutEnabled: false,
        AccessFailedCount: 0
      }
    });

    console.log("✅ Created test user:");
    console.log("   - Email:", testEmail);
    console.log("   - Password:", testPassword);
    console.log("   - ID:", testUser.Id);

    // Test 5: Create Admin role for test user
    console.log("\n🔍 Adding Admin role to test user...");
    
    // Find Admin role
    const adminRole = await prisma.aspNetRoles.findFirst({
      where: { Name: "Admin" }
    });

    if (adminRole) {
      // Check if role assignment already exists
      const existingRoleAssignment = await prisma.aspNetUserRoles.findFirst({
        where: { 
          UserId: testUser.Id,
          RoleId: adminRole.Id 
        }
      });

      if (!existingRoleAssignment) {
        await prisma.aspNetUserRoles.create({
          data: {
            UserId: testUser.Id,
            RoleId: adminRole.Id
          }
        });
        console.log("✅ Added Admin role to test user");
      } else {
        console.log("ℹ️  Test user already has Admin role");
      }
    } else {
      console.log("❌ Admin role not found");
    }

    // Test 6: Verify bcrypt works
    console.log("\n🔍 Testing bcrypt verification...");
    const bcryptTest = await bcrypt.compare(testPassword, bcryptHash);
    console.log("✅ Bcrypt verification works:", bcryptTest);

    console.log("\n🎉 All tests completed successfully!");
    console.log("\n📝 You can now test login with:");
    console.log("   Email: test@example.com");
    console.log("   Password: TestPassword123!");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testDatabaseAndCreateUser(); 