import { NextRequest, NextResponse } from 'next/server';
import { validateBridgeApiKey } from '@/lib/bridge-auth';

export async function GET(request: NextRequest) {
  if (!validateBridgeApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'ok',
    service: 'billing-agent-bridge',
    timestamp: new Date().toISOString(),
  });
}
