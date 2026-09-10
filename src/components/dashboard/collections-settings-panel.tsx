'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateShort } from '@/lib/utils';
import { Loader2, ShieldAlert, Save } from 'lucide-react';

interface Suppressed {
  total?: number;
  byLevel?: Record<string, number>;
  armedLevels?: number[];
  maxPerRun?: number;
  cappedOut?: number;
}

interface Run {
  id: string;
  runDate: string;
  status: string;
  invoicesScanned: number;
  followUpsSent: number;
  promisesBroken: number;
  suppressed: Suppressed | null;
}

interface Config {
  l1Days: number;
  l2Days: number;
  l3Days: number;
  autoSendLevels: number[];
  maxPerRun: number;
}

const LEVELS = [
  { n: 1, label: 'Level 1 — gentle reminder' },
  { n: 2, label: 'Level 2 — firm reminder' },
  { n: 3, label: 'Level 3 — final notice' },
];

export function CollectionsSettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Config | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [levelsWithTemplate, setLevelsWithTemplate] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/collections/settings');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setConfig(data.settings);
      setSaved(data.settings);
      setRuns(data.runs ?? []);
      setLevelsWithTemplate(data.levelsWithTemplate ?? []);
      setError(null);
    } catch {
      setError('Could not load the collections settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const latest = runs[0];
  const wouldSend = latest?.suppressed?.byLevel ?? {};
  /** What the last run reported for a level — the cost of arming it. */
  const costOf = (n: number) => Number(wouldSend[String(n)] ?? 0);

  const dirty = !!config && !!saved && JSON.stringify(config) !== JSON.stringify(saved);

  const toggle = (n: number) => {
    if (!config) return;
    const on = config.autoSendLevels.includes(n);
    setConfig({
      ...config,
      autoSendLevels: on
        ? config.autoSendLevels.filter((x) => x !== n)
        : [...config.autoSendLevels, n].sort(),
    });
  };

  /** Emails the next armed run would send, given the toggles and the cap. */
  const projected = () => {
    if (!config) return 0;
    const owed = config.autoSendLevels.reduce((sum, n) => sum + costOf(n), 0);
    return config.maxPerRun > 0 ? Math.min(owed, config.maxPerRun) : owed;
  };
  const owedNow = config ? config.autoSendLevels.reduce((s, n) => s + costOf(n), 0) : 0;
  const held = Math.max(0, owedNow - projected());

  const save = async () => {
    if (!config) return;

    const missing = config.autoSendLevels.filter((n) => !levelsWithTemplate.includes(n));
    if (missing.length) {
      alert(
        `Level ${missing.join(', ')} has no follow-up email template.\n\n` +
          `Arming it would send nothing and log an error against every overdue invoice. ` +
          `Add the template under the Follow-up Emails tab first.`
      );
      return;
    }

    const n = projected();
    if (
      config.autoSendLevels.length > 0 &&
      !window.confirm(
        `Arm auto-send for level${config.autoSendLevels.length > 1 ? 's' : ''} ` +
          `${config.autoSendLevels.join(', ')}?\n\n` +
          `Based on the last sweep, tonight's run would email about ${n} client${n === 1 ? '' : 's'}` +
          (held > 0 ? `, holding ${held} back for later nights` : '') +
          `.\n\nThese are real emails to real clients.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/collections/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      setSaved(body.settings);
      setConfig(body.settings);
      setError(null);
      alert(body.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading collections settings…
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error ?? 'Could not load the collections settings.'}
      </div>
    );
  }

  const armed = config.autoSendLevels.length > 0;

  return (
    <div className="space-y-6">
      {/* Current state, stated plainly — this is the thing people get wrong. */}
      <div
        className={`rounded-lg border p-4 ${
          armed ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/40'
        }`}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert
            className={`mt-0.5 h-5 w-5 shrink-0 ${armed ? 'text-amber-600' : 'text-muted-foreground'}`}
          />
          <div>
            <p className="font-medium">
              {armed
                ? `Auto-send is ON for level${config.autoSendLevels.length > 1 ? 's' : ''} ${config.autoSendLevels.join(', ')}`
                : 'Auto-send is OFF — nothing is emailed to clients'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {armed
                ? `The nightly sweep emails overdue clients at ${
                    config.maxPerRun > 0 ? `up to ${config.maxPerRun} per night` : 'no nightly limit'
                  }. Un-armed levels are still evaluated and reported.`
                : 'The nightly sweep still runs and reports what it would have sent, so you can see the cost of arming a level before you do.'}
            </p>
          </div>
        </div>
      </div>

      {/* Ladder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Follow-up ladder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {LEVELS.map((lvl) => {
            const on = config.autoSendLevels.includes(lvl.n);
            const cost = costOf(lvl.n);
            const dayKey = (['l1Days', 'l2Days', 'l3Days'] as const)[lvl.n - 1];
            return (
              <div
                key={lvl.n}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-3"
              >
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-primary"
                    checked={on}
                    onChange={() => toggle(lvl.n)}
                  />
                  <span className="text-sm font-medium">{lvl.label}</span>
                </label>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>sends at</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={config[dayKey]}
                    onChange={(e) =>
                      setConfig({ ...config, [dayKey]: Number(e.target.value) })
                    }
                    className="w-20 rounded-md border border-border px-2 py-1 text-sm"
                  />
                  <span>days overdue</span>
                </div>

                {!levelsWithTemplate.includes(lvl.n) && (
                  <span className="text-xs font-medium text-destructive">
                    No email template — arming this sends nothing
                  </span>
                )}

                <div className="ml-auto">
                  {latest ? (
                    <Badge variant={cost > 0 ? (on ? 'warning' : 'outline') : 'outline'}>
                      {cost > 0 ? `${cost} waiting` : 'none waiting'}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">no sweep yet</span>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
            <span className="text-sm font-medium">Most emails per night</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={config.maxPerRun}
              onChange={(e) => setConfig({ ...config, maxPerRun: Number(e.target.value) })}
              className="w-24 rounded-md border border-border px-2 py-1 text-sm"
            />
            <span className="text-sm text-muted-foreground">
              0 means no limit. The oldest debts are chased first, so a capped run drains the
              backlog over several nights instead of in one burst.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Projection — the number that actually matters when you press save */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What tonight would send</CardTitle>
        </CardHeader>
        <CardContent>
          {latest ? (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold">{projected()}</span>
                <span className="text-sm text-muted-foreground">
                  email{projected() === 1 ? '' : 's'} to clients
                  {held > 0 && `, with ${held} held back for later nights`}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Based on the sweep of {formatDateShort(new Date(latest.runDate))}, which scanned{' '}
                {latest.invoicesScanned} invoices and found {latest.suppressed?.total ?? 0} owed a
                follow-up. Tomorrow&apos;s figure will differ as invoices age and get paid.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The nightly sweep hasn&apos;t run yet, so there is nothing to project from. It runs at
              8 AM Manila.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent runs */}
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent nightly sweeps</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDateShort(new Date(r.runDate))}
                    <span className="text-muted-foreground">
                      {' · '}scanned {r.invoicesScanned}
                      {r.promisesBroken > 0 && ` · ${r.promisesBroken} promises broken`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={r.followUpsSent > 0 ? 'warning' : 'outline'}>
                      {r.followUpsSent} sent
                    </Badge>
                    {(r.suppressed?.total ?? 0) > 0 && (
                      <Badge variant="outline">{r.suppressed?.total} would have</Badge>
                    )}
                    {(r.suppressed?.cappedOut ?? 0) > 0 && (
                      <Badge variant="secondary">{r.suppressed?.cappedOut} capped</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || !dirty}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving…' : 'Save collections settings'}
        </Button>
        {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}
