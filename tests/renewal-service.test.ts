import { daysUntil, renewalStage, needsNotice, noticeDue, DEFAULT_LEAD_DAYS } from '@/lib/renewal-service';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = d('2026-09-08');
const LEAD = 45;

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil(d('2026-10-23'), TODAY)).toBe(45);
    expect(daysUntil(d('2026-09-09'), TODAY)).toBe(1);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntil(d('2026-09-07'), TODAY)).toBe(-1);
    expect(daysUntil(d('2026-08-08'), TODAY)).toBe(-31);
  });

  it('is not thrown off by times of day', () => {
    // A late-evening "today" must not make tomorrow read as 0 days.
    const evening = new Date('2026-09-08T23:59:00Z');
    expect(daysUntil(new Date('2026-09-09T00:30:00Z'), evening)).toBe(1);
  });
});

describe('renewalStage', () => {
  it('separates lapsed, actionable, and further out', () => {
    expect(renewalStage(-1, LEAD)).toBe('overdue');
    expect(renewalStage(0, LEAD)).toBe('due');
    expect(renewalStage(45, LEAD)).toBe('due');
    expect(renewalStage(46, LEAD)).toBe('soon');
    expect(renewalStage(90, LEAD)).toBe('soon');
    expect(renewalStage(91, LEAD)).toBe('later');
  });

  it('defaults to a 45-day lead time', () => {
    expect(DEFAULT_LEAD_DAYS).toBe(45);
  });
});

describe('needsNotice — the "no renewal is missed" guarantee', () => {
  it('reminds exactly at the lead time', () => {
    expect(needsNotice(d('2026-10-23'), null, TODAY, LEAD)).toBe(true); // 45 days
  });

  it('does not remind before the window opens', () => {
    expect(needsNotice(d('2026-10-24'), null, TODAY, LEAD)).toBe(false); // 46 days
  });

  it('still catches a contract already inside the window', () => {
    // The whole point: a contract 20 days out when this shipped must not be
    // skipped just because its exact 45-day mark has passed.
    expect(needsNotice(d('2026-09-28'), null, TODAY, LEAD)).toBe(true);
    expect(needsNotice(d('2026-09-09'), null, TODAY, LEAD)).toBe(true);
  });

  it('survives the cron missing a night', () => {
    // Day 45 skipped; day 44 must still fire rather than silently pass.
    expect(needsNotice(d('2026-10-22'), null, TODAY, LEAD)).toBe(true);
  });

  it('reminds only once per renewal', () => {
    const end = d('2026-10-01');
    expect(needsNotice(end, null, TODAY, LEAD)).toBe(true);
    const sentToday = new Date('2026-09-08T09:00:00Z');
    expect(needsNotice(end, sentToday, TODAY, LEAD)).toBe(false);
  });

  it('reminds again for the NEXT cycle after a renewal', () => {
    // Reminded in Sep 2026 for the Oct 2026 renewal; a year later the contract
    // ends Oct 2027 and that stale notice must not suppress the new reminder.
    const oldNotice = d('2026-09-08');
    const nextEnd = d('2027-10-01');
    const laterToday = d('2027-09-01');
    expect(needsNotice(nextEnd, oldNotice, laterToday, LEAD)).toBe(true);
  });

  it('does not keep emailing about a contract that already lapsed', () => {
    // It still shows on the list as "lapsed" — it just stops generating notices.
    expect(needsNotice(d('2026-09-07'), null, TODAY, LEAD)).toBe(false);
    expect(needsNotice(d('2026-01-01'), null, TODAY, LEAD)).toBe(false);
  });

  it('fires on the last day', () => {
    expect(needsNotice(TODAY, null, TODAY, LEAD)).toBe(true);
  });

  it('honours a custom lead time', () => {
    expect(needsNotice(d('2026-10-23'), null, TODAY, 30)).toBe(false); // 45 out, 30-day lead
    expect(needsNotice(d('2026-10-08'), null, TODAY, 30)).toBe(true); // 30 out
    expect(needsNotice(d('2026-11-07'), null, TODAY, 90)).toBe(true); // 60 out, 90-day lead
  });
});

describe('lapse alerts — a contract must not lapse silently', () => {
  const offsets = { lead: 45 };
  const LEADD = offsets.lead;

  it('raises a lapse alert once the end date has passed', () => {
    expect(noticeDue(d('2026-09-07'), null, TODAY, LEADD)).toBe('lapsed');
    expect(noticeDue(d('2026-08-10'), null, TODAY, LEADD)).toBe('lapsed');
  });

  it('catches contracts that lapsed long before this shipped', () => {
    // No notice was ever recorded for these — they must still surface.
    expect(noticeDue(d('2026-03-08'), null, TODAY, LEADD)).toBe('lapsed');
    expect(noticeDue(d('2025-01-01'), null, TODAY, LEADD)).toBe('lapsed');
  });

  it('still alerts after a lead-time reminder was already sent', () => {
    // Reminded on 20 Sep for a 1 Oct renewal; by 8 Oct it has lapsed.
    const end = d('2026-10-01');
    const reminded = d('2026-09-20');
    expect(noticeDue(end, reminded, d('2026-10-08'), LEADD)).toBe('lapsed');
  });

  it('raises the lapse alert only once', () => {
    const end = d('2026-08-10');
    const lapseNotice = d('2026-08-11'); // written after the end date
    expect(noticeDue(end, lapseNotice, TODAY, LEADD)).toBeNull();
    expect(noticeDue(end, lapseNotice, d('2026-12-01'), LEADD)).toBeNull();
  });

  it('treats a notice written on the end date itself as still owing the alert', () => {
    const end = d('2026-09-01');
    expect(noticeDue(end, end, TODAY, LEADD)).toBe('lapsed');
  });

  it('reminds again for the next cycle once the contract is renewed', () => {
    // Lapse alert sent Aug 2026; contract later renewed to Oct 2027.
    const lapseNotice = d('2026-08-11');
    expect(noticeDue(d('2027-10-01'), lapseNotice, d('2027-09-01'), LEADD)).toBe('reminder');
  });

  it('does not confuse the two phases', () => {
    expect(noticeDue(d('2026-10-23'), null, TODAY, LEADD)).toBe('reminder'); // 45 out
    expect(noticeDue(d('2026-11-07'), null, TODAY, LEADD)).toBeNull(); // 60 out
    expect(noticeDue(TODAY, null, TODAY, LEADD)).toBe('reminder'); // due today, not lapsed
  });
});
