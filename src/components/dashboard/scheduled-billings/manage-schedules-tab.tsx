'use client';

import { useState } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Mail,
  FileText,
  MoreVertical,
  Trash2,
  StopCircle,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, format } from 'date-fns';

interface ScheduledBilling {
  id: string;
  contractId: string;
  companyName: string;
  productType: string;
  email: string | null;
  billingAmount: number;
  description: string | null;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | 'CUSTOM';
  customIntervalValue?: number | null;
  customIntervalUnit?: 'DAYS' | 'MONTHS' | null;
  billingDayOfMonth: number;
  nextBillingDate: string | null;
  startDate: string;
  endDate: string | null;
  autoApprove: boolean;
  autoSendEnabled: boolean;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  vatType: 'VAT' | 'NON_VAT';
  hasWithholding: boolean;
  remarks: string | null;
  billingEntity: { id: string; code: string; name: string };
  runCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string | null; email: string } | null;
  approvedBy?: { id: string; name: string | null; email: string } | null;
  approvedAt?: string | null;
}

interface Stats {
  pending: number;
  active: number;
  paused: number;
  ended: number;
  dueThisWeek: number;
  total: number;
}

interface ManageSchedulesTabProps {
  scheduledBillings: ScheduledBilling[];
  stats: Stats;
  onRefresh: () => void;
  loading: boolean;
}

export function ManageSchedulesTab({
  scheduledBillings,
  stats,
  onRefresh,
  loading,
}: ManageSchedulesTabProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const filteredBillings = scheduledBillings.filter((sb) => {
    if (statusFilter === 'all') return true;
    return sb.status === statusFilter;
  });

  const approveSchedule = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve');
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const rejectSchedule = async (id: string) => {
    const reason = prompt('Enter rejection reason (optional):');
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject');
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const pauseSchedule = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}/pause`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to pause');
      onRefresh();
    } catch {
      setError('Failed to pause schedule');
    } finally {
      setActionLoading(null);
      setOpenMenu(null);
    }
  };

  const resumeSchedule = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}/resume`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to resume');
      onRefresh();
    } catch {
      setError('Failed to resume schedule');
    } finally {
      setActionLoading(null);
      setOpenMenu(null);
    }
  };

  const runNow = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}/run-now`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to run');
      }
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run schedule');
    } finally {
      setActionLoading(null);
      setOpenMenu(null);
    }
  };

  const endSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to end this schedule? This action cannot be undone.')) {
      return;
    }
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ENDED' }),
      });
      if (!res.ok) throw new Error('Failed to end schedule');
      onRefresh();
    } catch {
      setError('Failed to end schedule');
    } finally {
      setActionLoading(null);
      setOpenMenu(null);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule? This will also delete all run history.')) {
      return;
    }
    try {
      setActionLoading(id);
      const res = await fetch(`/api/scheduled-billings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onRefresh();
    } catch {
      setError('Failed to delete schedule');
    } finally {
      setActionLoading(null);
      setOpenMenu(null);
    }
  };

  const getOrdinalSuffix = (day: number) => {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><Clock className="h-3 w-3" />Pending Approval</span>;
      case 'ACTIVE':
        return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"><CheckCircle className="h-3 w-3" />Active</span>;
      case 'PAUSED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"><Pause className="h-3 w-3" />Paused</span>;
      case 'ENDED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"><StopCircle className="h-3 w-3" />Ended</span>;
      default:
        return null;
    }
  };

  const getFrequencyLabel = (billing: ScheduledBilling) => {
    switch (billing.frequency) {
      case 'MONTHLY': return 'Monthly';
      case 'QUARTERLY': return 'Quarterly';
      case 'ANNUALLY': return 'Annually';
      case 'CUSTOM':
        if (billing.customIntervalValue && billing.customIntervalUnit) {
          const unit = billing.customIntervalUnit === 'DAYS' ? 'day' : 'month';
          const plural = billing.customIntervalValue > 1 ? 's' : '';
          return `Every ${billing.customIntervalValue} ${unit}${plural}`;
        }
        return 'Custom';
      default: return billing.frequency;
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 underline">Dismiss</button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        <div className="rounded-lg border bg-white p-4 cursor-pointer hover:border-amber-300" onClick={() => setStatusFilter('PENDING')}>
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <p className="text-sm text-gray-500">Pending</p>
        </div>
        <div className="rounded-lg border bg-white p-4 cursor-pointer hover:border-green-300" onClick={() => setStatusFilter('ACTIVE')}>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          <p className="text-sm text-gray-500">Active</p>
        </div>
        <div className="rounded-lg border bg-white p-4 cursor-pointer hover:border-gray-400" onClick={() => setStatusFilter('PAUSED')}>
          <div className="text-2xl font-bold text-gray-600">{stats.paused}</div>
          <p className="text-sm text-gray-500">Paused</p>
        </div>
        <div className="rounded-lg border bg-white p-4 cursor-pointer hover:border-red-300" onClick={() => setStatusFilter('ENDED')}>
          <div className="text-2xl font-bold text-red-600">{stats.ended}</div>
          <p className="text-sm text-gray-500">Ended</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            <span className="text-2xl font-bold text-blue-600">{stats.dueThisWeek}</span>
          </div>
          <p className="text-sm text-gray-500">Due This Week</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        {['all', 'PENDING', 'ACTIVE', 'PAUSED', 'ENDED'].map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === filter
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {filter === 'all' ? 'All' : filter === 'PENDING' ? 'Pending Approval' : filter.charAt(0) + filter.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white">
        <div className="overflow-x-auto">
          {filteredBillings.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <p className="text-lg font-medium">No scheduled billings found</p>
              <p className="text-sm mt-1">
                {statusFilter === 'all'
                  ? 'Create a new schedule to get started'
                  : `No ${statusFilter.toLowerCase()} schedules`}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Entity</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Schedule</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Next Billing</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Automation</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Runs</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredBillings.map((billing) => (
                  <tr key={billing.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{billing.companyName}</div>
                      {billing.description && (
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{billing.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {billing.billingEntity.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(billing.billingAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-1">
                        <span>{billing.billingDayOfMonth}{getOrdinalSuffix(billing.billingDayOfMonth)}</span>
                        <span className="text-gray-400">|</span>
                        <span className="text-xs text-gray-500">{getFrequencyLabel(billing)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {billing.status === 'PENDING' ? (
                        <span className="text-gray-400 text-xs">Awaiting approval</span>
                      ) : billing.nextBillingDate ? (
                        <div>
                          <div>{format(new Date(billing.nextBillingDate), 'MMM d, yyyy')}</div>
                          <div className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(billing.nextBillingDate), { addSuffix: true })}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 text-xs ${billing.autoApprove ? 'text-green-600' : 'text-amber-600'}`}>
                          {billing.autoApprove ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                          {billing.autoApprove ? 'Auto-approve' : 'Manual'}
                        </span>
                        {billing.autoApprove && billing.autoSendEnabled && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                            <Mail className="h-3 w-3" />
                            Auto-send
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(billing.status)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                        <FileText className="h-3 w-3" />
                        {billing.runCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Approval actions for PENDING */}
                        {billing.status === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveSchedule(billing.id)}
                              disabled={actionLoading === billing.id}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {actionLoading === billing.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Check className="mr-1 h-4 w-4" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectSchedule(billing.id)}
                              disabled={actionLoading === billing.id}
                            >
                              <X className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}

                        {/* Resume button for PAUSED */}
                        {billing.status === 'PAUSED' && (
                          <Button
                            size="sm"
                            onClick={() => resumeSchedule(billing.id)}
                            disabled={actionLoading === billing.id}
                          >
                            {actionLoading === billing.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Play className="mr-1 h-4 w-4" />
                                Resume
                              </>
                            )}
                          </Button>
                        )}

                        {/* Menu for ACTIVE and other states */}
                        <div className="relative inline-block">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenu(openMenu === billing.id ? null : billing.id);
                            }}
                            disabled={actionLoading === billing.id}
                            className="rounded p-1 hover:bg-gray-100 disabled:opacity-50"
                          >
                            {actionLoading === billing.id && billing.status !== 'PENDING' && billing.status !== 'PAUSED' ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </button>
                          {openMenu === billing.id && (
                            <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border bg-white py-1 shadow-lg">
                              {billing.status === 'ACTIVE' && (
                                <>
                                  <button
                                    onClick={() => runNow(billing.id)}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                                  >
                                    <Play className="h-4 w-4 text-green-600" />
                                    Run Now
                                  </button>
                                  <button
                                    onClick={() => pauseSchedule(billing.id)}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                                  >
                                    <Pause className="h-4 w-4 text-amber-600" />
                                    Pause
                                  </button>
                                </>
                              )}
                              {billing.status !== 'ENDED' && (
                                <>
                                  <button
                                    onClick={() => endSchedule(billing.id)}
                                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                                  >
                                    <StopCircle className="h-4 w-4 text-gray-600" />
                                    End Schedule
                                  </button>
                                  <hr className="my-1" />
                                </>
                              )}
                              <button
                                onClick={() => deleteSchedule(billing.id)}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
