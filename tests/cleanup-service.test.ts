import { computeFlags, FlaggableInvoice, STALE_DAYS } from '@/lib/cleanup-service';
import { InvoiceStatus } from '@/generated/prisma';

const TODAY = new Date('2026-09-07T00:00:00Z');

function inv(over: Partial<FlaggableInvoice> & { id: string }): FlaggableInvoice {
  return {
    billingNo: `BILL-${over.id}`,
    entity: 'YOWI',
    customerName: 'Acme Corp',
    status: InvoiceStatus.SENT,
    netAmount: 50_000,
    dueDate: new Date('2026-09-01T00:00:00Z'),
    periodStart: null,
    createdAt: new Date('2026-03-07T00:00:00Z'),
    hasBeenEmailed: true,
    hasEmailAddress: true,
    ...over,
  };
}

const flagsFor = (set: FlaggableInvoice[], id: string) => computeFlags(set, TODAY).get(id) ?? [];
const buckets = (set: FlaggableInvoice[], id: string) => flagsFor(set, id).map((f) => f.bucket);

describe('duplicate detection', () => {
  const period = new Date('2026-02-28T00:00:00Z');

  it('keeps the original and marks only the later copy as clear-cut', () => {
    // Both being preselectable would void the receivable entirely.
    const set = [
      inv({ id: 'a', periodStart: period, netAmount: 165_000, createdAt: new Date('2026-05-04') }),
      inv({ id: 'b', periodStart: period, netAmount: 165_000, createdAt: new Date('2026-05-21') }),
    ];
    const keeper = flagsFor(set, 'a').find((x) => x.bucket === 'duplicates')!;
    const copy = flagsFor(set, 'b').find((x) => x.bucket === 'duplicates')!;
    expect(keeper.confident).toBe(false);
    expect(keeper.reason).toMatch(/keep this one/);
    expect(copy.confident).toBe(true);
    expect(copy.reason).toContain('BILL-a'); // names the survivor, so it can be checked
  });

  it('leaves exactly one survivor however many identical copies there are', () => {
    const set = [1, 2, 3, 4].map((n) =>
      inv({
        id: `d${n}`,
        periodStart: period,
        netAmount: 58_928.57,
        createdAt: new Date(`2026-0${n + 2}-01`),
      })
    );
    const confident = set.filter((i) =>
      flagsFor(set, i.id).some((f) => f.bucket === 'duplicates' && f.confident)
    );
    expect(confident).toHaveLength(3); // 4 copies in, 1 kept
    expect(confident.map((c) => c.id)).not.toContain('d1'); // the earliest survives
  });

  it('flags differing amounts in the same period, but NOT as clear-cut', () => {
    const set = [
      inv({ id: 'a', periodStart: period, netAmount: 126_107.14 }),
      inv({ id: 'b', periodStart: period, netAmount: 113_142.88 }),
    ];
    const f = flagsFor(set, 'a').find((x) => x.bucket === 'duplicates')!;
    expect(f.confident).toBe(false);
    expect(f.reason).toMatch(/re-bill/);
  });

  it('separates the confident pair from the rest inside one mixed cluster', () => {
    // Mirrors the real INNOVE Nov-2025 cluster.
    const set = [
      inv({ id: 'x1', periodStart: period, netAmount: 126_107.14 }),
      inv({ id: 'x2', periodStart: period, netAmount: 165_000, createdAt: new Date('2026-05-04') }),
      inv({ id: 'x3', periodStart: period, netAmount: 165_000, createdAt: new Date('2026-05-21') }),
    ];
    expect(flagsFor(set, 'x1').find((f) => f.bucket === 'duplicates')!.confident).toBe(false);
    // x2 is the earlier of the identical pair, so it survives; x3 is the copy.
    expect(flagsFor(set, 'x2').find((f) => f.bucket === 'duplicates')!.confident).toBe(false);
    expect(flagsFor(set, 'x3').find((f) => f.bucket === 'duplicates')!.confident).toBe(true);
  });

  it('does not flag a lone invoice, or two in different periods', () => {
    expect(buckets([inv({ id: 'a', periodStart: period })], 'a')).not.toContain('duplicates');
    const set = [
      inv({ id: 'a', periodStart: period }),
      inv({ id: 'b', periodStart: new Date('2026-03-31T00:00:00Z') }),
    ];
    expect(buckets(set, 'a')).not.toContain('duplicates');
  });

  it('does not treat different clients as duplicates of each other', () => {
    const set = [
      inv({ id: 'a', customerName: 'Acme Corp', periodStart: period }),
      inv({ id: 'b', customerName: 'Globe Telecom', periodStart: period }),
    ];
    expect(buckets(set, 'a')).not.toContain('duplicates');
  });

  it('matches client names case- and whitespace-insensitively', () => {
    const set = [
      inv({ id: 'a', customerName: 'INNOVE COMMUNICATIONS INC.', periodStart: period, netAmount: 1 }),
      inv({ id: 'b', customerName: '  innove communications inc. ', periodStart: period, netAmount: 1 }),
    ];
    expect(buckets(set, 'a')).toContain('duplicates');
  });

  it('does not flag the same client billed by two different entities', () => {
    // Real case: MINDANAO GOLDEN GRAINS, same period and amount, YOWI + ABBA.
    // Two entities billing one client are two debts, not a double-billing.
    const set = [
      inv({ id: 'a', entity: 'YOWI', periodStart: period, netAmount: 322_216.37 }),
      inv({ id: 'b', entity: 'ABBA', periodStart: period, netAmount: 322_216.37 }),
    ];
    expect(buckets(set, 'a')).not.toContain('duplicates');
    expect(buckets(set, 'b')).not.toContain('duplicates');
  });

  it('names the twin with its entity, since billing numbers are reused', () => {
    const set = [
      inv({ id: 'a', entity: 'YOWI', periodStart: period, netAmount: 1000, createdAt: new Date('2026-01-01') }),
      inv({ id: 'b', entity: 'YOWI', periodStart: period, netAmount: 1000, createdAt: new Date('2026-02-01') }),
    ];
    // 'a' is the keeper, so its twin 'b' is the one naming a qualified survivor.
    expect(flagsFor(set, 'b').find((f) => f.bucket === 'duplicates')!.reason).toContain('BILL-a (YOWI)');
  });

  it('never flags duplicates when the period is unknown', () => {
    const set = [inv({ id: 'a', periodStart: null }), inv({ id: 'b', periodStart: null })];
    expect(buckets(set, 'a')).not.toContain('duplicates');
  });
});

describe('never-delivered detection', () => {
  it('flags an APPROVED invoice as never sent', () => {
    const set = [inv({ id: 'a', status: InvoiceStatus.APPROVED })];
    expect(buckets(set, 'a')).toContain('never-sent');
  });

  it('flags a SENT invoice with no email ever logged', () => {
    const set = [inv({ id: 'a', hasBeenEmailed: false })];
    expect(flagsFor(set, 'a').find((f) => f.bucket === 'never-sent')!.reason).toMatch(/no email was ever logged/);
  });

  it('leaves a properly delivered invoice alone', () => {
    const set = [inv({ id: 'a', hasBeenEmailed: true })];
    expect(buckets(set, 'a')).not.toContain('never-sent');
  });

  it('is never marked clear-cut — voiding undelivered billing needs a human', () => {
    const set = [
      inv({ id: 'a', status: InvoiceStatus.APPROVED }),
      inv({ id: 'b', hasBeenEmailed: false }),
    ];
    for (const id of ['a', 'b']) {
      expect(flagsFor(set, id).find((f) => f.bucket === 'never-sent')!.confident).toBe(false);
    }
  });
});

describe('stale and unreachable', () => {
  it('flags at the threshold but not a day before', () => {
    const at = new Date(TODAY.getTime() - STALE_DAYS * 86_400_000);
    const before = new Date(TODAY.getTime() - (STALE_DAYS - 1) * 86_400_000);
    expect(buckets([inv({ id: 'a', dueDate: at })], 'a')).toContain('stale');
    expect(buckets([inv({ id: 'b', dueDate: before })], 'b')).not.toContain('stale');
  });

  it('does not flag an invoice with no due date', () => {
    expect(buckets([inv({ id: 'a', dueDate: null })], 'a')).not.toContain('stale');
  });

  it('flags a missing email address', () => {
    expect(buckets([inv({ id: 'a', hasEmailAddress: false })], 'a')).toContain('no-email');
  });
});

describe('test rows', () => {
  it('flags a test-looking name', () => {
    expect(buckets([inv({ id: 'a', customerName: 'Testing' })], 'a')).toContain('test');
  });

  it('does not flag real names that merely contain the letters', () => {
    // "Protest" / "Attest" must not trip the word-boundary match.
    expect(buckets([inv({ id: 'a', customerName: 'Attestation Services Inc' })], 'a')).not.toContain('test');
  });

  it('flags a trivial amount', () => {
    expect(buckets([inv({ id: 'a', netAmount: 11.2 })], 'a')).toContain('test');
  });

  it('is clear-cut only when the name AND the amount both look like a test', () => {
    expect(flagsFor([inv({ id: 'a', customerName: 'Testing', netAmount: 11.2 })], 'a')
      .find((f) => f.bucket === 'test')!.confident).toBe(true);
    // A real client with a tiny balance is not safe to bulk-void.
    expect(flagsFor([inv({ id: 'b', customerName: 'Acme Corp', netAmount: 11.2 })], 'b')
      .find((f) => f.bucket === 'test')!.confident).toBe(false);
    // A test-named row for a large amount deserves a look, not a bulk void.
    expect(flagsFor([inv({ id: 'c', customerName: 'Demo Corp', netAmount: 90_000 })], 'c')
      .find((f) => f.bucket === 'test')!.confident).toBe(false);
  });
});

describe('overall behaviour', () => {
  it('returns an entry for every invoice, flagged or not', () => {
    const set = [inv({ id: 'clean' }), inv({ id: 'dirty', hasEmailAddress: false })];
    const map = computeFlags(set, TODAY);
    expect(map.size).toBe(2);
    expect(map.get('clean')).toEqual([]);
    expect(map.get('dirty')!.length).toBe(1);
  });

  it('can carry several flags at once', () => {
    const set = [
      inv({
        id: 'a',
        status: InvoiceStatus.APPROVED,
        hasEmailAddress: false,
        dueDate: new Date('2025-01-01T00:00:00Z'),
      }),
    ];
    expect(buckets(set, 'a').sort()).toEqual(['never-sent', 'no-email', 'stale']);
  });
});
