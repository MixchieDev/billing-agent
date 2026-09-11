import { suspensionStage, DEFAULT_GRACE_DAYS } from '@/lib/suspension-service';

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
