import { NextRequest, NextResponse } from 'next/server';
import { validateBridgeApiKey } from '@/lib/bridge-auth';
import prisma from '@/lib/prisma';

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
        const where: any = {};
        if (searchTerm) {
          where.companyName = { contains: searchTerm, mode: 'insensitive' };
        }
        if (status) {
          where.status = status;
        }
        if (nexusAgreementId) {
          where.bridgeMappings = { some: { nexusAgreementId } };
        }

        const contracts = await prisma.contract.findMany({
          where,
          include: { billingEntity: true, bridgeMappings: true },
          take: 20,
          orderBy: { updatedAt: 'desc' },
        });

        return NextResponse.json({
          entity: 'contracts',
          count: contracts.length,
          data: contracts.map((c) => ({
            id: c.id,
            companyName: c.companyName,
            productType: c.productType,
            status: c.status,
            monthlyFee: Number(c.monthlyFee),
            billingAmount: c.billingAmount ? Number(c.billingAmount) : null,
            nextDueDate: c.nextDueDate,
            billingEntity: c.billingEntity?.code || null,
            email: c.email,
            contactPerson: c.contactPerson,
            nexusAgreementId: c.bridgeMappings[0]?.nexusAgreementId || null,
          })),
        });
      }

      case 'invoices': {
        const where: any = {};
        if (searchTerm) {
          where.customerName = { contains: searchTerm, mode: 'insensitive' };
        }
        if (status) {
          where.status = status;
        }
        if (contractId) {
          where.contractId = contractId;
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: { company: true },
          take: 20,
          orderBy: { dueDate: 'desc' },
        });

        return NextResponse.json({
          entity: 'invoices',
          count: invoices.length,
          data: invoices.map((inv) => ({
            id: inv.id,
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
        const where: any = { status: 'PAID' };
        if (searchTerm) {
          where.customerName = { contains: searchTerm, mode: 'insensitive' };
        }

        const payments = await prisma.invoice.findMany({
          where,
          include: { company: true },
          take: 20,
          orderBy: { paidAt: 'desc' },
        });

        return NextResponse.json({
          entity: 'payments',
          count: payments.length,
          data: payments.map((inv) => ({
            id: inv.id,
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
        const [totalContracts, activeContracts, totalInvoices, paidInvoices, overdueInvoices] =
          await Promise.all([
            prisma.contract.count(),
            prisma.contract.count({ where: { status: 'ACTIVE' } }),
            prisma.invoice.count(),
            prisma.invoice.count({ where: { status: 'PAID' } }),
            prisma.invoice.count({
              where: { status: 'SENT', dueDate: { lt: new Date() } },
            }),
          ]);

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
