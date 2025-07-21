/**
 * RBAC System Test Script
 * Tests the complete Role-Based Access Control implementation
 */

import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcrypt';

interface TestUser {
  email: string;
  password: string;
  roles: string[];
  id?: string;
}

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  details: any;
  timestamp: string;
}

interface PermissionResult {
  email: string;
  expectedRoles: string[];
  actualRoles: string[];
  expectedTables: string[];
  actualTables: string[];
  permissionsMatch: boolean;
}

interface TestReport {
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    successRate: string;
    timestamp: string;
  };
  results: TestResult[];
  recommendations: string[];
}

// Test configuration
const TEST_USERS = [
  { email: 'admin@test.com', password: 'AdminTest123!', roles: ['Admin'] },
  { email: 'ap@test.com', password: 'ApTest123!', roles: ['AP_Report_RW'] },
  { email: 'todo@test.com', password: 'TodoTest123!', roles: ['Todo_RW'] },
  { email: 'interview@test.com', password: 'InterviewTest123!', roles: ['Interviews_RW'] },
  { email: 'multi@test.com', password: 'MultiTest123!', roles: ['AP_Report_RW', 'Todo_RW'] },
];

const API_ENDPOINTS = [
  { path: '/api/accounts-payable', requiredTable: 'ap_report' },
  { path: '/api/todo', requiredTable: 'todo_list' },
  { path: '/api/interviews', requiredTable: 'interviews' },
  { path: '/api/onboarding', requiredTable: 'onboarding' },
  { path: '/api/sheets/ap/sync', requiredTable: '*' },
  { path: '/api/admin/users', requiredTable: '*' },
  { path: '/api/admin/roles', requiredTable: '*' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  'Admin': ['*'],
  'AP_Report_RW': ['ap_report'],
  'Todo_RW': ['todo_list'],
  'Interviews_RW': ['interviews'],
  'Onboarding_RW': ['onboarding'],
};

let testResults: TestResult[] = [];
let testUsers: TestUser[] = [];

function log(message: string, type: string = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function addTestResult(testName: string, passed: boolean, message: string = '', details: any = {}) {
  const result = {
    testName,
    passed,
    message,
    details,
    timestamp: new Date().toISOString()
  };
  testResults.push(result);
  
  if (passed) {
    log(`${testName}: PASSED${message ? ' - ' + message : ''}`, 'success');
  } else {
    log(`${testName}: FAILED${message ? ' - ' + message : ''}`, 'error');
  }
}

async function cleanupTestUsers() {
  log('Cleaning up test users...');
  try {
    // Delete test users
    for (const testUser of TEST_USERS) {
      await prisma.aspNetUsers.deleteMany({
        where: { Email: testUser.email }
      });
    }
    log('Test users cleaned up successfully');
  } catch (error) {
    log(`Error cleaning up test users: ${error.message}`, 'error');
  }
}

async function createTestUsers() {
  log('Creating test users...');
  
  try {
    // Get all roles
    const roles = await prisma.aspNetRoles.findMany();
    const roleMap = roles.reduce((acc, role) => {
      acc[role.Name] = role.Id;
      return acc;
    }, {});

    for (const testUser of TEST_USERS) {
      const hashedPassword = await bcrypt.hash(testUser.password, 10);
      
      // Create user
      const user = await prisma.aspNetUsers.create({
        data: {
          Id: crypto.randomUUID(),
          Email: testUser.email,
          NormalizedEmail: testUser.email.toUpperCase(),
          PasswordHash: hashedPassword,
          EmailConfirmed: true,
          UserName: testUser.email,
          NormalizedUserName: testUser.email.toUpperCase(),
          SecurityStamp: crypto.randomUUID(),
          ConcurrencyStamp: crypto.randomUUID(),
          PhoneNumberConfirmed: false,
          TwoFactorEnabled: false,
          LockoutEnabled: false,
          AccessFailedCount: 0,
          IsApproved: true,
          Name: testUser.email.split('@')[0]
        }
      });

      // Add roles
      for (const roleName of testUser.roles) {
        const roleId = roleMap[roleName];
        if (roleId) {
          await prisma.aspNetUserRoles.create({
            data: {
              UserId: user.Id,
              RoleId: roleId
            }
          });
        }
      }

      testUsers.push({ ...testUser, id: user.Id });
    }

    addTestResult('Create Test Users', true, `Created ${testUsers.length} test users`);
  } catch (error) {
    addTestResult('Create Test Users', false, error.message);
    throw error;
  }
}

async function testRolePermissions() {
  log('Testing role permissions...');
  
  try {
    const users = await prisma.aspNetUsers.findMany({
      where: {
        Email: { in: TEST_USERS.map(u => u.email) }
      },
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

    let allPermissionsCorrect = true;
    const permissionResults = [];

    for (const user of users) {
      const userEmail = user.Email;
      const expectedRoles = TEST_USERS.find(u => u.email === userEmail)?.roles || [];
      
      // Get user's table permissions
      const userTables = new Set();
      user.AspNetUserRoles.forEach(userRole => {
        userRole.AspNetRoles.AspNetRoleClaims.forEach(claim => {
          if (claim.ClaimType === 'table') {
            userTables.add(claim.ClaimValue);
          }
        });
      });

      // Calculate expected permissions
      const expectedTables = new Set();
      expectedRoles.forEach(roleName => {
        const rolePermissions = ROLE_PERMISSIONS[roleName] || [];
        rolePermissions.forEach(permission => {
          expectedTables.add(permission);
        });
      });

      // Compare permissions
      const actualArray = Array.from(userTables).sort();
      const expectedArray = Array.from(expectedTables).sort();
      const permissionsMatch = JSON.stringify(actualArray) === JSON.stringify(expectedArray);

      if (!permissionsMatch) {
        allPermissionsCorrect = false;
      }

      permissionResults.push({
        email: userEmail,
        expectedRoles,
        actualRoles: user.AspNetUserRoles.map(ur => ur.AspNetRoles.Name),
        expectedTables: expectedArray,
        actualTables: actualArray,
        permissionsMatch
      });
    }

    addTestResult('Role Permissions', allPermissionsCorrect, 
      allPermissionsCorrect ? 'All users have correct permissions' : 'Some users have incorrect permissions',
      { permissionResults }
    );

    return allPermissionsCorrect;
  } catch (error) {
    addTestResult('Role Permissions', false, error.message);
    return false;
  }
}

async function testDatabaseConnections() {
  log('Testing database connections...');
  
  try {
    // Test each table
    const tables = [
      { name: 'AspNetUsers', prismaModel: 'aspNetUsers' },
      { name: 'AspNetRoles', prismaModel: 'aspNetRoles' },
      { name: 'AspNetUserRoles', prismaModel: 'aspNetUserRoles' },
      { name: 'AspNetRoleClaims', prismaModel: 'aspNetRoleClaims' },
      { name: 'AP_Report', prismaModel: 'aP_Report' },
      { name: 'todo_list', prismaModel: 'todo_list' },
      { name: 'interviews', prismaModel: 'interviews' },
      { name: 'onboarding', prismaModel: 'onboarding' },
    ];

    let allTablesAccessible = true;
    const tableResults = [];

    for (const table of tables) {
      try {
        const count = await prisma[table.prismaModel].count();
        tableResults.push({
          table: table.name,
          accessible: true,
          count,
          error: null
        });
      } catch (error) {
        allTablesAccessible = false;
        tableResults.push({
          table: table.name,
          accessible: false,
          count: 0,
          error: error.message
        });
      }
    }

    addTestResult('Database Connections', allTablesAccessible,
      allTablesAccessible ? 'All tables accessible' : 'Some tables inaccessible',
      { tableResults }
    );

    return allTablesAccessible;
  } catch (error) {
    addTestResult('Database Connections', false, error.message);
    return false;
  }
}

async function testPermissionLogic() {
  log('Testing permission logic...');
  
  try {
    // Test the permission checking logic
    const testCases = [
      { userTables: ['*'], requiredTable: 'ap_report', shouldPass: true },
      { userTables: ['*'], requiredTable: 'any_table', shouldPass: true },
      { userTables: ['ap_report'], requiredTable: 'ap_report', shouldPass: true },
      { userTables: ['ap_report'], requiredTable: 'todo_list', shouldPass: false },
      { userTables: ['ap_report', 'todo_list'], requiredTable: 'ap_report', shouldPass: true },
      { userTables: ['ap_report', 'todo_list'], requiredTable: 'interviews', shouldPass: false },
      { userTables: [], requiredTable: 'ap_report', shouldPass: false },
    ];

    let allTestsPassed = true;
    const logicResults = [];

    for (const testCase of testCases) {
      // Simulate the permission check logic
      const hasPermission = testCase.userTables.includes('*') || 
                          testCase.userTables.includes(testCase.requiredTable);
      
      const testPassed = hasPermission === testCase.shouldPass;
      if (!testPassed) {
        allTestsPassed = false;
      }

      logicResults.push({
        ...testCase,
        actualResult: hasPermission,
        testPassed
      });
    }

    addTestResult('Permission Logic', allTestsPassed,
      allTestsPassed ? 'All permission logic tests passed' : 'Some permission logic tests failed',
      { logicResults }
    );

    return allTestsPassed;
  } catch (error) {
    addTestResult('Permission Logic', false, error.message);
    return false;
  }
}

async function generateTestReport() {
  log('Generating test report...');
  
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  const successRate = totalTests > 0 ? (passedTests / totalTests * 100).toFixed(2) : 0;

  const report = {
    summary: {
      totalTests,
      passedTests,
      failedTests,
      successRate: `${successRate}%`,
      timestamp: new Date().toISOString()
    },
    results: testResults,
    recommendations: []
  };

  // Add recommendations based on failures
  if (failedTests > 0) {
    report.recommendations.push('Review failed tests and fix underlying issues');
    report.recommendations.push('Check database schema and permissions');
    report.recommendations.push('Verify role claims are correctly configured');
  }

  if (successRate < 100) {
    report.recommendations.push('Run tests again after fixes to ensure stability');
  }

  log(`\n${'='.repeat(50)}`);
  log('RBAC SYSTEM TEST REPORT');
  log(`${'='.repeat(50)}`);
  log(`Total Tests: ${totalTests}`);
  log(`Passed: ${passedTests}`, 'success');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'error' : 'success');
  log(`Success Rate: ${successRate}%`);
  log(`${'='.repeat(50)}\n`);

  if (failedTests > 0) {
    log('Failed Tests:', 'error');
    testResults.filter(r => !r.passed).forEach(result => {
      log(`  - ${result.testName}: ${result.message}`, 'error');
    });
  }

  return report;
}

async function runTests() {
  log('Starting RBAC System Tests...');
  
  try {
    // Cleanup any existing test users
    await cleanupTestUsers();
    
    // Run tests
    await createTestUsers();
    await testDatabaseConnections();
    await testRolePermissions();
    await testPermissionLogic();
    
    // Generate report
    const report = await generateTestReport();
    
    // Cleanup
    await cleanupTestUsers();
    
    log('RBAC System Tests completed!');
    return report;
    
  } catch (error) {
    log(`Critical error during testing: ${error.message}`, 'error');
    
    // Attempt cleanup even on error
    try {
      await cleanupTestUsers();
    } catch (cleanupError) {
      log(`Error during cleanup: ${cleanupError.message}`, 'error');
    }
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests if called directly
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});

export { runTests }; 