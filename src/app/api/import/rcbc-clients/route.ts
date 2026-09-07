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

    // ==================== COLLAPSE IN-FILE DUPLICATES ====================
    // A client can only appear once per month (RcbcEndClient @@unique([name, month])).
    // Spreadsheets often repeat a client, which would put two conflicting writes
    // in one transaction and fail the whole import. Collapse them here —
    // last row wins — and report what was merged.
    const dedupedByKey = new Map<string, (typeof parseResult.data)[number]>();
    const duplicateNames = new Set<string>();
    for (const row of parseResult.data) {
      const key = `${row.name}::${row.month.toISOString()}`;
      if (dedupedByKey.has(key)) duplicateNames.add(row.name);
      dedupedByKey.set(key, row); // later row wins
    }
    const rowsToImport = [...dedupedByKey.values()];

    // ==================== BATCH-FETCH EXISTING CLIENTS ====================
    // Collect unique months from the CSV to scope the query
    const uniqueMonths = [...new Set(rowsToImport.map(r => r.month.toISOString()))];

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

    for (const row of rowsToImport) {
      const clientData = {
        name: row.name,
        employeeCount: row.employeeCount,
        ratePerEmployee: row.ratePerEmployee,
        month: row.month,
        isActive: row.isActive,
      };

      const key = `${row.name}::${row.month.toISOString()}`;
      if (existingMap.has(key)) results.updated++;
      else results.created++;

      // Upsert on the unique key so a row created between the pre-fetch and
      // this write can't blow up the transaction.
      transactionOps.push(
        prisma.rcbcEndClient.upsert({
          where: { name_month: { name: row.name, month: row.month } },
          update: clientData,
          create: clientData,
        })
      );
    }

    // Execute all writes in a single transaction
    if (transactionOps.length > 0) {
      try {
        await prisma.$transaction(transactionOps);
      } catch (error: any) {
        console.error('Transaction failed:', error);
        // Surface a usable reason. `error` is the field the import modal reads.
        const detail =
          error?.code === 'P2002'
            ? 'Two rows target the same client and month. Remove the duplicate row and try again.'
            : error?.message || 'Unknown database error';
        return NextResponse.json({
          success: false,
          error: `Import failed: ${detail}`,
          message: `Import failed: ${detail}`,
          results: { created: 0, updated: 0, skipped: results.skipped, errors: [{ row: 0, message: detail }] },
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
          duplicatesMerged: duplicateNames.size,
        },
      },
    });

    const duplicateNote =
      duplicateNames.size > 0
        ? ` (merged ${duplicateNames.size} duplicate ${duplicateNames.size === 1 ? 'client' : 'clients'}: ${[...duplicateNames].join(', ')} — kept the last row)`
        : '';

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped${duplicateNote}`,
      results,
      duplicatesMerged: [...duplicateNames],
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
