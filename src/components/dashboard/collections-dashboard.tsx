'use client';

import { Header } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency } from '@/lib/utils';
import {
  RefreshCw,
  Loader2,
  Wallet,
  HandCoins,
  MailWarning,
  CalendarClock,
  CalendarDays,
  Banknote,
} from 'lucide-react';
import { format, parseISO, isToday } from 'date-fns';

interface BucketStat { count: number; amount: number }

interface CollectionsSummary {
  aging: {
    current: BucketStat;
    d1_30: BucketStat;
    d31_60: BucketStat;
    d61_90: BucketStat;
    d90plus: BucketStat;
  };
  totalOutstanding: number;
  outstandingCount: number;
  pausedCount: number;
  collectedThisWeek: BucketStat & { amount: number };
  followUpsThisWeek: number;
  promises: { open: BucketStat; brokenLast30: number };
  calendar: Array<{ date: string; items: Array<{ type: 'DUE' | 'PROMISE' | 'PDC'; label: string; amount: number }> }>;
}

// Ordinal aging ramp — bucket order is fixed; colors come from the validated
// chart tokens (older = darker in both modes).
const AGING_BUCKETS = [
  { key: 'current', label: 'Current', swatch: 'bg-chart-1' },
  { key: 'd1_30', label: '1–30 days', swatch: 'bg-chart-2' },
  { key: 'd31_60', label: '31–60 days', swatch: 'bg-chart-3' },
  { key: 'd61_90', label: '61–90 days', swatch: 'bg-chart-4' },
  { key: 'd90plus', label: '90+ days', swatch: 'bg-chart-5' },
] as const;

const CAL_ICON = { DUE: CalendarDays, PROMISE: CalendarClock, PDC: Banknote } as const;
const CAL_LABEL = { DUE: 'Due', PROMISE: 'Promise', PDC: 'PDC' } as const;

export function CollectionsDashboard() {
  const { data, error, isLoading, mutate } = useApi<CollectionsSummary>('/api/collections/summary');

  const kpis = data
    ? [
        {
          title: 'Total Outstanding',
          value: formatCurrency(data.totalOutstanding),
          sub: `${data.outstandingCount} open invoice${data.outstandingCount === 1 ? '' : 's'} · ${data.pausedCount} paused by promises`,
          icon: Wallet,
        },
        {
          title: 'Collected This Week',
          value: formatCurrency(data.collectedThisWeek.amount),
          sub: `${data.collectedThisWeek.count} payment${data.collectedThisWeek.count === 1 ? '' : 's'} since Monday`,
          icon: HandCoins,
        },
        {
          title: 'Follow-ups This Week',
          value: String(data.followUpsThisWeek),
          sub: 'reminder emails sent',
          icon: MailWarning,
        },
        {
          title: 'Promises to Pay',
          value: `${data.promises.open.count} open`,
          sub: `${formatCurrency(data.promises.open.amount)} promised · ${data.promises.brokenLast30} broken in 30d`,
          icon: CalendarClock,
        },
      ]
    : [];

  return (
    <div className="flex flex-col">
      <Header title="Collections" subtitle="Receivables, promises, and the cash runway" />

      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Collections Overview
            {isLoading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
          </h2>
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load collections summary.
          </div>
        )}

        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Aging pipeline */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Receivables Aging</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data && data.totalOutstanding > 0 ? (
                <>
                  {/* Pipeline bar: ordinal ramp, 2px gaps, rounded outer ends */}
                  <div
                    className="flex h-6 w-full gap-0.5 overflow-hidden rounded"
                    role="img"
                    aria-label={AGING_BUCKETS.map(
                      (b) => `${b.label}: ${formatCurrency(data.aging[b.key].amount)}`
                    ).join(', ')}
                  >
                    {AGING_BUCKETS.map((b) => {
                      const stat = data.aging[b.key];
                      if (stat.amount <= 0) return null;
                      const pct = (stat.amount / data.totalOutstanding) * 100;
                      return (
                        <div
                          key={b.key}
                          className={`${b.swatch} h-full`}
                          style={{ width: `${pct}%` }}
                          title={`${b.label}: ${formatCurrency(stat.amount)} (${stat.count})`}
                        />
                      );
                    })}
                  </div>

                  {/* Legend + values (the readable channel for every segment) */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {AGING_BUCKETS.map((b) => {
                      const stat = data.aging[b.key];
                      return (
                        <div key={b.key} className="rounded-md border p-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-sm ${b.swatch}`} aria-hidden />
                            <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                          </div>
                          <div className="mt-1 text-sm font-semibold">{formatCurrency(stat.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {stat.count} invoice{stat.count === 1 ? '' : 's'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : 'Nothing outstanding — all caught up.'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cash calendar rail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cash Calendar · next 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              {data && data.calendar.length > 0 ? (
                <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
                  {data.calendar.map((day) => {
                    const d = parseISO(day.date);
                    return (
                      <div key={day.date}>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {isToday(d) ? 'Today' : format(d, 'EEE, MMM d')}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {day.items.map((item, i) => {
                            const Icon = CAL_ICON[item.type];
                            return (
                              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate" title={item.label}>
                                    <span className="text-muted-foreground">{CAL_LABEL[item.type]} · </span>
                                    {item.label}
                                  </span>
                                </span>
                                <span className="shrink-0 font-medium">{formatCurrency(item.amount)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : 'No dues, promises, or checks in the next 14 days.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
