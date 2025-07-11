import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';

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

// Expected headers for todo_list
const EXPECTED_HEADERS = [
  'category', 'taskname', 'triggerdate', 'assignedto', 'internalduedate', 
  'actualduedate', 'status', 'requiresfiling', 'filed', 'followupneeded', 
  'recurring', 'nextduedate', 'note'
];

interface TodoItem {
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
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Read sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:Z', // Read all columns
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return NextResponse.json({ 
        error: 'No data found in sheet' 
      }, { status: 422 });
    }

    // Header validation
    const headers = rows[0].map((h: any) => String(h).trim().toLowerCase());
    const expectedHeaders = EXPECTED_HEADERS.map((h: string) => h.toLowerCase());
    
    const missingHeaders = expectedHeaders.filter((h: string) => !headers.includes(h));
    const extraHeaders = headers.filter((h: string) => h && !expectedHeaders.includes(h));
    
    if (missingHeaders.length > 0 || extraHeaders.length > 0) {
      const details = [];
      if (missingHeaders.length > 0) {
        details.push(`Missing headers: ${missingHeaders.join(', ')}`);
      }
      if (extraHeaders.length > 0) {
        details.push(`Extra headers: ${extraHeaders.join(', ')}`);
      }
      
      return NextResponse.json({ 
        error: `Column mismatch: ${details.join('; ')}` 
      }, { status: 422 });
    }

    // Parse sheet data into TodoItems
    const sheetData = new Map<string, TodoItem>();
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const item: any = {};
      headers.forEach((header: string, index: number) => {
        const value = row[index] || '';
        const cleanHeader = header.toLowerCase();
        
        switch (cleanHeader) {
          case 'triggerdate':
          case 'internalduedate':
          case 'actualduedate':
          case 'nextduedate':
            item[cleanHeader] = value ? new Date(value) : null;
            break;
          case 'requiresfiling':
          case 'filed':
          case 'followupneeded':
          case 'recurring':
            item[cleanHeader] = value.toLowerCase() === 'true';
            break;
          case 'note':
            item[cleanHeader] = value || null;
            break;
          default:
            item[cleanHeader] = value || null;
        }
      });

      // Skip rows without required fields
      if (!item.category?.trim() || !item.taskname?.trim()) continue;
      
      // Natural identifier: category + taskname
      const key = `${item.category.trim().toLowerCase()}|${item.taskname.trim().toLowerCase()}`;
      sheetData.set(key, item);
    }

    // Get current database data
    const dbRecords = await prisma.todo_list.findMany();
    const dbData = new Map<string, any>();
    
    dbRecords.forEach(record => {
      const key = `${(record.category || '').trim().toLowerCase()}|${(record.taskname || '').trim().toLowerCase()}`;
      dbData.set(key, record);
    });

    // Perform sync within a transaction
    const result: SyncResult = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      let updated = 0;
      let deleted = 0;

      // INSERT and UPDATE operations
      for (const [key, sheetItem] of sheetData.entries()) {
        const dbItem = dbData.get(key);
        
        if (!dbItem) {
          // INSERT
          await tx.todo_list.create({
            data: {
              category: sheetItem.category,
              taskname: sheetItem.taskname,
              triggerdate: sheetItem.triggerdate,
              assignedto: sheetItem.assignedto,
              internalduedate: sheetItem.internalduedate,
              actualduedate: sheetItem.actualduedate,
              status: sheetItem.status,
              requiresfiling: sheetItem.requiresfiling,
              filed: sheetItem.filed,
              followupneeded: sheetItem.followupneeded,
              recurring: sheetItem.recurring,
              nextduedate: sheetItem.nextduedate,
              note: sheetItem.note,
            }
          });
          inserted++;
        } else {
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
            // UPDATE
            await tx.todo_list.update({
              where: { taskid: dbItem.taskid },
              data: {
                category: sheetItem.category,
                taskname: sheetItem.taskname,
                triggerdate: sheetItem.triggerdate,
                assignedto: sheetItem.assignedto,
                internalduedate: sheetItem.internalduedate,
                actualduedate: sheetItem.actualduedate,
                status: sheetItem.status,
                requiresfiling: sheetItem.requiresfiling,
                filed: sheetItem.filed,
                followupneeded: sheetItem.followupneeded,
                recurring: sheetItem.recurring,
                nextduedate: sheetItem.nextduedate,
                note: sheetItem.note,
              }
            });
            updated++;
          }
        }
      }

      // DELETE operations
      for (const [key, dbItem] of dbData.entries()) {
        if (!sheetData.has(key)) {
          await tx.todo_list.delete({
            where: { taskid: dbItem.taskid }
          });
          deleted++;
        }
      }

      return { inserted, updated, deleted };
    });

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