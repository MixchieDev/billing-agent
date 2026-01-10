'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Play, Clock, CheckCircle, XCircle, AlertCircle, Calendar, Mail, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, format } from 'date-fns';

interface SchedulerStatus {
  running: boolean;
  config: {
    cronExpression: string;
    timezone: string;
    daysBeforeDue: number;
    enabled: boolean;
  };
  lastRun: string | null;
  nextRun: string | null;
}

interface Stats {
  totalUpcoming: number;
  alreadyInvoiced: number;
  pendingGeneration: number;
  willAutoSend: number;
  requiresApproval: number;
}

interface JobRun {
  id: string;
  jobName: string;
  startedAt: string;
  completedAt: string | null;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  itemsProcessed: number;
  errors: any;
}

interface UpcomingBilling {
  id: string;
  companyName: string;
  productType: string;
  monthlyFee: number;
  billingAmount: number;
  paymentPlan: string | null;
  expectedFrequency: string;
  autoSendEnabled: boolean;
  willAutoSend: boolean;
  nextDueDate: string;
  contractEndDate: string | null;
  email: string | null;
  billingEntity: { code: string; name: string };
  partner: { name: string; billingModel: string } | null;
  existingInvoice: {
    id: string;
    billingNo: string;
    status: string;
    billingFrequency: string;
  } | null;
  hasInvoice: boolean;
}

interface ScheduledBillingsData {
  scheduler: SchedulerStatus;
  stats: Stats;
  jobRuns: JobRun[];
  upcomingBillings: UpcomingBilling[];
}

export function ScheduledBillingsPage() {
  const [data, setData] = useState<ScheduledBillingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/scheduled-billings');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError('Failed to load scheduled billings');
    } finally {
      setLoading(false);
    }
  };

  const triggerScheduler = async () => {
    try {
      setTriggering(true);
      const res = await fetch('/api/scheduler/trigger', { method: 'POST' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to trigger');
      }
      // Refresh data after triggering
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger scheduler');
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-64 items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { scheduler, stats, jobRuns, upcomingBillings } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Scheduled Billings</h2>
          <p className="text-sm text-gray-500">Monitor and manage automated billing processes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={triggerScheduler} disabled={triggering}>
            <Play className={`mr-2 h-4 w-4 ${triggering ? 'animate-pulse' : ''}`} />
            {triggering ? 'Running...' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* Scheduler Status Card */}
      <div className="rounded-lg border bg-white p-6">
        <h3 className="mb-4 text-sm font-medium text-gray-700">Scheduler Status</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2">
              {scheduler.running ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="text-sm font-medium">
                {scheduler.running ? 'Running' : 'Stopped'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Status</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium">{scheduler.config.cronExpression}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Schedule (Daily 8 AM)</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-sm font-medium">
              {scheduler.lastRun
                ? formatDistanceToNow(new Date(scheduler.lastRun), { addSuffix: true })
                : 'Never'}
            </div>
            <p className="mt-1 text-xs text-gray-500">Last Run</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-sm font-medium">
              {scheduler.nextRun
                ? format(new Date(scheduler.nextRun), 'MMM d, h:mm a')
                : 'N/A'}
            </div>
            <p className="mt-1 text-xs text-gray-500">Next Run</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-2xl font-bold text-gray-900">{stats.totalUpcoming}</div>
          <p className="text-sm text-gray-500">Upcoming (15 days)</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-2xl font-bold text-green-600">{stats.alreadyInvoiced}</div>
          <p className="text-sm text-gray-500">Already Invoiced</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-2xl font-bold text-blue-600">{stats.pendingGeneration}</div>
          <p className="text-sm text-gray-500">Pending Generation</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold text-green-600">{stats.willAutoSend}</span>
          </div>
          <p className="text-sm text-gray-500">Will Auto-Send</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold text-amber-600">{stats.requiresApproval}</span>
          </div>
          <p className="text-sm text-gray-500">Requires Approval</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Job Run History */}
        <div className="rounded-lg border bg-white">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium text-gray-900">Job Run History</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {jobRuns.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No job runs recorded yet
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Time</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Processed</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">
                        {format(new Date(run.startedAt), 'MMM d, h:mm a')}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            run.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-700'
                              : run.status === 'FAILED'
                              ? 'bg-red-100 text-red-700'
                              : run.status === 'RUNNING'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {run.status === 'COMPLETED' && <CheckCircle className="h-3 w-3" />}
                          {run.status === 'FAILED' && <XCircle className="h-3 w-3" />}
                          {run.status === 'RUNNING' && <RefreshCw className="h-3 w-3 animate-spin" />}
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{run.itemsProcessed}</td>
                      <td className="px-4 py-2">
                        {run.errors && typeof run.errors === 'object' && (
                          <span className="text-xs text-gray-500">
                            {(run.errors as any).autoSent !== undefined && (
                              <span className="text-green-600">{(run.errors as any).autoSent} sent</span>
                            )}
                            {(run.errors as any).pendingApproval !== undefined && (
                              <span className="ml-2 text-amber-600">
                                {(run.errors as any).pendingApproval} pending
                              </span>
                            )}
                            {(run.errors as any).errors?.length > 0 && (
                              <span className="ml-2 text-red-600">
                                {(run.errors as any).errors.length} errors
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Upcoming Billings */}
        <div className="rounded-lg border bg-white">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium text-gray-900">Upcoming Billings (Next 15 Days)</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {upcomingBillings.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No upcoming billings
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Client</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Due Date</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Frequency</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {upcomingBillings.map((billing) => (
                    <tr key={billing.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{billing.companyName}</div>
                        <div className="text-xs text-gray-500">{billing.billingEntity.code}</div>
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {format(new Date(billing.nextDueDate), 'MMM d')}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            billing.expectedFrequency === 'MONTHLY'
                              ? 'bg-blue-100 text-blue-700'
                              : billing.expectedFrequency === 'QUARTERLY'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {billing.expectedFrequency}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {billing.hasInvoice ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <FileText className="h-3 w-3" />
                            {billing.existingInvoice?.billingNo}
                          </span>
                        ) : billing.willAutoSend ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <Mail className="h-3 w-3" />
                            Auto-send
                          </span>
                        ) : !billing.autoSendEnabled ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                            <AlertCircle className="h-3 w-3" />
                            Manual (Auto-send off)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Needs Approval
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <h4 className="mb-2 text-sm font-medium text-gray-700">Billing Automation Rules</h4>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-green-500" />
            <span className="text-gray-600">Auto-send - Invoice sent automatically</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-gray-600">Needs Approval - Annual contracts require manual review</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-gray-500" />
            <span className="text-gray-600">Manual - Auto-send disabled in contract settings</span>
          </div>
        </div>
      </div>
    </div>
  );
}
