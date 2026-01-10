import { Header } from '@/components/dashboard/header';
import { ScheduledBillingsPage } from '@/components/dashboard/scheduled-billings-page';

export default function ScheduledPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Header title="Scheduled Billings" subtitle="Monitor automated billing processes" />
      <main className="flex-1 overflow-auto p-6">
        <ScheduledBillingsPage />
      </main>
    </div>
  );
}
