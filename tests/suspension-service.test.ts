import { suspensionStage, resolveGraceDays, DEFAULT_GRACE_DAYS } from '@/lib/suspension-service';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = d('2026-09-11');

describe('suspensionStage', () => {
  it('is in grace while the deadline is still ahead', () => {
    expect(suspensionStage(false, null, d('2026-09-18'), TODAY)).toBe('grace');
  });

  it('becomes due the day the deadline arrives', () => {
    expect(suspensionStage(false, null, TODAY, TODAY)).toBe('due');
    expect(suspensionStage(false, null, d('2026-09-10'), TODAY)).toBe('due');
  });

  it('reports an already-restricted account as suspended', () => {
    expect(suspensionStage(false, d('2026-09-05'), d('2026-09-04'), TODAY)).toBe('suspended');
  });

  it('flags a PAID but still-restricted account for restore, above everything else', () => {
    // The worst outcome in this flow is a paying client left locked out, so
    // this must win even though the deadline is long past.
    expect(suspensionStage(true, d('2026-09-05'), d('2026-01-01'), TODAY)).toBe('restore');
  });

  it('does not ask to restore an account that was never restricted', () => {
    expect(suspensionStage(true, null, d('2026-09-01'), TODAY)).toBe('due');
  });

  it('ships a 7-day grace period', () => {
    expect(DEFAULT_GRACE_DAYS).toBe(7);
  });
});

describe('resolveGraceDays — it ends up in a client-facing notice', () => {
  it('accepts sensible values', () => {
    expect(resolveGraceDays(7)).toBe(7);
    expect(resolveGraceDays(1)).toBe(1);
    expect(resolveGraceDays(30)).toBe(30);
    expect(resolveGraceDays('14')).toBe(14);
  });

  it('falls back rather than clamping to a bound', () => {
    // -5 clamped to 1 would tell a client they have one day. Nobody set that.
    expect(resolveGraceDays(-5)).toBe(DEFAULT_GRACE_DAYS);
    expect(resolveGraceDays(0)).toBe(DEFAULT_GRACE_DAYS);
    expect(resolveGraceDays(999)).toBe(DEFAULT_GRACE_DAYS);
  });

  it('falls back on junk and absence', () => {
    expect(resolveGraceDays('abc')).toBe(DEFAULT_GRACE_DAYS);
    expect(resolveGraceDays(null)).toBe(DEFAULT_GRACE_DAYS);
    expect(resolveGraceDays(undefined)).toBe(DEFAULT_GRACE_DAYS);
    expect(resolveGraceDays({})).toBe(DEFAULT_GRACE_DAYS);
  });
});
