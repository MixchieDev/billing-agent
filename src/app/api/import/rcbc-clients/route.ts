import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { parseRcbcClientsCSV, generateRcbcClientsTemplate } from '@/lib/csv-parser';

// GET - Download template
export async function GET() {
  const template = generateRcbcClientsTemplate();

  return new NextResponse(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="rcbc-clients-template.csv"',
    },
  });
}

// POST - Import RCBC clients from CSV
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can import
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file content
    const csvContent = await file.text();

    // Parse CSV
    const parseResult = parseRcbcClientsCSV(csvContent);

    if (!parseResult.success && parseResult.data.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to parse CSV',
          details: parseResult.errors,
        },
        { status: 400 }
      );
    }

    // Process clients
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; message: string }[],
    };

    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];

      try {
        // Convert month to timestamp
        const monthTimestamp = row.month instanceof Date ? row.month.getTime() : new Date(row.month).getTime();

        // Check if client exists for this month
        const existingClients = await convexClient.query(api.rcbcEndClients.list, {
          month: monthTimestamp,
        });
        const existingClient = existingClients.find((c: any) => c.name === row.name);

        const clientData = {
          name: row.name,
          employeeCount: row.employeeCount,
          ratePerEmployee: row.ratePerEmployee,
          month: monthTimestamp,
          isActive: row.isActive,
        };

        if (existingClient) {
          // Update existing client
          await convexClient.mutation(api.rcbcEndClients.update, {
            id: existingClient._id,
            data: clientData,
          });
          results.updated++;
        } else {
          // Create new client
          await convexClient.mutation(api.rcbcEndClients.create, {
            name: clientData.name,
            employeeCount: clientData.employeeCount,
            ratePerEmployee: clientData.ratePerEmployee,
            month: clientData.month,
            isActive: clientData.isActive,
          });
          results.created++;
        }
      } catch (error: any) {
        results.errors.push({ row: i + 2, message: error.message });
        results.skipped++;
      }
    }

    // Audit log
    try {
      await convexClient.mutation(api.auditLogs.create, {
        userId: session.user.id as any,
        action: 'RCBC_CLIENTS_IMPORTED',
        entityType: 'RcbcEndClient',
        entityId: 'bulk',
        details: {
          fileName: file.name,
          totalRows: parseResult.totalRows,
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
        },
      });
    } catch (auditError) {
      console.warn('Failed to create audit log:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
      results,
      parseErrors: parseResult.errors,
    });
  } catch (error) {
    console.error('Error importing RCBC clients:', error);
    return NextResponse.json(
      { error: 'Failed to import RCBC clients' },
      { status: 500 }
    );
  }
}
