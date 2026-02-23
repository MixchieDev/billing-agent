import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { generateInvoice, GenerateInvoiceRequest } from '@/lib/invoice-generator';
import { autoSendInvoice } from '@/lib/auto-send';
import { VatType } from '@/lib/enums';

/**
 * POST /api/invoices/generate
 * Generate an ad-hoc invoice
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.billingEntityId) {
      return NextResponse.json({ error: 'billingEntityId is required' }, { status: 400 });
    }
    if (!body.billingAmount || body.billingAmount <= 0) {
      return NextResponse.json({ error: 'billingAmount must be greater than 0' }, { status: 400 });
    }
    if (!body.dueDate) {
      return NextResponse.json({ error: 'dueDate is required' }, { status: 400 });
    }

    // Must have either contractId or customBillTo
    if (!body.contractId && !body.customBillTo) {
      return NextResponse.json(
        { error: 'Either contractId or customBillTo is required' },
        { status: 400 }
      );
    }

    // Validate customBillTo if provided
    if (body.customBillTo && !body.customBillTo.name) {
      return NextResponse.json(
        { error: 'customBillTo.name is required' },
        { status: 400 }
      );
    }

    // Check if billing entity exists
    const billingEntity = await convexClient.query(api.companies.getById, {
      id: body.billingEntityId as any,
    });

    if (!billingEntity) {
      return NextResponse.json({ error: 'Billing entity not found' }, { status: 404 });
    }

    // If contractId provided, check if contract exists
    if (body.contractId) {
      const contract = await convexClient.query(api.contracts.getById, {
        id: body.contractId as any,
      });

      if (!contract) {
        return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
      }
    }

    // Parse line items if provided (for multi-month billing)
    const lineItems = body.lineItems?.map((item: { description: string; amount: number; periodStart?: string; periodEnd?: string }) => ({
      description: item.description,
      amount: item.amount,
      periodStart: item.periodStart ? new Date(item.periodStart) : undefined,
      periodEnd: item.periodEnd ? new Date(item.periodEnd) : undefined,
    }));

    // Build request
    const invoiceRequest: GenerateInvoiceRequest = {
      contractId: body.contractId,
      customBillTo: body.customBillTo,
      billingEntityId: body.billingEntityId,
      billingAmount: body.billingAmount,
      dueDate: new Date(body.dueDate),
      vatType: body.vatType as VatType,
      hasWithholding: body.hasWithholding,
      withholdingRate: body.withholdingRate,
      withholdingCode: body.withholdingCode,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      autoApprove: body.autoApprove,
      description: body.description,
      remarks: body.remarks,
      lineItems,
    };

    // Generate invoice
    const result = await generateInvoice(invoiceRequest);

    // If sendImmediately is true and invoice is approved, send it
    let emailSent = false;
    if (body.sendImmediately && result.autoApproved) {
      try {
        await autoSendInvoice(result.invoice.id);
        emailSent = true;
      } catch (emailError) {
        console.error('Failed to send invoice:', emailError);
        // Don't fail the request, just log the error
      }
    }

    // Create audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: (session.user as { id: string }).id as any,
      action: 'INVOICE_GENERATED_ADHOC',
      entityType: 'Invoice',
      entityId: result.invoice.id,
      details: {
        billingNo: result.invoice.billingNo,
        customerName: result.invoice.customerName,
        amount: result.invoice.netAmount,
        autoApproved: result.autoApproved,
        emailSent,
        source: body.contractId ? 'contract' : 'custom',
      },
    });

    return NextResponse.json({
      success: true,
      invoice: result.invoice,
      autoApproved: result.autoApproved,
      emailSent,
    }, { status: 201 });
  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
