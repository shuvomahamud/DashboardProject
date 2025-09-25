import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { google } from 'googleapis';
import { apReportSchema } from '@/lib/validations/apReportSchema';
import { z } from 'zod';
import { checkTablePermission } from '@/lib/auth/withTableAuthAppRouter';

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

// Expected headers for AP_Report (AP_ID will be auto-managed)
const EXPECTED_HEADERS = [
  'ap_id', 'startdate', 'enddate', 'authorizeduser', 'taskorder', 
  'candidatename', 'region', 'jobtitle', 'totalhours', 
  'approvedtimesheetreceived', 'hourlywagerate', 'hourlywageratewithmarkup', 
  'markup', 'totalbilledtoclient', 'paidtovendor', 'vendorname', 
  'hrssharedbyvendor', 'hoursmatchinvoice', 'invoice', 'vendorinvoiceremarks', 
  'vendorinvoicedate', 'istimesheetapproved', 'remark', 'pmttermnet', 
  'paymentmode', 'paymentduedate', 'check'
];

interface APReportItem {
  AP_ID?: number | null;
  StartDate: Date;
  EndDate: Date;
  AgencyAuthorizedUser: string;
  TaskOrderNumber: string;
  CandidateName: string;
  Region: number;
  JobTitle: string;
  SkillLevel: number;
  TotalHours: number;
  TimesheetApprovalDate: Date;
  HourlyWageRateBase: number;
  MarkUpPercent: number;
  HourlyWageRateWithMarkup: number;
  TotalBilledOGSClient: number;
  PaidToVendor: number;
  VendorName: string;
  VendorHours?: number | null;
  HoursMatchInvoice: boolean;
  InvoiceNumber: string;
  VendorInvoiceRemarks?: string | null;
  VendorInvoiceDate: Date;
  TimesheetsApproved: boolean;
  Remark: string;
  PaymentTermNet: number;
  PaymentMode: string;
  PaymentDueDate: Date;
  Check: string;
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
    // Check admin permissions (sync is admin-only)
    const session = await checkTablePermission('*');
    console.log(`🔐 Admin user "${session.user.name}" (${session.user.email}) initiated AP sync`);

    // Get sheet URL from sheet_config table
    const config = await prisma.$queryRaw`
      SELECT sheet_url as sheeturl 
      FROM sheet_config 
      WHERE table_key = 'ap_report'
      AND sheet_url IS NOT NULL 
      AND sheet_url != ''
    ` as Array<{sheeturl: string}>;
    
    if (config.length === 0) {
      return NextResponse.json({ 
        error: "No URL configured for 'ap_report'" 
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
    const range = sheetName ? `'${sheetName}'!A:AB` : 'A:AB';
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
    
    console.log(`📝 Reading from range A:AB, found ${rows.length} rows`);
    console.log(`📝 First few rows of data:`);
    rows.slice(0, 3).forEach((row, index) => {
      console.log(`  Row ${index + 1}: [${row.join(', ')}]`);
    });

    // Check and manage AP_ID column
    let headers = rows[0].map((h: any) => String(h).trim().toLowerCase());
    let apIdColumnIndex = headers.indexOf('ap_id');
    let needsApIdColumn = apIdColumnIndex === -1;

    if (needsApIdColumn) {
      console.log('📋 AP_ID COLUMN MISSING - Adding it now...');
      
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
            values: [['AP_ID']]
          }
        });
        console.log('✅ Added AP_ID header to A1');
        
        // Hide the AP_ID column immediately
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
        console.log('✅ Hidden AP_ID column');
        
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
          apIdColumnIndex = headers.indexOf('ap_id');
          console.log('✅ Updated local data with new sheet structure');
          console.log(`📍 AP_ID column now at index: ${apIdColumnIndex}`);
        }
        
      } catch (insertError) {
        console.error('❌ Failed to insert AP_ID column:', insertError);
        return NextResponse.json({ 
          error: `Failed to add AP_ID column to Google Sheets: ${insertError instanceof Error ? insertError.message : 'Unknown error'}` 
        }, { status: 500 });
      }
    } else {
      console.log(`✅ AP_ID column found at index ${apIdColumnIndex}`);
    }

    // Debug: Show what headers we actually detected
    console.log('🔍 HEADER ANALYSIS:');
    console.log(`Raw headers from sheet: [${rows[0].join(', ')}]`);
    console.log(`Processed headers (lowercase): [${headers.join(', ')}]`);
    
    // Check for required headers using the new simplified header names
    const requiredHeaders = ['candidatename', 'totalhours', 'invoice'];
    const missingHeaders = [];
    
    for (const requiredHeader of requiredHeaders) {
      if (!headers.includes(requiredHeader)) {
        missingHeaders.push(requiredHeader);
      }
    }
    
    // Special validation for date columns - accept either separate start/end dates OR combined date
    const hasStartDate = headers.includes('startdate');
    const hasEndDate = headers.includes('enddate');
    const hasCombinedDate = headers.includes('start/enddate') || headers.includes('startenddate');
    
    if (!hasStartDate && !hasCombinedDate) {
      missingHeaders.push('startdate');
    }
    if (!hasEndDate && !hasCombinedDate) {
      missingHeaders.push('enddate');
    }
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}. 
        
DETECTED HEADERS: [${headers.join(', ')}]
RAW HEADERS: [${rows[0].join(', ')}]

Make sure you have columns with headers matching these simplified names (case-insensitive):
- candidatename (for candidate name)
- totalhours (for total hours)
- invoice (for invoice number)
- startdate and enddate (for separate date columns)
- OR start/enddate (for combined date column)` 
      }, { status: 422 });
    }

    // Helper function to map headers to standard field names
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

    // Generate header-to-field mapping
    const headerToFieldMap = sheetHeadersToDbFields(headers);

    // Parse sheet data into APReportItems
    const sheetData = new Map<string, APReportItem>();
    const newItemsWithoutApId: APReportItem[] = [];
    const validationFailures: Array<{ row: number, candidateName: string, errors: string[] }> = [];
    
    console.log(`Processing ${rows.length - 1} data rows from Google Sheets`);
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // Create item object
      const item: any = { rowIndex: i };
      
      // Debug: Show raw row data for first few rows
      if (i <= 3) {
        console.log(`🔍 Row ${i} raw data: [${row.join(' | ')}]`);
      }
      
      // Debug: Show header mapping for first few rows
      if (i <= 3) {
        console.log(`🔍 Row ${i} header mapping:`, headerToFieldMap);
      }
      
              // Map each column to the corresponding field
        headers.forEach((header: string, index: number) => {
          const value = row[index] || '';
          const standardField = headerToFieldMap[index];
          
          // Debug: Show field mapping for first few rows
          if (i <= 3) {
            console.log(`🔍 Row ${i} Column ${index}: "${header}" -> "${standardField}" = "${value}"`);
          }
          
          // Skip if no mapping found for this column
          if (!standardField) return;
          
          switch (standardField) {
          case 'AP_ID':
            const trimmedValue = String(value).trim();
            item.AP_ID = trimmedValue && !isNaN(Number(trimmedValue)) && Number(trimmedValue) > 0 ? Number(trimmedValue) : null;
            break;
          case 'StartDate':
            // If we have a single "Start /End Date" column, use it for both dates
            if (header === 'start /end date' || header === 'start/end date') {
              const startParsedDate = value && value.trim() ? new Date(value.trim()) : null;
              const startIsValidDate = startParsedDate && !isNaN(startParsedDate.getTime());
              item.StartDate = startIsValidDate ? startParsedDate : null;
              item.EndDate = startIsValidDate ? startParsedDate : null;
            } else {
              const startParsedDate = value && value.trim() ? new Date(value.trim()) : null;
              const startIsValidDate = startParsedDate && !isNaN(startParsedDate.getTime());
              item.StartDate = startIsValidDate ? startParsedDate : null;
            }
            break;
          case 'EndDate':
            const endParsedDate = value && value.trim() ? new Date(value.trim()) : null;
            const endIsValidDate = endParsedDate && !isNaN(endParsedDate.getTime());
            item.EndDate = endIsValidDate ? endParsedDate : null;
            break;
          case 'AgencyAuthorizedUser':
            item.AgencyAuthorizedUser = value || '';
            break;
          case 'TaskOrderNumber':
            item.TaskOrderNumber = value || '';
            break;
          case 'CandidateName':
            item.CandidateName = value || '';
            break;
          case 'Region':
            const regionValue = value && value.trim() && value.trim().toUpperCase() !== 'NA' ? parseInt(value.trim()) : 0;
            item.Region = isNaN(regionValue) || regionValue < 0 ? 0 : regionValue;
            break;
          case 'JobTitle':
            item.JobTitle = value || '';
            break;
          case 'SkillLevel':
            const skillValue = value && value.trim() && value.trim().toUpperCase() !== 'NA' ? parseInt(value.trim()) : 0;
            item.SkillLevel = isNaN(skillValue) || skillValue < 0 ? 0 : skillValue;
            break;
          case 'TotalHours':
            const totalHoursValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.TotalHours = isNaN(totalHoursValue) || totalHoursValue < 0 ? 0 : totalHoursValue;
            break;
          case 'TimesheetApprovalDate':
            const timesheetDate = value && value.trim() ? new Date(value.trim()) : null;
            const timesheetIsValidDate = timesheetDate && !isNaN(timesheetDate.getTime());
            item.TimesheetApprovalDate = timesheetIsValidDate ? timesheetDate : null;
            break;
          case 'HourlyWageRateBase':
            const baseRateValue = value && value.trim() ? parseFloat(value.trim().replace(/[$,]/g, '')) : 0;
            item.HourlyWageRateBase = isNaN(baseRateValue) || baseRateValue < 0 ? 0 : baseRateValue;
            break;
          case 'MarkUpPercent':
            const markupValue = value && value.trim() ? parseFloat(value.trim().replace(/[%]/g, '')) : 0;
            item.MarkUpPercent = isNaN(markupValue) || markupValue < 0 ? 0 : markupValue;
            break;
          case 'HourlyWageRateWithMarkup':
            const markupRateValue = value && value.trim() ? parseFloat(value.trim().replace(/[$,]/g, '')) : 0;
            item.HourlyWageRateWithMarkup = isNaN(markupRateValue) || markupRateValue < 0 ? 0 : markupRateValue;
            break;
          case 'TotalBilledOGSClient':
            const billedValue = value && value.trim() ? parseFloat(value.trim().replace(/[$,]/g, '')) : 0;
            item.TotalBilledOGSClient = isNaN(billedValue) || billedValue < 0 ? 0 : billedValue;
            break;
          case 'PaidToVendor':
            const paidValue = value && value.trim() ? parseFloat(value.trim().replace(/[$,]/g, '')) : 0;
            item.PaidToVendor = isNaN(paidValue) || paidValue < 0 ? 0 : paidValue;
            break;
          case 'VendorName':
            // Handle cases where vendor name might be "-" or empty
            const vendorValue = value && value.trim() && value.trim() !== '-' ? value.trim() : '';
            item.VendorName = vendorValue;
            break;
          case 'VendorHours':
            const vendorHoursValue = value && value.trim() ? parseFloat(value.trim()) : null;
            item.VendorHours = vendorHoursValue && !isNaN(vendorHoursValue) && vendorHoursValue >= 0 ? vendorHoursValue : null;
            break;
          case 'HoursMatchInvoice':
            const hoursMatchValue = value && value.trim() ? value.trim().toLowerCase() : '';
            item.HoursMatchInvoice = hoursMatchValue === 'y' || hoursMatchValue === 'yes' || hoursMatchValue === 'true';
            break;
          case 'InvoiceNumber':
            // Handle cases where invoice number might be "-" or empty
            const invoiceValue = value && value.trim() && value.trim() !== '-' ? value.trim() : '';
            item.InvoiceNumber = invoiceValue;
            break;
          case 'VendorInvoiceRemarks':
            item.VendorInvoiceRemarks = value && value.trim() ? value.trim() : null;
            break;
          case 'VendorInvoiceDate':
            const vendorInvoiceDate = value && value.trim() ? new Date(value.trim()) : null;
            const vendorInvoiceIsValidDate = vendorInvoiceDate && !isNaN(vendorInvoiceDate.getTime());
            item.VendorInvoiceDate = vendorInvoiceIsValidDate ? vendorInvoiceDate : null;
            break;
          case 'TimesheetsApproved':
            const timesheetsValue = value && value.trim() ? value.trim().toLowerCase() : '';
            item.TimesheetsApproved = timesheetsValue === 'y' || timesheetsValue === 'yes' || timesheetsValue === 'true';
            break;
          case 'Remark':
            item.Remark = value || '';
            break;
          case 'PaymentTermNet':
            const paymentTermValue = value && value.trim() ? parseInt(value.trim()) : 0;
            item.PaymentTermNet = isNaN(paymentTermValue) || paymentTermValue < 0 ? 0 : paymentTermValue;
            break;
          case 'PaymentMode':
            item.PaymentMode = value || '';
            break;
          case 'PaymentDueDate':
            const paymentDueDate = value && value.trim() ? new Date(value.trim()) : null;
            const paymentDueIsValidDate = paymentDueDate && !isNaN(paymentDueDate.getTime());
            item.PaymentDueDate = paymentDueIsValidDate ? paymentDueDate : null;
            break;
          case 'Check':
            item.Check = value || '';
            break;
        }
      });

      // Debug: Show all parsed fields before validation
      if (i <= 3) {
        console.log(`🔍 Row ${i} ALL parsed fields:`, item);
      }
      
      // Ensure CandidateName has a default value if empty
      if (!item.CandidateName?.trim()) {
        item.CandidateName = 'Unknown';
        console.log(`⚠️ Row ${i} - empty CandidateName, setting to 'Unknown'`);
      }
      
      // Log missing fields but let Zod schema handle defaults
      if (!item.StartDate) {
        console.log(`⚠️ Row ${i} - missing StartDate, will be set to null`);
      }
      if (!item.EndDate) {
        console.log(`⚠️ Row ${i} - missing EndDate, will be set to null`);
      }
      if (!item.AgencyAuthorizedUser?.trim()) {
        console.log(`⚠️ Row ${i} - missing AgencyAuthorizedUser, will be set to empty string`);
      }
      if (!item.TaskOrderNumber?.trim()) {
        console.log(`⚠️ Row ${i} - missing TaskOrderNumber, will be set to empty string`);
      }
      if (!item.JobTitle?.trim()) {
        console.log(`⚠️ Row ${i} - missing JobTitle, will be set to empty string`);
      }
      if (!item.VendorName?.trim()) {
        console.log(`⚠️ Row ${i} - missing VendorName, will be set to empty string`);
      }
      if (!item.PaymentMode?.trim()) {
        console.log(`⚠️ Row ${i} - missing PaymentMode, will be set to empty string`);
      }
      
      // Debug: Show parsed item data for first few rows
      if (i <= 3) {
        console.log(`🔍 Row ${i} parsed data:`, {
          AP_ID: item.AP_ID,
          StartDate: item.StartDate,
          EndDate: item.EndDate,
          CandidateName: item.CandidateName,
          InvoiceNumber: item.InvoiceNumber,
          HoursMatchInvoice: item.HoursMatchInvoice,
          TimesheetsApproved: item.TimesheetsApproved,
          TotalHours: item.TotalHours,
          HourlyWageRateBase: item.HourlyWageRateBase
        });
      }
      
      // Validate and transform item using Zod schema (with defaults)
      let validatedItem: any;
      try {
        validatedItem = apReportSchema.parse(item);
        console.log(`✅ Row ${i} validation passed for "${validatedItem.CandidateName}"`);
      } catch (validationError) {
        console.error(`❌ Row ${i} validation failed for "${item.CandidateName}":`, validationError);
        console.error(`❌ Row ${i} raw data:`, row);
        console.error(`❌ Row ${i} parsed data:`, item);
        
        // Collect validation errors for summary
        const errors: string[] = [];
        if (validationError instanceof z.ZodError) {
          console.error(`❌ Row ${i} validation errors:`, validationError.issues);
          validationError.issues.forEach((error: z.ZodIssue, errorIndex: number) => {
            const errorMsg = `${error.path.join('.')} - ${error.message}`;
            console.error(`   Error ${errorIndex + 1}: ${errorMsg} (got: ${error.code})`);
            errors.push(errorMsg);
          });
        }
        
        // Add to validation failures summary
        validationFailures.push({
          row: i,
          candidateName: item.CandidateName || 'Unknown',
          errors: errors
        });
        
        // Skip this row due to validation failure
        continue;
      }
      
      // Use the validated item with defaults applied
      Object.assign(item, validatedItem);

              if (item.AP_ID && item.AP_ID > 0) {
          // Existing item with valid AP_ID
          console.log(`✅ Row ${i}: Existing item with AP_ID ${item.AP_ID} - "${item.CandidateName}"`);
          sheetData.set(`ap_id_${item.AP_ID}`, item);
        } else {
          // New item without AP_ID (or invalid AP_ID)
          console.log(`✅ Row ${i}: New item without AP_ID - "${item.CandidateName}" (AP_ID value was: "${row[apIdColumnIndex] || 'empty'}")`);
          newItemsWithoutApId.push(item);
        }
        
        // Debug: Show what was added to arrays
        if (i <= 3) {
          console.log(`🔍 Row ${i} added to arrays. sheetData size: ${sheetData.size}, newItemsWithoutApId length: ${newItemsWithoutApId.length}`);
        }
    }
    
    console.log(`📊 FINAL PROCESSING SUMMARY:`);
    console.log(`Found ${sheetData.size} existing items and ${newItemsWithoutApId.length} new items`);
    
    // Log validation failures summary
    if (validationFailures.length > 0) {
      console.log(`\n🚨 VALIDATION FAILURES SUMMARY:`);
      console.log(`${validationFailures.length} rows failed validation and were skipped:`);
      validationFailures.forEach((failure, index) => {
        console.log(`\n  ${index + 1}. Row ${failure.row} - "${failure.candidateName}":`);
        failure.errors.forEach((error, errorIndex) => {
          console.log(`     • ${error}`);
        });
      });
      console.log(`\n💡 TIP: Fix these validation issues in your Google Sheet and try syncing again.`);
    } else {
      console.log(`✅ All rows passed validation!`);
    }

    // Get current database data
    const dbRecords = await prisma.aP_Report.findMany();
    const dbData = new Map<number, any>();
    
    dbRecords.forEach(record => {
      dbData.set(record.AP_ID, record);
    });

    console.log(`📊 Database has ${dbRecords.length} existing records`);
    console.log(`📊 About to start transaction processing...`);

    // Perform sync within a transaction
    const result: SyncResult = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      let updated = 0;
      let deleted = 0;
      
      console.log(`📊 Starting transaction - processing ${sheetData.size} updates...`);

      // Process existing items with AP_ID first (UPDATE operations)
      for (const [key, sheetItem] of sheetData.entries()) {
        if (sheetItem.AP_ID) {
          const dbItem = dbData.get(sheetItem.AP_ID);
          
          if (dbItem) {
            // Update existing record
            console.log(`🔄 UPDATING existing record AP_ID: ${sheetItem.AP_ID} - ${sheetItem.CandidateName}`);
            await tx.aP_Report.update({
              where: { AP_ID: dbItem.AP_ID },
              data: {
                StartDate: sheetItem.StartDate,
                EndDate: sheetItem.EndDate,
                AgencyAuthorizedUser: sheetItem.AgencyAuthorizedUser,
                TaskOrderNumber: sheetItem.TaskOrderNumber,
                CandidateName: sheetItem.CandidateName,
                Region: sheetItem.Region,
                JobTitle: sheetItem.JobTitle,
                SkillLevel: sheetItem.SkillLevel,
                TotalHours: sheetItem.TotalHours,
                TimesheetApprovalDate: sheetItem.TimesheetApprovalDate,
                HourlyWageRateBase: sheetItem.HourlyWageRateBase,
                MarkUpPercent: sheetItem.MarkUpPercent,
                HourlyWageRateWithMarkup: sheetItem.HourlyWageRateWithMarkup,
                TotalBilledOGSClient: sheetItem.TotalBilledOGSClient,
                PaidToVendor: sheetItem.PaidToVendor,
                VendorName: sheetItem.VendorName,
                VendorHours: sheetItem.VendorHours,
                HoursMatchInvoice: sheetItem.HoursMatchInvoice,
                InvoiceNumber: sheetItem.InvoiceNumber,
                VendorInvoiceRemarks: sheetItem.VendorInvoiceRemarks,
                VendorInvoiceDate: sheetItem.VendorInvoiceDate,
                TimesheetsApproved: sheetItem.TimesheetsApproved,
                Remark: sheetItem.Remark,
                PaymentTermNet: sheetItem.PaymentTermNet,
                PaymentMode: sheetItem.PaymentMode,
                PaymentDueDate: sheetItem.PaymentDueDate,
                Check: sheetItem.Check,
              }
            });
            updated++;
          } else {
            // AP_ID exists in sheet but not in database - this shouldn't happen
            console.warn(`Warning: AP_ID ${sheetItem.AP_ID} found in sheet but not in database`);
          }
        }
      }

      // Process new items without AP_ID (INSERT operations)
      console.log(`📊 Starting INSERT operations - ${newItemsWithoutApId.length} new items...`);
      for (const newItem of newItemsWithoutApId) {
        console.log(`➕ INSERTING: "${newItem.CandidateName}" (Invoice: ${newItem.InvoiceNumber}, row: ${newItem.rowIndex})`);
        
        const createdItem = await tx.aP_Report.create({
          data: {
            StartDate: newItem.StartDate,
            EndDate: newItem.EndDate,
            AgencyAuthorizedUser: newItem.AgencyAuthorizedUser,
            TaskOrderNumber: newItem.TaskOrderNumber,
            CandidateName: newItem.CandidateName,
            Region: newItem.Region,
            JobTitle: newItem.JobTitle,
            SkillLevel: newItem.SkillLevel,
            TotalHours: newItem.TotalHours,
            TimesheetApprovalDate: newItem.TimesheetApprovalDate,
            HourlyWageRateBase: newItem.HourlyWageRateBase,
            MarkUpPercent: newItem.MarkUpPercent,
            HourlyWageRateWithMarkup: newItem.HourlyWageRateWithMarkup,
            TotalBilledOGSClient: newItem.TotalBilledOGSClient,
            PaidToVendor: newItem.PaidToVendor,
            VendorName: newItem.VendorName,
            VendorHours: newItem.VendorHours,
            HoursMatchInvoice: newItem.HoursMatchInvoice,
            InvoiceNumber: newItem.InvoiceNumber,
            VendorInvoiceRemarks: newItem.VendorInvoiceRemarks,
            VendorInvoiceDate: newItem.VendorInvoiceDate,
            TimesheetsApproved: newItem.TimesheetsApproved,
            Remark: newItem.Remark,
            PaymentTermNet: newItem.PaymentTermNet,
            PaymentMode: newItem.PaymentMode,
            PaymentDueDate: newItem.PaymentDueDate,
            Check: newItem.Check,
          }
        });
        
        // Add AP_ID to the row for sheet update
        newItem.AP_ID = createdItem.AP_ID;
        console.log(`    Created with AP_ID: ${createdItem.AP_ID}`);
        inserted++;
      }

      // DELETE operations - remove records that are in database but not in sheet
      const sheetApIds = new Set([
        ...Array.from(sheetData.values()).filter(item => item.AP_ID).map(item => item.AP_ID!),
        ...newItemsWithoutApId.map(item => item.AP_ID!).filter(Boolean)
      ]);
      
      for (const [apId, dbItem] of dbData.entries()) {
        if (!sheetApIds.has(apId)) {
          await tx.aP_Report.delete({
            where: { AP_ID: apId }
          });
          deleted++;
        }
      }

      return { inserted, updated, deleted };
    });

    // Update Google Sheets with AP_ID for new items
    if (newItemsWithoutApId.length > 0) {
      console.log(`📝 Updating ${newItemsWithoutApId.length} AP_ID values in Google Sheets`);
      
      const updatesForSheet: any[] = [];
      
      // Update AP_ID values for newly created items
      for (const newItem of newItemsWithoutApId) {
        if (newItem.AP_ID && newItem.rowIndex) {
          const cellAddress = sheetName ? `'${sheetName}'!A${newItem.rowIndex + 1}` : `A${newItem.rowIndex + 1}`;
          console.log(`  📍 Will update row ${newItem.rowIndex + 1} (${cellAddress}) with AP_ID: ${newItem.AP_ID}`);
          updatesForSheet.push({
            range: cellAddress,
            values: [[newItem.AP_ID]]
          });
        }
      }
      
      // Apply AP_ID updates to the sheet
      if (updatesForSheet.length > 0) {
        try {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'RAW',
              data: updatesForSheet
            }
          });
          
          console.log(`✅ Successfully updated ${updatesForSheet.length} AP_ID values in Google Sheets`);
        } catch (sheetError) {
          console.error('❌ Error updating Google Sheets with AP_ID values:', sheetError);
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
    console.error('Error syncing AP report sheet:', error);
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
      error: `AP Report sync failed: ${errorMessage}` 
    }, { status: 500 });
  }
} 