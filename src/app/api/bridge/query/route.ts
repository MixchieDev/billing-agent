import { NextRequest, NextResponse } from 'next/server';
import { validateBridgeApiKey } from '@/lib/bridge-auth';
import { convexClient, api } from '@/lib/convex';

/**
 * POST /api/bridge/query
 *
 * Read-only query endpoint for the Collector.
 * Supports: contracts, invoices, payments, billing_summary
 */
export async function POST(request: NextRequest) {
  // Auth check
  if (!validateBridgeApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { entity, searchTerm, contractId, status, nexusAgreementId } = body;

    if (!entity) {
      return NextResponse.json({ error: 'entity is required' }, { status: 400 });
    }

    switch (entity) {
      case 'contracts': {
        let contracts = await convexClient.query(api.contracts.list, {
          ...(status ? { status } : {}),
        });

        // Apply additional filters client-side
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          contracts = contracts.filter((c: any) =>
            c.companyName?.toLowerCase().includes(term)
          );
        }
        if (nexusAgreementId) {
          // Need to check bridge mappings
          const mapping = await convexClient.query(api.bridgeMappings.getByNexusAgreementId, {
            nexusAgreementId,
          });
          if (mapping) {
            contracts = contracts.filter((c: any) => c._id === mapping.contractId);
          } else {
            contracts = [];
          }
        }

        // Limit to 20
        contracts = contracts.slice(0, 20);

        // Get bridge mappings for each contract
        const contractsWithMappings = await Promise.all(
          contracts.map(async (c: any) => {
            const bridgeMapping = await convexClient.query(api.bridgeMappings.getByContractId, {
              contractId: c._id,
            });
            return {
              id: c._id,
              companyName: c.companyName,
              productType: c.productType,
              status: c.status,
              monthlyFee: Number(c.monthlyFee),
              billingAmount: c.billingAmount ? Number(c.billingAmount) : null,
              nextDueDate: c.nextDueDate,
              billingEntity: c.billingEntity?.code || null,
              email: c.email,
              contactPerson: c.contactPerson,
              nexusAgreementId: bridgeMapping?.nexusAgreementId || null,
            };
          })
        );

        return NextResponse.json({
          entity: 'contracts',
          count: contractsWithMappings.length,
          data: contractsWithMappings,
        });
      }

      case 'invoices': {
        let invoices = await convexClient.query(api.invoices.list, {
          ...(status ? { status } : {}),
        });

        // Apply additional filters client-side
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          invoices = invoices.filter((inv: any) =>
            inv.customerName?.toLowerCase().includes(term)
          );
        }
        if (contractId) {
          // Filter by contractId through contractInvoices if needed
          invoices = invoices.filter((inv: any) => inv.contractId === contractId);
        }

        // Limit to 20, sort by dueDate desc
        invoices.sort((a: any, b: any) => (b.dueDate || 0) - (a.dueDate || 0));
        invoices = invoices.slice(0, 20);

        return NextResponse.json({
          entity: 'invoices',
          count: invoices.length,
          data: invoices.map((inv: any) => ({
            id: inv._id,
            invoiceNo: inv.invoiceNo,
            billingNo: inv.billingNo,
            customerName: inv.customerName,
            status: inv.status,
            serviceFee: Number(inv.serviceFee),
            vatAmount: Number(inv.vatAmount),
            netAmount: Number(inv.netAmount),
            dueDate: inv.dueDate,
            paidAt: inv.paidAt,
            paidAmount: inv.paidAmount ? Number(inv.paidAmount) : null,
            billingEntity: inv.company?.code || null,
          })),
        });
      }

      case 'payments': {
        let payments = await convexClient.query(api.invoices.list, {
          status: 'PAID',
        });

        // Apply search filter
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          payments = payments.filter((inv: any) =>
            inv.customerName?.toLowerCase().includes(term)
          );
        }

        // Sort by paidAt desc and limit to 20
        payments.sort((a: any, b: any) => (b.paidAt || 0) - (a.paidAt || 0));
        payments = payments.slice(0, 20);

        return NextResponse.json({
          entity: 'payments',
          count: payments.length,
          data: payments.map((inv: any) => ({
            id: inv._id,
            invoiceNo: inv.invoiceNo,
            customerName: inv.customerName,
            netAmount: Number(inv.netAmount),
            paidAmount: inv.paidAmount ? Number(inv.paidAmount) : null,
            paidAt: inv.paidAt,
            paymentMethod: inv.paymentMethod,
            paymentReference: inv.paymentReference,
            billingEntity: inv.company?.code || null,
          })),
        });
      }

      case 'billing_summary': {
        const [totalContracts, activeContracts, totalInvoices, paidInvoices] =
          await Promise.all([
            convexClient.query(api.contracts.count, {}),
            convexClient.query(api.contracts.count, { status: 'ACTIVE' }),
            convexClient.query(api.invoices.count, {}),
            convexClient.query(api.invoices.count, { status: 'PAID' }),
          ]);

        // Get overdue invoices (SENT with dueDate < now)
        const sentInvoices = await convexClient.query(api.invoices.list, { status: 'SENT' });
        const now = Date.now();
        const overdueInvoices = sentInvoices.filter((inv: any) => inv.dueDate && inv.dueDate < now).length;

        return NextResponse.json({
          entity: 'billing_summary',
          data: {
            totalContracts,
            activeContracts,
            totalInvoices,
            paidInvoices,
            overdueInvoices,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown entity: ${entity}. Supported: contracts, invoices, payments, billing_summary` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Bridge query error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
