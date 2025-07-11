import { prisma } from '@/lib/prisma';

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
  // Helper function to safely parse dates
  const parseDate = (dateStr: string): string | null => {
    if (!dateStr || dateStr.trim() === '') return null;
    
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: "${dateStr}" - skipping this date`);
      return null;
    }
    
    return date.toISOString().split('T')[0];
  };

  // Get all existing tasks from database
  const existingTasks = await prisma.$queryRaw`
    SELECT taskid, taskname FROM todo_list
  ` as Array<{taskid: number, taskname: string}>;

  // Create a Set of tasknames from the Google Sheet
  const sheetTaskNames = new Set(
    rows.filter(row => row.taskname?.trim()).map(row => row.taskname.trim())
  );

  // 1. DELETE: Remove tasks that are no longer in the Google Sheet
  for (const existingTask of existingTasks) {
    if (!sheetTaskNames.has(existingTask.taskname)) {
      await prisma.$executeRaw`
        DELETE FROM todo_list WHERE taskid = ${existingTask.taskid}
      `;
      console.log(`Deleted task: ${existingTask.taskname}`);
    }
  }

  // 2. INSERT/UPDATE: Process each row from Google Sheet
  for (const row of rows) {
    if (!row.taskname?.trim()) continue;
    
    const taskData = {
      taskname: row.taskname,
      category: (row.category || '').substring(0, 255),
      triggerdate: parseDate(row.triggerdate),
      assignedto: (row.assignedto || '').substring(0, 255),
      internalduedate: parseDate(row.internalduedate),
      actualduedate: parseDate(row.actualduedate),
      status: (row.status || 'Not Started').substring(0, 50),
      requiresfiling: row.requiresfiling?.toLowerCase() === 'true',
      filed: row.filed?.toLowerCase() === 'true',
      followupneeded: row.followupneeded?.toLowerCase() === 'true',
      recurring: row.recurring?.toLowerCase() === 'true',
      nextduedate: parseDate(row.nextduedate),
      note: row.note || null
    };
    
    // Check if task exists by name
    const existingTask = await prisma.$queryRaw`
      SELECT taskid FROM todo_list WHERE taskname = ${taskData.taskname}
    ` as Array<{taskid: number}>;
    
    if (existingTask.length === 0) {
      // INSERT: Add new task
      await prisma.$executeRaw`
        INSERT INTO todo_list (
          taskname, category, triggerdate, assignedto, internalduedate,
          actualduedate, status, requiresfiling, filed, followupneeded,
          recurring, nextduedate, note
        ) VALUES (
          ${taskData.taskname}, ${taskData.category}, ${taskData.triggerdate}::date,
          ${taskData.assignedto}, ${taskData.internalduedate}::date, ${taskData.actualduedate}::date,
          ${taskData.status}, ${taskData.requiresfiling}, ${taskData.filed},
          ${taskData.followupneeded}, ${taskData.recurring}, ${taskData.nextduedate}::date, ${taskData.note}
        )
      `;
      console.log(`Inserted new task: ${taskData.taskname}`);
    } else {
      // UPDATE: Update existing task
      await prisma.$executeRaw`
        UPDATE todo_list SET
          category = ${taskData.category},
          triggerdate = ${taskData.triggerdate}::date,
          assignedto = ${taskData.assignedto},
          internalduedate = ${taskData.internalduedate}::date,
          actualduedate = ${taskData.actualduedate}::date,
          status = ${taskData.status},
          requiresfiling = ${taskData.requiresfiling},
          filed = ${taskData.filed},
          followupneeded = ${taskData.followupneeded},
          recurring = ${taskData.recurring},
          nextduedate = ${taskData.nextduedate}::date,
          note = ${taskData.note}
        WHERE taskid = ${existingTask[0].taskid}
      `;
      console.log(`Updated task: ${taskData.taskname}`);
    }
  }
}

async function syncApData(rows: CsvRow[]): Promise<void> {
  for (const row of rows) {
    if (!row.consultantname?.trim()) continue;
    
    const apData = {
      consultantname: row.consultantname,
      startenddate: row.startenddate ? new Date(row.startenddate) : null,
      agency: row.agency || '',
      taskordernumber: row.taskordernumber || '',
      region: row.region ? parseInt(row.region) : null,
      jobtitle: row.jobtitle || '',
      skilllevel: row.skilllevel ? parseInt(row.skilllevel) : null,
      totalhours: row.totalhours ? parseFloat(row.totalhours) : null,
      timesheetapprovaldate: row.timesheetapprovaldate ? new Date(row.timesheetapprovaldate) : null,
      hourlywagerate: row.hourlywagerate ? parseFloat(row.hourlywagerate) : null,
      vendorname: row.vendorname || '',
      invoicenumber: row.invoicenumber || '',
      invoicedate: row.invoicedate ? new Date(row.invoicedate) : null,
      paymentmode: row.paymentmode || '',
      paymentduedate: row.paymentduedate ? new Date(row.paymentduedate) : null,
      monthyear: row.monthyear || '',
    };

    // Check if record exists
    const existing = await prisma.ap_report.findFirst({
      where: { 
        consultantname: row.consultantname,
        invoicenumber: row.invoicenumber
      }
    });

    if (existing) {
      await prisma.ap_report.update({
        where: { ap_id: existing.ap_id },
        data: apData,
      });
    } else {
      await prisma.ap_report.create({
        data: apData,
      });
    }
  }
}

async function syncInterviewData(rows: CsvRow[]): Promise<void> {
  for (const row of rows) {
    if (!row.consultantname?.trim()) continue;
    
    const interviewData = {
      hbits_no: row.hbits_no || '',
      position: row.position || '',
      level: row.level ? parseInt(row.level) : null,
      mailreceiveddate: row.mailreceiveddate ? new Date(row.mailreceiveddate) : null,
      consultantname: row.consultantname,
      clientsuggesteddates: row.clientsuggesteddates || '',
      maileddatestoconsultant: row.maileddatestoconsultant ? new Date(row.maileddatestoconsultant) : null,
      interviewtimeoptedfor: row.interviewtimeoptedfor || '',
      interviewscheduledmailedtomr: row.interviewscheduledmailedtomr === 'true',
      interviewconfirmedbyclient: row.interviewconfirmedbyclient ? new Date(row.interviewconfirmedbyclient) : null,
      timeofinterview: row.timeofinterview ? new Date(row.timeofinterview) : null,
      thrurecruiter: row.thrurecruiter || '',
      consultantcontactno: row.consultantcontactno || '',
      consultantemail: row.consultantemail || '',
      vendorpocname: row.vendorpocname || '',
      vendornumber: row.vendornumber || '',
      vendoremailid: row.vendoremailid || '',
      candidateselected: row.candidateselected || '',
      monthyear: row.monthyear || '',
    };

    // Check if record exists
    const existing = await prisma.interviews.findFirst({
      where: { 
        consultantname: row.consultantname,
        timeofinterview: interviewData.timeofinterview
      }
    });

    if (existing) {
      await prisma.interviews.update({
        where: { interviewid: existing.interviewid },
        data: interviewData,
      });
    } else {
      await prisma.interviews.create({
        data: interviewData,
      });
    }
  }
} 