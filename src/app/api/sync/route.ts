import { NextRequest, NextResponse } from 'next/server';
import { syncContracts, syncRcbcEndClients, previewSync, fullSync } from '@/lib/data-sync';

// GET - Preview sync status
export async function GET() {
  try {
    const preview = await previewSync();
    return NextResponse.json({
      success: true,
      data: preview,
    });
  } catch (error: any) {
    console.error('[API] Sync preview error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST - Run sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type = 'full', rcbcMonth } = body;

    let result;

    switch (type) {
      case 'contracts':
        result = { contracts: await syncContracts() };
        break;
      case 'rcbc':
        result = { rcbc: await syncRcbcEndClients(rcbcMonth) };
        break;
      case 'full':
      default:
        result = await fullSync(rcbcMonth);
        break;
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[API] Sync error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
