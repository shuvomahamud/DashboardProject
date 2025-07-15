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

// Expected headers for AP_Report (AP_ID will be auto-managed)
const EXPECTED_HEADERS = [
  'ap_id', 'start date', 'end date', 'agency / authorized user', 'task order #(s)', 
  'candidate name', 'region', 'job title', 'skill level', 'total hours', 
  'timesheet approved date', 'hourly wage rate (base)', 'mark-up %', 
  'hourly wage rate (+ mark-up)', 'total billed to ogs / client', 'paid to vendor',
  'vendor name', 'hours on vendor invoice', 'hours match invoice (y/n)', 
  'invoice #', 'vendor invoice remarks', 'vendor invoice date', 
  'timesheets approved (y/n)', 'remark', 'payment term net', 'payment mode',
  'payment due date', 'check #'
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
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    
    // Check for required headers with flexible matching
    const requiredHeadersMap = {
      'candidate name': ['candidate name', 'candidatename', 'candidate'],
      'total hours': ['total hours', 'totalhours', 'hours'],
      'invoice #': ['invoice #', 'invoice number', 'inv.no', 'invoice no', 'invno', 'inv no']
    };
    
    const missingHeaders = [];
    for (const [standardHeader, variations] of Object.entries(requiredHeadersMap)) {
      const found = variations.some(variation => headers.includes(variation));
      if (!found) {
        missingHeaders.push(standardHeader);
      }
    }
    
    // Special validation for date columns - accept either separate start/end dates OR combined date
    const hasStartDate = headers.includes('start date');
    const hasEndDate = headers.includes('end date');
    const hasCombinedDate = headers.includes('start /end date') || headers.includes('start/end date');
    
    if (!hasStartDate && !hasCombinedDate) {
      missingHeaders.push('start date (or combined start/end date)');
    }
    if (!hasEndDate && !hasCombinedDate) {
      missingHeaders.push('end date (or combined start/end date)');
    }
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}. 
        
DETECTED HEADERS: [${headers.join(', ')}]
RAW HEADERS: [${rows[0].join(', ')}]

Make sure you have columns with headers matching one of these patterns (case-insensitive):
- Candidate Name: ${requiredHeadersMap['candidate name'].join(', ')}
- Total Hours: ${requiredHeadersMap['total hours'].join(', ')}
- Invoice #: ${requiredHeadersMap['invoice #'].join(', ')}
- Date: Either separate 'Start Date' and 'End Date' columns, OR a single 'Start /End Date' column` 
      }, { status: 422 });
    }

    // Helper function to map headers to standard field names
    const getStandardFieldName = (header: string): string => {
      const headerMappings: { [key: string]: string[] } = {
        'AP_ID': ['ap_id'],
        'StartDate': ['start date', 'start /end date', 'start/end date'],
        'EndDate': ['end date'],
        'AgencyAuthorizedUser': ['agency / authorized user', 'agency/authorized user', 'agency'],
        'TaskOrderNumber': ['task order #(s)', 'task order', 'task order number'],
        'CandidateName': ['candidate name', 'candidatename', 'candidate'],
        'Region': ['region'],
        'JobTitle': ['job title', 'jobtitle'],
        'SkillLevel': ['skill level', 'skilllevel'],
        'TotalHours': ['total hours', 'totalhours', 'hours'],
        'TimesheetApprovalDate': ['timesheet approved date', 'date when approved timesheet was received', 'timesheet approval date'],
        'HourlyWageRateBase': ['hourly wage rate (base)', 'hourly rate'],
        'MarkUpPercent': ['mark-up %', 'mark-up', 'markup'],
        'HourlyWageRateWithMarkup': ['hourly wage rate (+ mark-up)', 'hourly wage rate with markup'],
        'TotalBilledOGSClient': ['total billed to ogs / client', 'total billed to ogs/client', 'total billed'],
        'PaidToVendor': ['paid to vendor', 'paidtovendor'],
        'VendorName': ['vendor name', 'vendorname'],
        'VendorHours': ['hours on vendor invoice', 'hrs shared by vendor', 'vendor hours'],
        'HoursMatchInvoice': ['hours match invoice (y/n)', 'hours match invoice', 'hours match'],
        'InvoiceNumber': ['invoice #', 'invoice number', 'inv.no', 'invoice no', 'invno', 'inv no'],
        'VendorInvoiceRemarks': ['vendor invoice remarks', 'invoice remarks', 'remarks'],
        'VendorInvoiceDate': ['vendor invoice date', 'invoice date'],
        'TimesheetsApproved': ['timesheets approved (y/n)', 'timesheets approved', 'timesheet approved'],
        'Remark': ['remark', 'remarks'],
        'PaymentTermNet': ['payment term net', 'pmt term @ net', 'payment term'],
        'PaymentMode': ['payment mode', 'payment method'],
        'PaymentDueDate': ['payment due date', 'due date'],
        'Check': ['check #', 'check', 'check number', 'check#']
      };
      
      for (const [standardField, variations] of Object.entries(headerMappings)) {
        if (variations.includes(header)) {
          return standardField;
        }
      }
      return header; // Return original if no mapping found
    };

    // Parse sheet data into APReportItems
    const sheetData = new Map<string, APReportItem>();
    const newItemsWithoutApId: APReportItem[] = [];
    
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
      
      // Map each column to the corresponding field
      headers.forEach((header: string, index: number) => {
        const value = row[index] || '';
        let standardField = getStandardFieldName(header);
        
        // Handle duplicate column names by position
        if (header === 'hourly wage rate') {
          // Find all instances of "hourly wage rate" and use position to determine which one
          const hourlyRateIndices = headers.map((h, i) => h === 'hourly wage rate' ? i : -1).filter(i => i !== -1);
          if (hourlyRateIndices.length > 1) {
            if (index === hourlyRateIndices[0]) {
              standardField = 'HourlyWageRateBase';
            } else if (index === hourlyRateIndices[1]) {
              standardField = 'HourlyWageRateWithMarkup';
            }
          } else {
            standardField = 'HourlyWageRateBase'; // Default to base if only one
          }
        }
        
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
            const regionValue = value && value.trim() ? parseInt(value.trim()) : 0;
            item.Region = isNaN(regionValue) ? 0 : regionValue;
            break;
          case 'JobTitle':
            item.JobTitle = value || '';
            break;
          case 'SkillLevel':
            const skillValue = value && value.trim() ? parseInt(value.trim()) : 0;
            item.SkillLevel = isNaN(skillValue) ? 0 : skillValue;
            break;
          case 'TotalHours':
            const totalHoursValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.TotalHours = isNaN(totalHoursValue) ? 0 : totalHoursValue;
            break;
          case 'TimesheetApprovalDate':
            const timesheetDate = value && value.trim() ? new Date(value.trim()) : null;
            const timesheetIsValidDate = timesheetDate && !isNaN(timesheetDate.getTime());
            item.TimesheetApprovalDate = timesheetIsValidDate ? timesheetDate : null;
            break;
          case 'HourlyWageRateBase':
            const baseRateValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.HourlyWageRateBase = isNaN(baseRateValue) ? 0 : baseRateValue;
            break;
          case 'MarkUpPercent':
            const markupValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.MarkUpPercent = isNaN(markupValue) ? 0 : markupValue;
            break;
          case 'HourlyWageRateWithMarkup':
            const markupRateValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.HourlyWageRateWithMarkup = isNaN(markupRateValue) ? 0 : markupRateValue;
            break;
          case 'TotalBilledOGSClient':
            const billedValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.TotalBilledOGSClient = isNaN(billedValue) ? 0 : billedValue;
            break;
          case 'PaidToVendor':
            const paidValue = value && value.trim() ? parseFloat(value.trim()) : 0;
            item.PaidToVendor = isNaN(paidValue) ? 0 : paidValue;
            break;
          case 'VendorName':
            item.VendorName = value || '';
            break;
          case 'VendorHours':
            const vendorHoursValue = value && value.trim() ? parseFloat(value.trim()) : null;
            item.VendorHours = vendorHoursValue && !isNaN(vendorHoursValue) ? vendorHoursValue : null;
            break;
          case 'HoursMatchInvoice':
            const hoursMatchValue = value && value.trim() ? value.trim().toLowerCase() : '';
            item.HoursMatchInvoice = hoursMatchValue === 'y' || hoursMatchValue === 'yes' || hoursMatchValue === 'true';
            break;
          case 'InvoiceNumber':
            item.InvoiceNumber = value || '';
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
            item.PaymentTermNet = isNaN(paymentTermValue) ? 0 : paymentTermValue;
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

      // Skip rows without required fields
      if (!item.CandidateName?.trim() || !item.InvoiceNumber?.trim()) {
        console.log(`Skipping row ${i} - missing required fields: CandidateName or InvoiceNumber`);
        continue;
      }
      
      // Validate required dates
      if (!item.StartDate || !item.EndDate || !item.TimesheetApprovalDate || !item.VendorInvoiceDate || !item.PaymentDueDate) {
        console.log(`Skipping row ${i} - missing required dates:`, {
          StartDate: item.StartDate,
          EndDate: item.EndDate,
          TimesheetApprovalDate: item.TimesheetApprovalDate,
          VendorInvoiceDate: item.VendorInvoiceDate,
          PaymentDueDate: item.PaymentDueDate
        });
        continue;
      }
      
      // Validate other required fields
      if (!item.AgencyAuthorizedUser?.trim() || !item.TaskOrderNumber?.trim() || !item.JobTitle?.trim() || !item.VendorName?.trim() || !item.PaymentMode?.trim()) {
        console.log(`Skipping row ${i} - missing required text fields`);
        continue;
      }
      
      // Ensure boolean fields are properly set
      if (item.HoursMatchInvoice === undefined) {
        item.HoursMatchInvoice = false;
      }
      if (item.TimesheetsApproved === undefined) {
        item.TimesheetsApproved = false;
      }
      
      // Ensure numeric fields are valid
      if (item.Region === undefined || isNaN(item.Region)) {
        item.Region = 0;
      }
      if (item.SkillLevel === undefined || isNaN(item.SkillLevel)) {
        item.SkillLevel = 0;
      }
      if (item.TotalHours === undefined || isNaN(item.TotalHours)) {
        item.TotalHours = 0;
      }
      if (item.HourlyWageRateBase === undefined || isNaN(item.HourlyWageRateBase)) {
        item.HourlyWageRateBase = 0;
      }
      if (item.MarkUpPercent === undefined || isNaN(item.MarkUpPercent)) {
        item.MarkUpPercent = 0;
      }
      if (item.HourlyWageRateWithMarkup === undefined || isNaN(item.HourlyWageRateWithMarkup)) {
        item.HourlyWageRateWithMarkup = 0;
      }
      if (item.TotalBilledOGSClient === undefined || isNaN(item.TotalBilledOGSClient)) {
        item.TotalBilledOGSClient = 0;
      }
      if (item.PaidToVendor === undefined || isNaN(item.PaidToVendor)) {
        item.PaidToVendor = 0;
      }
      if (item.PaymentTermNet === undefined || isNaN(item.PaymentTermNet)) {
        item.PaymentTermNet = 0;
      }
      
      // Ensure string fields are not null
      if (!item.Remark) {
        item.Remark = '';
      }
      if (!item.Check) {
        item.Check = '';
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

      if (item.AP_ID && item.AP_ID > 0) {
        // Existing item with valid AP_ID
        console.log(`Row ${i}: Existing item with AP_ID ${item.AP_ID} - "${item.CandidateName}"`);
        sheetData.set(`ap_id_${item.AP_ID}`, item);
      } else {
        // New item without AP_ID (or invalid AP_ID)
        console.log(`Row ${i}: New item without AP_ID - "${item.CandidateName}" (AP_ID value was: "${row[apIdColumnIndex] || 'empty'}")`);
        newItemsWithoutApId.push(item);
      }
    }
    
    console.log(`Found ${sheetData.size} existing items and ${newItemsWithoutApId.length} new items`);

    // Get current database data
    const dbRecords = await prisma.aP_Report.findMany();
    const dbData = new Map<number, any>();
    
    dbRecords.forEach(record => {
      dbData.set(record.AP_ID, record);
    });

    // Perform sync within a transaction
    const result: SyncResult = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      let updated = 0;
      let deleted = 0;

      // Process existing items with AP_ID first (UPDATE operations)
      for (const [key, sheetItem] of sheetData.entries()) {
        if (sheetItem.AP_ID) {
          const dbItem = dbData.get(sheetItem.AP_ID);
          
          if (dbItem) {
            // Update existing record
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
      console.log(`Inserting ${newItemsWithoutApId.length} new items into database`);
      for (const newItem of newItemsWithoutApId) {
        console.log(`  Inserting: "${newItem.CandidateName}" (Invoice: ${newItem.InvoiceNumber}, row: ${newItem.rowIndex})`);
        
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
    console.log(`AP Report sync completed: ${result.inserted} inserted, ${result.updated} updated, ${result.deleted} deleted (${duration}ms)`);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing AP report sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      error: `AP Report sync failed: ${errorMessage}` 
    }, { status: 500 });
  }
} 