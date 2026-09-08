import { Sidebar } from '@/components/dashboard/sidebar';
import { ChatPanelLazy } from '@/components/dashboard/chat/chat-panel-lazy';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-muted text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <ChatPanelLazy />
    </div>
  );
}
