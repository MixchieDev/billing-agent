import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { parseContractsCSV, generateContractsTemplate } from '@/lib/csv-parser';
import { ProductType, ContractStatus, VatType, BillingType } from '@/lib/enums';

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

// POST - Import contracts from CSV
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can import contracts
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
    const parseResult = parseContractsCSV(csvContent);

    if (!parseResult.success && parseResult.data.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to parse CSV',
          details: parseResult.errors,
        },
        { status: 400 }
      );
    }

    // Get all partners and companies for lookup
    const partners = await convexClient.query(api.partners.list, {});
    const companies = await convexClient.query(api.companies.list, {});

    const partnerMap = new Map(partners.map((p: any) => [p.code, p]));
    const companyMap = new Map(companies.map((c: any) => [c.code, c]));

    // Process contracts
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; message: string }[],
    };

    // Product type mapping
    const productTypeMap: Record<string, ProductType> = {
      'ACCOUNTING': ProductType.ACCOUNTING,
      'PAYROLL': ProductType.PAYROLL,
      'COMPLIANCE': ProductType.COMPLIANCE,
      'HR': ProductType.HR,
    };

    // Status mapping
    const statusMap: Record<string, ContractStatus> = {
      'ACTIVE': ContractStatus.ACTIVE,
      'INACTIVE': ContractStatus.INACTIVE,
      'STOPPED': ContractStatus.STOPPED,
      'NOT_STARTED': ContractStatus.NOT_STARTED,
    };

    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];

      try {
        // Find partner
        const partner = partnerMap.get(row.partner);
        if (!partner) {
          results.errors.push({ row: i + 2, message: `Partner not found: ${row.partner}` });
          results.skipped++;
          continue;
        }

        // Find company
        const company = companyMap.get(row.billingEntity);
        if (!company) {
          results.errors.push({ row: i + 2, message: `Billing entity not found: ${row.billingEntity}` });
          results.skipped++;
          continue;
        }

        // Check if contract exists by searching
        const existingContracts = await convexClient.query(api.contracts.list, {
          billingEntityId: company._id,
        });
        const existingContract = existingContracts.find(
          (c: any) => c.customerId === row.customerId
        );

        const contractData = {
          customerId: row.customerId,
          companyName: row.companyName,
          productType: productTypeMap[row.productType] || ProductType.ACCOUNTING,
          partnerId: partner._id,
          billingEntityId: company._id,
          monthlyFee: row.monthlyFee,
          paymentPlan: row.paymentPlan || null,
          contractStart: row.contractStart ? new Date(row.contractStart).getTime() : null,
          nextDueDate: row.nextDueDate ? new Date(row.nextDueDate).getTime() : null,
          status: statusMap[row.status?.toUpperCase() || 'ACTIVE'] || ContractStatus.ACTIVE,
          vatType: row.vatType?.toUpperCase() === 'NON_VAT' ? VatType.NON_VAT : VatType.VAT,
          billingType: row.billingType?.toUpperCase() === 'ONE_TIME' ? BillingType.ONE_TIME : BillingType.RECURRING,
          contactPerson: row.contactPerson || null,
          email: row.email || null,
          tin: row.tin || null,
          mobile: row.mobile || null,
          remarks: row.remarks || null,
        };

        if (existingContract) {
          // Update existing contract
          await convexClient.mutation(api.contracts.update, {
            id: existingContract._id,
            data: contractData,
          });
          results.updated++;
        } else {
          // Create new contract
          await convexClient.mutation(api.contracts.create, {
            data: contractData,
          });
          results.created++;
        }
      } catch (error: any) {
        results.errors.push({ row: i + 2, message: error.message });
        results.skipped++;
      }
    }

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'CONTRACTS_IMPORTED',
      entityType: 'Contract',
      entityId: 'bulk',
      details: {
        fileName: file.name,
        totalRows: parseResult.totalRows,
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
      results,
      parseErrors: parseResult.errors,
    });
  } catch (error) {
    console.error('Error importing contracts:', error);
    return NextResponse.json(
      { error: 'Failed to import contracts' },
      { status: 500 }
    );
  }
}
