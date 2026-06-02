import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { PartnersPage } from '@/components/dashboard/partners-page';
import {
  fetchPartnersForServer,
  fetchCompaniesForServer,
  fetchEmailTemplatesForServer,
} from '@/lib/server-data';

export const dynamic = 'force-dynamic';

export default async function PartnersPageRoute() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  // Sequential (not Promise.all) to avoid exhausting the production Prisma
  // connection pool, which can be as small as 1.
  const partners = await fetchPartnersForServer();
  const companies = await fetchCompaniesForServer();
  const emailTemplates = await fetchEmailTemplatesForServer();

  return (
    <PartnersPage
      initialData={{
        partners: partners as any,
        companies: companies as any,
        emailTemplates: emailTemplates as any,
      }}
    />
  );
}
