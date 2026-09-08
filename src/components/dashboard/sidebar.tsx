'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Users,
  UserCog,
  Settings,
  LogOut,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Handshake,
  FilePlus,
  History,
  Wallet,
  MailWarning,
  CalendarClock,
  Receipt,
  BrushCleaning,
  CalendarSync,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

/**
 * Grouped by the job you're doing, not by data model — the flat list had grown
 * to 19 entries where "Rejected" sat next to "RCBC" with nothing to separate
 * them. Order runs the way work does: raise invoices, chase payment, then the
 * ledger and the accounts behind it.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Billing run',
    items: [
      { name: 'Invoice Generator', href: '/dashboard/generate-invoice', icon: FilePlus },
      { name: 'Scheduled Billings', href: '/dashboard/scheduled', icon: Calendar },
      { name: 'Pending Approval', href: '/dashboard/pending', icon: Clock },
      { name: 'Approved', href: '/dashboard/approved', icon: CheckCircle },
      { name: 'Rejected', href: '/dashboard/rejected', icon: XCircle },
    ],
  },
  {
    label: 'Getting paid',
    items: [
      { name: 'Collections', href: '/dashboard/collections', icon: Wallet },
      { name: 'Follow-up Queue', href: '/dashboard/follow-ups', icon: MailWarning },
      { name: 'Promises to Pay', href: '/dashboard/promises', icon: CalendarClock },
      { name: '2307 Certificates', href: '/dashboard/wht2307', icon: Receipt },
    ],
  },
  {
    label: 'Invoices',
    items: [
      { name: 'All Invoices', href: '/dashboard/invoices', icon: FileText },
      { name: 'Paid Invoices', href: '/dashboard/paid', icon: DollarSign },
      { name: 'Invoice Cleanup', href: '/dashboard/cleanup', icon: BrushCleaning },
    ],
  },
  {
    label: 'Clients',
    items: [
      { name: 'Contracts', href: '/dashboard/contracts', icon: Users },
      { name: 'Renewals', href: '/dashboard/renewals', icon: CalendarSync },
      { name: 'Partners', href: '/dashboard/partners', icon: Handshake },
      { name: 'RCBC', href: '/dashboard/rcbc', icon: Landmark },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Settings', href: '/settings', icon: Settings },
      { name: 'Users', href: '/dashboard/users', icon: UserCog, adminOnly: true },
      { name: 'Audit Logs', href: '/dashboard/audit-logs', icon: History, adminOnly: true },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  // Drop admin-only entries, then any group left empty by that filter.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || isAdmin),
  })).filter((g) => g.items.length > 0);

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-sidebar-border">
        {collapsed ? (
          <span className="text-xl font-bold text-sidebar-foreground">YA</span>
        ) : (
          <h1 className="text-xl font-bold text-sidebar-foreground">YAHSHUA-ABBA</h1>
        )}
      </div>
      {!collapsed && (
        <div className="flex h-8 items-center justify-center bg-sidebar-accent">
          <span className="text-xs text-muted-foreground">Billing Agent</span>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-b border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <ChevronLeft className="h-5 w-5" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.label} className={gi > 0 ? 'mt-5' : undefined}>
            {collapsed ? (
              // No room for a label when collapsed — a rule keeps the grouping.
              gi > 0 && <div className="mx-2 mb-2 border-t border-sidebar-border" />
            ) : (
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : 'gap-3',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={cn(
            'flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors',
            collapsed ? 'justify-center' : 'gap-3'
          )}
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
}
