import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateRcbcInvoice } from '@/lib/rcbc-billing';

// POST - Generate RCBC consolidated invoice for a month
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can generate invoices
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    if (!body.month) {
      return NextResponse.json(
        { error: 'Month is required (format: YYYY-MM)' },
        { status: 400 }
      );
    }

    const result = await generateRcbcInvoice(body.month, session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `RCBC invoice generated successfully`,
      invoiceId: result.invoiceId,
    });
  } catch (error) {
    console.error('Error generating RCBC invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate RCBC invoice' },
      { status: 500 }
    );
  }
}
