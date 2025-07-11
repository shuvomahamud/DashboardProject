import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

// Column name constant to prevent future typos
const SHEET_CONFIG_SELECT = 'table_key AS tablekey, sheet_url AS sheeturl';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all sheet configurations
    const configs = await prisma.$queryRaw`
      SELECT table_key AS tablekey, sheet_url AS sheeturl 
      FROM sheet_config 
      WHERE 1=1
    ` as Array<{tablekey: string, sheeturl: string}>;
    
    const result: Record<string, string> = {};
    for (const config of configs) {
      result[config.tablekey] = config.sheeturl;
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching sheet configs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    
    // Update or insert sheet configurations
    for (const [tableKey, sheetUrl] of Object.entries(data)) {
      if (typeof sheetUrl === 'string' && sheetUrl.trim()) {
        await prisma.$executeRaw`
          INSERT INTO sheet_config (table_key, sheet_url, updated_utc) 
          VALUES (${tableKey}, ${sheetUrl}, NOW())
          ON CONFLICT (table_key) 
          DO UPDATE SET 
            sheet_url = EXCLUDED.sheet_url,
            updated_utc = EXCLUDED.updated_utc
        `;
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating sheet configs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 