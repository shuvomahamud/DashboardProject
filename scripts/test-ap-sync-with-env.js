// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const { google } = require('googleapis');

const prisma = new PrismaClient();

// Google service account credentials from environment variables
function getGoogleCredentials() {
  return {
    type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE || "service_account",
    project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
    private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
    auth_uri: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
    token_uri: process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI || "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL,
    universe_domain: process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN || "googleapis.com"
  };
}

async function testApSyncWithEnv() {
  console.log('🧪 AP SYNC TEST WITH ENV LOADING');
  console.log('=================================');
  
  try {
    // Step 1: Check environment variables
    console.log('\n🔍 Step 1: Checking environment variables from .env.local...');
    
    const credentials = getGoogleCredentials();
    
    console.log('📋 Environment Variables Status:');
    console.log(`   GOOGLE_SERVICE_ACCOUNT_PROJECT_ID: ${credentials.project_id ? '✅ Present' : '❌ Missing'}`);
    console.log(`   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: ${credentials.private_key ? '✅ Present' : '❌ Missing'}`);
    console.log(`   GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: ${credentials.client_email ? '✅ Present' : '❌ Missing'}`);
    
    if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
      console.log('❌ FAILED: Required Google Service Account credentials missing');
      console.log('   Please check your .env.local file contains:');
      console.log('   - GOOGLE_SERVICE_ACCOUNT_PROJECT_ID');
      console.log('   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
      console.log('   - GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL');
      return;
    }
    
    console.log('✅ All required Google Service Account credentials found');
    
    // Step 2: Get sheet URL from database
    console.log('\n📋 Step 2: Getting AP report sheet URL from database...');
    
    const config = await prisma.$queryRaw`
      SELECT sheet_url as sheeturl 
      FROM sheet_config 
      WHERE table_key = 'ap_report'
      AND sheet_url IS NOT NULL 
      AND sheet_url != ''
    `;
    
    if (config.length === 0) {
      console.log('❌ FAILED: No AP report sheet URL configured in database');
      return;
    }
    
    const sheetUrl = config[0].sheeturl;
    console.log(`✅ Found AP report sheet URL: ${sheetUrl}`);
    
    // Step 3: Extract sheet information
    console.log('\n🔍 Step 3: Extracting sheet information...');
    
    const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!spreadsheetIdMatch) {
      console.log('❌ FAILED: Invalid Google Sheets URL format');
      return;
    }
    
    const spreadsheetId = spreadsheetIdMatch[1];
    const gidMatch = sheetUrl.match(/[?&]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    
    console.log(`✅ Spreadsheet ID: ${spreadsheetId}`);
    console.log(`✅ Sheet GID: ${gid}`);
    
    // Step 4: Test Google Sheets API connection
    console.log('\n🔗 Step 4: Testing Google Sheets API connection...');
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    try {
      const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title,index))'
      });
      
      console.log('✅ Google Sheets API connection successful');
      
      let sheetName = '';
      console.log('📊 Available sheets:');
      sheetInfo.data.sheets?.forEach((sheet, index) => {
        const props = sheet.properties;
        console.log(`   ${index + 1}. "${props?.title}" (ID: ${props?.sheetId})`);
        if (props?.sheetId?.toString() === gid) {
          console.log(`      ⭐ This is the target sheet`);
          sheetName = props?.title || '';
        }
      });
      
      if (!sheetName && sheetInfo.data.sheets && sheetInfo.data.sheets.length > 0) {
        sheetName = sheetInfo.data.sheets[0].properties?.title || '';
        console.log(`⚠️ Using first sheet: "${sheetName}"`);
      }
      
      // Step 5: Read and analyze sheet data
      console.log('\n📖 Step 5: Reading sheet data...');
      
      const range = sheetName ? `'${sheetName}'!A:AB` : 'A:AB';
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      
      const rows = response.data.values || [];
      console.log(`✅ Successfully read ${rows.length} rows from Google Sheets`);
      
      if (rows.length === 0) {
        console.log('❌ ISSUE FOUND: Sheet is empty');
        return;
      }
      
      if (rows.length === 1) {
        console.log('❌ ISSUE FOUND: Sheet only has headers, no data rows');
        return;
      }
      
      // Analyze headers
      const headers = rows[0].map(h => String(h).toLowerCase().trim());
      console.log(`✅ Found ${headers.length} headers`);
      
      // Check for required fields (dates are now optional)
      const requiredFields = ['candidatename', 'totalhours', 'invoice'];
      const missingFields = requiredFields.filter(field => !headers.includes(field));
      
      if (missingFields.length > 0) {
        console.log(`❌ ISSUE FOUND: Missing required headers: ${missingFields.join(', ')}`);
        console.log('📋 Available headers:', headers.join(', '));
        return;
      }
      
      console.log('✅ All required headers found');
      
      // Analyze first few data rows
      const dataRows = rows.slice(1, 4);
      console.log(`\n📊 Analyzing first ${dataRows.length} data rows...`);
      
      let validRows = 0;
      dataRows.forEach((row, index) => {
        const candidateNameIndex = headers.indexOf('candidatename');
        const invoiceIndex = headers.indexOf('invoice');
        const startDateIndex = headers.indexOf('startdate');
        const endDateIndex = headers.indexOf('enddate');
        
        const candidateName = candidateNameIndex >= 0 ? row[candidateNameIndex] : '';
        const invoice = invoiceIndex >= 0 ? row[invoiceIndex] : '';
        const startDate = startDateIndex >= 0 ? row[startDateIndex] : '';
        const endDate = endDateIndex >= 0 ? row[endDateIndex] : '';
        
        const isValid = candidateName?.trim() && invoice?.trim(); // Dates are now optional
        
        console.log(`   Row ${index + 1}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
        console.log(`      CandidateName: "${candidateName}"`);
        console.log(`      Invoice: "${invoice}"`);
        console.log(`      StartDate: "${startDate}" (optional)`);
        console.log(`      EndDate: "${endDate}" (optional)`);
        
        if (isValid) validRows++;
      });
      
      console.log(`\n📊 Summary: ${validRows}/${dataRows.length} sample rows would pass validation`);
      
      if (validRows === 0) {
        console.log('❌ ISSUE FOUND: No valid data rows found');
        console.log('   All rows are missing required fields (CandidateName, Invoice)');
        return;
      }
      
      console.log('✅ Sheet data looks good for processing');
      
      // Step 6: Test actual sync call
      console.log('\n🔄 Step 6: Testing actual sync endpoint...');
      
      try {
        const syncResponse = await fetch('http://localhost:3000/api/sheets/ap/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (!syncResponse.ok) {
          console.log(`❌ Sync endpoint failed with status: ${syncResponse.status}`);
          const errorText = await syncResponse.text();
          console.log(`   Error: ${errorText}`);
          return;
        }
        
        const syncResult = await syncResponse.json();
        console.log('✅ Sync endpoint responded successfully');
        console.log(`📊 Result: ${syncResult.inserted} inserted, ${syncResult.updated} updated, ${syncResult.deleted} deleted`);
        
        if (syncResult.inserted === 0 && syncResult.updated === 0 && syncResult.deleted === 0) {
          console.log('❌ ISSUE FOUND: Sync returned 0 operations despite valid data');
          console.log('   Check the server logs for detailed debugging output');
          console.log('   The issue might be in the sync route logic itself');
        } else {
          console.log('✅ Sync worked correctly!');
        }
        
      } catch (fetchError) {
        console.log('❌ Could not test sync endpoint (server might not be running)');
        console.log(`   Error: ${fetchError.message}`);
        console.log('   Start your dev server with: npm run dev');
      }
      
    } catch (authError) {
      console.log('❌ FAILED: Google Sheets authentication error');
      console.log(`   Error: ${authError.message}`);
      console.log('   Please check:');
      console.log('   1. Service account has access to the sheet');
      console.log('   2. Private key format is correct (with \\n for newlines)');
      console.log('   3. Sheet URL is correct');
    }
    
  } catch (error) {
    console.log('\n❌ TEST FAILED:');
    console.log(`   Error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('\n=================================');
  console.log('🧪 AP SYNC TEST COMPLETED');
}

// Run the test
testApSyncWithEnv().catch(console.error); 