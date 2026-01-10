import { Sidebar } from '@/components/dashboard/sidebar';
import { ChatPanel } from '@/components/dashboard/chat';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <ChatPanel />
    </div>
  );
}
