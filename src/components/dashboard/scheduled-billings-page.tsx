'use client';

import { useState, useEffect } from 'react';
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Calendar,
  ListChecks,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, format } from 'date-fns';
import { CreateScheduleTab } from './scheduled-billings/create-schedule-tab';
import { ManageSchedulesTab } from './scheduled-billings/manage-schedules-tab';
import { RunHistoryTab } from './scheduled-billings/run-history-tab';

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
  pending: number;
  active: number;
  paused: number;
  ended: number;
  dueThisWeek: number;
  total: number;
  totalUpcoming: number;
  alreadyInvoiced: number;
  pendingGeneration: number;
  willAutoSend: number;
  requiresApproval: number;
}

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

interface ScheduledBillingsData {
  scheduler: SchedulerStatus;
  stats: Stats;
  scheduledBillings: ScheduledBilling[];
}

type TabType = 'create' | 'manage' | 'history';

export function ScheduledBillingsPage() {
  const [data, setData] = useState<ScheduledBillingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('manage');

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/scheduled-billings');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError('Failed to load scheduled billings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateSuccess = () => {
    fetchData();
    setActiveTab('manage');
  };

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

  const { scheduler, stats, scheduledBillings } = data;

  const tabs = [
    { id: 'create' as TabType, label: 'Create Schedule', icon: Plus },
    { id: 'manage' as TabType, label: 'Manage Schedules', icon: ListChecks, badge: stats.pending > 0 ? stats.pending : undefined },
    { id: 'history' as TabType, label: 'Run History', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Scheduled Billings</h2>
          <p className="text-sm text-gray-500">Create and manage recurring billing schedules</p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 underline">Dismiss</button>
        </div>
      )}

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

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.badge && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'create' && (
          <CreateScheduleTab onSuccess={handleCreateSuccess} />
        )}
        {activeTab === 'manage' && (
          <ManageSchedulesTab
            scheduledBillings={scheduledBillings}
            stats={stats}
            onRefresh={fetchData}
            loading={loading}
          />
        )}
        {activeTab === 'history' && (
          <RunHistoryTab />
        )}
      </div>

      {/* Legend */}
      {activeTab === 'manage' && (
        <div className="rounded-lg border bg-gray-50 p-4">
          <h4 className="mb-2 text-sm font-medium text-gray-700">Billing Automation</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-gray-600">Pending Approval = New schedule awaiting review</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-gray-600">Auto-approve = Invoice created as approved</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-gray-600">Manual = Requires approval after generation</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
