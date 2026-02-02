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
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Pending Approval', href: '/dashboard/pending', icon: Clock },
  { name: 'Approved', href: '/dashboard/approved', icon: CheckCircle },
  { name: 'Rejected', href: '/dashboard/rejected', icon: XCircle },
  { name: 'All Invoices', href: '/dashboard/invoices', icon: FileText },
  { name: 'Paid Invoices', href: '/dashboard/paid', icon: DollarSign },
  { name: 'Contracts', href: '/dashboard/contracts', icon: Users },
  { name: 'Scheduled Billings', href: '/dashboard/scheduled', icon: Calendar },
  { name: 'Invoice Generator', href: '/dashboard/generate-invoice', icon: FilePlus },
  { name: 'RCBC', href: '/dashboard/rcbc', icon: Landmark },
  { name: 'Partners', href: '/dashboard/partners', icon: Handshake },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const adminNavigation = [
  { name: 'Users', href: '/dashboard/users', icon: UserCog },
  { name: 'Audit Logs', href: '/dashboard/audit-logs', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  // Combine navigation items based on role
  const navItems = isAdmin ? [...navigation, ...adminNavigation] : navigation;

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-gray-900 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-gray-800">
        {collapsed ? (
          <span className="text-xl font-bold text-white">YA</span>
        ) : (
          <h1 className="text-xl font-bold text-white">YAHSHUA-ABBA</h1>
        )}
      </div>
      {!collapsed && (
        <div className="flex h-8 items-center justify-center bg-gray-800">
          <span className="text-xs text-gray-400">Billing Agent</span>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-b border-gray-800 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <ChevronLeft className="h-5 w-5" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center' : 'gap-3',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-800 p-2">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={cn(
            'flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors',
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
