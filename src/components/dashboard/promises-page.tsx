'use client';

import { useState } from 'react';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { RefreshCw, Loader2, CalendarClock, Trash2 } from 'lucide-react';

type PromiseStatus = 'OPEN' | 'KEPT' | 'BROKEN';

interface PromiseRow {
  id: string;
  status: PromiseStatus;
  promisedDate: string;
  promisedAmount: number | null;
  madeBy: string | null;
  capturedByName: string | null;
  channel: string | null;
  notes: string | null;
  daysToPromise: number;
  invoice: {
    id: string;
    billingNo: string | null;
    customerName: string;
    status: string;
    entity: string;
    balance: number;
  };
}

interface PromisesData {
  promises: PromiseRow[];
  counts: Partial<Record<PromiseStatus, number>>;
}

const STATUS_META: Record<PromiseStatus, { label: string; variant: 'warning' | 'success' | 'destructive' }> = {
  OPEN: { label: 'Open', variant: 'warning' },
  KEPT: { label: 'Kept', variant: 'success' },
  BROKEN: { label: 'Broken', variant: 'destructive' },
};

const FILTERS: Array<{ key: 'ALL' | PromiseStatus; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'BROKEN', label: 'Broken' },
  { key: 'KEPT', label: 'Kept' },
];

export function PromisesPage() {
  const [filter, setFilter] = useState<'ALL' | PromiseStatus>('ALL');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useApi<PromisesData>(
    `/api/collections/promises?status=${filter}`
  );

  const handleCancel = async (row: PromiseRow) => {
    if (!window.confirm(
      `Cancel the promise from ${row.invoice.customerName}? Follow-ups will resume immediately.`
    )) return;
    setCancelling(row.id);
    try {
      const res = await fetch(
        `/api/invoices/${row.invoice.id}/promises?promiseId=${row.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to cancel promise');
      }
      mutate();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCancelling(null);
    }
  };

  /** "in 5 days" / "3 days ago" / "today" */
  const relativeDay = (days: number) =>
    days === 0 ? 'today' : days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`;

  const rows = data?.promises ?? [];

  return (
    <div className="flex flex-col">
      <Header title="Promises to Pay" subtitle="What clients committed to, and whether they kept it" />

      <div className="flex-1 space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.key !== 'ALL' && data?.counts?.[f.key] != null && (
                  <span className="ml-1.5 opacity-70">{data.counts[f.key]}</span>
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

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load promises.
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            {rows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client / Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Promised date</TableHead>
                    <TableHead className="text-right">Promised</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Who promised</TableHead>
                    <TableHead>Logged by</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const meta = STATUS_META[row.status];
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.invoice.customerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.invoice.billingNo ?? row.invoice.id.slice(0, 8)} · {row.invoice.entity}
                          </div>
                          {row.notes && (
                            <div className="mt-1 max-w-64 text-xs italic text-muted-foreground">
                              “{row.notes}”
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                        <TableCell>
                          <div>{formatDateShort(new Date(row.promisedDate))}</div>
                          {row.status === 'OPEN' && (
                            <div className="text-xs text-muted-foreground">
                              {relativeDay(row.daysToPromise)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.promisedAmount != null ? formatCurrency(row.promisedAmount) : '—'}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.invoice.balance)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{row.madeBy || '—'}</div>
                          {row.channel && (
                            <div className="text-xs text-muted-foreground">via {row.channel.toLowerCase()}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.capturedByName || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === 'OPEN' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancelling === row.id}
                              onClick={() => handleCancel(row)}
                              className="text-destructive hover:bg-destructive/10"
                              title="Cancel this promise and resume follow-ups"
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              {cancelling === row.id ? 'Cancelling…' : 'Cancel'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <CalendarClock className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {isLoading ? 'Loading…' : 'No promises logged yet. Use the Promise action on an overdue invoice.'}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          An open promise pauses follow-up emails until the promised date. Paying settles it as
          <span className="font-medium"> Kept</span>; missing the date marks it
          <span className="font-medium"> Broken</span> and resumes chasing.
        </p>
      </div>
    </div>
  );
}
