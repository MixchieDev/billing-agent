import { contractOrderBy, CONTRACT_SORTS } from '@/lib/contract-sort';

describe('contractOrderBy', () => {
  it('sorts by company name both ways', () => {
    expect(contractOrderBy('name_asc')[0]).toEqual({ companyName: 'asc' });
    expect(contractOrderBy('name_desc')[0]).toEqual({ companyName: 'desc' });
  });

  it('falls back to newest for missing or unknown values', () => {
    expect(contractOrderBy(null)[0]).toEqual({ createdAt: 'desc' });
    expect(contractOrderBy('drop table')[0]).toEqual({ createdAt: 'desc' });
  });

  it('always ends with a unique tiebreaker so pages never overlap', () => {
    for (const sort of Object.keys(CONTRACT_SORTS)) {
      expect(contractOrderBy(sort).at(-1)).toEqual({ id: 'asc' });
    }
  });
});
