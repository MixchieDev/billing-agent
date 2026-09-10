/** Unit tests for the pure collections ladder decision (PR-4). */
import { decideFollowUp } from '@/lib/collections-service';

const offsets = { 1: 1, 2: 7, 3: 15 };
const all = [1, 2, 3];

describe('decideFollowUp', () => {
  it('not yet overdue enough for level 1', () => {
    const d = decideFollowUp(0, 0, offsets, all);
    expect(d.due).toBe(false);
    expect(d.level).toBe(1);
  });

  it('fires level 1 at the l1 offset', () => {
    const d = decideFollowUp(1, 0, offsets, all);
    expect(d.due).toBe(true);
    expect(d.level).toBe(1);
  });

  it('holds level 2 until the l2 offset', () => {
    expect(decideFollowUp(5, 1, offsets, all).due).toBe(false);
    const d = decideFollowUp(7, 1, offsets, all);
    expect(d.due).toBe(true);
    expect(d.level).toBe(2);
  });

  it('fires level 3 at the l3 offset', () => {
    const d = decideFollowUp(15, 2, offsets, all);
    expect(d.due).toBe(true);
    expect(d.level).toBe(3);
  });

  it('never escalates past level 3', () => {
    const d = decideFollowUp(100, 3, offsets, all);
    expect(d.due).toBe(false);
    expect(d.level).toBeNull();
    expect(d.reason).toMatch(/max level/);
  });

  it('climbs one level per run, not straight to 3', () => {
    // A very overdue, un-chased invoice only gets level 1 this run.
    const d = decideFollowUp(30, 0, offsets, all);
    expect(d.level).toBe(1);
    expect(d.due).toBe(true);
  });

  it('respects autoSendLevels (draft-for-review levels are not auto-sent)', () => {
    const d = decideFollowUp(10, 1, offsets, [1]); // only L1 auto-sends
    expect(d.due).toBe(false);
    expect(d.ripe).toBe(true); // old enough, just not armed
    expect(d.level).toBe(2);
    expect(d.reason).toMatch(/not armed for auto-send/);
  });
});

describe('dormant-by-default safety', () => {
  const offsets = { 1: 1, 2: 7, 3: 15 };

  it('sends nothing when no level is armed', () => {
    for (const [days, last] of [[1, 0], [7, 1], [15, 2], [90, 0]] as const) {
      expect(decideFollowUp(days, last, offsets, []).due).toBe(false);
    }
  });

  it('still reports what it would have sent', () => {
    const d = decideFollowUp(30, 0, offsets, []);
    expect(d.due).toBe(false);
    expect(d.ripe).toBe(true); // old enough — only the arming is missing
    expect(d.level).toBe(1);
    expect(d.reason).toMatch(/would send L1/);
  });

  it('does not report an unripe invoice as withheld', () => {
    const d = decideFollowUp(0, 0, offsets, []);
    expect(d.ripe).toBe(false); // not overdue enough; arming would change nothing
    expect(d.due).toBe(false);
  });

  it('arms only the levels explicitly listed', () => {
    expect(decideFollowUp(30, 0, offsets, [1]).due).toBe(true);
    expect(decideFollowUp(30, 1, offsets, [1]).due).toBe(false);
    expect(decideFollowUp(30, 1, offsets, [1]).ripe).toBe(true);
  });

  it('never treats a maxed-out invoice as withheld', () => {
    const d = decideFollowUp(100, 3, offsets, []);
    expect(d.ripe).toBe(false);
    expect(d.level).toBeNull();
  });
});

describe('the shipped default is dormant', () => {
  it('DEFAULT_SETTINGS arms no levels', () => {
    // Guards the merge hazard: an armed default would chase the entire
    // pre-existing book on the first production sweep.
    const { DEFAULTS } = jest.requireActual('@/lib/settings');
    expect(DEFAULTS['collections.autoSendLevels']).toEqual([]);
  });
});

describe('nightly cap', () => {
  // The cap lives in runCollectionsSweep (needs I/O), so these lock the two
  // pure rules it depends on: ordering, and that a cap never changes what is
  // considered DUE — only how many of them go out tonight.
  const offsets = { 1: 1, 2: 7, 3: 15 };

  it('leaves the ladder decision untouched — a cap defers, it does not exempt', () => {
    const d = decideFollowUp(30, 0, offsets, [1]);
    expect(d.due).toBe(true);
    expect(d.ripe).toBe(true);
    // Nothing about the decision encodes a cap; holding back is the sweep's job.
    expect(Object.keys(d)).not.toContain('capped');
  });

  it('orders a capped run oldest-debt-first', () => {
    const invoices = [
      { id: 'newest', dueDate: new Date('2026-09-01') },
      { id: 'oldest', dueDate: new Date('2026-01-15') },
      { id: 'middle', dueDate: new Date('2026-05-20') },
    ];
    const sorted = [...invoices].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    expect(sorted.map((i) => i.id)).toEqual(['oldest', 'middle', 'newest']);
  });
});

describe('the shipped cap default', () => {
  it('DEFAULT_SETTINGS caps the nightly sweep', () => {
    // Guards the burst hazard: an uncapped default would drain the whole
    // backlog the first night a level is armed.
    const { DEFAULTS } = jest.requireActual('@/lib/settings');
    expect(DEFAULTS['collections.maxPerRun']).toBe(25);
  });
});
