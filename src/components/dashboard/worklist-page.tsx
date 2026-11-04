'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataState } from '@/components/dashboard/data-state';
import { PromiseToPayModal, type InvoiceForPromise } from '@/components/dashboard/promise-to-pay-modal';
import { WorklistItemRow } from '@/components/dashboard/worklist-item-row';
import { useApi } from '@/lib/hooks/use-api';
import { cn, formatCurrency } from '@/lib/utils';
import { addDays, dayLabel, shortDay } from '@/lib/worklist';
import type { WorklistItemView, WorklistDay } from '@/lib/worklist-service';
import type { Suggestion } from '@/lib/worklist';
import {
  Building2, ChevronLeft, ChevronRight, ClipboardList, Loader2, Plus, RefreshCw, Sparkles, X,
} from 'lucide-react';

type DayData = WorklistDay & { date: string; today: string; me: string };
type ClientHit = {
  id: string; companyName: string; customerNumber: string | null; status: string; entity: string | null; contractCount: number;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong');
  return json;
}

export function WorklistPage() {
  const { data: session } = useSession();
  const [date, setDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<'mine' | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [promiseFor, setPromiseFor] = useState<InvoiceForPromise | null>(null);

  // Keep the last day on screen while the next loads, so the date, owners and
  // add box don't blank out; its items are hidden until the new day arrives.
  const { data, error, isLoading, mutate } = useApi<DayData>(`/api/worklist${date ? `?date=${date}` : ''}`, {
    keepPreviousData: true,
  });
  const today = data?.today ?? null;
  const day = date ?? data?.date ?? null;
  const isPast = !!(day && today && day < today);

  // Add box
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ClientHit | null>(null);
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [showHits, setShowHits] = useState(false);
  const [amount, setAmount] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const searchSeq = useRef(0);

  // Suggestions
  const [showSuggest, setShowSuggest] = useState(false);
  const { data: sug, error: sugError, isLoading: sugLoading, mutate: mutateSug } = useApi<{
    suggestions: Suggestion[];
    unlinked: number;
  }>(showSuggest && day ? `/api/worklist/suggestions?date=${day}` : null);

  useEffect(() => {
    if (!ownerId && data?.me) setOwnerId(data.me);
  }, [data?.me, ownerId]);

  useEffect(() => {
    if (picked || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/worklist/clients?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        if (seq === searchSeq.current) setHits(json.clients ?? []);
      } catch {
        if (seq === searchSeq.current) setHits([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, picked]);

  const me = data?.me ?? session?.user?.id;
  const items = useMemo(() => {
    const all = data && (!date || data.date === date) ? data.items : [];
    return filter === 'mine' ? all.filter((i) => i.owner.id === me) : all;
  }, [data, date, filter, me]);

  const totals = useMemo(() => {
    let invoiced = 0, uninvoiced = 0, closed = 0, open = 0, blocked = 0, done = 0;
    for (const i of items) {
      invoiced += i.amounts.invoiced;
      uninvoiced += i.amounts.uninvoiced;
      if (i.status === 'DONE') { done++; closed += i.amounts.total; }
      else { open++; if (i.status === 'BLOCKED') blocked++; }
    }
    return { invoiced, uninvoiced, closed, open, blocked, done };
  }, [items]);

  const go = (n: number) => {
    if (!day) return;
    setOpenId(null);
    setDate(addDays(day, n));
  };

  const add = async (contract: { id: string } | null, title: string | null, amt: string) => {
    if (!day) return;
    setAddError(null);
    const n = amt.trim() === '' ? null : Number(amt);
    if (n != null && (!Number.isFinite(n) || n < 0)) {
      setAddError('Enter an amount of zero or more');
      return;
    }
    setAdding(true);
    try {
      const body: Record<string, unknown> = { date: day, ownerId: ownerId || undefined };
      if (contract) {
        body.contractId = contract.id;
        if (n != null) body.targetAmount = n;
      } else {
        body.title = title;
        if (n != null) body.uninvoicedAmount = n;
      }
      await send('/api/worklist', 'POST', body);
      // Only clear what was submitted; the user may have started the next one.
      if (contract) setPicked((p) => (p?.id === contract.id ? null : p));
      else setQuery((q) => (q.trim() === title ? '' : q));
      setAmount((a) => (a === amt ? '' : a));
      await mutate();
      if (showSuggest) mutateSug();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add');
    } finally {
      setAdding(false);
    }
  };

  const submitAdd = () => {
    if (picked) return add(picked, null, amount);
    const t = query.trim();
    if (!t) {
      setAddError('Search a client or type a task first');
      return;
    }
    if (hits.length > 0 && hits.some((h) => h.companyName.toLowerCase() === t.toLowerCase())) {
      setAddError('Pick the client from the list so its balance shows');
      return;
    }
    return add(null, t, amount);
  };

  const logPromise = async (invoiceId: string, payload: Record<string, unknown>) => {
    await send(`/api/invoices/${invoiceId}/promises`, 'POST', payload);
    const item = data?.items.find((i) => i.client?.invoices.some((v) => v.id === invoiceId));
    const inv = item?.client?.invoices.find((v) => v.id === invoiceId);
    if (item) {
      await send(`/api/worklist/${item.id}/notes`, 'POST', {
        body: `Logged promise to pay on ${shortDay(String(payload.promisedDate))}` +
          (payload.promisedAmount != null ? ` for ${formatCurrency(Number(payload.promisedAmount))}` : '') +
          (inv?.billingNo ? ` (${inv.billingNo})` : ''),
      }).catch(() => {});
      if (item.status === 'TODO') await send(`/api/worklist/${item.id}`, 'PATCH', { status: 'IN_PROGRESS' }).catch(() => {});
    }
    await mutate();
  };

  const stat = (label: string, value: string, sub: string, tone?: string) => (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold', tone)}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );

  return (
    <div className="flex flex-col">
      <Header title="Worklist" subtitle="Clients and tasks to work on today, and what got done" />

      <div className="flex-1 space-y-4 p-6">
        {/* Day and filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go(-1)} disabled={!day}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-44 text-center">
              <div className="text-base font-semibold">{day && today ? dayLabel(day, today) : '…'}</div>
              <div className="text-xs text-muted-foreground">
                {items.length} item{items.length === 1 ? '' : 's'}
                {isPast && ' · past day'}
              </div>
            </div>
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => go(1)} disabled={!day}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              aria-label="Go to date"
              value={day ?? ''}
              onChange={(e) => { if (e.target.value) { setOpenId(null); setDate(e.target.value); } }}
              className="h-9 w-40"
            />
            {day && today && day !== today && (
              <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); setDate(today); }}>Today</Button>
            )}
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border">
              {(['mine', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1.5 text-sm transition-colors',
                    filter === f ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {f === 'mine' ? 'Mine' : 'Everyone'}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isLoading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat('To collect', formatCurrency(totals.invoiced + totals.uninvoiced), `${formatCurrency(totals.invoiced)} invoiced`)}
          {stat('Not invoiced yet', formatCurrency(totals.uninvoiced), 'needs an invoice', totals.uninvoiced > 0 ? 'text-amber-700 dark:text-amber-400' : undefined)}
          {stat('Open', String(totals.open), `${totals.blocked} blocked`)}
          {stat('Done', String(totals.done), `${formatCurrency(totals.closed)} worked`)}
        </div>

        {/* Add */}
        {isPast ? (
          <p className="text-sm text-muted-foreground">
            Past days are a record of what happened. Unfinished items from this day are on today’s list.
          </p>
        ) : (
          <Card>
            <CardContent className="space-y-2 pt-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="relative min-w-64 flex-[2]">
                  {picked ? (
                    <div className="flex h-10 items-center justify-between rounded-md border bg-accent/40 px-3 text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {picked.companyName}
                        {picked.entity && <span className="text-xs text-muted-foreground">{picked.entity}</span>}
                      </span>
                      <button aria-label="Clear client" onClick={() => setPicked(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Input
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setShowHits(true); setAddError(null); }}
                      onFocus={() => setShowHits(true)}
                      onBlur={() => setTimeout(() => setShowHits(false), 150)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
                      placeholder="Search a client, or type a task"
                      aria-label="Client or task"
                    />
                  )}
                  {!picked && showHits && hits.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-card shadow-lg">
                      {hits.map((h) => (
                        <button
                          key={h.id}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setPicked(h); setShowHits(false); setAddError(null); }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="truncate">{h.companyName}</span>
                          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                            {[h.entity, h.contractCount > 1 ? `${h.contractCount} contracts` : h.customerNumber, h.status !== 'ACTIVE' ? h.status.toLowerCase() : null].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      ))}
                      <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                        Not a client? Press Add to save “{query.trim()}” as a task.
                      </div>
                    </div>
                  )}
                </div>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAddError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
                  placeholder={picked ? 'Target (blank = full balance)' : 'Amount (optional)'}
                  aria-label="Amount to collect"
                  className="min-w-44 flex-1"
                />
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  aria-label="Owner"
                  className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                >
                  {(data?.users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.id === me ? `${u.name} (me)` : u.name}</option>
                  ))}
                </select>
                <Button onClick={submitAdd} disabled={adding}>
                  {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add
                </Button>
                <Button variant="outline" onClick={() => setShowSuggest((s) => !s)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Suggest
                </Button>
              </div>
              {addError && <p className="text-sm text-destructive">{addError}</p>}
              {!picked && !addError && (
                <p className="text-xs text-muted-foreground">
                  For a task, the amount is counted as not invoiced yet. For a client, it’s how much of the open balance you’re aiming for.
                </p>
              )}

              {showSuggest && (
                <div className="mt-2 rounded-md border bg-muted/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Overdue with no promise or PDC, or a promise due {day === today ? 'today' : 'that day'}
                    </span>
                    <button aria-label="Close suggestions" onClick={() => setShowSuggest(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {sugLoading ? (
                    <div className="py-2 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</div>
                  ) : sugError ? (
                    <div className="text-sm text-destructive">Couldn’t load suggestions. <button className="underline" onClick={() => mutateSug()}>Retry</button></div>
                  ) : (sug?.suggestions.length ?? 0) === 0 ? (
                    <div className="text-sm text-muted-foreground">Nothing to suggest. Every overdue client has a commitment or is already on the list.</div>
                  ) : (
                    <div className="max-h-80 divide-y overflow-y-auto">
                      {sug!.suggestions.map((s) => (
                        <div key={s.contractId} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{s.companyName}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {formatCurrency(s.amount)} ·{' '}
                              {s.reason === 'PROMISE_DUE' ? 'promise due' : `${s.oldestDaysOverdue} days overdue, no commitment`}
                            </span>
                          </div>
                          <Button size="sm" variant="outline" disabled={adding} onClick={() => add({ id: s.contractId }, null, '')}>
                            <Plus className="mr-1 h-3.5 w-3.5" />Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(sug?.unlinked ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {sug!.unlinked} overdue invoice{sug!.unlinked === 1 ? ' isn’t' : 's aren’t'} linked to a contract, so {sug!.unlinked === 1 ? 'it' : 'they'} can’t be suggested. Add those as tasks.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* List */}
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item: WorklistItemView) => (
              <WorklistItemRow
                key={item.id}
                item={item}
                day={day!}
                users={data?.users ?? []}
                me={me}
                isAdmin={session?.user?.role === 'ADMIN'}
                canLogPromise={session?.user?.role === 'ADMIN' || session?.user?.role === 'APPROVER'}
                open={openId === item.id}
                onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                onPatch={async (patch) => { await send(`/api/worklist/${item.id}`, 'PATCH', patch); await mutate(); }}
                onNote={async (body) => { await send(`/api/worklist/${item.id}/notes`, 'POST', { body }); await mutate(); }}
                onRemove={async () => { await send(`/api/worklist/${item.id}`, 'DELETE'); setOpenId(null); await mutate(); }}
                onLogPromise={(inv) => setPromiseFor(inv)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <DataState
                isLoading={isLoading && (!data || (!!date && data.date !== date))}
                error={error}
                subject="the worklist"
                icon={ClipboardList}
                onRetry={() => mutate()}
                emptyMessage={
                  filter === 'mine'
                    ? 'Nothing on your list for this day. Switch to Everyone to see the team’s.'
                    : isPast
                      ? 'Nothing was on the list this day.'
                      : 'Nothing on the list yet. Search a client above, or use Suggest.'
                }
              />
            </CardContent>
          </Card>
        )}
      </div>

      <PromiseToPayModal
        invoice={promiseFor}
        isOpen={!!promiseFor}
        onClose={() => setPromiseFor(null)}
        onSave={logPromise}
      />
    </div>
  );
}
