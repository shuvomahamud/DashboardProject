import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file must contain at least a header row and one data row' }, { status: 400 });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const expectedHeaders = [
      'category', 'taskname', 'triggerdate', 'assignedto', 'internalduedate', 
      'actualduedate', 'status', 'requiresfiling', 'filed', 'followupneeded', 
      'recurring', 'nextduedate'
    ];

    // Validate headers
    const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return NextResponse.json({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}` 
      }, { status: 400 });
    }

    const results = {
      imported: 0,
      errors: [] as string[]
    };

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const rowData: any = {};

        headers.forEach((header, index) => {
          const value = values[index] || '';
          
          switch (header) {
            case 'triggerdate':
            case 'internalduedate':
            case 'actualduedate':
            case 'nextduedate':
              rowData[header] = value ? new Date(value) : null;
              break;
            case 'requiresfiling':
            case 'filed':
            case 'followupneeded':
            case 'recurring':
              rowData[header] = value.toLowerCase() === 'true';
              break;
            default:
              rowData[header] = value || null;
          }
        });

        await prisma.todo_list.create({
          data: rowData
        });

        results.imported++;
      } catch (error) {
        results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error importing CSV:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 