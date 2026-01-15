import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Verify the request is from Vercel Cron or an authenticated admin
 */
async function verifyCronOrAdmin(request: NextRequest): Promise<{ authorized: boolean; source: string }> {
  // Check for CRON_SECRET (Vercel Cron sends this in Authorization header)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { authorized: true, source: 'vercel-cron' };
  }

  // Fallback to session auth for manual triggers
  const session = await getServerSession(authOptions);
  if (session?.user?.role === 'ADMIN') {
    return { authorized: true, source: 'admin-user' };
  }

  return { authorized: false, source: 'unknown' };
}

// GET - Vercel Cron calls this endpoint
export async function GET(request: NextRequest) {
  try {
    const { authorized, source } = await verifyCronOrAdmin(request);

    if (!authorized) {
      console.log('[Cron Trigger] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Cron Trigger] Running billing job (source: ${source})`);

    // Dynamic import to avoid node-cron issues in serverless
    const { triggerBillingJob } = await import('@/lib/scheduler');
    const result = await triggerBillingJob();

    return NextResponse.json({
      message: 'Billing job triggered successfully',
      source,
      ...result,
    });
  } catch (error) {
    console.error('[Cron Trigger] Error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger billing job' },
      { status: 500 }
    );
  }
}

// POST - Manual trigger from UI (requires admin session)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can manually trigger
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[Cron Trigger] Manual trigger by admin');

    // Dynamic import to avoid node-cron issues in serverless
    const { triggerBillingJob } = await import('@/lib/scheduler');
    const result = await triggerBillingJob();

    return NextResponse.json({
      message: 'Billing job triggered successfully',
      source: 'manual',
      ...result,
    });
  } catch (error) {
    console.error('[Cron Trigger] Error:', error);
    return NextResponse.json(
      { error: 'Failed to trigger billing job' },
      { status: 500 }
    );
  }
}
