/**
 * The contract form used to list partners from a hardcoded set of four codes,
 * so a partner added from the Partners page never appeared in the dropdown.
 * The list has to come from the partners themselves.
 */
import { partnersForEntity, defaultPartnerFor } from '@/lib/partner-options';

const partners = [
  { id: '1', code: 'Direct-YOWI', name: 'Direct Billing (YOWI)', billingModel: 'DIRECT', entityCode: 'YOWI' },
  { id: '2', code: 'Direct-ABBA', name: 'Direct Billing (ABBA)', billingModel: 'DIRECT', entityCode: 'ABBA' },
  { id: '3', code: 'Globe', name: 'Globe Telecom', billingModel: 'GLOBE_INNOVE', entityCode: 'YOWI' },
  { id: '4', code: 'RCBC', name: 'RCBC', billingModel: 'RCBC_CONSOLIDATED', entityCode: 'YOWI' },
  { id: '5', code: 'SBA', name: 'Sterling Bank of Asia', billingModel: 'DIRECT', entityCode: 'ABBA' },
];

describe('partnersForEntity', () => {
  it('includes a partner added later under that entity', () => {
    expect(partnersForEntity(partners, 'ABBA').map((p) => p.code)).toEqual(['Direct-ABBA', 'SBA']);
  });

  it('keeps each entity to its own partners', () => {
    expect(partnersForEntity(partners, 'YOWI').map((p) => p.code)).toEqual(['Direct-YOWI', 'Globe', 'RCBC']);
  });

  it('shows a partner with no entity rather than hiding it', () => {
    const older = [{ id: '9', code: 'Legacy', name: 'Legacy', billingModel: 'DIRECT' }];
    expect(partnersForEntity(older, 'ABBA')).toHaveLength(1);
  });
});

describe('defaultPartnerFor', () => {
  it('starts a new contract on that entity’s direct partner', () => {
    expect(defaultPartnerFor('ABBA', partners)).toBe('Direct-ABBA');
    expect(defaultPartnerFor('YOWI', partners)).toBe('Direct-YOWI');
  });

  it('falls back to the entity’s first partner when there is no direct one', () => {
    expect(defaultPartnerFor('ABBA', [partners[4]])).toBe('SBA');
  });

  it('is empty when the entity has no partners at all', () => {
    expect(defaultPartnerFor('NEW', [partners[0]])).toBe('');
  });
});
