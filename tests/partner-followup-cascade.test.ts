/**
 * The partner switch is a default for new contracts. Pushing it onto the
 * clients already on the books is a separate, explicit choice — one click must
 * not silently stop chasing a whole book.
 */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockPrisma = {
  partner: { update: jest.fn() },
  contract: { updateMany: jest.fn() },
  invoice: { updateMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

import { getServerSession } from 'next-auth';
import { PUT } from '@/app/api/partners/[id]/route';

const put = (body: unknown) =>
  PUT({ json: async () => body } as never, { params: Promise.resolve({ id: 'p1' }) } as never);

describe('PUT /api/partners/[id] — follow-up switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mockPrisma.partner.update.mockResolvedValue({ id: 'p1', code: 'RCBC', followUpEnabled: false });
    mockPrisma.contract.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('changes only the partner by default', async () => {
    await put({ name: 'RCBC', followUpEnabled: false });
    expect(mockPrisma.contract.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('applies to existing contracts and open invoices when asked', async () => {
    const res = await put({ name: 'RCBC', followUpEnabled: false, applyToExisting: true });
    expect(await res.json()).toMatchObject({ applied: { contracts: 3, invoices: 2 } });
    expect(mockPrisma.contract.updateMany).toHaveBeenCalledWith({
      where: { partnerId: 'p1' },
      data: { followUpEnabled: false },
    });
    // Paid and draft invoices are not chaseable, so they are left alone.
    expect(mockPrisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { partnerId: 'p1', status: { in: ['SENT', 'PARTIALLY_PAID'] } },
      data: { followUpEnabled: false },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'FOLLOW_UP_DISABLED_BULK' }),
      })
    );
  });

  it('never cascades when the switch itself was not sent', async () => {
    await put({ name: 'RCBC', applyToExisting: true });
    expect(mockPrisma.contract.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.partner.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ followUpEnabled: expect.anything() }) })
    );
  });

  it('is admin-only', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u2', role: 'APPROVER' } });
    expect((await put({ followUpEnabled: false, applyToExisting: true })).status).toBe(403);
    expect(mockPrisma.contract.updateMany).not.toHaveBeenCalled();
  });
});
