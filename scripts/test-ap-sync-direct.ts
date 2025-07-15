import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';

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

// Header mapping function (copied from the sync route)
function clean(h: string) {
  return h.toLowerCase().replace(/\s|_/g, "");
}

function sheetHeadersToDbFields(headerRow: string[]) {
  const map: Record<number, string> = {};

  headerRow.forEach((h, idx) => {
    switch (clean(h)) {
      case "apid":                     map[idx] = "AP_ID"; break;
      case "startdate":                map[idx] = "StartDate"; break;
      case "enddate":                  map[idx] = "EndDate"; break;
      case "authorizeduser":
      case "agencyauthorizeduser":
      case "agency/authorizeduser":
      case "agency":                   map[idx] = "AgencyAuthorizedUser"; break;
      case "taskorder":
      case "taskorder#(s)":
      case "taskordernumber":          map[idx] = "TaskOrderNumber"; break;
      case "candidatename":
      case "candidate":                map[idx] = "CandidateName"; break;
      case "region":                   map[idx] = "Region"; break;
      case "jobtitle":                 map[idx] = "JobTitle"; break;
      case "skilllevel":               map[idx] = "SkillLevel"; break;
      case "totalhours":
      case "hours":                    map[idx] = "TotalHours"; break;
      case "approvedtimesheetreceived":
      case "timesheetapprovaldate":
      case "timesheetapproveddate":    map[idx] = "TimesheetApprovalDate"; break;
      case "hourlywagerate":
      case "hourlyrate":
      case "hourlywagerate(base)":     map[idx] = "HourlyWageRateBase"; break;
      case "hourlywageratewithmarkup":
      case "hourlywagerate(+mark-up)": map[idx] = "HourlyWageRateWithMarkup"; break;
      case "markup":
      case "mark-up":
      case "mark-up%":                 map[idx] = "MarkUpPercent"; break;
      case "totalbilledtoclient":
      case "totalbilledtoogs/client":
      case "totalbilled":              map[idx] = "TotalBilledOGSClient"; break;
      case "paidtovendor":             map[idx] = "PaidToVendor"; break;
      case "vendorname":               map[idx] = "VendorName"; break;
      case "hrssharedbyvendor":
      case "vendorhours":
      case "hoursonvendorinvoice":     map[idx] = "VendorHours"; break;
      case "hoursmatchinvoice":
      case "hoursmatchinvoice(y/n)":   map[idx] = "HoursMatchInvoice"; break;
      case "invoice":
      case "invoice#":
      case "invoiceno":
      case "inv.no":
      case "invno":
      case "invoicenumber":            map[idx] = "InvoiceNumber"; break;
      case "vendorinvoiceremarks":
      case "invoiceremarks":
      case "remarks":                  map[idx] = "VendorInvoiceRemarks"; break;
      case "vendorinvoicedate":
      case "invoicedate":              map[idx] = "VendorInvoiceDate"; break;
      case "istimesheetapproved":
      case "timesheetsapproved":
      case "timesheetsapproved(y/n)":  map[idx] = "TimesheetsApproved"; break;
      case "remark":                   map[idx] = "Remark"; break;
      case "pmttermnet":
      case "paymentterm":
      case "paymenttermnet":           map[idx] = "PaymentTermNet"; break;
      case "paymentmode":
      case "paymentmethod":            map[idx] = "PaymentMode"; break;
      case "paymentduedate":
      case "duedate":                  map[idx] = "PaymentDueDate"; break;
      case "check":
      case "check#":
      case "checknumber":              map[idx] = "Check"; break;
      // SNo intentionally ignored
    }
  });

  return map;
}

async function testApSyncDirect() {
  console.log('🧪 DIRECT AP SYNC TEST STARTED');
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
    
    // Step 2: Extract sheet information
    console.log('\n🔍 Step 2: Extracting sheet information...');
    
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
    
    // Step 3: Test Google Sheets API connection
    console.log('\n🔗 Step 3: Testing Google Sheets API connection...');
    
    const credentials = getGoogleCredentials();
    
    if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
      console.log('❌ FAILED: Google Cloud Service Account credentials not properly configured');
      console.log('   Missing required environment variables:');
      console.log(`   - GOOGLE_SERVICE_ACCOUNT_PROJECT_ID: ${credentials.project_id ? '✅' : '❌'}`);
      console.log(`   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: ${credentials.private_key ? '✅' : '❌'}`);
      console.log(`   - GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: ${credentials.client_email ? '✅' : '❌'}`);
      return;
    }
    
    console.log('✅ Google credentials configured');
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Step 4: Test permissions
    console.log('\n🔐 Step 4: Testing Google Sheets permissions...');
    
    try {
      const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title,index))'
      });
      
      console.log('✅ Google Sheets permissions confirmed');
      
      let sheetName = '';
      console.log('📊 Available sheets in this document:');
      sheetInfo.data.sheets?.forEach((sheet, index) => {
        const props = sheet.properties;
        console.log(`   ${index + 1}. "${props?.title}" (ID: ${props?.sheetId}, Index: ${props?.index})`);
        if (props?.sheetId?.toString() === gid) {
          console.log(`      ⭐ This is the target sheet`);
          sheetName = props?.title || '';
        }
      });
      
      if (!sheetName && sheetInfo.data.sheets && sheetInfo.data.sheets.length > 0) {
        sheetName = sheetInfo.data.sheets[0].properties?.title || '';
        console.log(`⚠️ Sheet with gid ${gid} not found, using first sheet: "${sheetName}"`);
      }
      
      console.log(`✅ Using sheet: "${sheetName}"`);
      
      // Step 5: Read sheet data
      console.log('\n📖 Step 5: Reading sheet data...');
      
      const range = sheetName ? `'${sheetName}'!A:AB` : 'A:AB';
      console.log(`📖 Reading from range: ${range}`);
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      
      const rows = response.data.values || [];
      console.log(`✅ Successfully read ${rows.length} rows from Google Sheets`);
      
      if (rows.length === 0) {
        console.log('❌ ISSUE FOUND: Sheet has no data rows');
        return;
      }
      
      // Step 6: Analyze headers
      console.log('\n🔍 Step 6: Analyzing sheet headers...');
      
      const headerRow = rows[0];
      const headers = headerRow.map(h => String(h).toLowerCase().trim());
      
      console.log('📋 Raw headers from sheet:');
      headerRow.forEach((header, index) => {
        console.log(`   ${index}: "${header}"`);
      });
      
      console.log('📋 Cleaned headers:');
      headers.forEach((header, index) => {
        console.log(`   ${index}: "${header}"`);
      });
      
      // Step 7: Test header mapping
      console.log('\n🗺️ Step 7: Testing header mapping...');
      
      const headerToFieldMap = sheetHeadersToDbFields(headers);
      
      console.log('📋 Header mapping results:');
      Object.entries(headerToFieldMap).forEach(([index, field]) => {
        console.log(`   Column ${index}: "${headers[parseInt(index)]}" → "${field}"`);
      });
      
      const mappedFieldsCount = Object.keys(headerToFieldMap).length;
      console.log(`✅ Mapped ${mappedFieldsCount} columns to database fields`);
      
      // Step 8: Check required headers
      console.log('\n✅ Step 8: Checking required headers...');
      
      const requiredHeaders = ['candidatename', 'totalhours', 'invoice', 'startdate', 'enddate'];
      const missingHeaders = [];
      
      for (const requiredHeader of requiredHeaders) {
        const found = headers.includes(requiredHeader);
        console.log(`   ${requiredHeader}: ${found ? '✅ Found' : '❌ Missing'}`);
        if (!found) {
          missingHeaders.push(requiredHeader);
        }
      }
      
      if (missingHeaders.length > 0) {
        console.log(`❌ ISSUE FOUND: Missing required headers: ${missingHeaders.join(', ')}`);
        return;
      }
      
      // Step 9: Analyze data rows
      console.log('\n📊 Step 9: Analyzing data rows...');
      
      if (rows.length === 1) {
        console.log('❌ ISSUE FOUND: Sheet only has header row, no data rows');
        return;
      }
      
      console.log(`✅ Sheet has ${rows.length - 1} data rows`);
      
      // Analyze first few data rows
      const dataRows = rows.slice(1, Math.min(4, rows.length));
      console.log('📊 First 3 data rows:');
      
      dataRows.forEach((row, index) => {
        const rowNum = index + 1;
        console.log(`   Row ${rowNum}: [${row.join(' | ')}]`);
        
        // Check if this row would be processed
        const candidateNameIndex = headers.indexOf('candidatename');
        const invoiceIndex = headers.indexOf('invoice');
        const startDateIndex = headers.indexOf('startdate');
        const endDateIndex = headers.indexOf('enddate');
        
        const candidateName = candidateNameIndex >= 0 ? row[candidateNameIndex] : '';
        const invoice = invoiceIndex >= 0 ? row[invoiceIndex] : '';
        const startDate = startDateIndex >= 0 ? row[startDateIndex] : '';
        const endDate = endDateIndex >= 0 ? row[endDateIndex] : '';
        
        console.log(`      CandidateName: "${candidateName}"`);
        console.log(`      Invoice: "${invoice}"`);
        console.log(`      StartDate: "${startDate}"`);
        console.log(`      EndDate: "${endDate}"`);
        
        // Check if this row would pass validation
        const hasRequiredFields = candidateName?.trim() && invoice?.trim();
        const hasRequiredDates = startDate && endDate;
        
        console.log(`      Would pass validation: ${hasRequiredFields && hasRequiredDates ? '✅ Yes' : '❌ No'}`);
        
        if (!hasRequiredFields) {
          console.log(`      ⚠️ Missing required fields: ${!candidateName?.trim() ? 'CandidateName ' : ''}${!invoice?.trim() ? 'Invoice' : ''}`);
        }
        
        if (!hasRequiredDates) {
          console.log(`      ⚠️ Missing required dates: ${!startDate ? 'StartDate ' : ''}${!endDate ? 'EndDate' : ''}`);
        }
      });
      
      // Step 10: Final diagnosis
      console.log('\n🔍 Step 10: Final diagnosis...');
      
      console.log('✅ All checks passed! The issue might be in the sync logic itself.');
      console.log('');
      console.log('🔍 Recommendations:');
      console.log('   1. Check server logs when running the actual sync');
      console.log('   2. Verify the data validation logic in the sync route');
      console.log('   3. Ensure the transaction logic is working correctly');
      console.log('   4. Check if items are being added to the processing arrays');
      
    } catch (permError) {
      console.log('❌ FAILED: Google Sheets permission error');
      console.log(`   Error: ${permError instanceof Error ? permError.message : 'Permission error'}`);
      console.log('   Please check:');
      console.log('   1. Service account has access to the sheet');
      console.log('   2. Sheet URL is correct and accessible');
      console.log('   3. Sheet is not private or restricted');
    }
    
  } catch (error) {
    console.log('\n❌ TEST FAILED WITH ERROR:');
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(`   Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
  } finally {
    await prisma.$disconnect();
  }
  
  console.log('\n=====================================');
  console.log('🧪 DIRECT AP SYNC TEST COMPLETED');
}

// Run the test
testApSyncDirect().catch(console.error); 