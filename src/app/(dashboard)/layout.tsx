import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/dashboard/sidebar';

// Lazy-load the AI chat panel — it's heavy (Anthropic SDK) and not
// needed on first paint. Skip SSR since it's a client-only widget.
const ChatPanel = dynamic(
  () => import('@/components/dashboard/chat').then((m) => m.ChatPanel),
  { ssr: false }
);

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
