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
    expect(d.level).toBe(2);
    expect(d.reason).toMatch(/not auto-sent/);
  });
});
