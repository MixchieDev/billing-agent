import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
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

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvContent = await file.text();
    const parseResult = parseRcbcClientsCSV(csvContent);

    if (!parseResult.success && parseResult.data.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV', details: parseResult.errors },
        { status: 400 },
      );
    }

    // ==================== BATCH-FETCH EXISTING CLIENTS ====================
    // Collect unique months from the CSV to scope the query
    const uniqueMonths = [...new Set(parseResult.data.map(r => r.month.toISOString()))];

    const existingClients = await prisma.rcbcEndClient.findMany({
      where: { month: { in: uniqueMonths.map(m => new Date(m)) } },
      select: { id: true, name: true, month: true },
    });

    // Build lookup map: "name::month" -> existing record
    const existingMap = new Map<string, { id: string }>();
    for (const client of existingClients) {
      existingMap.set(`${client.name}::${client.month.toISOString()}`, client);
    }

    // ==================== BUILD TRANSACTION ====================
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; message: string }[],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactionOps: any[] = [];

    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];

      const clientData = {
        name: row.name,
        employeeCount: row.employeeCount,
        ratePerEmployee: row.ratePerEmployee,
        month: row.month,
        isActive: row.isActive,
      };

      const key = `${row.name}::${row.month.toISOString()}`;
      const existing = existingMap.get(key);

      if (existing) {
        transactionOps.push(
          prisma.rcbcEndClient.update({ where: { id: existing.id }, data: clientData })
        );
        results.updated++;
      } else {
        transactionOps.push(
          prisma.rcbcEndClient.create({ data: clientData })
        );
        results.created++;
      }
    }

    // Execute all writes in a single transaction
    if (transactionOps.length > 0) {
      try {
        await prisma.$transaction(transactionOps);
      } catch (error: any) {
        console.error('Transaction failed:', error);
        return NextResponse.json({
          success: false,
          message: `Import failed: ${error.message}`,
          results: { created: 0, updated: 0, skipped: results.skipped, errors: [{ row: 0, message: error.message }] },
          parseErrors: parseResult.errors,
        }, { status: 500 });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
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
      },
    });

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
