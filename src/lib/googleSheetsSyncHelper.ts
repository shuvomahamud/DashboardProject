import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CsvRow {
  [key: string]: string;
}

export async function syncSheetToDatabase(tableKey: string, sheetUrl: string): Promise<void> {
  // Convert Google Sheets URL to CSV export URL
  const csvUrl = convertToCsvUrl(sheetUrl);
  
  // Download CSV data
  const csvData = await downloadCsvData(csvUrl);
  
  // Parse CSV and sync to database
  await syncCsvToDatabase(tableKey, csvData);
}

function convertToCsvUrl(sheetUrl: string): string {
  // Convert Google Sheets URL to CSV export format
  // Example: https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=0
  // Convert to: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=0
  
  const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!spreadsheetIdMatch) {
    throw new Error('Invalid Google Sheets URL format');
  }
  
  const spreadsheetId = spreadsheetIdMatch[1];
  
  // Extract gid (sheet ID) if present
  const gidMatch = sheetUrl.match(/[?&]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

async function downloadCsvData(csvUrl: string): Promise<string> {
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to download CSV: ${response.status} ${response.statusText}`);
  }
  
  return await response.text();
}

async function syncCsvToDatabase(tableKey: string, csvData: string): Promise<void> {
  const rows = parseCsv(csvData);
  if (rows.length === 0) {
    return;
  }
  
  switch (tableKey.toLowerCase()) {
    case 'todo':
      await syncTodoData(rows);
      break;
    case 'interview':
      await syncInterviewData(rows);
      break;
    case 'ap':
      await syncApData(rows);
      break;
    case 'onboarding':
      await syncOnboardingData(rows);
      break;
    default:
      throw new Error(`Unknown table key: ${tableKey}`);
  }
}

function parseCsv(csvData: string): CsvRow[] {
  const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length < 2) {
    return [];
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: CsvRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: CsvRow = {};
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    
    rows.push(row);
  }
  
  return rows;
}

async function syncTodoData(rows: CsvRow[]): Promise<void> {
  for (const row of rows) {
    if (!row.taskname?.trim()) continue;
    
    const taskData = {
      taskname: row.taskname,
      category: row.category || '',
      description: row.description || '',
      plannedstartdate: row.plannedstartdate ? new Date(row.plannedstartdate) : null,
      plannedenddate: row.plannedenddate ? new Date(row.plannedenddate) : null,
      actualstartdate: row.actualstartdate ? new Date(row.actualstartdate) : null,
      actualenddate: row.actualenddate ? new Date(row.actualenddate) : null,
      priority: row.priority || 'Medium',
      status: row.status || 'Not Started',
      completedpercentage: row.completedpercentage ? parseInt(row.completedpercentage) : 0,
      isactive: row.isactive?.toLowerCase() === 'true',
      iscritical: row.iscritical?.toLowerCase() === 'true',
      isdelayed: row.isdelayed?.toLowerCase() === 'true',
      isescalated: row.isescalated?.toLowerCase() === 'true',
      comments: row.comments || '',
      createddate: new Date(),
      updateddate: new Date()
    };
    
    // Check if task exists by name
    const existingTask = await prisma.$queryRaw`
      SELECT taskid FROM todo_list WHERE taskname = ${taskData.taskname}
    ` as Array<{taskid: number}>;
    
    if (existingTask.length === 0) {
      // Insert new task
      await prisma.$executeRaw`
        INSERT INTO todo_list (
          taskname, category, description, plannedstartdate, plannedenddate,
          actualstartdate, actualenddate, priority, status, completedpercentage,
          isactive, iscritical, isdelayed, isescalated, comments, createddate, updateddate
        ) VALUES (
          ${taskData.taskname}, ${taskData.category}, ${taskData.description},
          ${taskData.plannedstartdate}, ${taskData.plannedenddate},
          ${taskData.actualstartdate}, ${taskData.actualenddate},
          ${taskData.priority}, ${taskData.status}, ${taskData.completedpercentage},
          ${taskData.isactive}, ${taskData.iscritical}, ${taskData.isdelayed},
          ${taskData.isescalated}, ${taskData.comments}, ${taskData.createddate},
          ${taskData.updateddate}
        )
      `;
    }
  }
}

async function syncInterviewData(rows: CsvRow[]): Promise<void> {
  for (const row of rows) {
    if (!row.consultantname?.trim()) continue;
    
    const interviewData = {
      hbits_no: row.hbits_no || '',
      consultantname: row.consultantname,
      timeofinterview: row.timeofinterview ? new Date(row.timeofinterview) : null,
      interviewfeedback: row.interviewfeedback || '',
      candidatename: row.candidatename || '',
      clientname: row.clientname || '',
      recruiterleadname: row.recruiterleadname || '',
      recruiterleadcontact: row.recruiterleadcontact || '',
      interviewstatus: row.interviewstatus || 'Pending',
      interviewtype: row.interviewtype || 'Phone',
      interviewrating: row.interviewrating ? parseInt(row.interviewrating) : null,
      comments: row.comments || '',
      createddate: new Date(),
      updateddate: new Date()
    };
    
    // Check if interview exists by consultant name and client
    const existingInterview = await prisma.$queryRaw`
      SELECT interviewid FROM interviews 
      WHERE consultantname = ${interviewData.consultantname} 
      AND clientname = ${interviewData.clientname}
      AND timeofinterview = ${interviewData.timeofinterview}
    ` as Array<{interviewid: number}>;
    
    if (existingInterview.length === 0) {
      // Insert new interview
      await prisma.$executeRaw`
        INSERT INTO interviews (
          hbits_no, consultantname, timeofinterview, interviewfeedback,
          candidatename, clientname, recruiterleadname, recruiterleadcontact,
          interviewstatus, interviewtype, interviewrating, comments,
          createddate, updateddate
        ) VALUES (
          ${interviewData.hbits_no}, ${interviewData.consultantname},
          ${interviewData.timeofinterview}, ${interviewData.interviewfeedback},
          ${interviewData.candidatename}, ${interviewData.clientname},
          ${interviewData.recruiterleadname}, ${interviewData.recruiterleadcontact},
          ${interviewData.interviewstatus}, ${interviewData.interviewtype},
          ${interviewData.interviewrating}, ${interviewData.comments},
          ${interviewData.createddate}, ${interviewData.updateddate}
        )
      `;
    }
  }
}

async function syncApData(rows: CsvRow[]): Promise<void> {
  for (const row of rows) {
    if (!row.candidatename?.trim()) continue;
    
    const apData = {
      startenddate: row.startenddate || '',
      agency: row.agency || '',
      taskordernumber: row.taskordernumber || '',
      candidatename: row.candidatename,
      region: row.region || '',
      jobtitle: row.jobtitle || '',
      skilllevel: row.skilllevel || '',
      totalhours: row.totalhours ? parseFloat(row.totalhours) : 0,
      timesheetapprovaldate: row.timesheetapprovaldate ? new Date(row.timesheetapprovaldate) : null,
      hourlywagerate: row.hourlywagerate ? parseFloat(row.hourlywagerate) : 0,
      vendorname: row.vendorname || '',
      invoicenumber: row.invoicenumber || '',
      invoicedate: row.invoicedate ? new Date(row.invoicedate) : null,
      paymentmode: row.paymentmode || '',
      paymentduedate: row.paymentduedate ? new Date(row.paymentduedate) : null,
      monthyear: row.monthyear || '',
      createddate: new Date(),
      updateddate: new Date()
    };
    
    // Check if AP record exists by candidate name and invoice number
    const existingAp = await prisma.$queryRaw`
      SELECT ap_id FROM ap_report 
      WHERE candidatename = ${apData.candidatename} 
      AND invoicenumber = ${apData.invoicenumber}
    ` as Array<{ap_id: number}>;
    
    if (existingAp.length === 0) {
      // Insert new AP record
      await prisma.$executeRaw`
        INSERT INTO ap_report (
          startenddate, agency, taskordernumber, candidatename, region,
          jobtitle, skilllevel, totalhours, timesheetapprovaldate,
          hourlywagerate, vendorname, invoicenumber, invoicedate,
          paymentmode, paymentduedate, monthyear, createddate, updateddate
        ) VALUES (
          ${apData.startenddate}, ${apData.agency}, ${apData.taskordernumber},
          ${apData.candidatename}, ${apData.region}, ${apData.jobtitle},
          ${apData.skilllevel}, ${apData.totalhours}, ${apData.timesheetapprovaldate},
          ${apData.hourlywagerate}, ${apData.vendorname}, ${apData.invoicenumber},
          ${apData.invoicedate}, ${apData.paymentmode}, ${apData.paymentduedate},
          ${apData.monthyear}, ${apData.createddate}, ${apData.updateddate}
        )
      `;
    }
  }
}

async function syncOnboardingData(rows: CsvRow[]): Promise<void> {
  for (const row of rows) {
    if (!row.candidatename?.trim()) continue;
    
    const onboardingData = {
      candidatename: row.candidatename,
      jobtitle: row.jobtitle || '',
      department: row.department || '',
      startdate: row.startdate ? new Date(row.startdate) : null,
      enddate: row.enddate ? new Date(row.enddate) : null,
      status: row.status || 'Pending',
      comments: row.comments || '',
      createddate: new Date(),
      updateddate: new Date()
    };
    
    // Check if onboarding record exists by candidate name
    const existingOnboarding = await prisma.$queryRaw`
      SELECT onboardingid FROM onboarding 
      WHERE candidatename = ${onboardingData.candidatename}
    ` as Array<{onboardingid: number}>;
    
    if (existingOnboarding.length === 0) {
      // Insert new onboarding record
      await prisma.$executeRaw`
        INSERT INTO onboarding (
          candidatename, jobtitle, department, startdate, enddate,
          status, comments, createddate, updateddate
        ) VALUES (
          ${onboardingData.candidatename}, ${onboardingData.jobtitle},
          ${onboardingData.department}, ${onboardingData.startdate},
          ${onboardingData.enddate}, ${onboardingData.status},
          ${onboardingData.comments}, ${onboardingData.createddate},
          ${onboardingData.updateddate}
        )
      `;
    }
  }
} 