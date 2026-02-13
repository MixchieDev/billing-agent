import { NextResponse } from 'next/server';
import { getProductTypes } from '@/lib/settings';

export async function GET() {
  const productTypes = await getProductTypes();
  return NextResponse.json(productTypes);
}
