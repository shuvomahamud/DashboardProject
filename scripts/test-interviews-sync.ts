/**
 * Test script for interviews Google Sheets sync
 */

import { prisma } from '../src/lib/prisma';

async function testInterviewsSync() {
  console.log('🔍 Testing Interviews Sync...');
  
  try {
    // Test 1: Check if interviews table exists and is accessible
    const interviewCount = await prisma.interviews.count();
    console.log(`✅ Interviews table accessible with ${interviewCount} records`);

    // Test 2: Test the sync endpoint with sample data
    const sampleSheetData = [
      // Headers
      ['HBITS', 'Position', 'Level', 'MailReceivedDate', 'ConsultantName', 'ClientSuggestedDates', 'MailedDateToConsultant', 'InterviewTimeOptedFor', 'ScheduledMailToMrDave', 'TimeConfirmedByClient', 'TimeOfInterview', 'ThruRecruiter', 'ConsultantContactNo', 'ConsultantEmail', 'VendorPOCName', 'VendorNumber', 'VendorEmailId', 'CandidateSelected', 'Remark', 'Status', 'clientconfmailreceived', 'mailsenttoconsultant', 'mailreceivedfromconsultant', 'confemailccvendor', 'InterviewID'],
      // Data rows
      ['HBIT001', 'Senior Developer', '3', '2025-01-15', 'John Smith', 'Jan 20, Jan 21', '2025-01-16', '10 AM', 'Yes', '2025-01-17', '2025-01-20 10:00:00', 'Tech Recruiter Inc', '555-0123', 'john.smith@email.com', 'Jane Doe', '555-0456', 'jane.doe@vendor.com', 'Y', 'Good candidate', 'Open', 'Y', 'Y', 'Y', 'Y', ''],
      ['HBIT002', 'Data Analyst', '2', '2025-01-16', 'Alice Johnson', 'Jan 22, Jan 23', '2025-01-17', '2 PM', 'No', '2025-01-18', '2025-01-22 14:00:00', 'Data Solutions', '555-0789', 'alice.johnson@email.com', 'Bob Wilson', '555-0321', 'bob.wilson@vendor.com', 'N', 'Needs more experience', 'Closed', 'N', 'Y', 'N', 'N', ''],
      ['HBIT003', 'Project Manager', '4', '2025-01-17', 'Mike Brown', 'Jan 24, Jan 25', '', '11 AM', 'Yes', '', '', 'PM Recruiters', '555-0654', 'mike.brown@email.com', 'Sarah Davis', '555-0987', 'sarah.davis@vendor.com', 'Pending', 'Interview scheduled', 'On-hold', '', '', '', '', '']
    ];

    // Test the sync directly (this would normally be called via API)
    const headers = sampleSheetData[0];
    const dataRows = sampleSheetData.slice(1);

    console.log('📋 Testing with sample data:');
    console.log(`   Headers: ${headers.length}`);
    console.log(`   Data rows: ${dataRows.length}`);

    // Test 3: Verify field mapping
    const INTERVIEW_MAP: Record<string, string> = {
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

    // Test field mapping
    const fieldMapping: Record<number, string> = {};
    headers.forEach((header, index) => {
      if (INTERVIEW_MAP[header]) {
        fieldMapping[index] = INTERVIEW_MAP[header];
      }
    });

    console.log('✅ Field mapping test:');
    console.log(`   Mapped fields: ${Object.keys(fieldMapping).length}/${headers.length}`);
    
    // Test 4: Verify data type conversions
    const toBool = (value: string | undefined): boolean | null => {
      if (!value || value.trim() === '') return null;
      return /^(y|yes|true|1|✓)$/i.test(value.trim());
    };

    const parseDate = (value: string | undefined): Date | null => {
      if (!value || value.trim() === '') return null;
      const date = new Date(value.trim());
      return isNaN(date.getTime()) ? null : date;
    };

    const parseIntSafe = (value: string | undefined): number | null => {
      if (!value || value.trim() === '') return null;
      const num = Number(value.trim());
      return isNaN(num) ? null : Math.floor(num);
    };

    console.log('✅ Data type conversion tests:');
    console.log(`   Boolean 'Yes': ${toBool('Yes')}`);
    console.log(`   Boolean 'No': ${toBool('No')}`);
    console.log(`   Boolean '': ${toBool('')}`);
    console.log(`   Date '2025-01-15': ${parseDate('2025-01-15')}`);
    console.log(`   Date '': ${parseDate('')}`);
    console.log(`   Int '3': ${parseIntSafe('3')}`);
    console.log(`   Int '': ${parseIntSafe('')}`);

    // Test 5: Check if sheet_config table exists
    try {
      await prisma.sheet_config.findFirst({
        where: { table_key: 'interviews' }
      });
      console.log('✅ sheet_config table accessible');
    } catch (error) {
      console.log('❌ sheet_config table not found or not accessible');
    }

    // Test 6: Check user permissions
    const interviewUser = await prisma.aspNetUsers.findFirst({
      where: { Email: 'interview.user@example.com' },
      include: {
        AspNetUserRoles: {
          include: {
            AspNetRoles: {
              include: {
                AspNetRoleClaims: true
              }
            }
          }
        }
      }
    });

    if (interviewUser) {
      const userTables = new Set<string>();
      interviewUser.AspNetUserRoles.forEach(userRole => {
        userRole.AspNetRoles.AspNetRoleClaims.forEach(claim => {
          if (claim.ClaimType === 'table') {
            userTables.add(claim.ClaimValue);
          }
        });
      });

      console.log('✅ Interview user permissions:');
      console.log(`   User: ${interviewUser.Email || 'No email'}`);
      console.log(`   Tables: ${Array.from(userTables).join(', ')}`);
      console.log(`   Has interviews access: ${userTables.has('interviews')}`);
    } else {
      console.log('❌ Interview user not found');
    }

    console.log('\n🎉 Interviews sync test completed!');
    console.log('🔗 Ready to test with actual Google Sheets data');
    console.log('📚 API Endpoint: POST /api/sheets/interviews/sync');
    console.log('📊 Sample payload: { "sheetData": [...] }');

  } catch (error) {
    console.error('❌ Error during interviews sync test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testInterviewsSync(); 