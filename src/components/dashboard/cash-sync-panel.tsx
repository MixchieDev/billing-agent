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

interface Failure {
  createdAt: string;
  entityId: string;
  details: { customerNumber?: string | null; error?: string } | null;
}

interface Status {
  lastRun: LastRun | null;
  nightlyReconcile: boolean;
  recentFailures: Failure[];
}

export function CashSyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'sync' | 'nightly' | null>(null);
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
          'Until the cash management app is updated, this also resets who acquired, ' +
          'reliability score, bank account and notes on every customer there.'
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
          'Only do this once the cash management app has been updated to stop ' +
          'overwriting who acquired, reliability score, bank account and notes. ' +
          'Before that, those four would be reset on every customer, every night.'
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sync status…
      </div>
    );
  }

  const run = status?.lastRun;

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
                morning. Leave off until the cash management app has been updated — see the
                warning when you turn it on.
              </span>
            </span>
          </label>
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
                    <span className="font-medium">{f.details?.customerNumber ?? f.entityId}</span>
                    <span className="text-muted-foreground"> — {f.details?.error ?? 'unknown error'}</span>
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
