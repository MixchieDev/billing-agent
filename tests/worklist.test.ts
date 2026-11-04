/** Unit tests for the daily Worklist helpers. */
import {
  addDays,
  buildSuggestions,
  contractNameIndex,
  dayLabel,
  daysBetween,
  isValidDay,
  itemAmounts,
  manilaDay,
  nextDoneDate,
  onDayWhere,
  parseAmount,
  summarizeClient,
  type SuggestInvoiceInput,
} from '@/lib/worklist';

// Manila is UTC+8: 16:00Z is midnight the next day there.
const at = (iso: string) => new Date(iso);

function inv(over: Partial<SuggestInvoiceInput> = {}): SuggestInvoiceInput {
  return {
    id: 'i1',
    billingNo: 'B-1',
    customerName: 'Client A',
    dueDate: at('2026-10-20T00:00:00+08:00'),
    netAmount: 1000,
    balanceDue: 1000,
    amountPaidTotal: 0,
    lastFollowUpAt: null,
    lastFollowUpLevel: 0,
    contractIds: ['c1'],
    contracts: [{ id: 'c1', companyName: 'Client A' }],
    openPromises: [],
    pendingPdcs: [],
    ...over,
  };
}

describe('days', () => {
  it('reads the Manila day, not the UTC one', () => {
    expect(manilaDay(at('2026-11-03T16:30:00Z'))).toBe('2026-11-04');
    expect(manilaDay(at('2026-11-03T15:59:00Z'))).toBe('2026-11-03');
  });

  it('validates days strictly', () => {
    expect(isValidDay('2026-11-04')).toBe(true);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('2026-11-4')).toBe(false);
    expect(isValidDay(null)).toBe(false);
  });

  it('adds and counts days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(daysBetween('2026-10-20', '2026-11-04')).toBe(15);
  });

  it('labels nearby days', () => {
    expect(dayLabel('2026-11-04', '2026-11-04')).toMatch(/^Today, /);
    expect(dayLabel('2026-11-03', '2026-11-04')).toMatch(/^Yesterday, /);
    expect(dayLabel('2026-11-05', '2026-11-04')).toMatch(/^Tomorrow, /);
  });
});

describe('carry-over rule', () => {
  // Mirrors the where clause: on the list from startDate until the done day.
  const onDay = (item: { start: string; done: string | null }, day: string) => {
    const w = onDayWhere(day);
    const d = w.startDate.lte.getTime();
    const start = new Date(item.start + 'T00:00:00Z').getTime();
    const done = item.done ? new Date(item.done + 'T00:00:00Z').getTime() : null;
    return start <= d && (done === null || done >= d);
  };

  it('keeps an open item on every day after it was added', () => {
    const it = { start: '2026-11-03', done: null };
    expect(onDay(it, '2026-11-02')).toBe(false);
    expect(onDay(it, '2026-11-03')).toBe(true);
    expect(onDay(it, '2026-11-10')).toBe(true);
  });

  it('drops a done item after the day it was done, but keeps it in history', () => {
    const it = { start: '2026-11-03', done: '2026-11-04' };
    expect(onDay(it, '2026-11-03')).toBe(true);
    expect(onDay(it, '2026-11-04')).toBe(true);
    expect(onDay(it, '2026-11-05')).toBe(false);
  });

  it('sets the done day on Done and clears it when reopened', () => {
    expect(nextDoneDate({ status: 'TODO', doneDate: null }, 'DONE', '2026-11-04')).toBe('2026-11-04');
    expect(nextDoneDate({ status: 'DONE', doneDate: '2026-11-03' }, 'DONE', '2026-11-04')).toBe('2026-11-03');
    expect(nextDoneDate({ status: 'DONE', doneDate: '2026-11-03' }, 'IN_PROGRESS', '2026-11-04')).toBeNull();
    expect(nextDoneDate({ status: 'TODO', doneDate: null }, 'BLOCKED', '2026-11-04')).toBeNull();
  });
});

describe('parseAmount', () => {
  it('separates not given, cleared and a value', () => {
    expect(parseAmount(undefined)).toEqual({ value: undefined });
    expect(parseAmount(null)).toEqual({ value: null });
    expect(parseAmount('')).toEqual({ value: null });
    expect(parseAmount('1500.555')).toEqual({ value: 1500.56 });
    expect(parseAmount(0)).toEqual({ value: 0 });
  });

  it('rejects negatives and junk', () => {
    expect(parseAmount(-1).error).toBeDefined();
    expect(parseAmount('abc').error).toBeDefined();
    expect(parseAmount(Infinity).error).toBeDefined();
    expect(parseAmount({}).error).toBeDefined();
  });
});

describe('itemAmounts', () => {
  it('uses the full open balance when no target is set', () => {
    expect(itemAmounts({ targetAmount: null, uninvoicedAmount: 0 }, 184800)).toEqual({
      invoiced: 184800, uninvoiced: 0, total: 184800,
    });
  });

  it('uses the target, capped at what is still open', () => {
    expect(itemAmounts({ targetAmount: 90000, uninvoicedAmount: 0 }, 184800).invoiced).toBe(90000);
    // a payment since shrank the balance below the target
    expect(itemAmounts({ targetAmount: 90000, uninvoicedAmount: 0 }, 40000).invoiced).toBe(40000);
  });

  it('adds money not invoiced yet, including for tasks', () => {
    expect(itemAmounts({ targetAmount: null, uninvoicedAmount: 18000 }, 322000).total).toBe(340000);
    expect(itemAmounts({ targetAmount: null, uninvoicedAmount: 25000 }, null)).toEqual({
      invoiced: 0, uninvoiced: 25000, total: 25000,
    });
  });
});

describe('summarizeClient', () => {
  const today = '2026-11-04';

  it('totals open balances and finds the oldest overdue', () => {
    const s = summarizeClient(
      [
        inv({ id: 'a', balanceDue: 1000, dueDate: at('2026-10-20T00:00:00+08:00') }),
        inv({ id: 'b', balanceDue: null, netAmount: 500, amountPaidTotal: 200, dueDate: at('2026-11-10T00:00:00+08:00') }),
      ],
      today
    );
    expect(s.openBalance).toBe(1300);
    expect(s.openInvoiceCount).toBe(2);
    expect(s.oldestDaysOverdue).toBe(15);
    expect(s.overdueUncommitted).toBe(1000);
    expect(s.invoices.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('treats a promise or a pending PDC as a commitment, earliest first', () => {
    const s = summarizeClient(
      [
        inv({ id: 'a', openPromises: [{ promisedDate: at('2026-11-12T00:00:00+08:00'), promisedAmount: 400 }] }),
        inv({ id: 'b', pendingPdcs: [{ checkDate: at('2026-11-08T00:00:00+08:00'), amount: 1000 }] }),
      ],
      today
    );
    expect(s.overdueUncommitted).toBe(0);
    expect(s.nextCommitment).toEqual({ kind: 'PDC', day: '2026-11-08', amount: 1000 });
  });

  it('ignores fully paid invoices and reports the latest follow-up', () => {
    const s = summarizeClient(
      [
        inv({ id: 'a', balanceDue: 0, lastFollowUpAt: at('2026-10-30T10:00:00+08:00'), lastFollowUpLevel: 2 }),
        inv({ id: 'b', lastFollowUpAt: at('2026-10-25T10:00:00+08:00'), lastFollowUpLevel: 1 }),
      ],
      today
    );
    expect(s.openInvoiceCount).toBe(1);
    expect(s.lastFollowUp).toEqual({ day: '2026-10-30', level: 2 });
  });

  it('is empty for a client with nothing open', () => {
    const s = summarizeClient([], today);
    expect(s).toMatchObject({ openBalance: 0, openInvoiceCount: 0, oldestDaysOverdue: 0, nextCommitment: null });
  });
});

describe('buildSuggestions', () => {
  const today = '2026-11-04';
  const idx = contractNameIndex([
    { id: 'c1', companyName: 'Client A' },
    { id: 'c2', companyName: 'Client B' },
    { id: 'c3', companyName: 'Client C' },
  ]);

  it('suggests overdue clients with no commitment, biggest first, one row per client', () => {
    const { suggestions } = buildSuggestions(
      [
        inv({ id: '1', balanceDue: 500 }),
        inv({ id: '2', balanceDue: 700 }),
        inv({ id: '3', balanceDue: 5000, contracts: [{ id: 'c2', companyName: 'Client B' }] }),
      ],
      today,
      new Set(),
      idx
    );
    expect(suggestions.map((s) => [s.contractId, s.amount, s.reason])).toEqual([
      ['c2', 5000, 'NO_COMMITMENT'],
      ['c1', 1200, 'NO_COMMITMENT'],
    ]);
  });

  it('leaves out committed, not-yet-due and already-listed clients', () => {
    const { suggestions } = buildSuggestions(
      [
        inv({ id: '1', pendingPdcs: [{ checkDate: at('2026-11-20T00:00:00+08:00'), amount: 1000 }] }),
        inv({ id: '2', dueDate: at('2026-11-10T00:00:00+08:00'), contracts: [{ id: 'c2', companyName: 'Client B' }] }),
        inv({ id: '3', contracts: [{ id: 'c3', companyName: 'Client C' }] }),
      ],
      today,
      new Set(['client c']),
      idx
    );
    expect(suggestions).toEqual([]);
  });

  it('suggests a promise due today, listed first', () => {
    const { suggestions } = buildSuggestions(
      [
        inv({ id: '1', balanceDue: 99999, contracts: [{ id: 'c2', companyName: 'Client B' }] }),
        inv({ id: '2', openPromises: [{ promisedDate: at('2026-11-04T00:00:00+08:00'), promisedAmount: 500 }] }),
      ],
      today,
      new Set(),
      idx
    );
    expect(suggestions.map((s) => [s.contractId, s.reason])).toEqual([
      ['c1', 'PROMISE_DUE'],
      ['c2', 'NO_COMMITMENT'],
    ]);
  });

  it('matches an unlinked invoice to a client by name, ignoring case and spacing', () => {
    const r = buildSuggestions(
      [inv({ contracts: [], contractIds: [], customerName: '  client   a ', balanceDue: 300 })],
      today, new Set(), idx
    );
    expect(r.suggestions.map((s) => [s.contractId, s.amount])).toEqual([['c1', 300]]);
    expect(r.unlinked).toBe(0);
  });

  it('groups a client\'s contracts into one suggestion', () => {
    const r = buildSuggestions(
      [
        inv({ id: '1', balanceDue: 100, contracts: [{ id: 'c1', companyName: 'Client A' }] }),
        inv({ id: '2', balanceDue: 200, contracts: [{ id: 'c9', companyName: 'Client A' }] }),
      ],
      today, new Set(), idx
    );
    expect(r.suggestions.map((s) => [s.contractId, s.amount])).toEqual([['c1', 300]]);
  });

  it('counts invoices that match no client instead of dropping them silently', () => {
    const r = buildSuggestions([inv({ contracts: [], contractIds: [], customerName: 'Nobody Inc' })], today, new Set(), idx);
    expect(r.suggestions).toEqual([]);
    expect(r.unlinked).toBe(1);
  });
});

describe('contractNameIndex', () => {
  it('keeps the first contract for a name, so ACTIVE ones passed first represent it', () => {
    const i = contractNameIndex([
      { id: 'active', companyName: 'Acme Corp' },
      { id: 'old', companyName: 'ACME  corp' },
    ]);
    expect(i.get('acme corp')?.id).toBe('active');
    expect(i.size).toBe(1);
  });
});
