import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import courseHtml from '@/lib/onboarding/course.html.json';

/**
 * The Get started course: a self-contained page (practice copy of the app on
 * invented clients, handbook, checklist) shown in an iframe on /get-started.
 * Signed-in users only; it holds nothing sensitive, but it is part of the app.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(courseHtml as string, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, max-age=0, must-revalidate',
      'x-frame-options': 'SAMEORIGIN',
    },
  });
}
