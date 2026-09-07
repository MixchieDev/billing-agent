'use client';

import { useMemo, useState } from 'react';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PromiseToPayModal, InvoiceForPromise } from '@/components/dashboard/promise-to-pay-modal';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import {
  RefreshCw, Loader2, MailWarning, CalendarClock, Moon, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { DataState } from '@/components/dashboard/data-state';
import { format } from 'date-fns';

type QueueCategory = 'BROKEN_PROMISE' | 'NO_EMAIL' | 'MAXED' | 'REVIEW';

interface QueueRow {
  id: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
  daysOverdue: number;
  balance: number;
  status: string;
  lastFollowUpLevel: number;
  nextLevel: number | null;
  category: QueueCategory;
  note: string;
  brokenPromise?: { promisedDate: string; madeBy: string | null };
}

interface QueueData {
  needsAction: QueueRow[];
  autoTonight: Array<Omit<QueueRow, 'category' | 'note'>>;
  recentAuto: Array<{
    id: string;
    level: number;
    sentAt: string;
    toEmail: string;
    status: string;
    invoice: { id: string; billingNo: string | null; customerName: string; company: { code: string } | null };
  }>;
  settings: { offsets: Record<number, number>; autoSendLevels: number[] };
}

const CATEGORY_META: Record<QueueCategory, { label: string; variant: 'destructive' | 'warning' | 'secondary' }> = {
  BROKEN_PROMISE: { label: 'Broken promise', variant: 'destructive' },
  MAXED: { label: 'Needs escalation', variant: 'destructive' },
  NO_EMAIL: { label: 'No email', variant: 'warning' },
  REVIEW: { label: 'Review & send', variant: 'warning' },
};

export function FollowUpQueue() {
  const { data, error, isLoading, mutate } = useApi<QueueData>('/api/collections/queue');
  const [entityFilter, setEntityFilter] = useState<'ALL' | 'YOWI' | 'ABBA'>('ALL');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [promiseInvoice, setPromiseInvoice] = useState<InvoiceForPromise | null>(null);

  const needsAction = useMemo(
    () => (data?.needsAction ?? []).filter((r) => entityFilter === 'ALL' || r.entity === entityFilter),
    [data, entityFilter]
  );
  const autoTonight = useMemo(
    () => (data?.autoTonight ?? []).filter((r) => entityFilter === 'ALL' || r.entity === entityFilter),
    [data, entityFilter]
  );

  const handleSendNow = async (row: QueueRow) => {
    const level = row.lastFollowUpLevel + 1;
    if (!window.confirm(`Send follow-up level ${level} for ${row.billingNo ?? row.id.slice(0, 8)} to ${row.customerName}?`)) return;
    setSendingId(row.id);
    try {
      const res = await fetch(`/api/invoices/${row.id}/follow-up`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to send follow-up');
      mutate();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSendingId(null);
    }
  };

  const handleSavePromise = async (
    invoiceId: string,
    payload: { promisedDate: string; promisedAmount?: number; channel?: string; notes?: string }
  ) => {
    const res = await fetch(`/api/invoices/${invoiceId}/promises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'Failed to log promise');
    }
    mutate();
  };

  return (
    <div className="flex flex-col">
      <Header title="Follow-up Queue" subtitle="Today's ladder actions — what needs you, and what runs itself" />

      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Worklist
            {isLoading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as 'ALL' | 'YOWI' | 'ABBA')}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ALL">All Entities</option>
              <option value="YOWI">YOWI</option>
              <option value="ABBA">ABBA</option>
            </select>
            <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load the follow-up queue.
          </div>
        )}

        {/* 1 — Needs action */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              Needs action {data && <span className="font-normal text-muted-foreground">({needsAction.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {needsAction.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client / Invoice</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-right">Days overdue</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Why it&apos;s here</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {needsAction.map((row) => {
                    const meta = CATEGORY_META[row.category];
                    const canSend = row.category === 'REVIEW' || row.category === 'BROKEN_PROMISE';
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.customerName}</div>
                          <div className="text-xs text-muted-foreground">{row.billingNo ?? row.id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{row.entity}</Badge></TableCell>
                        <TableCell className="text-right font-medium">{row.daysOverdue}d</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                        <TableCell>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                          <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                            {row.category === 'BROKEN_PROMISE' && row.brokenPromise
                              ? `Promised ${formatDateShort(new Date(row.brokenPromise.promisedDate))}${row.brokenPromise.madeBy ? ` by ${row.brokenPromise.madeBy}` : ''} — not paid`
                              : row.note}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canSend && row.nextLevel && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={sendingId === row.id}
                                onClick={() => handleSendNow(row)}
                                className="text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                              >
                                <MailWarning className="mr-1 h-4 w-4" />
                                {sendingId === row.id ? 'Sending…' : `Send L${row.nextLevel}`}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setPromiseInvoice({
                                  id: row.id,
                                  billingNo: row.billingNo,
                                  customerName: row.customerName,
                                  netAmount: row.balance,
                                  balanceDue: row.balance,
                                })
                              }
                              className="text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                            >
                              <CalendarClock className="mr-1 h-4 w-4" />
                              Promise
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <DataState
                isLoading={isLoading}
                error={error}
                subject="the follow-up queue"
                onRetry={() => mutate()}
                emptyMessage="Nothing needs a human right now. 🎉"
              />
            )}
          </CardContent>
        </Card>

        {/* 2 — Auto-send tonight */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Moon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              Queued for tonight&apos;s auto-send {data && <span className="font-normal text-muted-foreground">({autoTonight.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {autoTonight.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client / Invoice</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-right">Days overdue</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Will send</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoTonight.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.customerName}</div>
                        <div className="text-xs text-muted-foreground">{row.billingNo ?? row.id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{row.entity}</Badge></TableCell>
                      <TableCell className="text-right">{row.daysOverdue}d</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                      <TableCell className="text-right"><Badge variant="warning">Level {row.nextLevel}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <DataState
                isLoading={isLoading}
                error={error}
                subject="the nightly sweep"
                onRetry={() => mutate()}
                emptyMessage="Nothing due for the nightly sweep."
              />
            )}
          </CardContent>
        </Card>

        {/* 3 — Recently sent */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Sent in the last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.recentAuto.length > 0 ? (
              <ul className="divide-y divide-border">
                {data.recentAuto
                  .filter((l) => entityFilter === 'ALL' || l.invoice.company?.code === entityFilter)
                  .map((log) => (
                    <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Badge variant="warning">L{log.level}</Badge>
                        <span className="truncate">
                          <span className="font-medium">{log.invoice.customerName}</span>
                          <span className="text-muted-foreground"> · {log.invoice.billingNo} → {log.toEmail}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format(new Date(log.sentAt), 'MMM d, h:mm a')} · {log.status}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <DataState
                isLoading={isLoading}
                error={error}
                subject="recent follow-ups"
                onRetry={() => mutate()}
                emptyMessage="No follow-ups sent in the last 7 days."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <PromiseToPayModal
        invoice={promiseInvoice}
        isOpen={!!promiseInvoice}
        onClose={() => setPromiseInvoice(null)}
        onSave={handleSavePromise}
      />
    </div>
  );
}
