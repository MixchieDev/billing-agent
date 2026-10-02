/**
 * followUpEnabled switches off the AUTOMATED ladder only. A person deliberately
 * sending a follow-up is exactly what "manual follow-up" means, so the flag must
 * not block them — but anything that doesn't say it's manual must still respect it.
 */
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { invoice: { findUnique: jest.fn() } },
}));
jest.mock('@/lib/email-service', () => ({
  initEmailServiceFromEnv: jest.fn(),
  replacePlaceholders: jest.fn((t: string) => t),
  sendBillingEmail: jest.fn(),
}));
jest.mock('@/lib/pdf-generator', () => ({ generateInvoicePdfLib: jest.fn() }));

import prisma from '@/lib/prisma';
import { canSendFollowUp } from '@/lib/follow-up-service';

const findUnique = (prisma as unknown as { invoice: { findUnique: jest.Mock } }).invoice.findUnique;

const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  status: 'SENT',
  followUpEnabled: true,
  lastFollowUpLevel: 0,
  customerEmail: 'ap@client.test',
  customerEmails: null,
  ...over,
});

describe('canSendFollowUp and the manual follow-up flag', () => {
  beforeEach(() => findUnique.mockReset());

  it('lets a person send when automated follow-up is off for the client', async () => {
    findUnique.mockResolvedValue(invoice({ followUpEnabled: false }));
    const r = await canSendFollowUp('inv1', { manual: true });
    expect(r.canSend).toBe(true);
    expect(r.nextLevel).toBe(1);
  });

  it('still blocks the automated path when the flag is off', async () => {
    findUnique.mockResolvedValue(invoice({ followUpEnabled: false }));
    const r = await canSendFollowUp('inv1');
    expect(r.canSend).toBe(false);
    expect(r.reason).toMatch(/send it manually/i);
  });

  it('defaults to automated, so an unspecified caller cannot bypass the flag', async () => {
    findUnique.mockResolvedValue(invoice({ followUpEnabled: false }));
    expect((await canSendFollowUp('inv1', {})).canSend).toBe(false);
  });

  it('does not let manual override the other guards', async () => {
    findUnique.mockResolvedValue(invoice({ followUpEnabled: false, status: 'PAID' }));
    expect((await canSendFollowUp('inv1', { manual: true })).canSend).toBe(false);

    findUnique.mockResolvedValue(invoice({ followUpEnabled: false, customerEmail: null }));
    expect((await canSendFollowUp('inv1', { manual: true })).canSend).toBe(false);

    findUnique.mockResolvedValue(invoice({ followUpEnabled: false, lastFollowUpLevel: 4 }));
    expect((await canSendFollowUp('inv1', { manual: true })).canSend).toBe(false);
  });

  it('allows the suspension notice as the fourth level', async () => {
    findUnique.mockResolvedValue(invoice({ lastFollowUpLevel: 3 }));
    const r = await canSendFollowUp('inv1', { manual: true });
    expect(r.canSend).toBe(true);
    expect(r.nextLevel).toBe(4);
  });
});

/**
 * The suspension notice must not be stuck behind levels 2 and 3: a client who
 * has gone quiet can be sent straight to it. The ladder itself never jumps.
 */
describe('canSendFollowUp — choosing the level', () => {
  beforeEach(() => findUnique.mockReset());

  it('lets a person send the suspension notice after only level 1', async () => {
    findUnique.mockResolvedValue(invoice({ lastFollowUpLevel: 1 }));
    const r = await canSendFollowUp('inv1', { manual: true, level: 4 });
    expect(r).toMatchObject({ canSend: true, nextLevel: 4 });
  });

  it('never lets the automated sweep skip a rung', async () => {
    findUnique.mockResolvedValue(invoice({ lastFollowUpLevel: 1 }));
    const r = await canSendFollowUp('inv1', { level: 4 });
    expect(r.canSend).toBe(false);
    expect(r.reason).toMatch(/manual send/i);
  });

  it('refuses to go back down the ladder', async () => {
    findUnique.mockResolvedValue(invoice({ lastFollowUpLevel: 3 }));
    const r = await canSendFollowUp('inv1', { manual: true, level: 2 });
    expect(r.canSend).toBe(false);
    expect(r.reason).toMatch(/already been sent/i);
  });

  it('rejects a level outside 1–4', async () => {
    findUnique.mockResolvedValue(invoice());
    for (const level of [0, 5, 2.5]) {
      expect((await canSendFollowUp('inv1', { manual: true, level })).canSend).toBe(false);
    }
  });

  it('still climbs one rung when no level is chosen', async () => {
    findUnique.mockResolvedValue(invoice({ lastFollowUpLevel: 1 }));
    expect(await canSendFollowUp('inv1', { manual: true })).toMatchObject({ nextLevel: 2 });
  });

  it('still refuses once level 4 has gone out', async () => {
    findUnique.mockResolvedValue(invoice({ lastFollowUpLevel: 4 }));
    expect((await canSendFollowUp('inv1', { manual: true, level: 4 })).canSend).toBe(false);
  });
});
