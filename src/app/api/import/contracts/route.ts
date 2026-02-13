import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseContractsCSV, generateContractsTemplate, ContractCSVRow } from '@/lib/csv-parser';
import { ContractStatus, VatType, BillingType } from '@/generated/prisma';
import { getProductTypes } from '@/lib/settings';

// GET - Download template
export async function GET() {
  const template = generateContractsTemplate();

  return new NextResponse(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="contracts-template.csv"',
    },
  });
}

// Status mapping
const statusMap: Record<string, ContractStatus> = {
  'ACTIVE': ContractStatus.ACTIVE,
  'INACTIVE': ContractStatus.INACTIVE,
  'STOPPED': ContractStatus.STOPPED,
  'NOT_STARTED': ContractStatus.NOT_STARTED,
};

// Validated row type
interface ValidatedRow {
  rowNumber: number;
  action: 'create' | 'update' | 'skip';
  data: {
    customerId: string;
    companyName: string;
    productType: string;
    partner: string;
    billingEntity: string;
    monthlyFee: number;
    status: string;
    vatType: string;
    billingType: string;
    contactPerson?: string;
    email?: string;
    tin?: string;
    mobile?: string;
    remarks?: string;
    paymentPlan?: string;
    contractStart?: string;
    nextDueDate?: string;
  };
  existingContract?: {
    id: string;
    companyName: string;
    customerNumber: string | null;
  };
  customerNumberToAssign?: string;
  errors: string[];
  warnings: string[];
  _partnerId?: string;
  _companyId?: string;
  _companyCode?: string;
  _companyContractPrefix?: string | null;
  _existingContractId?: string;
  _resolvedProductType?: string;
}

// Shared validation logic for both CSV and JSON input
async function validateRows(rows: ContractCSVRow[], startRowNumber: number = 2) {
  // Load reference data from DB (3 parallel queries)
  const [partners, companies, configuredTypes] = await Promise.all([
    prisma.partner.findMany(),
    prisma.company.findMany(),
    getProductTypes(),
  ]);

  const validProductTypes = configuredTypes.map(t => t.value);
  const partnerMap = new Map(partners.map(p => [p.code, p]));
  const companyMap = new Map(companies.map(c => [c.code, c]));

  // Track customerNumber counters per company for preview
  const companyCounters = new Map<string, number>();
  for (const company of companies) {
    companyCounters.set(company.id, company.nextContractNo || 1);
  }

  // ==================== BATCH-FETCH EXISTING CONTRACTS ====================
  const billingEntityIds = new Set<string>();
  for (const row of rows) {
    const company = companyMap.get(row.billingEntity);
    if (company) billingEntityIds.add(company.id);
  }

  let existingContracts: Array<{ id: string; companyName: string; customerNumber: string | null; customerId: string | null; productType: string; billingEntityId: string }> = [];
  if (billingEntityIds.size > 0) {
    existingContracts = await prisma.contract.findMany({
      where: { billingEntityId: { in: [...billingEntityIds] } },
      select: { id: true, companyName: true, customerNumber: true, customerId: true, productType: true, billingEntityId: true },
    });
  }

  // Build lookup maps
  const contractByCustomerId = new Map<string, typeof existingContracts[0]>();
  const contractByNameType = new Map<string, typeof existingContracts[0]>();
  for (const contract of existingContracts) {
    if (contract.customerId) {
      contractByCustomerId.set(`${contract.customerId}::${contract.billingEntityId}`, contract);
    }
    contractByNameType.set(`${contract.companyName}::${contract.productType}::${contract.billingEntityId}`, contract);
  }

  // ==================== VALIDATE EACH ROW ====================
  const seenPairs = new Map<string, number>();
  const validatedRows: ValidatedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = startRowNumber + i;
    const errors: string[] = [];
    const warnings: string[] = [];
    let action: 'create' | 'update' | 'skip' = 'create';

    const partner = partnerMap.get(row.partner);
    if (!partner) {
      errors.push(`Partner not found: ${row.partner}`);
    }

    const company = companyMap.get(row.billingEntity);
    if (!company) {
      errors.push(`Billing entity not found: ${row.billingEntity}`);
    }

    if (!row.companyName) {
      errors.push('Missing companyName');
    }

    if (row.monthlyFee <= 0) {
      errors.push('Invalid monthlyFee');
    }

    let resolvedProductType = row.productType;
    if (!validProductTypes.includes(row.productType)) {
      const fallback = validProductTypes[0] || 'ACCOUNTING';
      warnings.push(`Unknown product type "${row.productType}" — will default to ${fallback}`);
      resolvedProductType = fallback;
    }

    // Dedup within batch
    const dedupKey = row.customerId
      ? `${row.customerId}::${row.billingEntity}`
      : `${row.companyName}::${row.productType}::${row.billingEntity}`;

    const firstRow = seenPairs.get(dedupKey);
    if (firstRow !== undefined) {
      warnings.push(`Duplicate of row ${firstRow} (same ${row.customerId ? 'customerId + billingEntity' : 'companyName + productType + billingEntity'})`);
    } else {
      seenPairs.set(dedupKey, rowNumber);
    }

    // Check existing contract using pre-fetched map
    let existingContract: typeof existingContracts[0] | undefined;
    if (company) {
      if (row.customerId) {
        existingContract = contractByCustomerId.get(`${row.customerId}::${company.id}`);
      }
      if (!existingContract) {
        existingContract = contractByNameType.get(`${row.companyName}::${row.productType}::${company.id}`);
      }
    }

    if (existingContract) action = 'update';
    if (errors.length > 0) action = 'skip';

    let customerNumberToAssign: string | undefined;
    if (action === 'create' && company) {
      const currentNo = companyCounters.get(company.id) || 1;
      const prefix = company.contractPrefix || company.code;
      customerNumberToAssign = `${prefix}-${String(currentNo).padStart(4, '0')}`;
      companyCounters.set(company.id, currentNo + 1);
    }

    validatedRows.push({
      rowNumber,
      action,
      data: {
        customerId: row.customerId || '',
        companyName: row.companyName,
        productType: row.productType,
        partner: row.partner,
        billingEntity: row.billingEntity,
        monthlyFee: row.monthlyFee,
        status: row.status || 'ACTIVE',
        vatType: row.vatType || 'VAT',
        billingType: row.billingType || 'RECURRING',
        contactPerson: row.contactPerson,
        email: row.email,
        tin: row.tin,
        mobile: row.mobile,
        remarks: row.remarks,
        paymentPlan: row.paymentPlan,
        contractStart: row.contractStart ? row.contractStart.toISOString() : undefined,
        nextDueDate: row.nextDueDate ? row.nextDueDate.toISOString() : undefined,
      },
      existingContract: existingContract ? {
        id: existingContract.id,
        companyName: existingContract.companyName,
        customerNumber: existingContract.customerNumber,
      } : undefined,
      customerNumberToAssign,
      errors,
      warnings,
      _partnerId: partner?.id,
      _companyId: company?.id,
      _companyCode: company?.code,
      _companyContractPrefix: company?.contractPrefix,
      _existingContractId: existingContract?.id,
      _resolvedProductType: resolvedProductType,
    });
  }

  return { validatedRows, companies, companyCounters, validProductTypes };
}

// Build validate response
function buildValidateResponse(validatedRows: ValidatedRow[], totalRows: number, parseErrors: { row: number; message: string }[] = []) {
  const summary = {
    totalRows,
    toCreate: validatedRows.filter(r => r.action === 'create').length,
    toUpdate: validatedRows.filter(r => r.action === 'update').length,
    errors: validatedRows.filter(r => r.action === 'skip').length,
    warnings: validatedRows.filter(r => r.warnings.length > 0).length,
  };

  const rows = validatedRows.map(({ _partnerId, _companyId, _companyCode, _companyContractPrefix, _existingContractId, _resolvedProductType, ...rest }) => rest);

  return NextResponse.json({ success: true, summary, rows, parseErrors });
}

// Execute import from validated rows
async function executeImport(
  validatedRows: ValidatedRow[],
  companies: Awaited<ReturnType<typeof prisma.company.findMany>>,
  userId: string,
  fileName: string,
  totalRows: number,
  parseErrors: { row: number; message: string }[] = [],
) {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as { row: number; message: string }[],
    warnings: [] as { row: number; message: string }[],
  };

  const importCounters = new Map<string, number>();
  for (const c of companies) {
    importCounters.set(c.id, c.nextContractNo || 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactionOps: any[] = [];

  for (const row of validatedRows) {
    if (row.action === 'skip') {
      results.errors.push({ row: row.rowNumber, message: row.errors.join('; ') });
      results.skipped++;
      continue;
    }

    if (row.warnings.length > 0) {
      results.warnings.push({ row: row.rowNumber, message: row.warnings.join('; ') });
    }

    const contractData = {
      customerId: row.data.customerId || null,
      companyName: row.data.companyName,
      productType: row._resolvedProductType || row.data.productType,
      partnerId: row._partnerId!,
      billingEntityId: row._companyId!,
      monthlyFee: row.data.monthlyFee,
      paymentPlan: row.data.paymentPlan || null,
      contractStart: row.data.contractStart ? new Date(row.data.contractStart) : null,
      nextDueDate: row.data.nextDueDate ? new Date(row.data.nextDueDate) : null,
      status: statusMap[row.data.status?.toUpperCase() || 'ACTIVE'] || ContractStatus.ACTIVE,
      vatType: row.data.vatType?.toUpperCase() === 'NON_VAT' ? VatType.NON_VAT : VatType.VAT,
      billingType: row.data.billingType?.toUpperCase() === 'ONE_TIME' ? BillingType.ONE_TIME : BillingType.RECURRING,
      contactPerson: row.data.contactPerson || null,
      email: row.data.email || null,
      tin: row.data.tin || null,
      mobile: row.data.mobile || null,
      remarks: row.data.remarks || null,
    };

    if (row._existingContractId) {
      transactionOps.push(
        prisma.contract.update({ where: { id: row._existingContractId }, data: contractData })
      );
      results.updated++;
    } else {
      const currentNo = importCounters.get(row._companyId!) || 1;
      const prefix = row._companyContractPrefix || row._companyCode!;
      const customerNumber = `${prefix}-${String(currentNo).padStart(4, '0')}`;
      importCounters.set(row._companyId!, currentNo + 1);

      transactionOps.push(
        prisma.contract.create({ data: { ...contractData, customerNumber } })
      );
      results.created++;
    }
  }

  // Company counter updates
  for (const [companyId, nextNo] of importCounters.entries()) {
    const original = companies.find(c => c.id === companyId);
    if (original && nextNo !== (original.nextContractNo || 1)) {
      transactionOps.push(
        prisma.company.update({ where: { id: companyId }, data: { nextContractNo: nextNo } })
      );
    }
  }

  if (transactionOps.length > 0) {
    try {
      await prisma.$transaction(transactionOps);
    } catch (error: any) {
      console.error('Transaction failed:', error);
      return NextResponse.json({
        success: false,
        message: `Import failed: ${error.message}`,
        results: { created: 0, updated: 0, skipped: results.skipped, errors: [{ row: 0, message: error.message }], warnings: results.warnings },
        parseErrors,
      }, { status: 500 });
    }
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CONTRACTS_IMPORTED',
      entityType: 'Contract',
      entityId: 'bulk',
      details: { fileName, totalRows, created: results.created, updated: results.updated, skipped: results.skipped },
    },
  });

  return NextResponse.json({
    success: true,
    message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
    results,
    parseErrors,
  });
}

// Convert JSON row data to ContractCSVRow format
function jsonRowToCSVRow(row: Record<string, any>): ContractCSVRow {
  return {
    customerId: row.customerId || '',
    companyName: row.companyName || '',
    productType: (row.productType || '').toUpperCase(),
    partner: row.partner || '',
    billingEntity: (row.billingEntity || '').toUpperCase(),
    monthlyFee: typeof row.monthlyFee === 'number' ? row.monthlyFee : parseFloat(row.monthlyFee) || 0,
    paymentPlan: row.paymentPlan || undefined,
    contractStart: row.contractStart ? new Date(row.contractStart) : undefined,
    nextDueDate: row.nextDueDate ? new Date(row.nextDueDate) : undefined,
    status: row.status || 'ACTIVE',
    vatType: row.vatType || 'VAT',
    billingType: row.billingType || 'RECURRING',
    contactPerson: row.contactPerson || undefined,
    email: row.email || undefined,
    tin: row.tin || undefined,
    mobile: row.mobile || undefined,
    remarks: row.remarks || undefined,
  };
}

// POST - Validate or import contracts (CSV or JSON)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'import';

    // ==================== JSON MODES (edited data from preview) ====================
    if (mode === 'validate-json' || mode === 'import-json') {
      const body = await request.json();
      const jsonRows = body.rows as Record<string, any>[];

      if (!jsonRows || !Array.isArray(jsonRows) || jsonRows.length === 0) {
        return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
      }

      const csvRows = jsonRows.map(jsonRowToCSVRow);
      const { validatedRows, companies } = await validateRows(csvRows, 1);

      if (mode === 'validate-json') {
        return buildValidateResponse(validatedRows, jsonRows.length);
      }

      // import-json
      return executeImport(validatedRows, companies, session.user.id, 'edited-import', jsonRows.length);
    }

    // ==================== CSV MODES (file upload) ====================
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const csvContent = await file.text();
    const parseResult = parseContractsCSV(csvContent);

    if (!parseResult.success && parseResult.data.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV', details: parseResult.errors },
        { status: 400 }
      );
    }

    const { validatedRows, companies } = await validateRows(parseResult.data);

    if (mode === 'validate') {
      return buildValidateResponse(validatedRows, parseResult.totalRows, parseResult.errors);
    }

    // import (default)
    return executeImport(validatedRows, companies, session.user.id, file.name, parseResult.totalRows, parseResult.errors);
  } catch (error) {
    console.error('Error importing contracts:', error);
    return NextResponse.json(
      { error: 'Failed to import contracts' },
      { status: 500 }
    );
  }
}
