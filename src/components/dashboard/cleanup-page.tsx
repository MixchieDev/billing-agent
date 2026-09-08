'use client';

import { useMemo, useState } from 'react';
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
import { RefreshCw, Loader2, BrushCleaning, Ban, BellOff, ShieldCheck } from 'lucide-react';

type Bucket = 'duplicates' | 'never-sent' | 'no-email' | 'stale' | 'test';

interface Flag {
  bucket: Bucket;
  reason: string;
  confident: boolean;
}

interface Candidate {
  id: string;
  billingNo: string | null;
  customerName: string;
  entity: string;
  status: string;
  netAmount: number;
  dueDate: string | null;
  createdAt: string;
  daysOverdue: number | null;
  hasBeenEmailed: boolean;
  hasEmailAddress: boolean;
  followUpEnabled: boolean;
  flags: Flag[];
}

interface CleanupData {
  candidates: Candidate[];
  counts: Record<Bucket, number>;
  totals: { openCount: number; openValue: number; flaggedCount: number; flaggedValue: number };
}

const TABS: Array<{ key: Bucket; label: string; blurb: string }> = [
  { key: 'duplicates', label: 'Duplicates', blurb: 'Same client and service period billed more than once. Matching amounts are the strong signal; differing amounts are often legitimate re-bills.' },
  { key: 'never-sent', label: 'Never delivered', blurb: 'Approved but never sent, or marked sent with no email ever logged. These are our delivery gap, not the client’s non-payment — chasing them would be indefensible.' },
  { key: 'no-email', label: 'No email', blurb: 'No address on the invoice, so no reminder can reach anyone. Fix the contact or take them out of the ladder.' },
  { key: 'stale', label: '90+ days', blurb: 'Long past due. Worth a decision — still collectable, write-off, or already settled outside the system.' },
  { key: 'test', label: 'Test rows', blurb: 'Test-looking client names or trivial amounts left in the live book.' },
];

export function CleanupPage() {
  const [tab, setTab] = useState<Bucket>('duplicates');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, mutate } = useApi<CleanupData>('/api/invoices/cleanup');

  const rows = useMemo(
    () => (data?.candidates ?? []).filter((c) => c.flags.some((f) => f.bucket === tab)),
    [data, tab]
  );

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedValue = selectedRows.reduce((s, r) => s + r.netAmount, 0);

  const switchTab = (next: Bucket) => {
    setTab(next);
    setSelected(new Set()); // selections don't carry across buckets
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))
    );
  };

  const selectConfident = () => {
    setSelected(
      new Set(
        rows.filter((r) => r.flags.some((f) => f.bucket === tab && f.confident)).map((r) => r.id)
      )
    );
  };

  const bulkVoid = async () => {
    const reason = window.prompt(
      `Void ${selectedRows.length} invoice(s) worth ${formatCurrency(selectedValue)}.\n\n` +
        `This cannot be undone from here. Give a reason (recorded on every invoice):`,
      'Book cleanup — duplicate billing'
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A reason is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/invoices/bulk-void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], reason: reason.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to void');
      setSelected(new Set());
      mutate();
      alert(
        body.message +
          (body.skipped?.length
            ? `\n\nSkipped:\n${body.skipped
                .map((s: { billingNo: string | null; reason: string }) => `• ${s.billingNo ?? '?'} — ${s.reason}`)
                .join('\n')}`
            : '')
      );
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const setFollowUps = async (enabled: boolean) => {
    if (
      !window.confirm(
        `${enabled ? 'Resume' : 'Stop'} follow-ups for ${selectedRows.length} invoice(s)?\n\n` +
          `The invoices stay open and on the books — only the reminder ladder changes.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch('/api/invoices/bulk-follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update');
      setSelected(new Set());
      mutate();
      alert(body.message);
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const activeTab = TABS.find((t) => t.key === tab)!;
  const confidentCount = rows.filter((r) =>
    r.flags.some((f) => f.bucket === tab && f.confident)
  ).length;

  return (
    <div className="flex flex-col">
      <Header
        title="Invoice Cleanup"
        subtitle="Tidy the open book before the collections ladder is armed against it"
      />

      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Open book</CardTitle>
              <BrushCleaning className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.totals.openValue, formatCurrency, error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : `${data?.totals.openCount ?? 0} open invoices`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Flagged for review
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.totals.flaggedValue, formatCurrency, error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : `${data?.totals.flaggedCount ?? 0} invoices need a decision`}
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
                onClick={() => switchTab(t.key)}
              >
                {t.label}
                {data && (
                  <span className="ml-2 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                    {data.counts[t.key]}
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

        <p className="text-sm text-muted-foreground">{activeTab.blurb}</p>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
            <span className="text-sm font-medium">
              {selected.size} selected · {formatCurrency(selectedValue)}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setFollowUps(false)}>
                <BellOff className="mr-1 h-4 w-4" />
                Stop follow-ups
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={bulkVoid}>
                <Ban className="mr-1 h-4 w-4" />
                {busy ? 'Working…' : 'Void selected'}
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            {rows.length > 0 ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={toggleAll}>
                    {selected.size === rows.length ? 'Clear selection' : `Select all ${rows.length}`}
                  </Button>
                  {confidentCount > 0 && (
                    <Button size="sm" variant="outline" onClick={selectConfident}>
                      Select the {confidentCount} clear-cut one{confidentCount === 1 ? '' : 's'}
                    </Button>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Client / Invoice</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Why it&apos;s flagged</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const flag = r.flags.find((f) => f.bucket === tab)!;
                      return (
                        <TableRow
                          key={r.id}
                          className={selected.has(r.id) ? 'bg-muted/50' : undefined}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-primary"
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)}
                              aria-label={`Select ${r.billingNo ?? r.customerName}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{r.customerName}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.billingNo ?? r.id.slice(0, 8)} · {r.status}
                              {!r.followUpEnabled && ' · follow-ups off'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.entity}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(r.netAmount)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.dueDate ? formatDateShort(new Date(r.dueDate)) : '—'}
                            {r.daysOverdue !== null && r.daysOverdue > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {r.daysOverdue}d overdue
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-sm text-sm">
                            <span
                              className={
                                flag.confident ? 'font-medium text-destructive' : 'text-muted-foreground'
                              }
                            >
                              {flag.reason}
                            </span>
                            {flag.confident && (
                              <Badge variant="destructive" className="ml-2 align-middle">
                                clear-cut
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            ) : (
              <DataState
                isLoading={isLoading}
                error={error}
                subject="the cleanup list"
                icon={BrushCleaning}
                onRetry={() => mutate()}
                emptyMessage={`Nothing flagged under ${activeTab.label.toLowerCase()}.`}
              />
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Voiding is permanent and recorded against each invoice with your reason. Stopping
          follow-ups is reversible and leaves the receivable on the books — prefer it whenever the
          debt is real but shouldn&apos;t be chased automatically.
        </p>
      </div>
    </div>
  );
}
