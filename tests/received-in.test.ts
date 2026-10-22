/** Unit tests for the "received in" bank-account filter. */
import { receivedInWhere, receivedInKey, RECEIVED_IN_NONE } from '@/lib/received-in';

describe('receivedInWhere', () => {
  it('no value → no filter', () => {
    expect(receivedInWhere(null)).toEqual({});
    expect(receivedInWhere('')).toEqual({});
  });

  it('an account key matches invoices with a payment in that account', () => {
    const key = receivedInKey({ bankName: 'RCBC', bankAccountNo: '777-TEST' });
    expect(receivedInWhere(key)).toEqual({
      payments: { some: { receivedInBank: 'RCBC', receivedInAccountNo: '777-TEST' } },
    });
  });

  it('keeps an account with no number (legacy single account)', () => {
    expect(receivedInWhere('BDO|')).toEqual({
      payments: { some: { receivedInBank: 'BDO', receivedInAccountNo: '' } },
    });
  });

  it('NONE → paid invoices whose payments name no account', () => {
    expect(receivedInWhere(RECEIVED_IN_NONE)).toEqual({
      payments: { some: {}, none: { receivedInBank: { not: null } } },
    });
  });

  it('a malformed value is ignored rather than matching nothing', () => {
    expect(receivedInWhere('RCBC')).toEqual({});
  });
});
