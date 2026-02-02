'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuditLogDetailModal } from './audit-log-detail-modal';
import {
  RefreshCw,
  Eye,
  Loader2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  } | null;
}

interface User {
  id: string;
  name: string | null;
  email: string;
}

// Action badge configuration
const actionBadgeConfig: Record<string, { variant: 'default' | 'success' | 'destructive' | 'secondary' | 'warning'; label: string }> = {
  INVOICE_CREATED: { variant: 'default', label: 'Created' },
  INVOICE_APPROVED: { variant: 'success', label: 'Approved' },
  INVOICE_REJECTED: { variant: 'destructive', label: 'Rejected' },
  INVOICE_SENT: { variant: 'default', label: 'Sent' },
  INVOICE_PAID: { variant: 'success', label: 'Paid' },
  INVOICE_VOIDED: { variant: 'secondary', label: 'Voided' },
  INVOICE_UPDATED: { variant: 'warning', label: 'Updated' },
  INVOICE_AUTO_SENT: { variant: 'default', label: 'Auto-sent' },
  INVOICE_SEND_FAILED: { variant: 'destructive', label: 'Send Failed' },
  INVOICE_PDF_GENERATED: { variant: 'secondary', label: 'PDF Generated' },
  INVOICE_EMAIL_SENT: { variant: 'default', label: 'Email Sent' },
  INVOICE_REMINDER_SENT: { variant: 'warning', label: 'Reminder Sent' },
  INVOICE_GENERATED_ADHOC: { variant: 'default', label: 'Generated (Ad-hoc)' },
  CONTRACT_SETTINGS_UPDATED: { variant: 'secondary', label: 'Settings Updated' },
  CONTRACT_UPDATED: { variant: 'warning', label: 'Updated' },
  CONTRACT_DELETED: { variant: 'destructive', label: 'Deleted' },
  USER_CREATED: { variant: 'default', label: 'Created' },
};

const ACTION_OPTIONS = [
  { value: 'INVOICE_CREATED', label: 'Invoice Created' },
  { value: 'INVOICE_APPROVED', label: 'Invoice Approved' },
  { value: 'INVOICE_REJECTED', label: 'Invoice Rejected' },
  { value: 'INVOICE_SENT', label: 'Invoice Sent' },
  { value: 'INVOICE_PAID', label: 'Invoice Paid' },
  { value: 'INVOICE_VOIDED', label: 'Invoice Voided' },
  { value: 'INVOICE_UPDATED', label: 'Invoice Updated' },
  { value: 'INVOICE_AUTO_SENT', label: 'Invoice Auto-sent' },
  { value: 'INVOICE_SEND_FAILED', label: 'Invoice Send Failed' },
  { value: 'INVOICE_REMINDER_SENT', label: 'Reminder Sent' },
  { value: 'INVOICE_GENERATED_ADHOC', label: 'Invoice Generated (Ad-hoc)' },
  { value: 'CONTRACT_SETTINGS_UPDATED', label: 'Contract Settings Updated' },
  { value: 'CONTRACT_UPDATED', label: 'Contract Updated' },
  { value: 'CONTRACT_DELETED', label: 'Contract Deleted' },
  { value: 'USER_CREATED', label: 'User Created' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: 'Invoice', label: 'Invoice' },
  { value: 'Contract', label: 'Contract' },
  { value: 'User', label: 'User' },
];

function getActionBadge(action: string) {
  const config = actionBadgeConfig[action] || { variant: 'secondary' as const, label: action.replace(/_/g, ' ') };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function AuditLogsPage() {
  const { data: session } = useSession();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch users for filter dropdown
  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, []);

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());

      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (actionFilter) params.set('action', actionFilter);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      if (userFilter) params.set('userId', userFilter);
      if (searchQuery) params.set('search', searchQuery);

      const response = await fetch(`/api/audit-logs?${params}`);

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You do not have permission to view audit logs');
        }
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      setLogs(data.logs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, actionFilter, entityTypeFilter, userFilter, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setActionFilter('');
    setEntityTypeFilter('');
    setUserFilter('');
    setSearchQuery('');
    setPage(1);
  };

  const hasActiveFilters = dateFrom || dateTo || actionFilter || entityTypeFilter || userFilter || searchQuery;

  const isAdmin = session?.user?.role === 'ADMIN';

  if (!isAdmin) {
    return (
      <div className="flex flex-col">
        <Header title="Audit Logs" subtitle="System activity history" />
        <div className="flex-1 p-6">
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            You do not have permission to access this page.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header title="Audit Logs" subtitle="System-wide activity history and audit trail" />

      <div className="flex-1 space-y-6 p-6">
        {/* Filters */}
        <div className="rounded-lg border bg-white p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Date From */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Action Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
              <Select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Actions</option>
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Entity Type Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
              <Select
                value={entityTypeFilter}
                onChange={(e) => {
                  setEntityTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Types</option>
                {ENTITY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* User Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
              <Select
                value={userFilter}
                onChange={(e) => {
                  setUserFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Users</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </Select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search Entity ID</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear Filters
              </Button>
            </div>
          )}
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Activity Log
            {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({total} entr{total !== 1 ? 'ies' : 'y'})
            </span>
          </h2>
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity Type</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      {log.user ? (log.user.name || log.user.email) : (
                        <span className="text-gray-400">System</span>
                      )}
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{log.entityType}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm max-w-[200px] truncate" title={log.entityId}>
                      {log.entityId}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AuditLogDetailModal
        log={selectedLog}
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
