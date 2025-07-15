import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

interface SyncResult {
  inserted: number;
  updated: number;
  deleted: number;
}

async function testApSync() {
  console.log('🧪 AUTOMATED AP SYNC TEST STARTED');
  console.log('=====================================');
  
  try {
    // Step 1: Get the AP report sheet URL from database
    console.log('\n📋 Step 1: Getting AP report sheet configuration from database...');
    
    const config = await prisma.$queryRaw`
      SELECT sheet_url as sheeturl 
      FROM sheet_config 
      WHERE table_key = 'ap_report'
      AND sheet_url IS NOT NULL 
      AND sheet_url != ''
    ` as Array<{sheeturl: string}>;
    
    if (config.length === 0) {
      console.log('❌ FAILED: No AP report sheet URL configured in database');
      console.log('   Please configure the sheet URL in the Sheet Sync page first.');
      return;
    }
    
    const sheetUrl = config[0].sheeturl;
    console.log(`✅ Found AP report sheet URL: ${sheetUrl}`);
    
    // Step 2: Check current database state
    console.log('\n📊 Step 2: Checking current database state...');
    
    const currentRecords = await prisma.aP_Report.findMany({
      select: {
        AP_ID: true,
        CandidateName: true,
        InvoiceNumber: true,
        StartDate: true,
        EndDate: true
      },
      orderBy: { AP_ID: 'desc' },
      take: 5
    });
    
    console.log(`📊 Current database has ${currentRecords.length} AP records`);
    if (currentRecords.length > 0) {
      console.log('📊 Latest 5 records:');
      currentRecords.forEach((record, i) => {
        console.log(`   ${i + 1}. AP_ID: ${record.AP_ID}, Name: "${record.CandidateName}", Invoice: "${record.InvoiceNumber}"`);
      });
    }
    
    // Step 3: Test the sync endpoint
    console.log('\n🔄 Step 3: Testing AP sync endpoint...');
    
    const startTime = performance.now();
    
    // Call the sync endpoint
    const syncResponse = await fetch('http://localhost:3000/api/sheets/ap/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In a real scenario, we'd need proper authentication
        // For testing, we'll assume the endpoint handles auth internally
      }
    });
    
    const syncResult = await syncResponse.json();
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    console.log(`⏱️  Sync completed in ${duration}ms`);
    console.log(`📊 HTTP Status: ${syncResponse.status}`);
    
    if (!syncResponse.ok) {
      console.log('❌ SYNC FAILED:');
      console.log(`   Status: ${syncResponse.status}`);
      console.log(`   Error: ${syncResult.error || 'Unknown error'}`);
      return;
    }
    
    // Step 4: Analyze sync results
    console.log('\n📊 Step 4: Analyzing sync results...');
    
    const result = syncResult as SyncResult;
    console.log(`✅ Sync completed successfully:`);
    console.log(`   📥 Inserted: ${result.inserted}`);
    console.log(`   🔄 Updated: ${result.updated}`);
    console.log(`   🗑️  Deleted: ${result.deleted}`);
    console.log(`   🎯 Total operations: ${result.inserted + result.updated + result.deleted}`);
    
    // Step 5: Check database state after sync
    console.log('\n📊 Step 5: Checking database state after sync...');
    
    const afterRecords = await prisma.aP_Report.findMany({
      select: {
        AP_ID: true,
        CandidateName: true,
        InvoiceNumber: true,
        StartDate: true,
        EndDate: true
      },
      orderBy: { AP_ID: 'desc' },
      take: 5
    });
    
    console.log(`📊 Database now has ${afterRecords.length} AP records`);
    if (afterRecords.length > 0) {
      console.log('📊 Latest 5 records after sync:');
      afterRecords.forEach((record, i) => {
        console.log(`   ${i + 1}. AP_ID: ${record.AP_ID}, Name: "${record.CandidateName}", Invoice: "${record.InvoiceNumber}"`);
      });
    }
    
    // Step 6: Diagnosis
    console.log('\n🔍 Step 6: Diagnosis...');
    
    if (result.inserted === 0 && result.updated === 0 && result.deleted === 0) {
      console.log('🚨 ISSUE DETECTED: No operations performed (0 inserts, 0 updates, 0 deletions)');
      console.log('');
      console.log('🔍 Possible causes:');
      console.log('   1. 📋 Sheet has no data rows (only headers)');
      console.log('   2. 🔤 Header mapping issues - sheet headers don\'t match expected format');
      console.log('   3. ✅ Data validation failures - required fields missing or invalid');
      console.log('   4. 📅 Date parsing issues - invalid date formats causing row skips');
      console.log('   5. 🔗 Sheet permissions - unable to read sheet content');
      console.log('   6. 🐛 Code logic errors - items not being added to processing arrays');
      console.log('');
      console.log('💡 Next steps:');
      console.log('   1. Check server logs for detailed debugging output');
      console.log('   2. Verify sheet has data rows with valid values');
      console.log('   3. Check sheet header names match expected format');
      console.log('   4. Verify required fields (CandidateName, InvoiceNumber, StartDate, EndDate) are present');
      console.log('   5. Check date formats are valid (YYYY-MM-DD or MM/DD/YYYY)');
    } else {
      console.log('✅ Sync performed operations successfully!');
      console.log(`   🎯 Total changes: ${result.inserted + result.updated + result.deleted}`);
    }
    
    // Step 7: Additional debugging info
    console.log('\n🔧 Step 7: Additional debugging information...');
    
    // Check if the sync endpoint is working by testing with a simple call
    console.log('Testing basic endpoint connectivity...');
    try {
      const basicTest = await fetch('http://localhost:3000/api/sheets/config', {
        method: 'GET'
      });
      console.log(`✅ Basic API connectivity: ${basicTest.status}`);
    } catch (error) {
      console.log('❌ Basic API connectivity failed:', error);
    }
    
    // Check environment variables
    console.log('\n🔧 Environment check:');
    const requiredEnvs = [
      'GOOGLE_SERVICE_ACCOUNT_PROJECT_ID',
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
      'GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'
    ];
    
    requiredEnvs.forEach(env => {
      const value = process.env[env];
      console.log(`   ${env}: ${value ? '✅ Present' : '❌ Missing'}`);
    });
    
  } catch (error) {
    console.log('\n❌ TEST FAILED WITH ERROR:');
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(`   Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('\n=====================================');
  console.log('🧪 AUTOMATED AP SYNC TEST COMPLETED');
}

// Run the test
testApSync().catch(console.error); 