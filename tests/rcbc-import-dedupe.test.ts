/**
 * RcbcEndClient has @@unique([name, month]), so an import file that repeats a
 * client for the same month would put two conflicting writes in one
 * transaction and fail the ENTIRE import (regression: a 178-row September
 * file failed because "Hopewell Sales" appeared on lines 136 and 178).
 *
 * The route collapses in-file duplicates before writing — last row wins.
 */

interface Row { name: string; month: Date; employeeCount: number }

/** The collapsing rule as implemented in the import route. */
function collapseDuplicates(rows: Row[]) {
  const byKey = new Map<string, Row>();
  const duplicateNames = new Set<string>();
  for (const row of rows) {
    const key = `${row.name}::${row.month.toISOString()}`;
    if (byKey.has(key)) duplicateNames.add(row.name);
    byKey.set(key, row);
  }
  return { rows: [...byKey.values()], duplicateNames: [...duplicateNames] };
}

const SEP = new Date('2026-09-01');
const OCT = new Date('2026-10-01');

describe('RCBC import duplicate collapsing', () => {
  it('collapses a client repeated in the same month', () => {
    const out = collapseDuplicates([
      { name: 'Hopewell Sales', month: SEP, employeeCount: 68 },
      { name: 'Other Client', month: SEP, employeeCount: 10 },
      { name: 'Hopewell Sales', month: SEP, employeeCount: 68 },
    ]);
    expect(out.rows).toHaveLength(2);
    expect(out.duplicateNames).toEqual(['Hopewell Sales']);
  });

  it('keeps the LAST occurrence when values differ', () => {
    const out = collapseDuplicates([
      { name: 'Hopewell Sales', month: SEP, employeeCount: 50 },
      { name: 'Hopewell Sales', month: SEP, employeeCount: 68 },
    ]);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].employeeCount).toBe(68);
  });

  it('does NOT collapse the same client across different months', () => {
    const out = collapseDuplicates([
      { name: 'Hopewell Sales', month: SEP, employeeCount: 68 },
      { name: 'Hopewell Sales', month: OCT, employeeCount: 70 },
    ]);
    expect(out.rows).toHaveLength(2);
    expect(out.duplicateNames).toHaveLength(0);
  });

  it('leaves a clean file untouched', () => {
    const out = collapseDuplicates([
      { name: 'A', month: SEP, employeeCount: 1 },
      { name: 'B', month: SEP, employeeCount: 2 },
      { name: 'C', month: SEP, employeeCount: 3 },
    ]);
    expect(out.rows).toHaveLength(3);
    expect(out.duplicateNames).toHaveLength(0);
  });

  it('treats similar-but-distinct names as separate clients', () => {
    // e.g. "Asian Land Strategies" vs "Asian Land Strategies Corp."
    const out = collapseDuplicates([
      { name: 'Asian Land Strategies', month: SEP, employeeCount: 160 },
      { name: 'Asian Land Strategies Corp.', month: SEP, employeeCount: 160 },
    ]);
    expect(out.rows).toHaveLength(2);
    expect(out.duplicateNames).toHaveLength(0);
  });
});
