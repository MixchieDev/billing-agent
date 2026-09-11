'use client';

import { useState } from 'react';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { DataState, statValue } from '@/components/dashboard/data-state';
import { RefreshCw, Loader2, Lock, LockOpen, Hourglass, ShieldAlert } from 'lucide-react';

type Stage = 'grace' | 'due' | 'suspended' | 'restore';

interface Row {
  invoiceId: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
  balanceDue: number;
  dueDate: string;
  daysOverdue: number;
  noticeSentAt: string;
  deadline: string;
  daysToDeadline: number;
  suspendedAt: string | null;
  paidAt: string | null;
  stage: Stage;
  email: string | null;
}

interface Data {
  graceDays: number;
  rows: Row[];
  counts: Record<Stage, number>;
  dueValue: number;
}

const TABS: Array<{ key: Stage | 'all'; label: string; blurb: string }> = [
  {
    key: 'due',
    label: 'Set to read-only',
    blurb:
      'The grace period in the notice has expired and the balance is still unsettled. These are the accounts to switch to read-only in the service platform, then tick off here.',
  },
  {
    key: 'restore',
    label: 'Restore access',
    blurb:
      'Recorded as read-only but the invoice has since been settled. Restore these first — a paying client locked out is the worst outcome in this process.',
  },
  {
    key: 'grace',
    label: 'Grace running',
    blurb:
      'A suspension notice has gone out and the client still has time to pay. Nothing to do yet; they move to "Set to read-only" if the deadline passes unpaid.',
  },
  {
    key: 'suspended',
    label: 'Currently read-only',
    blurb: 'Recorded as read-only and still unsettled.',
  },
  { key: 'all', label: 'All', blurb: 'Every account that has ever had a suspension notice.' },
];

export function SuspensionsPage() {
  const [tab, setTab] = useState<Stage | 'all'>('due');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useApi<Data>('/api/collections/suspensions');

  const rows = (data?.rows ?? []).filter((r) => tab === 'all' || r.stage === tab);
  const active = TABS.find((t) => t.key === tab)!;

  const mark = async (r: Row, suspended: boolean) => {
    const verb = suspended ? 'read-only' : 'restored';
    if (
      !window.confirm(
        `Record ${r.customerName} as ${verb}?\n\n` +
          `This only logs what you did in the service platform — the app does not change ` +
          `anyone's access itself.`
      )
    )
      return;
    setBusy(r.invoiceId);
    try {
      const res = await fetch('/api/collections/suspensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: r.invoiceId, suspended }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed');
      mutate();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col">
      <Header
        title="Suspensions"
        subtitle="Accounts warned of read-only access, and what needs doing about each"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* The app never changes access — saying so once, plainly, up front. */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Setting an account read-only is done by you in the service platform. This page is the
            record of which accounts are due for it, which are already restricted, and which have
            paid and should be let back in. Ticking a row here logs what you did — it does not
            change anyone&apos;s access.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className={data?.counts.due ? 'border-destructive/40' : undefined}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Set to read-only
              </CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.counts.due, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : `${formatCurrency(data?.dueValue ?? 0)} unsettled`}
              </p>
            </CardContent>
          </Card>

          <Card className={data?.counts.restore ? 'border-green-600/40' : undefined}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Restore access
              </CardTitle>
              <LockOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.counts.restore, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : 'paid but still restricted'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Grace running
              </CardTitle>
              <Hourglass className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.counts.grace, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : `${data?.graceDays ?? 7} days from the notice`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Currently read-only
              </CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.counts.suspended, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : 'restricted and unsettled'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                variant={tab === t.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {data && t.key !== 'all' && (
                  <span className="ml-2 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                    {data.counts[t.key as Stage]}
                  </span>
                )}
              </Button>
            ))}
            {isLoading && <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">{active.blurb}</p>

        <Card>
          <CardContent className="pt-6">
            {rows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client / Invoice</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-right">Unsettled</TableHead>
                    <TableHead>Notice sent</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.invoiceId}>
                      <TableCell>
                        <div className="font-medium">{r.customerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.billingNo ?? r.invoiceId.slice(0, 8)} · {r.daysOverdue}d overdue
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.entity}</Badge></TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(r.balanceDue)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateShort(new Date(r.noticeSentAt))}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateShort(new Date(r.deadline))}
                        <div className="text-xs text-muted-foreground">
                          {r.daysToDeadline > 0
                            ? `${r.daysToDeadline}d left`
                            : `${Math.abs(r.daysToDeadline)}d past`}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.stage === 'restore' && <Badge variant="success">paid — restore</Badge>}
                        {r.stage === 'due' && <Badge variant="destructive">due for read-only</Badge>}
                        {r.stage === 'suspended' && <Badge variant="secondary">read-only</Badge>}
                        {r.stage === 'grace' && <Badge variant="warning">grace</Badge>}
                        {r.suspendedAt && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            since {formatDateShort(new Date(r.suspendedAt))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.suspendedAt ? (
                          <Button
                            size="sm"
                            variant={r.stage === 'restore' ? 'default' : 'outline'}
                            disabled={busy === r.invoiceId}
                            onClick={() => mark(r, false)}
                            className={r.stage === 'restore' ? 'bg-green-600 text-white hover:bg-green-700' : ''}
                          >
                            <LockOpen className="mr-1 h-4 w-4" />
                            {busy === r.invoiceId ? 'Saving…' : 'Mark restored'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={r.stage === 'due' ? 'destructive' : 'outline'}
                            disabled={busy === r.invoiceId || r.stage === 'grace'}
                            onClick={() => mark(r, true)}
                            title={
                              r.stage === 'grace'
                                ? 'The client still has time to pay'
                                : 'Record that you set this account read-only'
                            }
                          >
                            <Lock className="mr-1 h-4 w-4" />
                            {busy === r.invoiceId ? 'Saving…' : 'Mark read-only'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <DataState
                isLoading={isLoading}
                error={error}
                subject="suspensions"
                icon={Lock}
                onRetry={() => mutate()}
                emptyMessage={
                  tab === 'due'
                    ? 'Nothing is due for read-only.'
                    : tab === 'restore'
                      ? 'Nobody is waiting to be let back in.'
                      : 'Nothing at this stage.'
                }
              />
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          An account reaches this list when the level-4 suspension notice is sent, which starts a{' '}
          {data?.graceDays ?? 7}-day grace period. Change that with the{' '}
          <code>collections.suspensionGraceDays</code> setting — it also sets the deadline printed
          in the notice.
        </p>
      </div>
    </div>
  );
}
