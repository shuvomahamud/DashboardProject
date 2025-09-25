import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

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

// Expected headers for todo_list (taskid will be auto-managed)
const EXPECTED_HEADERS = [
  'taskid', 'category', 'taskname', 'triggerdate', 'assignedto', 'internalduedate', 
  'actualduedate', 'status', 'requiresfiling', 'filed', 'followupneeded', 
  'recurring', 'nextduedate', 'note'
];

interface TodoItem {
  taskid?: number | null;
  category: string;
  taskname: string;
  triggerdate?: Date | null;
  assignedto?: string;
  internalduedate?: Date | null;
  actualduedate?: Date | null;
  status?: string;
  requiresfiling?: boolean;
  filed?: boolean;
  followupneeded?: boolean;
  recurring?: boolean;
  nextduedate?: Date | null;
  note?: string;
  rowIndex?: number; // Track row position for updates
}

interface SyncResult {
  inserted: number;
  updated: number;
  deleted: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get sheet URL from sheet_config table
    const config = await prisma.$queryRaw`
      SELECT sheet_url as sheeturl 
      FROM sheet_config 
      WHERE table_key = 'todo_list'
      AND sheet_url IS NOT NULL 
      AND sheet_url != ''
    ` as Array<{sheeturl: string}>;
    
    if (config.length === 0) {
      return NextResponse.json({ 
        error: "No URL configured for 'todo_list'" 
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

    // Read sheet data from specific sheet by gid
    // Sheet name and range are already set above
    
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

    // Check and manage taskid column
    let headers = rows[0].map((h: any) => String(h).trim().toLowerCase());
    let taskidColumnIndex = headers.indexOf('taskid');
    let needsTaskidColumn = taskidColumnIndex === -1;

    if (needsTaskidColumn) {
      console.log('📋 TASKID COLUMN MISSING - Adding it now...');
      
      // First, let's try to insert a new column at the beginning
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
            values: [['taskid']]
          }
        });
        console.log('✅ Added taskid header to A1');
        
        // Hide the taskid column immediately
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
        console.log('✅ Hidden taskid column');
        
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
          headers = updatedRows[0].map((h: any) => String(h).trim().toLowerCase());
          taskidColumnIndex = headers.indexOf('taskid');
          console.log('✅ Updated local data with new sheet structure');
          console.log(`📍 TaskID column now at index: ${taskidColumnIndex}`);
        }
        
      } catch (insertError) {
        console.error('❌ Failed to insert taskid column:', insertError);
        return NextResponse.json({ 
          error: `Failed to add taskid column to Google Sheets: ${insertError instanceof Error ? insertError.message : 'Unknown error'}` 
        }, { status: 500 });
      }
    } else {
      console.log(`✅ Taskid column found at index ${taskidColumnIndex}`);
    }

    // Debug: Show what headers we actually detected
    console.log('🔍 HEADER ANALYSIS:');
    console.log(`Raw headers from sheet: [${rows[0].join(', ')}]`);
    console.log(`Processed headers (lowercase): [${headers.join(', ')}]`);
    
    // Only require essential headers - be flexible like the old sync
    // Check for taskname with common variations
    const taskNameVariations = ['taskname', 'task_name', 'task name', 'name', 'task'];
    const hasTaskName = taskNameVariations.some(variation => headers.includes(variation));
    
    if (!hasTaskName) {
      console.log(`❌ No taskname column found. Checked variations: ${taskNameVariations.join(', ')}`);
    } else {
      console.log(`✅ Found taskname column (variation: ${taskNameVariations.find(v => headers.includes(v))})`);
    }
    
    const requiredHeaders = hasTaskName ? [] : ['taskname']; // Only require if not found
    const missingHeaders = requiredHeaders;
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}. 
        
DETECTED HEADERS: [${headers.join(', ')}]
RAW HEADERS: [${rows[0].join(', ')}]

Make sure you have a column with header 'taskname' (case-insensitive). Check for extra spaces or special characters.` 
      }, { status: 422 });
    }
    
    // Log which optional headers are missing (for debugging)
    const optionalHeaders = ['category', 'triggerdate', 'assignedto', 'internalduedate', 'actualduedate', 'status', 'requiresfiling', 'filed', 'followupneeded', 'recurring', 'nextduedate', 'note'];
    const missingOptionalHeaders = optionalHeaders.filter((h: string) => !headers.includes(h));
    if (missingOptionalHeaders.length > 0) {
      console.log(`📝 Optional headers missing (will use defaults): ${missingOptionalHeaders.join(', ')}`);
    }

    // Parse sheet data into TodoItems
    const sheetData = new Map<string, TodoItem>();
    const newItemsWithoutTaskid: TodoItem[] = [];
    
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
        const cleanHeader = header.toLowerCase();
        
        // Map header variations to standard field names
        let fieldName = cleanHeader;
        if (['task_name', 'task name', 'name', 'task'].includes(cleanHeader)) {
          fieldName = 'taskname';
        }
        
        switch (fieldName) {
          case 'taskid':
            // More robust taskid parsing - handle empty strings, whitespace, etc.
            const trimmedValue = String(value).trim();
            item[fieldName] = trimmedValue && !isNaN(Number(trimmedValue)) && Number(trimmedValue) > 0 ? Number(trimmedValue) : null;
            break;
          case 'triggerdate':
          case 'internalduedate':
          case 'actualduedate':
          case 'nextduedate':
            // Safe date parsing - return null for invalid dates
            if (!value || value.trim() === '') {
              item[fieldName] = null;
              if (i <= 3) console.log(`📅 ${fieldName}: empty -> null`);
            } else {
              const parsedDate = new Date(value);
              if (isNaN(parsedDate.getTime())) {
                console.log(`⚠️ Row ${i} - Invalid date format for ${fieldName}: "${value}" - setting to null`);
                item[fieldName] = null;
              } else {
                item[fieldName] = parsedDate;
                if (i <= 3) console.log(`📅 ${fieldName}: "${value}" -> ${parsedDate.toISOString()}`);
              }
            }
            break;
          case 'requiresfiling':
          case 'filed':
          case 'followupneeded':
          case 'recurring':
            item[fieldName] = value.toLowerCase() === 'true';
            break;
          case 'note':
            item[fieldName] = value || null;
            break;
          default:
            item[fieldName] = value || null;
        }
      });

      // Apply defaults for missing fields (like old sync)
      if (!item.category) item.category = '';
      if (!item.status) item.status = 'Not Started';
      if (!item.assignedto) item.assignedto = '';
      if (item.requiresfiling === undefined) item.requiresfiling = false;
      if (item.filed === undefined) item.filed = false;
      if (item.followupneeded === undefined) item.followupneeded = false;
      if (item.recurring === undefined) item.recurring = false;

      // Skip rows without required fields (only taskname is required)
      if (!item.taskname?.trim()) {
        console.log(`Skipping row ${i} - missing required field: taskname`);
        continue;
      }
      
      if (item.taskid && item.taskid > 0) {
        // Existing item with valid taskid
        console.log(`Row ${i}: Existing item with taskid ${item.taskid} - "${item.taskname}"`);
        sheetData.set(`taskid_${item.taskid}`, item);
      } else {
        // New item without taskid (or invalid taskid)
        console.log(`Row ${i}: New item without taskid - "${item.taskname}" (taskid value was: "${row[taskidColumnIndex] || 'empty'}")`);
        newItemsWithoutTaskid.push(item);
      }
    }
    
    console.log(`Found ${sheetData.size} existing items and ${newItemsWithoutTaskid.length} new items`);
    
    // Debug: Show what we found
    if (newItemsWithoutTaskid.length > 0) {
      console.log('New items without taskid:');
      newItemsWithoutTaskid.forEach((item, index) => {
        console.log(`  ${index + 1}. Row ${item.rowIndex}: "${item.taskname}" (category: ${item.category})`);
      });
    }

    // Get current database data
    const dbRecords = await prisma.todo_list.findMany();
    const dbData = new Map<number, any>();
    
    dbRecords.forEach(record => {
      dbData.set(record.taskid, record);
    });

    // Perform sync within a transaction
    const result: SyncResult = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      let updated = 0;
      let deleted = 0;

      // Process existing items with taskid first (UPDATE operations)
      for (const [key, sheetItem] of sheetData.entries()) {
        if (sheetItem.taskid) {
          const dbItem = dbData.get(sheetItem.taskid);
          
          if (dbItem) {
            // Check if update is needed
            const needsUpdate = (
              dbItem.category !== sheetItem.category ||
              dbItem.taskname !== sheetItem.taskname ||
              dbItem.assignedto !== sheetItem.assignedto ||
              dbItem.status !== sheetItem.status ||
              dbItem.requiresfiling !== sheetItem.requiresfiling ||
              dbItem.filed !== sheetItem.filed ||
              dbItem.followupneeded !== sheetItem.followupneeded ||
              dbItem.recurring !== sheetItem.recurring ||
              dbItem.note !== sheetItem.note ||
              (dbItem.triggerdate?.toDateString() !== sheetItem.triggerdate?.toDateString()) ||
              (dbItem.internalduedate?.toDateString() !== sheetItem.internalduedate?.toDateString()) ||
              (dbItem.actualduedate?.toDateString() !== sheetItem.actualduedate?.toDateString()) ||
              (dbItem.nextduedate?.toDateString() !== sheetItem.nextduedate?.toDateString())
            );

            if (needsUpdate) {
              // UPDATE existing record
              await tx.todo_list.update({
                where: { taskid: dbItem.taskid },
                data: {
                  category: sheetItem.category || '',
                  taskname: sheetItem.taskname,
                  triggerdate: sheetItem.triggerdate || null,
                  assignedto: sheetItem.assignedto || '',
                  internalduedate: sheetItem.internalduedate || null,
                  actualduedate: sheetItem.actualduedate || null,
                  status: sheetItem.status || 'Not Started',
                  requiresfiling: sheetItem.requiresfiling || false,
                  filed: sheetItem.filed || false,
                  followupneeded: sheetItem.followupneeded || false,
                  recurring: sheetItem.recurring || false,
                  nextduedate: sheetItem.nextduedate || null,
                  note: sheetItem.note || null,
                }
              });
              updated++;
            }
          } else {
            // taskid exists in sheet but not in database - this shouldn't happen
            console.warn(`Warning: taskid ${sheetItem.taskid} found in sheet but not in database`);
          }
        }
      }

      // Process new items without taskid (INSERT operations)
      console.log(`Inserting ${newItemsWithoutTaskid.length} new items into database`);
      for (const newItem of newItemsWithoutTaskid) {
        console.log(`  Inserting: "${newItem.taskname}" (category: ${newItem.category}, row: ${newItem.rowIndex})`);
        
        const createdItem = await tx.todo_list.create({
          data: {
            category: newItem.category || '',
            taskname: newItem.taskname,
            triggerdate: newItem.triggerdate || null,
            assignedto: newItem.assignedto || '',
            internalduedate: newItem.internalduedate || null,
            actualduedate: newItem.actualduedate || null,
            status: newItem.status || 'Not Started',
            requiresfiling: newItem.requiresfiling || false,
            filed: newItem.filed || false,
            followupneeded: newItem.followupneeded || false,
            recurring: newItem.recurring || false,
            nextduedate: newItem.nextduedate || null,
            note: newItem.note || null,
          }
        });
        
        // Add taskid to the row for sheet update
        newItem.taskid = createdItem.taskid;
        console.log(`    Created with taskid: ${createdItem.taskid}`);
        inserted++;
      }

      // DELETE operations - remove records that are in database but not in sheet
      const sheetTaskIds = new Set([
        ...Array.from(sheetData.values()).filter(item => item.taskid).map(item => item.taskid!),
        ...newItemsWithoutTaskid.map(item => item.taskid!).filter(Boolean)
      ]);
      
      for (const [taskid, dbItem] of dbData.entries()) {
        if (!sheetTaskIds.has(taskid)) {
          await tx.todo_list.delete({
            where: { taskid }
          });
          deleted++;
        }
      }

      return { inserted, updated, deleted };
    });

    // Update Google Sheets with taskid for new items
    if (newItemsWithoutTaskid.length > 0) {
      console.log(`📝 Updating ${newItemsWithoutTaskid.length} taskid values in Google Sheets`);
      
      const updatesForSheet: any[] = [];
      
      // Update taskid values for newly created items
      for (const newItem of newItemsWithoutTaskid) {
        if (newItem.taskid && newItem.rowIndex) {
          const cellAddress = sheetName ? `'${sheetName}'!A${newItem.rowIndex + 1}` : `A${newItem.rowIndex + 1}`;
          console.log(`  📍 Will update row ${newItem.rowIndex + 1} (${cellAddress}) with taskid: ${newItem.taskid}`);
          updatesForSheet.push({
            range: cellAddress,
            values: [[newItem.taskid]]
          });
        } else {
          console.log(`  ⚠️ Cannot update row ${newItem.rowIndex} - missing taskid or rowIndex`, {
            taskid: newItem.taskid,
            rowIndex: newItem.rowIndex
          });
        }
      }
      
      // Apply taskid updates to the sheet
      if (updatesForSheet.length > 0) {
        try {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'RAW',
              data: updatesForSheet
            }
          });
          
          console.log(`✅ Successfully updated ${updatesForSheet.length} taskid values in Google Sheets`);
        } catch (sheetError) {
          console.error('❌ Error updating Google Sheets with taskid values:', sheetError);
          // Don't fail the entire sync for sheet update errors
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Todo sync completed: ${result.inserted} inserted, ${result.updated} updated, ${result.deleted} deleted (${duration}ms)`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing todo sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: `Todo sync failed: ${errorMessage}` 
    }, { status: 500 });
  }
} 