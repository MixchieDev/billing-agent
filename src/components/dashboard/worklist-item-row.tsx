'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import {
  WORKLIST_STATUSES,
  WORKLIST_STATUS_LABEL,
  MAX_NOTE_LENGTH,
  shortDay,
  type WorklistStatusKey,
} from '@/lib/worklist';
import type { WorklistItemView } from '@/lib/worklist-service';
import type { InvoiceForPromise } from '@/components/dashboard/promise-to-pay-modal';
import {
  Building2, CalendarClock, ChevronDown, ChevronUp, FilePlus, ListChecks, Loader2, MessageSquare, Trash2,
} from 'lucide-react';

const STATUS_TONE: Record<WorklistStatusKey, string> = {
  TODO: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  BLOCKED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });

interface Props {
  item: WorklistItemView;
  day: string;
  users: { id: string; name: string }[];
  me: string | undefined;
  isAdmin: boolean;
  canLogPromise: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onNote: (body: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onLogPromise: (inv: InvoiceForPromise) => void;
}

export function WorklistItemRow({
  item, day, users, me, isAdmin, canLogPromise, open, onToggle, onPatch, onNote, onRemove, onLogPromise,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [target, setTarget] = useState('');
  const [uninv, setUninv] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget(item.targetAmount == null ? '' : String(item.targetAmount));
      setUninv(item.uninvoicedAmount ? String(item.uninvoicedAmount) : '');
      setError(null);
      setConfirmRemove(false);
    }
  }, [open, item.targetAmount, item.uninvoicedAmount]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const c = item.client;
  const name = item.contract?.companyName ?? item.title ?? 'Removed client';
  const carried = item.startDate < day;
  const doneLater = item.status === 'DONE' && item.doneDate && item.doneDate > day;
  const lastNote = item.notes.filter((n) => n.kind === 'NOTE').at(-1);

  const saveAmounts = () => {
    const t = target.trim() === '' ? null : Number(target);
    const u = uninv.trim() === '' ? 0 : Number(uninv);
    if ((t != null && (!Number.isFinite(t) || t < 0)) || !Number.isFinite(u) || u < 0) {
      setError('Amounts must be zero or more');
      return;
    }
    if (c && t != null && t > c.openBalance) {
      setError(`That’s more than the open balance (${formatCurrency(c.openBalance)}). Put the extra under not invoiced yet.`);
      return;
    }
    run(() => onPatch({ ...(item.contract ? { targetAmount: t } : {}), uninvoicedAmount: u }));
  };

  const addNote = () => {
    const t = note.trim();
    if (!t) {
      setError('Write an update first');
      return;
    }
    run(async () => {
      await onNote(t);
      setNote('');
    });
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <button onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2">
            {item.contract ? (
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">{name}</span>
            {carried && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                from {shortDay(item.startDate)}
              </span>
            )}
            {doneLater && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                done {shortDay(item.doneDate!)}
              </span>
            )}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {c ? (
              c.openBalance > 0 ? (
                <>
                  {formatCurrency(c.openBalance)} open · {c.oldestDaysOverdue > 0 ? `${c.oldestDaysOverdue} days overdue` : 'not yet due'}
                  {c.nextCommitment ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {' '}· {c.nextCommitment.kind === 'PROMISE' ? 'Promise' : 'PDC'} {shortDay(c.nextCommitment.day)}
                      {c.nextCommitment.amount != null && ` · ${formatCurrency(c.nextCommitment.amount)}`}
                    </span>
                  ) : c.overdueUncommitted > 0 ? (
                    <span className="text-destructive"> · no commitment</span>
                  ) : null}
                </>
              ) : 'No open invoices'
            ) : item.contract ? 'Loading balance…' : 'Task'}
          </div>
          {!open && lastNote && (
            <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{lastNote.body}</span>
              <span className="shrink-0 opacity-70">{time(lastNote.createdAt)}</span>
            </div>
          )}
        </button>

        <button onClick={onToggle} className="min-w-32 text-right">
          {item.amounts.total > 0 ? (
            <>
              <div className="font-semibold">{formatCurrency(item.amounts.total)}</div>
              <div className="text-[11px] text-muted-foreground">
                {item.amounts.uninvoiced > 0 ? (
                  <>
                    {item.amounts.invoiced > 0 && `${formatCurrency(item.amounts.invoiced)} inv + `}
                    <span className="text-amber-700 dark:text-amber-400">{formatCurrency(item.amounts.uninvoiced)} not invoiced</span>
                  </>
                ) : item.targetAmount != null && c && item.targetAmount < c.openBalance ? (
                  `target of ${formatCurrency(c.openBalance)} open`
                ) : (
                  'to collect'
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">no amount</div>
          )}
        </button>

        <div className="flex flex-col gap-1">
          <select
            aria-label={`Owner of ${name}`}
            value={item.owner.id}
            disabled={busy}
            onChange={(e) => run(() => onPatch({ ownerId: e.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs"
          >
            {users.some((u) => u.id === item.owner.id) ? null : <option value={item.owner.id}>{item.owner.name}</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.id === me ? `${u.name} (me)` : u.name}</option>
            ))}
          </select>
          <select
            aria-label={`Status of ${name}`}
            value={item.status}
            disabled={busy}
            onChange={(e) => run(() => onPatch({ status: e.target.value }))}
            className={cn('h-8 rounded-md border-0 px-2 text-xs font-medium', STATUS_TONE[item.status])}
          >
            {WORKLIST_STATUSES.map((s) => (
              <option key={s} value={s}>{WORKLIST_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {error && !open && <p className="px-4 pb-3 text-sm text-destructive">{error}</p>}

      {open && (
        <div className="space-y-4 border-t px-4 py-3">
          {/* Amounts */}
          <div className="rounded-md bg-muted/40 p-3">
            <div className="flex flex-wrap items-end gap-2">
              {item.contract && (
                <label className="min-w-40 flex-1 text-xs text-muted-foreground">
                  From open invoices
                  <Input
                    type="number" min="0" step="0.01" value={target}
                    onChange={(e) => { setTarget(e.target.value); setError(null); }}
                    placeholder={c ? String(c.openBalance) : ''}
                    className="mt-1 h-9"
                  />
                </label>
              )}
              <label className="min-w-40 flex-1 text-xs text-muted-foreground">
                Not invoiced yet
                <Input
                  type="number" min="0" step="0.01" value={uninv}
                  onChange={(e) => { setUninv(e.target.value); setError(null); }}
                  placeholder="0"
                  className="mt-1 h-9"
                />
              </label>
              <Button size="sm" variant="outline" disabled={busy} onClick={saveAmounts}>Save amount</Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {item.contract
                ? `Leave the first box empty to use the full open balance${c ? ` (${formatCurrency(c.openBalance)})` : ''}. `
                : ''}
              These are working targets only. They don’t change invoices or AR.
            </p>
          </div>

          {/* Open invoices */}
          {c && c.invoices.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Open invoices</div>
              <div className="divide-y rounded-md border">
                {c.invoices.map((inv) => (
                  <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{inv.billingNo ?? inv.id.slice(0, 8)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatCurrency(inv.balance)} · due {shortDay(inv.dueDay)}
                        {inv.daysOverdue > 0 && ` · ${inv.daysOverdue} days overdue`}
                      </span>
                      {inv.commitment && (
                        <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                          {inv.commitment.kind === 'PROMISE' ? 'Promise' : 'PDC'} {shortDay(inv.commitment.day)}
                        </span>
                      )}
                    </div>
                    {canLogPromise && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => onLogPromise({
                          id: inv.id, billingNo: inv.billingNo, customerName: inv.customerName,
                          netAmount: inv.netAmount, balanceDue: inv.balance,
                        })}
                      >
                        <CalendarClock className="mr-1 h-3.5 w-3.5" />Log promise
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {c.lastFollowUp && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Last follow-up email: level {c.lastFollowUp.level}, {shortDay(c.lastFollowUp.day)}
                </p>
              )}
            </div>
          )}

          {item.amounts.uninvoiced > 0 && (
            <Link href="/dashboard/generate-invoice" className="inline-flex items-center text-sm text-primary hover:underline">
              <FilePlus className="mr-1 h-4 w-4" />Create an invoice for the not-invoiced amount
            </Link>
          )}

          {/* Updates */}
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Updates</div>
            {item.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {item.notes.map((n) => (
                  <li key={n.id} className={cn('text-sm', n.kind === 'SYSTEM' && 'text-xs text-muted-foreground')}>
                    <span className="mr-2 text-[11px] text-muted-foreground">{n.author} · {time(n.createdAt)}</span>
                    <span className="whitespace-pre-wrap">{n.body}</span>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
              rows={2}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="Called AP, they’ll pay Friday"
              aria-label={`Update for ${name}`}
              className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm text-destructive">{error}</span>
              <div className="flex items-center gap-2">
                {(item.createdById === me || isAdmin) && (
                  confirmRemove ? (
                    <>
                      <span className="text-xs text-muted-foreground">Remove from the list for good?</span>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => run(onRemove)}>Yes, remove</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" aria-label={`Remove ${name}`} onClick={() => setConfirmRemove(true)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )
                )}
                <Button size="sm" disabled={busy} onClick={addNote}>
                  {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Add update
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
