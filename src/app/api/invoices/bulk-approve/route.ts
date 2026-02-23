import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bulkApproveInvoices } from '@/lib/billing-service';
import { convexClient, api } from '@/lib/convex';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user role
    if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { invoiceIds } = body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { error: 'Invoice IDs are required' },
        { status: 400 }
      );
    }

    const result = await bulkApproveInvoices(invoiceIds, session.user.id);

    // Log the action
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'INVOICES_BULK_APPROVED',
      entityType: 'Invoice',
      entityId: 'bulk',
      details: { count: result.count, invoiceIds },
    });

    return NextResponse.json({
      message: `${result.count} invoices approved`,
      count: result.count,
    });
  } catch (error) {
    console.error('Error bulk approving invoices:', error);
    return NextResponse.json(
      { error: 'Failed to bulk approve invoices' },
      { status: 500 }
    );
  }
}
