'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { Loader2, RefreshCw, ArrowRightLeft } from 'lucide-react';

interface LastRun {
  at: string;
  contracts: number;
  sent: number;
  created: number;
  updated: number;
  skipped: number;
  failedBatches: number;
  errors: string[];
}

interface ReceivablesRun {
  at: string;
  receivables: number;
  collections: number;
  sent: number;
  pruned?: { receivables: number; collections: number };
  errors: string[];
}

interface Failure {
  createdAt: string;
  entityId: string;
  details: {
    customerNumber?: string | null;
    error?: string;
    feed?: string;
    invoiceIds?: string[];
    errors?: string[];
  } | null;
}

interface Status {
  lastRun: LastRun | null;
  nightlyReconcile: boolean;
  receivablesEnabled: boolean;
  receivablesLastRun: ReceivablesRun | null;
  recentFailures: Failure[];
}

export function CashSyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'sync' | 'nightly' | 'receivables' | 'sync-receivables' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cash-management/sync');
      if (!res.ok) throw new Error();
      setStatus(await res.json());
      setError(null);
    } catch {
      setError('Could not load the cash management sync status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/cash-management/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  };

  const syncNow = async () => {
    if (
      !window.confirm(
        'Push every contract to cash management now?\n\n' +
          'Contract terms there are updated to match the billing agent. Who acquired, ' +
          'reliability score, bank account and notes are left as they are.'
      )
    )
      return;
    setBusy('sync');
    try {
      const r: LastRun = await call({ action: 'sync' });
      await load();
      alert(
        r.failedBatches
          ? `Sync finished with problems: ${r.sent} of ${r.contracts} sent, ${r.failedBatches} batch(es) failed.`
          : `Synced ${r.sent} contracts — ${r.created} created, ${r.updated} updated.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(null);
    }
  };

  const toggleNightly = async () => {
    const next = !status?.nightlyReconcile;
    if (
      next &&
      !window.confirm(
        'Turn on the nightly sync of every contract?\n\n' +
          'Each night, contract terms in cash management are updated to match the ' +
          'billing agent. Who acquired, reliability score, bank account and notes ' +
          'are left as they are.'
      )
    )
      return;
    setBusy('nightly');
    try {
      await call({ action: 'nightly', enabled: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the setting');
    } finally {
      setBusy(null);
    }
  };

  const toggleReceivables = async () => {
    const next = !status?.receivablesEnabled;
    if (
      next &&
      !window.confirm(
        'Turn on the receivables feed?\n\n' +
          'Every change to an invoice, payment or promise is sent to cash management, ' +
          'and each night every open invoice plus the last 13 months of payments is sent ' +
          'in full. The cash management forecast does not use them yet.'
      )
    )
      return;
    setBusy('receivables');
    try {
      await call({ action: 'receivables', enabled: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the setting');
    } finally {
      setBusy(null);
    }
  };

  const pushReceivables = async () => {
    if (!window.confirm('Send every open invoice and the last 13 months of payments to cash management now?')) return;
    setBusy('sync-receivables');
    try {
      const r: ReceivablesRun = await call({ action: 'sync-receivables' });
      await load();
      alert(
        r.errors.length
          ? `Finished with problems: ${r.errors.length} error(s). See the last run below.`
          : `Sent ${r.receivables} invoices and ${r.collections} payments.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sync status…
      </div>
    );
  }

  const run = status?.lastRun;
  const rrun = status?.receivablesLastRun;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
        <ArrowRightLeft className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Billing agent is the source of truth for contracts</p>
          <p className="mt-1">
            Customer number, company name, entity, monthly fee, payment plan, contract start,
            renewal date, status and invoice day are pushed to cash management and always win there.
            Who acquired, reliability score, bank account and notes belong to cash management and
            are only set when a customer is first created.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Last full sync</CardTitle>
          <Button size="sm" onClick={syncNow} disabled={busy !== null}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === 'sync' ? 'animate-spin' : ''}`} />
            {busy === 'sync' ? 'Syncing…' : 'Sync all contracts now'}
          </Button>
        </CardHeader>
        <CardContent>
          {run ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={run.failedBatches ? 'destructive' : 'success'}>
                  {run.failedBatches ? 'finished with problems' : 'succeeded'}
                </Badge>
                <span className="text-muted-foreground">{formatDateTime(new Date(run.at))}</span>
              </div>
              <p>
                {run.sent} of {run.contracts} contracts sent · {run.created} created ·{' '}
                {run.updated} updated
                {run.skipped ? ` · ${run.skipped} skipped by cash management` : ''}
              </p>
              {run.errors.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-destructive">
                  {run.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No full sync has run yet. Individual contract edits still sync as they happen.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nightly full sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              checked={!!status?.nightlyReconcile}
              onChange={toggleNightly}
              disabled={busy !== null}
            />
            <span className="text-sm">
              <span className="font-medium">Push every contract to cash management each night</span>
              <span className="mt-0.5 block text-muted-foreground">
                The backstop: anything a single edit failed to send is corrected by the next
                morning.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Receivables feed</CardTitle>
          <Button size="sm" variant="outline" onClick={pushReceivables} disabled={busy !== null}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === 'sync-receivables' ? 'animate-spin' : ''}`} />
            {busy === 'sync-receivables' ? 'Sending…' : 'Send receivables now'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              checked={!!status?.receivablesEnabled}
              onChange={toggleReceivables}
              disabled={busy !== null}
            />
            <span className="text-sm">
              <span className="font-medium">Send invoices and payments to cash management</span>
              <span className="mt-0.5 block text-muted-foreground">
                What clients owe, when each promise or PDC says it will land, and what was
                actually received in which bank account. Changes are sent as they happen; the
                whole set is re-sent each night.
              </span>
            </span>
          </label>
          {rrun ? (
            <div className="space-y-2 border-t pt-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={rrun.errors.length ? 'destructive' : 'success'}>
                  {rrun.errors.length ? 'finished with problems' : 'succeeded'}
                </Badge>
                <span className="text-muted-foreground">{formatDateTime(new Date(rrun.at))}</span>
              </div>
              <p>
                {rrun.receivables} invoices · {rrun.collections} payments · {rrun.sent} rows sent
                {rrun.pruned
                  ? ` · removed ${rrun.pruned.receivables + rrun.pruned.collections} no longer in billing agent`
                  : ''}
              </p>
              {rrun.errors.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-destructive">
                  {rrun.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="border-t pt-3 text-sm text-muted-foreground">Nothing has been sent yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Failed syncs, last 7 days</CardTitle>
        </CardHeader>
        <CardContent>
          {status?.recentFailures.length ? (
            <ul className="divide-y divide-border text-sm">
              {status.recentFailures.map((f, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">
                      {f.details?.feed === 'receivables'
                        ? `${f.details.invoiceIds?.length ?? 1} invoice(s)`
                        : f.details?.customerNumber ?? f.entityId}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}— {f.details?.error ?? f.details?.errors?.[0] ?? 'unknown error'}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(new Date(f.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No failed syncs in the last 7 days.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
