/**
 * Creating a partner. The code is how contracts, CSV imports and exports name a
 * partner, so a duplicate or a malformed one has to be refused rather than
 * quietly merging two partners together.
 */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));

const mockPrisma = {
  partner: { findUnique: jest.fn(), create: jest.fn() },
  company: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: mockPrisma }));

import { getServerSession } from 'next-auth';
import { POST } from '@/app/api/partners/route';

const admin = { user: { id: 'u1', role: 'ADMIN' } };

const post = (body: unknown) =>
  POST({ json: async () => body } as never);

const valid = {
  code: 'Maybank',
  name: 'Maybank Philippines',
  billingModel: 'DIRECT',
  companyId: 'c1',
  emails: 'ap@maybank.test, billing@maybank.test',
};

describe('POST /api/partners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(admin);
    mockPrisma.company.findUnique.mockResolvedValue({ id: 'c1', code: 'YOWI' });
    mockPrisma.partner.findUnique.mockResolvedValue(null);
    mockPrisma.partner.create.mockImplementation(({ data }: { data: object }) => ({
      id: 'p1',
      ...data,
    }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('creates the partner and mirrors the first email into the legacy field', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(mockPrisma.partner.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'Maybank',
          email: 'ap@maybank.test',
          emails: 'ap@maybank.test, billing@maybank.test',
        }),
      })
    );
  });

  it('refuses a code another partner already uses', async () => {
    mockPrisma.partner.findUnique.mockResolvedValue({ id: 'other', code: 'Maybank' });
    const res = await post(valid);
    expect(res.status).toBe(409);
    expect(mockPrisma.partner.create).not.toHaveBeenCalled();
  });

  it('refuses a code that would break a CSV column', async () => {
    for (const code of ['', 'A', 'has,comma', 'way-too-long-a-partner-code']) {
      const res = await post({ ...valid, code });
      expect(res.status).toBe(400);
    }
    expect(mockPrisma.partner.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown billing model or missing entity', async () => {
    expect((await post({ ...valid, billingModel: 'MAGIC' })).status).toBe(400);
    expect((await post({ ...valid, companyId: '' })).status).toBe(400);
    mockPrisma.company.findUnique.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(400);
    expect(mockPrisma.partner.create).not.toHaveBeenCalled();
  });

  it('is admin-only', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u2', role: 'APPROVER' } });
    expect((await post(valid)).status).toBe(403);
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await post(valid)).status).toBe(401);
    expect(mockPrisma.partner.create).not.toHaveBeenCalled();
  });

  it('records who added the partner', async () => {
    await post(valid);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PARTNER_CREATED', userId: 'u1' }),
      })
    );
  });
});

describe('the per-partner follow-up switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(admin);
    mockPrisma.company.findUnique.mockResolvedValue({ id: 'c1', code: 'YOWI' });
    mockPrisma.partner.findUnique.mockResolvedValue(null);
    mockPrisma.partner.create.mockImplementation(({ data }: { data: object }) => ({ id: 'p1', ...data }));
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('defaults a new partner to being chased', async () => {
    await post(valid);
    expect(mockPrisma.partner.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ followUpEnabled: true }) })
    );
  });

  it('can create a partner that is chased by hand, like RCBC', async () => {
    await post({ ...valid, followUpEnabled: false });
    expect(mockPrisma.partner.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ followUpEnabled: false }) })
    );
  });
});
