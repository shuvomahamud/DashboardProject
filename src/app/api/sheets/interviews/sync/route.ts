import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { checkTablePermission } from '@/lib/auth/withTableAuthAppRouter';

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

// Column mapping from Google Sheets to database fields
const interviewsColumnMap = {
  'HBITS': 'hbits_no',
  'Position': 'position',
  'Level': 'level',
  'MailReceivedDate': 'mailreceiveddate',
  'ConsultantName': 'consultantname',
  'ClientSuggestedDates': 'clientsuggesteddates',
  'MailedDateToConsultant': 'maileddatestoconsultant',
  'InterviewTimeOptedFor': 'interviewtimeoptedfor',
  'ScheduledMailToMrDave': 'interviewscheduledmailedtomr',
  'TimeConfirmedByClient': 'interviewconfirmedbyclient',
  'TimeOfInterview': 'timeofinterview',
  'ThruRecruiter': 'thrurecruiter',
  'ConsultantContactNo': 'consultantcontactno',
  'ConsultantEmail': 'consultantemail',
  'VendorPOCName': 'vendorpocname',
  'VendorNumber': 'vendornumber',
  'VendorEmailId': 'vendoremailid',
  'CandidateSelected': 'candidateselected',
  'Remark': 'remark',
  'Status': 'status',
  'clientconfmailreceived': 'clientconfmailreceived',
  'mailsenttoconsultant': 'mailsenttoconsultant',
  'mailreceivedfromconsultant': 'mailreceivedfromconsultant',
  'confemailccvendor': 'confemailccvendor',
  'InterviewID': 'interviewid'
};

interface InterviewItem {
  interviewid?: number | null;
  hbits_no?: string;
  position?: string;
  level?: number | null;
  mailreceiveddate?: Date | null;
  consultantname?: string;
  clientsuggesteddates?: string;
  maileddatestoconsultant?: Date | null;
  interviewtimeoptedfor?: string;
  interviewscheduledmailedtomr?: boolean;
  interviewconfirmedbyclient?: Date | null;
  timeofinterview?: Date | null;
  thrurecruiter?: string;
  consultantcontactno?: string;
  consultantemail?: string;
  vendorpocname?: string;
  vendornumber?: string;
  vendoremailid?: string;
  candidateselected?: string;
  remark?: string;
  status?: string;
  clientconfmailreceived?: boolean;
  mailsenttoconsultant?: boolean;
  mailreceivedfromconsultant?: boolean;
  confemailccvendor?: boolean;
  monthyear?: string;
  rowIndex?: number;
}

interface SyncResult {
  inserted: number;
  updated: number;
  deleted: number;
}

// Helper function to parse boolean values
function parseBoolean(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1';
}

// Helper function to parse date values
function parseDate(value: string): Date | null {
  if (!value || value.trim() === '') return null;
  const parsedDate = new Date(value.trim());
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

// Helper function to parse integer values
function parseInt(value: string): number | null {
  if (!value || value.trim() === '' || value.trim().toUpperCase() === 'NA') return null;
  const parsed = Number(value.trim());
  return isNaN(parsed) ? null : parsed;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check admin permissions (sync is admin-only)
    const session = await checkTablePermission('*');
    console.log(`🔐 Admin user "${session.user.name}" (${session.user.email}) initiated interviews sync`);

    // Get sheet URL from sheet_config table
    const config = await prisma.$queryRaw`
      SELECT sheet_url as sheeturl 
      FROM sheet_config 
      WHERE table_key = 'interview'
      AND sheet_url IS NOT NULL 
      AND sheet_url != ''
    ` as Array<{sheeturl: string}>;
    
    if (config.length === 0) {
      return NextResponse.json({ 
        error: "No URL configured for 'interview'" 
      }, { status: 404 });
    }

    const sheetUrl = config[0].sheeturl;
    
    // Extract spreadsheet ID and sheet ID from URL
    const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!spreadsheetIdMatch) {
      return NextResponse.json({ 
        error: 'Invalid Google Sheets URL format' 
      }, { status: 422 });
    }
    
    const spreadsheetId = spreadsheetIdMatch[1];
    const gidMatch = sheetUrl.match(/[?&]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    // Initialize Google Sheets API
    const credentials = getGoogleCredentials();
    
    // Validate that required credentials are present
    if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
      return NextResponse.json({ 
        error: 'Google Cloud Service Account credentials not properly configured' 
      }, { status: 500 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // Quick permissions test
    try {
      console.log('🔐 Testing Google Sheets permissions...');
      await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title'
      });
      console.log('✅ Google Sheets permissions confirmed');
    } catch (permError) {
      console.error('❌ Google Sheets permission error:', permError);
      return NextResponse.json({ 
        error: `Google Sheets access denied: ${permError instanceof Error ? permError.message : 'Permission error'}` 
      }, { status: 403 });
    }

    // Get sheet information first
    console.log('📋 SHEET INFORMATION:');
    console.log(`Spreadsheet ID: ${spreadsheetId}`);
    console.log(`Sheet GID: ${gid}`);
    console.log(`Full URL: ${sheetUrl}`);
    
    // Get sheet metadata to understand the structure
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title,index))'
    });
    
    console.log('📊 Available sheets in this document:');
    let sheetName = '';
    sheetInfo.data.sheets?.forEach((sheet, index) => {
      const props = sheet.properties;
      console.log(`  ${index + 1}. "${props?.title}" (ID: ${props?.sheetId}, Index: ${props?.index})`);
      if (props?.sheetId?.toString() === gid) {
        console.log(`     ⭐ This is the sheet we're reading from`);
        sheetName = props?.title || '';
      }
    });
    
    // If no sheet found by gid, try to use the first sheet
    if (!sheetName && sheetInfo.data.sheets && sheetInfo.data.sheets.length > 0) {
      sheetName = sheetInfo.data.sheets[0].properties?.title || '';
      console.log(`⚠️ Sheet with gid ${gid} not found, using first sheet: "${sheetName}"`);
    }
    
    console.log(`📋 Using sheet: "${sheetName}"`);
    
    // Read from the specific sheet
    const range = sheetName ? `'${sheetName}'!A:Z` : 'A:Z';
    console.log(`📖 Reading from range: ${range}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return NextResponse.json({ 
        error: 'No data found in sheet' 
      }, { status: 422 });
    }
    
    console.log(`📝 Reading from range A:Z, found ${rows.length} rows`);
    console.log(`📝 First few rows of data:`);
    rows.slice(0, 3).forEach((row, index) => {
      console.log(`  Row ${index + 1}: [${row.join(', ')}]`);
    });

    // Check and manage InterviewID column
    let headers = rows[0].map((h: any) => String(h).trim());
    let interviewIdColumnIndex = headers.findIndex(h => h.toLowerCase() === 'interviewid');
    let needsInterviewIdColumn = interviewIdColumnIndex === -1;

    if (needsInterviewIdColumn) {
      console.log('📋 InterviewID COLUMN MISSING - Adding it now...');
      
      try {
        console.log('🔄 Inserting new column at position A (beginning)');
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              insertDimension: {
                range: {
                  sheetId: parseInt(gid),
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 1
                }
              }
            }]
          }
        });
        console.log('✅ Successfully inserted new column');
        
        // Now add the header to the specific sheet
        const headerRange = sheetName ? `'${sheetName}'!A1` : 'A1';
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: headerRange,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['InterviewID']]
          }
        });
        console.log('✅ Added InterviewID header to A1');
        
        // Hide the InterviewID column immediately
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              updateDimensionProperties: {
                range: {
                  sheetId: parseInt(gid),
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 1
                },
                properties: {
                  hiddenByUser: true
                },
                fields: 'hiddenByUser'
              }
            }]
          }
        });
        console.log('✅ Hidden InterviewID column');
        
        // Re-read the sheet to get the updated structure
        console.log('🔄 Re-reading sheet with new structure...');
        const updatedResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: range,
        });
        
        const updatedRows = updatedResponse.data.values || [];
        if (updatedRows.length > 0) {
          // Update our local data
          Object.assign(rows, updatedRows);
          headers = updatedRows[0].map((h: any) => String(h).trim());
          interviewIdColumnIndex = headers.findIndex(h => h.toLowerCase() === 'interviewid');
          console.log('✅ Updated local data with new sheet structure');
          console.log(`📍 InterviewID column now at index: ${interviewIdColumnIndex}`);
        }
        
      } catch (insertError) {
        console.error('❌ Failed to insert InterviewID column:', insertError);
        return NextResponse.json({ 
          error: `Failed to add InterviewID column to Google Sheets: ${insertError instanceof Error ? insertError.message : 'Unknown error'}` 
        }, { status: 500 });
      }
    } else {
      console.log(`✅ InterviewID column found at index ${interviewIdColumnIndex}`);
    }

    // Debug: Show what headers we actually detected
    console.log('🔍 HEADER ANALYSIS:');
    console.log(`Raw headers from sheet: [${headers.join(', ')}]`);
    
    // Check for required headers
    const requiredHeaders = ['ConsultantName'];
    const missingHeaders = [];
    
    for (const requiredHeader of requiredHeaders) {
      if (!headers.find(h => h.toLowerCase() === requiredHeader.toLowerCase())) {
        missingHeaders.push(requiredHeader);
      }
    }
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}. 
        
DETECTED HEADERS: [${headers.join(', ')}]

Make sure you have columns with headers matching these names (case-insensitive):
- ConsultantName (required for identifying interview records)` 
      }, { status: 422 });
    }

    // Parse sheet data into InterviewItems
    const sheetData = new Map<string, InterviewItem>();
    const newItemsWithoutInterviewId: InterviewItem[] = [];
    
    console.log(`Processing ${rows.length - 1} data rows from Google Sheets`);
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const item: any = { rowIndex: i };
      
      // Debug: Show raw row data for first few rows
      if (i <= 3) {
        console.log(`🔍 Row ${i} raw data: [${row.join(' | ')}]`);
      }
      
      headers.forEach((header: string, index: number) => {
        const value = row[index] || '';
        const fieldName = interviewsColumnMap[header as keyof typeof interviewsColumnMap];
        
        if (!fieldName) return; // Skip unmapped columns
        
        switch (fieldName) {
          case 'interviewid':
            const trimmedValue = String(value).trim();
            item[fieldName] = trimmedValue && !isNaN(Number(trimmedValue)) && Number(trimmedValue) > 0 ? Number(trimmedValue) : null;
            break;
          case 'level':
            item[fieldName] = parseInt(value);
            break;
          case 'mailreceiveddate':
          case 'maileddatestoconsultant':
          case 'interviewconfirmedbyclient':
            item[fieldName] = parseDate(value);
            break;
          case 'timeofinterview':
            // Handle timestamp parsing for TimeOfInterview (YYYY-MM-DD HH:mm format)
            item[fieldName] = parseDate(value);
            break;
          case 'interviewscheduledmailedtomr':
          case 'clientconfmailreceived':
          case 'mailsenttoconsultant':
          case 'mailreceivedfromconsultant':
          case 'confemailccvendor':
            item[fieldName] = parseBoolean(value);
            break;
          default:
            // String fields
            item[fieldName] = value || null;
        }
      });

      // Skip rows without required fields
      if (!item.consultantname?.trim()) {
        console.log(`Skipping row ${i} - missing required field: consultantname`);
        continue;
      }
      
      // Generate monthyear if not provided (for compatibility)
      if (!item.monthyear && item.mailreceiveddate) {
        const date = new Date(item.mailreceiveddate);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        item.monthyear = `${month}/${year}`;
      }
      
      if (item.interviewid && item.interviewid > 0) {
        // Existing item with valid interviewid
        console.log(`Row ${i}: Existing item with interviewid ${item.interviewid} - "${item.consultantname}"`);
        sheetData.set(`interviewid_${item.interviewid}`, item);
      } else {
        // New item without interviewid (or invalid interviewid)
        console.log(`Row ${i}: New item without interviewid - "${item.consultantname}" (interviewid value was: "${row[interviewIdColumnIndex] || 'empty'}")`);
        newItemsWithoutInterviewId.push(item);
      }
    }
    
    console.log(`Found ${sheetData.size} existing items and ${newItemsWithoutInterviewId.length} new items`);

    // Get current database data
    const dbRecords = await prisma.interviews.findMany();
    const dbData = new Map<number, any>();
    
    dbRecords.forEach(record => {
      dbData.set(record.interviewid, record);
    });

    console.log(`📊 Database has ${dbRecords.length} existing records`);
    console.log(`📊 About to start transaction processing...`);

    // Perform sync within a transaction with extended timeout
    let result: SyncResult;
    try {
      result = await prisma.$transaction(async (tx) => {
        let inserted = 0;
        let updated = 0;
        let deleted = 0;
        
        console.log(`📊 Starting transaction - processing ${sheetData.size} updates...`);

        // Process existing items with interviewid first (UPDATE operations)
        for (const [key, sheetItem] of sheetData.entries()) {
          if (sheetItem.interviewid) {
            const dbItem = dbData.get(sheetItem.interviewid);
            
            if (dbItem) {
              // Update existing record
              console.log(`🔄 UPDATING existing record interviewid: ${sheetItem.interviewid} - ${sheetItem.consultantname}`);
              await tx.interviews.update({
                where: { interviewid: dbItem.interviewid },
                data: {
                  hbits_no: sheetItem.hbits_no,
                  position: sheetItem.position,
                  level: sheetItem.level,
                  mailreceiveddate: sheetItem.mailreceiveddate,
                  consultantname: sheetItem.consultantname,
                  clientsuggesteddates: sheetItem.clientsuggesteddates,
                  maileddatestoconsultant: sheetItem.maileddatestoconsultant,
                  interviewtimeoptedfor: sheetItem.interviewtimeoptedfor,
                  interviewscheduledmailedtomr: sheetItem.interviewscheduledmailedtomr,
                  interviewconfirmedbyclient: sheetItem.interviewconfirmedbyclient,
                  timeofinterview: sheetItem.timeofinterview,
                  thrurecruiter: sheetItem.thrurecruiter,
                  consultantcontactno: sheetItem.consultantcontactno,
                  consultantemail: sheetItem.consultantemail,
                  vendorpocname: sheetItem.vendorpocname,
                  vendornumber: sheetItem.vendornumber,
                  vendoremailid: sheetItem.vendoremailid,
                  candidateselected: sheetItem.candidateselected,
                  monthyear: sheetItem.monthyear,
                  remark: sheetItem.remark,
                  status: sheetItem.status,
                  clientconfmailreceived: sheetItem.clientconfmailreceived,
                  mailsenttoconsultant: sheetItem.mailsenttoconsultant,
                  mailreceivedfromconsultant: sheetItem.mailreceivedfromconsultant,
                  confemailccvendor: sheetItem.confemailccvendor,
                }
              });
              updated++;
            } else {
              // interviewid exists in sheet but not in database - this shouldn't happen
              console.warn(`Warning: interviewid ${sheetItem.interviewid} found in sheet but not in database`);
            }
          }
        }

        // Process new items without interviewid (INSERT operations)
        console.log(`📊 Starting INSERT operations - ${newItemsWithoutInterviewId.length} new items...`);
        for (const newItem of newItemsWithoutInterviewId) {
          console.log(`➕ INSERTING: "${newItem.consultantname}" (Position: ${newItem.position}, row: ${newItem.rowIndex})`);
          
          const createdItem = await tx.interviews.create({
            data: {
              hbits_no: newItem.hbits_no,
              position: newItem.position,
              level: newItem.level,
              mailreceiveddate: newItem.mailreceiveddate,
              consultantname: newItem.consultantname,
              clientsuggesteddates: newItem.clientsuggesteddates,
              maileddatestoconsultant: newItem.maileddatestoconsultant,
              interviewtimeoptedfor: newItem.interviewtimeoptedfor,
              interviewscheduledmailedtomr: newItem.interviewscheduledmailedtomr,
              interviewconfirmedbyclient: newItem.interviewconfirmedbyclient,
              timeofinterview: newItem.timeofinterview,
              thrurecruiter: newItem.thrurecruiter,
              consultantcontactno: newItem.consultantcontactno,
              consultantemail: newItem.consultantemail,
              vendorpocname: newItem.vendorpocname,
              vendornumber: newItem.vendornumber,
              vendoremailid: newItem.vendoremailid,
              candidateselected: newItem.candidateselected,
              monthyear: newItem.monthyear,
              remark: newItem.remark,
              status: newItem.status,
              clientconfmailreceived: newItem.clientconfmailreceived,
              mailsenttoconsultant: newItem.mailsenttoconsultant,
              mailreceivedfromconsultant: newItem.mailreceivedfromconsultant,
              confemailccvendor: newItem.confemailccvendor,
            }
          });
          
          // Add interviewid to the row for sheet update
          newItem.interviewid = createdItem.interviewid;
          console.log(`    Created with interviewid: ${createdItem.interviewid}`);
          inserted++;
        }

        // DELETE operations - remove records that are in database but not in sheet
        const sheetInterviewIds = new Set([
          ...Array.from(sheetData.values()).filter(item => item.interviewid).map(item => item.interviewid!),
          ...newItemsWithoutInterviewId.map(item => item.interviewid!).filter(Boolean)
        ]);
        
        for (const [interviewid, dbItem] of dbData.entries()) {
          if (!sheetInterviewIds.has(interviewid)) {
            await tx.interviews.delete({
              where: { interviewid: interviewid }
            });
            deleted++;
          }
        }

        return { inserted, updated, deleted };
      }, {
        maxWait: 20000, // 20 seconds
        timeout: 60000, // 60 seconds
      });
    } catch (transactionError) {
      console.error('❌ Transaction failed:', transactionError);
      
      // Handle specific transaction errors
      if (transactionError instanceof Error) {
        if (transactionError.message.includes('Transaction not found') || 
            transactionError.message.includes('transaction ID is invalid')) {
          throw new Error('Database transaction timeout - try with fewer records or contact admin');
        }
        if (transactionError.message.includes('timeout')) {
          throw new Error('Database operation timed out - the sheet may be too large');
        }
      }
      
      throw transactionError;
    }

    // Update Google Sheets with InterviewID for new items
    if (newItemsWithoutInterviewId.length > 0) {
      console.log(`📝 Updating ${newItemsWithoutInterviewId.length} InterviewID values in Google Sheets`);
      
      const updatesForSheet: any[] = [];
      
      // Update InterviewID values for newly created items
      for (const newItem of newItemsWithoutInterviewId) {
        if (newItem.interviewid && newItem.rowIndex) {
          const cellAddress = sheetName ? `'${sheetName}'!A${newItem.rowIndex + 1}` : `A${newItem.rowIndex + 1}`;
          console.log(`  📍 Will update row ${newItem.rowIndex + 1} (${cellAddress}) with InterviewID: ${newItem.interviewid}`);
          updatesForSheet.push({
            range: cellAddress,
            values: [[newItem.interviewid]]
          });
        }
      }
      
      // Apply InterviewID updates to the sheet
      if (updatesForSheet.length > 0) {
        try {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'RAW',
              data: updatesForSheet
            }
          });
          
          console.log(`✅ Successfully updated ${updatesForSheet.length} InterviewID values in Google Sheets`);
        } catch (sheetError) {
          console.error('❌ Error updating Google Sheets with InterviewID values:', sheetError);
          // Don't fail the entire sync for sheet update errors
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`📊 SYNC COMPLETED:`);
    console.log(`📊 Final result: ${result.inserted} inserted, ${result.updated} updated, ${result.deleted} deleted (${duration}ms)`);
    console.log(`📊 Result object:`, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing interviews sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle permission errors specifically
    if (errorMessage.includes('Unauthenticated')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (errorMessage.includes('User not approved')) {
      return NextResponse.json({ error: 'User not approved' }, { status: 403 });
    }
    if (errorMessage.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    return NextResponse.json({ 
      error: `Interviews sync failed: ${errorMessage}` 
    }, { status: 500 });
  }
} 