'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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
  ChevronDown,
} from 'lucide-react';
import { format, parseISO, isToday } from 'date-fns';

interface AgingInvoice {
  id: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
  balance: number;
  daysOverdue: number;
  status: string;
  paused: boolean;
}

interface BucketStat { count: number; amount: number; invoices?: AgingInvoice[] }

interface WeekPayment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paidDate: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
}

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
  collectedThisWeek: { count: number; amount: number; payments: WeekPayment[] };
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
  const [openBucket, setOpenBucket] = useState<string | null>(null);
  const [showPayments, setShowPayments] = useState(false);

  const kpis = data
    ? [
        {
          title: 'Total Outstanding',
          value: formatCurrency(data.totalOutstanding),
          sub: `${data.outstandingCount} open invoice${data.outstandingCount === 1 ? '' : 's'} · ${data.pausedCount} paused by promises`,
          icon: Wallet,
          hint: 'See the aging breakdown below',
        },
        {
          title: 'Collected This Week',
          value: formatCurrency(data.collectedThisWeek.amount),
          sub: `${data.collectedThisWeek.count} payment${data.collectedThisWeek.count === 1 ? '' : 's'} since Monday`,
          icon: HandCoins,
          onClick: () => setShowPayments((v) => !v),
          hint: showPayments ? 'Hide payments' : 'Show payments',
        },
        {
          title: 'Follow-ups This Week',
          value: String(data.followUpsThisWeek),
          sub: 'reminder emails sent',
          icon: MailWarning,
          href: '/dashboard/follow-ups',
          hint: 'Open the follow-up queue',
        },
        {
          title: 'Promises to Pay',
          value: `${data.promises.open.count} open`,
          sub: `${formatCurrency(data.promises.open.amount)} promised · ${data.promises.brokenLast30} broken in 30d`,
          icon: CalendarClock,
          href: '/dashboard/promises',
          hint: 'See who promised what',
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

        {/* KPI row — tiles link or expand to the detail behind the number */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => {
            const body = (
              <>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
                  <kpi.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{kpi.value}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
                  {kpi.hint && (
                    <p className="mt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      {kpi.hint} →
                    </p>
                  )}
                </CardContent>
              </>
            );
            const interactive = 'group cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40';

            if (kpi.href) {
              return (
                <Link key={kpi.title} href={kpi.href} className="block">
                  <Card className={interactive}>{body}</Card>
                </Link>
              );
            }
            if (kpi.onClick) {
              return (
                <Card key={kpi.title} className={interactive} onClick={kpi.onClick}>
                  {body}
                </Card>
              );
            }
            return <Card key={kpi.title} className="group">{body}</Card>;
          })}
        </div>

        {/* Payments behind "Collected This Week" */}
        {showPayments && data && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments received since Monday</CardTitle>
            </CardHeader>
            <CardContent>
              {data.collectedThisWeek.payments.length > 0 ? (
                <ul className="divide-y divide-border">
                  {data.collectedThisWeek.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{p.customerName}</span>
                        <span className="text-muted-foreground">
                          {' '}· {p.billingNo ?? '—'} · {p.entity} · {p.method.replace('_', ' ').toLowerCase()}
                          {p.reference ? ` · ${p.reference}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">
                        {formatCurrency(p.amount)}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {format(new Date(p.paidDate), 'MMM d')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded this week.</p>
              )}
            </CardContent>
          </Card>
        )}

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

                  {/* Legend + values (the readable channel for every segment).
                      Click a bucket to see the invoices inside it. */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {AGING_BUCKETS.map((b) => {
                      const stat = data.aging[b.key];
                      const isOpen = openBucket === b.key;
                      const clickable = stat.count > 0;
                      return (
                        <button
                          key={b.key}
                          type="button"
                          disabled={!clickable}
                          onClick={() => setOpenBucket(isOpen ? null : b.key)}
                          aria-expanded={isOpen}
                          className={`rounded-md border p-3 text-left transition-colors ${
                            isOpen ? 'border-primary bg-accent/50' : ''
                          } ${clickable ? 'cursor-pointer hover:border-primary/40 hover:bg-accent/40' : 'cursor-default opacity-70'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-sm ${b.swatch}`} aria-hidden />
                            <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                            {clickable && (
                              <ChevronDown
                                className={`ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                            )}
                          </div>
                          <div className="mt-1 text-sm font-semibold">{formatCurrency(stat.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {stat.count} invoice{stat.count === 1 ? '' : 's'}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Drill-down: the invoices making up the selected bucket */}
                  {openBucket && (
                    <div className="rounded-md border">
                      <div className="flex items-center justify-between border-b px-4 py-2">
                        <p className="text-sm font-medium">
                          {AGING_BUCKETS.find((b) => b.key === openBucket)?.label} ·{' '}
                          <span className="text-muted-foreground">
                            {formatCurrency(data.aging[openBucket as keyof typeof data.aging].amount)}
                          </span>
                        </p>
                        <Button variant="ghost" size="sm" onClick={() => setOpenBucket(null)}>Close</Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Client / Invoice</TableHead>
                            <TableHead>Entity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Days overdue</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(data.aging[openBucket as keyof typeof data.aging].invoices ?? []).map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell>
                                <div className="font-medium">{inv.customerName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {inv.billingNo ?? inv.id.slice(0, 8)}
                                </div>
                              </TableCell>
                              <TableCell><Badge variant="outline">{inv.entity}</Badge></TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1">
                                  <Badge variant={inv.status === 'PARTIALLY_PAID' ? 'warning' : 'default'}>
                                    {inv.status === 'PARTIALLY_PAID' ? 'PARTIAL' : inv.status}
                                  </Badge>
                                  {inv.paused && (
                                    <Badge variant="secondary" title="Follow-ups paused by a promise to pay">
                                      paused
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : '—'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(inv.balance)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
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
