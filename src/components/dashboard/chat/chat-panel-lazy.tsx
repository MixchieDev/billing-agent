'use client';

import dynamic from 'next/dynamic';

// Client-only wrapper so the dashboard layout can stay a Server Component.
// `ssr: false` is only legal inside a Client Component in Next.js 16.
const ChatPanel = dynamic(
  () => import('./chat-panel').then((m) => m.ChatPanel),
  { ssr: false }
);

export function ChatPanelLazy() {
  return <ChatPanel />;
}
