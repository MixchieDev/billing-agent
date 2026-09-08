import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Wht2307Page } from '@/components/dashboard/wht2307-page';

export const dynamic = 'force-dynamic';

export default async function Wht2307Route() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <Wht2307Page />;
}
